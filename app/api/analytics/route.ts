import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';

// GET /api/analytics?type=savings|chain_ranking|price_drops|top_products|price_trend
// Backs the Analytics view (app/page.tsx). Each `type` is an independent
// query — kept in one route since they're all read-only reporting queries
// over the same tables, not because they share request/response shape.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const supabase = createServerClient();

    switch (type) {
      case 'savings': {
        const userId = searchParams.get('user_id');
        if (!userId) return NextResponse.json({ error: 'user_id is required' }, { status: 400 });

        const { data: baskets, error: basketsErr } = await supabase
          .from('baskets')
          .select('id')
          .eq('user_id', userId);
        if (basketsErr) throw basketsErr;

        const basketIds = (baskets ?? []).map((b) => b.id);
        if (basketIds.length === 0) {
          return NextResponse.json({ total_saved: 0 });
        }

        const { data: items, error: itemsErr } = await supabase
          .from('basket_items')
          .select('product_id, quantity_value')
          .in('basket_id', basketIds)
          .not('product_id', 'is', null);
        if (itemsErr) throw itemsErr;

        const productIds = [...new Set((items ?? []).map((i) => i.product_id as string))];
        if (productIds.length === 0) {
          return NextResponse.json({ total_saved: 0 });
        }

        const { data: prices, error: pricesErr } = await supabase
          .from('latest_prices')
          .select('product_id, price')
          .in('product_id', productIds);
        if (pricesErr) throw pricesErr;

        const minMaxByProduct: Record<string, { min: number; max: number }> = {};
        for (const p of prices ?? []) {
          const cur = minMaxByProduct[p.product_id];
          if (!cur) {
            minMaxByProduct[p.product_id] = { min: p.price, max: p.price };
          } else {
            cur.min = Math.min(cur.min, p.price);
            cur.max = Math.max(cur.max, p.price);
          }
        }

        let totalSaved = 0;
        for (const item of items ?? []) {
          const mm = minMaxByProduct[item.product_id as string];
          if (!mm) continue;
          totalSaved += (mm.max - mm.min) * (item.quantity_value ?? 1);
        }

        return NextResponse.json({ total_saved: Math.round(totalSaved * 100) / 100 });
      }

      case 'chain_ranking': {
        const { data: chains, error: chainsErr } = await supabase
          .from('chains')
          .select('id, name_he, name_en, color_hex');
        if (chainsErr) throw chainsErr;

        const { data: prices, error: pricesErr } = await supabase
          .from('latest_prices')
          .select('chain_id, price');
        if (pricesErr) throw pricesErr;

        const sums: Record<string, { sum: number; count: number }> = {};
        for (const p of prices ?? []) {
          if (!sums[p.chain_id]) sums[p.chain_id] = { sum: 0, count: 0 };
          sums[p.chain_id].sum += p.price;
          sums[p.chain_id].count += 1;
        }

        const ranking = (chains ?? [])
          .filter((c) => sums[c.id] && sums[c.id].count > 0)
          .map((c) => ({
            chain_id: c.id,
            name_he: c.name_he,
            name_en: c.name_en,
            color_hex: c.color_hex,
            avg_price: Math.round((sums[c.id].sum / sums[c.id].count) * 100) / 100,
            product_count: sums[c.id].count,
          }))
          .sort((a, b) => a.avg_price - b.avg_price);

        return NextResponse.json({ ranking });
      }

      case 'price_drops': {
        const days = Math.max(1, Math.min(90, parseInt(searchParams.get('days') ?? '7')));
        const cutoffIso = new Date(Date.now() - days * 86400000).toISOString();

        const [{ data: recent, error: recentErr }, { data: older, error: olderErr }] = await Promise.all([
          supabase
            .from('price_history')
            .select('product_id, chain_id, price, captured_at')
            .gte('captured_at', cutoffIso)
            .order('captured_at', { ascending: false })
            .limit(5000),
          supabase
            .from('price_history')
            .select('product_id, chain_id, price, captured_at')
            .lt('captured_at', cutoffIso)
            .order('captured_at', { ascending: false })
            .limit(5000),
        ]);
        if (recentErr) throw recentErr;
        if (olderErr) throw olderErr;

        // Latest row per (product_id, chain_id) in each window — both result
        // sets are already ordered newest-first, so the first time a key is
        // seen is its latest snapshot in that window.
        const latestInWindow = (rows: Array<{ product_id: string; chain_id: string; price: number }>) => {
          const map = new Map<string, number>();
          for (const r of rows) {
            const key = `${r.product_id}|${r.chain_id}`;
            if (!map.has(key)) map.set(key, r.price);
          }
          return map;
        };

        const newPrices = latestInWindow(recent ?? []);
        const oldPrices = latestInWindow(older ?? []);

        const drops: Array<{ product_id: string; chain_id: string; old_price: number; new_price: number; pct_drop: number }> = [];
        for (const [key, newPrice] of newPrices) {
          const oldPrice = oldPrices.get(key);
          if (oldPrice == null || oldPrice <= newPrice) continue;
          const [product_id, chain_id] = key.split('|');
          drops.push({
            product_id,
            chain_id,
            old_price: oldPrice,
            new_price: newPrice,
            pct_drop: Math.round(((oldPrice - newPrice) / oldPrice) * 1000) / 10,
          });
        }
        drops.sort((a, b) => b.pct_drop - a.pct_drop);
        const top = drops.slice(0, 5);

        const productIds = [...new Set(top.map((d) => d.product_id))];
        const chainIds = [...new Set(top.map((d) => d.chain_id))];
        const [{ data: products }, { data: chains }] = await Promise.all([
          productIds.length > 0
            ? supabase.from('products').select('id, name_he, name_en').in('id', productIds)
            : Promise.resolve({ data: [] as Array<{ id: string; name_he: string; name_en: string | null }> }),
          chainIds.length > 0
            ? supabase.from('chains').select('id, name_he, name_en, color_hex').in('id', chainIds)
            : Promise.resolve({ data: [] as Array<{ id: string; name_he: string; name_en: string; color_hex: string }> }),
        ]);

        const result = top.map((d) => ({
          ...d,
          product_name_he: products?.find((p) => p.id === d.product_id)?.name_he ?? d.product_id,
          product_name_en: products?.find((p) => p.id === d.product_id)?.name_en ?? null,
          chain_name_he: chains?.find((c) => c.id === d.chain_id)?.name_he ?? d.chain_id,
          chain_name_en: chains?.find((c) => c.id === d.chain_id)?.name_en ?? d.chain_id,
        }));

        return NextResponse.json({ drops: result });
      }

      case 'top_products': {
        const userId = searchParams.get('user_id');
        if (!userId) return NextResponse.json({ error: 'user_id is required' }, { status: 400 });

        const { data: baskets, error: basketsErr } = await supabase
          .from('baskets')
          .select('id')
          .eq('user_id', userId);
        if (basketsErr) throw basketsErr;

        const basketIds = (baskets ?? []).map((b) => b.id);
        if (basketIds.length === 0) {
          return NextResponse.json({ products: [] });
        }

        const { data: items, error: itemsErr } = await supabase
          .from('basket_items')
          .select('product_id')
          .in('basket_id', basketIds)
          .not('product_id', 'is', null);
        if (itemsErr) throw itemsErr;

        const counts: Record<string, number> = {};
        for (const i of items ?? []) {
          const pid = i.product_id as string;
          counts[pid] = (counts[pid] ?? 0) + 1;
        }
        const topIds = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([id]) => id);

        if (topIds.length === 0) {
          return NextResponse.json({ products: [] });
        }

        const [{ data: products }, { data: prices }] = await Promise.all([
          supabase.from('products').select('id, name_he, name_en').in('id', topIds),
          supabase.from('latest_prices').select('product_id, price').in('product_id', topIds),
        ]);

        const minPriceByProduct: Record<string, number> = {};
        for (const p of prices ?? []) {
          const cur = minPriceByProduct[p.product_id];
          minPriceByProduct[p.product_id] = cur == null ? p.price : Math.min(cur, p.price);
        }

        const result = topIds.map((id) => ({
          product_id: id,
          name_he: products?.find((p) => p.id === id)?.name_he ?? id,
          name_en: products?.find((p) => p.id === id)?.name_en ?? null,
          times_added: counts[id],
          min_price: minPriceByProduct[id] ?? null,
        }));

        return NextResponse.json({ products: result });
      }

      case 'price_trend': {
        const productId = searchParams.get('product_id');
        if (!productId) return NextResponse.json({ error: 'product_id is required' }, { status: 400 });
        const days = Math.max(1, Math.min(365, parseInt(searchParams.get('days') ?? '30')));
        const cutoffIso = new Date(Date.now() - days * 86400000).toISOString();

        const { data: history, error } = await supabase
          .from('price_history')
          .select('chain_id, price, captured_at')
          .eq('product_id', productId)
          .gte('captured_at', cutoffIso)
          .order('captured_at', { ascending: true })
          .limit(2000);
        if (error) throw error;

        const { data: chains } = await supabase.from('chains').select('id, name_he, name_en, color_hex');

        const pointsPerChain: Record<string, number> = {};
        for (const h of history ?? []) pointsPerChain[h.chain_id] = (pointsPerChain[h.chain_id] ?? 0) + 1;

        return NextResponse.json({
          history: history ?? [],
          chains: chains ?? [],
          has_enough_history: Object.values(pointsPerChain).some((c) => c >= 2),
        });
      }

      default:
        return NextResponse.json({ error: 'Unknown or missing type. Use one of: savings, chain_ranking, price_drops, top_products, price_trend' }, { status: 400 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Analytics query failed';
    console.error('[analytics]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
