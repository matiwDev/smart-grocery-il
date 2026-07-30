import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';

// GET /api/baskets/{basketId}/items?user_id=<uid>
// Rehydrates a basket's items with current prices in one request — used on
// login/page-load to restore the working basket instead of the client doing
// three separate round trips (basket_items, then products, then
// latest_prices) itself. Requires user_id so ownership can be checked
// server-side: this route uses the service-role client, which bypasses RLS.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: basketId } = await params;
    const userId = req.nextUrl.searchParams.get('user_id');

    if (!userId) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
    }

    const supabase = createServerClient();

    const { data: basketRow, error: basketError } = await supabase
      .from('baskets')
      .select('id, user_id')
      .eq('id', basketId)
      .single();

    if (basketError || !basketRow) {
      return NextResponse.json({ error: 'Basket not found' }, { status: 404 });
    }
    if (basketRow.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: items, error: itemsError } = await supabase
      .from('basket_items')
      .select('id, product_id, quantity_value, product_name')
      .eq('basket_id', basketId)
      .not('product_id', 'is', null);

    if (itemsError) throw itemsError;

    const productIds = (items ?? []).map((i) => i.product_id).filter((id): id is string => !!id);

    // No FK constraint exists between basket_items.product_id and products.id
    // (confirmed live: PostgREST embedding returns PGRST200), so this can't be
    // a single embedded select — fetch products + latest_prices separately and
    // merge in JS. Still one round trip from the client's perspective, which
    // is the part that matters for the "not N individual fetches" goal.
    const [{ data: products, error: productsError }, { data: prices, error: pricesError }] = await Promise.all([
      productIds.length > 0
        ? supabase.from('products').select('id, name_he, name_en, category, barcode').in('id', productIds)
        : Promise.resolve({ data: [], error: null }),
      productIds.length > 0
        ? supabase.from('latest_prices').select('product_id, chain_id, price, unit_qty, unit_type, is_sale').in('product_id', productIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (productsError) throw productsError;
    if (pricesError) throw pricesError;

    const productById: Record<string, { name_he: string; name_en: string | null; category: string | null; barcode: string | null }> = {};
    for (const p of products ?? []) productById[p.id] = p;

    const pricesByProduct: Record<string, Array<{ chain_id: string; price: number; unit_qty: number | null; unit_type: string | null; is_sale: boolean }>> = {};
    for (const p of prices ?? []) {
      if (!pricesByProduct[p.product_id]) pricesByProduct[p.product_id] = [];
      pricesByProduct[p.product_id].push(p);
    }

    const result = (items ?? []).map((i) => {
      const product = i.product_id ? productById[i.product_id] : undefined;
      return {
        db_id: i.id,
        product_id: i.product_id,
        quantity_value: i.quantity_value,
        name_he: product?.name_he ?? i.product_name,
        name_en: product?.name_en ?? null,
        category: product?.category ?? null,
        barcode: product?.barcode ?? null,
        prices: (i.product_id ? pricesByProduct[i.product_id] : undefined) ?? [],
      };
    });

    return NextResponse.json({ items: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load basket items';
    console.error('[baskets/[id]/items]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
