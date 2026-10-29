import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';

// GET /api/products/search?q=חלב&limit=8[&chain=rami_levy]
//
// Catalog search with estimated prices (active chains only).
// With `chain` (the user's chosen store), only products that chain carries are
// returned, each with `chain_price` (the price there) and `cheaper` (the
// cheapest OTHER active chain, only when it is lower). Without `chain` — the
// barcode scanner — every match is returned with all its prices.
// A household's own products ("My products") are searched by the client,
// not here (they're behind RLS).

const CHEAPER_MIN_DIFF = 0.05; // ₪ — ignore rounding-level differences

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    // Characters that would break PostgREST's or=(…) filter syntax.
    const query = (searchParams.get('q') ?? '').trim().replace(/[,()*\\]/g, ' ').trim();
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '8'), 20);
    const chainId = searchParams.get('chain')?.trim() || null;

    if (query.length < 1) {
      return NextResponse.json({ products: [] });
    }

    const supabase = createServerClient();
    const nameFilter = `name_he.ilike.%${query}%,name_en.ilike.%${query}%,barcode.eq.${query}`;

    const { data: products, error: productError } = chainId
      ? await supabase
          .from('products')
          .select('id, barcode, name_he, name_en, category, image_url, chain_prices!inner(chain_id)')
          .eq('chain_prices.chain_id', chainId)
          .or(nameFilter)
          .limit(limit)
      : await supabase
          .from('products')
          .select('id, barcode, name_he, name_en, category, image_url')
          .or(nameFilter)
          .limit(limit);

    if (productError) throw productError;
    if (!products || products.length === 0) {
      return NextResponse.json({ products: [] });
    }

    const productIds = products.map((p) => p.id);
    const [{ data: prices, error: priceError }, { data: chains }] = await Promise.all([
      supabase
        .from('active_chain_prices')
        .select('product_id, chain_id, price, unit_qty, unit_type, is_sale, captured_at')
        .in('product_id', productIds),
      supabase.from('chains').select('id, name_he, name_en, color_hex, status'),
    ]);
    if (priceError) throw priceError;

    const pricesByProduct: Record<string, Record<string, NonNullable<typeof prices>[number]>> = {};
    for (const price of prices ?? []) {
      (pricesByProduct[price.product_id] ??= {})[price.chain_id] = { ...price, price: Number(price.price) };
    }

    const result = products.map((product) => {
      const productPrices = pricesByProduct[product.id] ?? {};
      const entries = Object.entries(productPrices);
      const priceValues = entries.map(([, p]) => p.price);
      const chainPrice = chainId ? productPrices[chainId]?.price ?? null : null;
      const cheapestOther = entries
        .filter(([c]) => c !== chainId)
        .sort((a, b) => a[1].price - b[1].price)[0];
      const cheaper = chainPrice != null && cheapestOther && cheapestOther[1].price < chainPrice - CHEAPER_MIN_DIFF
        ? { chain_id: cheapestOther[0], price: cheapestOther[1].price }
        : null;

      return {
        id: product.id,
        barcode: product.barcode,
        name_he: product.name_he,
        name_en: product.name_en,
        category: product.category,
        image_url: product.image_url,
        prices: productPrices,
        min_price: priceValues.length > 0 ? Math.min(...priceValues) : null,
        max_price: priceValues.length > 0 ? Math.max(...priceValues) : null,
        best_chain: entries.length > 0 ? entries.sort((a, b) => a[1].price - b[1].price)[0][0] : null,
        chain_price: chainPrice,
        cheaper,
      };
    });

    return NextResponse.json({ products: result, chains: chains ?? [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Search failed';
    console.error('[products/search]', message);
    return NextResponse.json({ error: message, products: [] }, { status: 500 });
  }
}
