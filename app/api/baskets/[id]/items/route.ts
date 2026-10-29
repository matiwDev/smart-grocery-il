import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import type { BasketItemRow } from '@/lib/list';

// GET /api/baskets/{basketId}/items   (Authorization: Bearer <access token>)
// Rehydrates a list's items (catalog AND "My products" items) with current
// estimated prices in one request — used on login, on live updates from the
// household, and when loading a saved list. This route uses the service-role
// client (bypasses RLS), so it checks the caller itself: the signed-in user
// must own the list or belong to the household it is shared with. Household
// edits to products (product_overrides) are applied by the client, not here.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: basketId } = await params;
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    const supabase = createServerClient();
    const { data: auth, error: authError } = await supabase.auth.getUser(token);
    if (authError || !auth?.user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }
    const userId = auth.user.id;

    const { data: basketRow, error: basketError } = await supabase
      .from('baskets')
      .select('id, user_id, household_id')
      .eq('id', basketId)
      .single();

    if (basketError || !basketRow) {
      return NextResponse.json({ error: 'Basket not found' }, { status: 404 });
    }
    let allowed = basketRow.user_id === userId;
    if (!allowed && basketRow.household_id) {
      const { data: member } = await supabase
        .from('household_members')
        .select('user_id')
        .eq('household_id', basketRow.household_id)
        .eq('user_id', userId)
        .maybeSingle();
      allowed = !!member;
    }
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: items, error: itemsError } = await supabase
      .from('basket_items')
      .select('id, product_id, custom_product_id, quantity_value, product_name, checked, category, custom_price, image_url, created_at, custom_products(name, category, price, image_url)')
      .eq('basket_id', basketId)
      .order('created_at', { ascending: true });

    if (itemsError) throw itemsError;

    const productIds = [...new Set((items ?? []).map((i) => i.product_id).filter((id): id is string => !!id))];

    const [{ data: products, error: productsError }, { data: prices, error: pricesError }] = await Promise.all([
      productIds.length > 0
        ? supabase.from('products').select('id, name_he, name_en, category, barcode').in('id', productIds)
        : Promise.resolve({ data: [], error: null }),
      productIds.length > 0
        ? supabase.from('active_chain_prices').select('product_id, chain_id, price, unit_qty, unit_type, is_sale, captured_at').in('product_id', productIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (productsError) throw productsError;
    if (pricesError) throw pricesError;

    const productById: Record<string, { name_he: string; name_en: string | null; category: string | null; barcode: string | null }> = {};
    for (const p of products ?? []) productById[p.id] = p;

    const pricesByProduct: Record<string, BasketItemRow['prices']> = {};
    for (const p of prices ?? []) {
      (pricesByProduct[p.product_id] ??= []).push(p);
    }

    const result: BasketItemRow[] = (items ?? []).map((i) => {
      const product = i.product_id ? productById[i.product_id] : undefined;
      // "My products" (custom_products) are the source of truth for items
      // linked to one; the row's own columns are a fallback for older items.
      const embedded = i.custom_products as unknown;
      const custom = (Array.isArray(embedded) ? embedded[0] : embedded) as
        { name: string; category: string | null; price: number | null; image_url: string | null } | null | undefined;
      return {
        db_id: i.id,
        product_id: i.product_id,
        custom_product_id: i.custom_product_id ?? null,
        quantity_value: i.quantity_value,
        checked: !!i.checked,
        name_he: product?.name_he ?? custom?.name ?? i.product_name,
        name_en: product?.name_en ?? null,
        category: product?.category ?? custom?.category ?? i.category ?? null,
        barcode: product?.barcode ?? null,
        custom_price: custom ? custom.price : i.custom_price,
        image_url: custom ? custom.image_url : i.image_url,
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
