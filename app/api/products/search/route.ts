import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';

// GET /api/products/search?q=חלב&limit=8
// Returns products matching the query with their latest price per chain
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q')?.trim() ?? '';
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '8'), 20);

    if (query.length < 1) {
      return NextResponse.json({ products: [] });
    }

    const supabase = createServerClient();

    // Search products by Hebrew or English name using trigram similarity
    // This handles partial matches and is tolerant of Hebrew character variations
    const { data: products, error: productError } = await supabase
      .from('products')
      .select('id, barcode, name_he, name_en, category, image_url')
      .or(`name_he.ilike.%${query}%,name_en.ilike.%${query}%`)
      .limit(limit);

    if (productError) throw productError;
    if (!products || products.length === 0) {
      return NextResponse.json({ products: [] });
    }

    const productIds = products.map((p) => p.id);

    // Fetch latest prices for all matched products across all chains in one query
    const { data: prices, error: priceError } = await supabase
      .from('latest_prices')
      .select('product_id, chain_id, price, unit_qty, unit_type, is_sale, captured_at')
      .in('product_id', productIds);

    if (priceError) throw priceError;

    // Fetch chain metadata for display
    const { data: chains } = await supabase
      .from('chains')
      .select('id, name_he, name_en, color_hex');

    // Group prices by product_id
    const pricesByProduct: Record<string, Record<string, typeof prices[0]>> = {};
    for (const price of prices ?? []) {
      if (!pricesByProduct[price.product_id]) {
        pricesByProduct[price.product_id] = {};
      }
      pricesByProduct[price.product_id][price.chain_id] = price;
    }

    // Assemble the response
    const result = products.map((product) => {
      const productPrices = pricesByProduct[product.id] ?? {};
      const priceValues = Object.values(productPrices).map((p) => p.price);
      const minPrice = priceValues.length > 0 ? Math.min(...priceValues) : null;
      const maxPrice = priceValues.length > 0 ? Math.max(...priceValues) : null;

      return {
        id: product.id,
        barcode: product.barcode,
        name_he: product.name_he,
        name_en: product.name_en,
        category: product.category,
        image_url: product.image_url,
        prices: productPrices,
        min_price: minPrice,
        max_price: maxPrice,
        // Best price chain (for display in autocomplete)
        best_chain: priceValues.length > 0
          ? Object.entries(productPrices).reduce((best, [chainId, p]) =>
              p.price < (productPrices[best]?.price ?? Infinity) ? chainId : best,
              Object.keys(productPrices)[0]
            )
          : null,
      };
    });

    return NextResponse.json({
      products: result,
      chains: chains ?? [],
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Search failed';
    console.error('[products/search]', message);
    return NextResponse.json({ error: message, products: [] }, { status: 500 });
  }
}
