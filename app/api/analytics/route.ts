import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';

// PostgREST silently caps any response at its configured max-rows (1000 on
// this project, confirmed live: a plain `latest_prices` select with no range
// returned exactly 1000 rows total across chains, undercounting every chain
// past the cutoff and skipping two entirely). `.limit(N)` on the client side
// does NOT override that server-side cap. Queries below that can plausibly
// exceed 1000 rows (the full latest_prices table, multi-day price_history
// windows) page through with `.range()` instead of trusting a single select.
async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
  maxRows = 20000
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (from < maxRows) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

// ISO year-week key (e.g. "2026-W05") for a date, used to count distinct
// active weeks for the weekly-average calculation in spending_overview.
function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// Cheapest-price cost of a set of (product_id, quantity) pairs: fetches
// latest_prices for the involved products once and takes the per-product
// minimum, since there's no "price actually paid" data in this app — every
// basket_items row is a planned purchase, not a receipt line. Shared by
// spending_overview, monthly_basket, and personal_chain_ranking below.
async function minPriceByProduct(
  supabase: ReturnType<typeof createServerClient>,
  productIds: string[]
): Promise<Record<string, number>> {
  if (productIds.length === 0) return {};
  const { data, error } = await supabase
    .from('latest_prices')
    .select('product_id, price')
    .in('product_id', productIds);
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const p of data ?? []) {
    out[p.product_id] = out[p.product_id] == null ? p.price : Math.min(out[p.product_id], p.price);
  }
  return out;
}

// Every custom-market expense entry for a user, across all of their markets.
// Degrades to an empty list (not a 500) when migration 009 hasn't been
// applied yet — same PGRST205 pattern as the `custom_markets` case below.
// Shared by spending_overview and monthly_basket.
async function fetchUserCustomMarketEntries(
  supabase: ReturnType<typeof createServerClient>,
  userId: string
): Promise<Array<{ market_id: string; market_name: string; amount: number; note: string | null; spent_at: string }>> {
  const { data: markets, error: marketsErr } = await supabase
    .from('custom_markets')
    .select('id, name')
    .eq('user_id', userId);
  if (marketsErr) {
    if (marketsErr.code === 'PGRST205') return [];
    throw marketsErr;
  }
  const marketIds = (markets ?? []).map((m) => m.id);
  if (marketIds.length === 0) return [];

  const { data: entries, error: entriesErr } = await supabase
    .from('custom_market_entries')
    .select('market_id, amount, note, spent_at')
    .in('market_id', marketIds);
  if (entriesErr) throw entriesErr;

  const nameById: Record<string, string> = {};
  for (const m of markets ?? []) nameById[m.id] = m.name;
  return (entries ?? []).map((e) => ({ ...e, market_name: nameById[e.market_id] ?? '' }));
}

// GET /api/analytics?type=savings|chain_ranking|price_trend|spending_overview|
//                         personal_chain_ranking|monthly_basket|custom_markets
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

        const prices = await fetchAllPages<{ chain_id: string; price: number }>(
          (from, to) => supabase.from('latest_prices').select('chain_id, price').range(from, to),
          1000,
          60000
        );

        const sums: Record<string, { sum: number; count: number }> = {};
        for (const p of prices) {
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

        type PriceHistoryRow = { product_id: string; chain_id: string; price: number; captured_at: string };
        const [recent, older] = await Promise.all([
          fetchAllPages<PriceHistoryRow>(
            (from, to) => supabase.from('price_history').select('product_id, chain_id, price, captured_at')
              .gte('captured_at', cutoffIso).order('captured_at', { ascending: false }).range(from, to),
            1000, 5000
          ),
          fetchAllPages<PriceHistoryRow>(
            (from, to) => supabase.from('price_history').select('product_id, chain_id, price, captured_at')
              .lt('captured_at', cutoffIso).order('captured_at', { ascending: false }).range(from, to),
            1000, 5000
          ),
        ]);

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

        const newPrices = latestInWindow(recent);
        const oldPrices = latestInWindow(older);

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

        const history = await fetchAllPages<{ chain_id: string; price: number; captured_at: string }>(
          (from, to) => supabase.from('price_history').select('chain_id, price, captured_at')
            .eq('product_id', productId).gte('captured_at', cutoffIso).order('captured_at', { ascending: true }).range(from, to),
          1000, 2000
        );

        const { data: chains } = await supabase.from('chains').select('id, name_he, name_en, color_hex');

        const pointsPerChain: Record<string, number> = {};
        for (const h of history) pointsPerChain[h.chain_id] = (pointsPerChain[h.chain_id] ?? 0) + 1;

        return NextResponse.json({
          history,
          chains: chains ?? [],
          has_enough_history: Object.values(pointsPerChain).some((c) => c >= 2),
        });
      }

      case 'spending_overview': {
        const userId = searchParams.get('user_id');
        if (!userId) return NextResponse.json({ error: 'user_id is required' }, { status: 400 });

        const { data: baskets, error: basketsErr } = await supabase
          .from('baskets')
          .select('id, created_at')
          .eq('user_id', userId);
        if (basketsErr) throw basketsErr;

        if (!baskets || baskets.length === 0) {
          return NextResponse.json({ not_enough_data: true });
        }

        const earliestCreatedAt = baskets.reduce((min, b) => (b.created_at < min ? b.created_at : min), baskets[0].created_at);
        const daysActive = (Date.now() - new Date(earliestCreatedAt).getTime()) / 86400000;
        if (daysActive < 7) {
          return NextResponse.json({ not_enough_data: true });
        }

        const basketIds = baskets.map((b) => b.id);
        const basketDateById: Record<string, string> = {};
        for (const b of baskets) basketDateById[b.id] = b.created_at;

        const { data: items, error: itemsErr } = await supabase
          .from('basket_items')
          .select('basket_id, product_id, quantity_value')
          .in('basket_id', basketIds)
          .not('product_id', 'is', null);
        if (itemsErr) throw itemsErr;

        const productIds = [...new Set((items ?? []).map((i) => i.product_id as string))];
        const minPrices = await minPriceByProduct(supabase, productIds);

        // Cost per basket ("trip"), dated by that basket's created_at — this
        // app has no separate purchase-timestamp, so a saved/active basket
        // IS the unit of a "trip".
        const costByBasket: Record<string, number> = {};
        for (const i of items ?? []) {
          const price = minPrices[i.product_id as string];
          if (price == null) continue;
          costByBasket[i.basket_id] = (costByBasket[i.basket_id] ?? 0) + price * (i.quantity_value ?? 1);
        }

        const customEntries = await fetchUserCustomMarketEntries(supabase, userId);

        const now = new Date();
        const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const currentMonthKey = monthKey(now);
        const currentYear = now.getFullYear();

        // Combined (supermarket-chain basket + local custom-market) totals per
        // month — the unified spending picture this fix asked for, instead of
        // two separate figures the frontend had to reconcile itself.
        const monthlyTotals: Record<string, { basketTotal: number; customTotal: number; trips: number; weeks: Set<string> }> = {};
        const ensureMonth = (mk: string) => (monthlyTotals[mk] ??= { basketTotal: 0, customTotal: 0, trips: 0, weeks: new Set() });
        const weeksWithActivity = new Set<string>();

        let basketAllTimeTotal = 0;
        for (const [basketId, cost] of Object.entries(costByBasket)) {
          const d = new Date(basketDateById[basketId]);
          basketAllTimeTotal += cost;
          const weekKey = isoWeekKey(d);
          weeksWithActivity.add(weekKey);

          const agg = ensureMonth(monthKey(d));
          agg.basketTotal += cost;
          agg.trips += 1;
          agg.weeks.add(weekKey);
        }

        let customAllTimeTotal = 0;
        for (const e of customEntries) {
          const d = new Date(e.spent_at);
          const amount = Number(e.amount);
          customAllTimeTotal += amount;
          const weekKey = isoWeekKey(d);
          weeksWithActivity.add(weekKey);

          const agg = ensureMonth(monthKey(d));
          agg.customTotal += amount;
          agg.weeks.add(weekKey);
        }

        const combinedAllTimeTotal = basketAllTimeTotal + customAllTimeTotal;

        let annualTotalToDate = 0;
        for (const [mk, agg] of Object.entries(monthlyTotals)) {
          if (mk.startsWith(`${currentYear}-`)) annualTotalToDate += agg.basketTotal + agg.customTotal;
        }

        const weeksActive = Math.max(1, weeksWithActivity.size);
        const weeklyAvg = combinedAllTimeTotal / weeksActive;

        // Last 6 calendar months (including current), oldest first.
        const monthlyBreakdown: Array<{ month: string; total: number; avg_per_week: number; trips: number }> = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const mk = monthKey(d);
          const m = monthlyTotals[mk];
          const total = (m?.basketTotal ?? 0) + (m?.customTotal ?? 0);
          monthlyBreakdown.push({
            month: mk,
            total: Math.round(total * 100) / 100,
            avg_per_week: m && m.weeks.size > 0 ? Math.round((total / m.weeks.size) * 100) / 100 : 0,
            trips: m?.trips ?? 0,
          });
        }

        const monthsWithData = Object.keys(monthlyTotals).length;
        const monthlyAverage = monthsWithData > 0 ? combinedAllTimeTotal / monthsWithData : 0;
        const annualProjection = monthlyAverage * 12;

        const currentMonth = monthlyTotals[currentMonthKey];
        const basketTotalThisMonth = currentMonth?.basketTotal ?? 0;
        const customTotalThisMonth = currentMonth?.customTotal ?? 0;

        return NextResponse.json({
          not_enough_data: false,
          basket_total: Math.round(basketTotalThisMonth * 100) / 100,
          custom_total: Math.round(customTotalThisMonth * 100) / 100,
          combined_total: Math.round((basketTotalThisMonth + customTotalThisMonth) * 100) / 100,
          weekly_avg: Math.round(weeklyAvg * 100) / 100,
          monthly_breakdown: monthlyBreakdown,
          annual_projection: Math.round(annualProjection * 100) / 100,
          annual_total_to_date: Math.round(annualTotalToDate * 100) / 100,
        });
      }

      case 'personal_chain_ranking': {
        const userId = searchParams.get('user_id');
        if (!userId) return NextResponse.json({ error: 'user_id is required' }, { status: 400 });

        const { data: baskets, error: basketsErr } = await supabase.from('baskets').select('id').eq('user_id', userId);
        if (basketsErr) throw basketsErr;
        const basketIds = (baskets ?? []).map((b) => b.id);
        if (basketIds.length === 0) return NextResponse.json({ ranking: [] });

        const { data: items, error: itemsErr } = await supabase
          .from('basket_items')
          .select('product_id, quantity_value')
          .in('basket_id', basketIds)
          .not('product_id', 'is', null);
        if (itemsErr) throw itemsErr;

        const productIds = [...new Set((items ?? []).map((i) => i.product_id as string))];
        if (productIds.length === 0) return NextResponse.json({ ranking: [] });

        const [{ data: prices, error: pricesErr }, { data: chains, error: chainsErr }] = await Promise.all([
          supabase.from('latest_prices').select('product_id, chain_id, price').in('product_id', productIds),
          supabase.from('chains').select('id, name_he, name_en, color_hex'),
        ]);
        if (pricesErr) throw pricesErr;
        if (chainsErr) throw chainsErr;

        const priceMap: Record<string, Record<string, number>> = {};
        for (const p of prices ?? []) {
          if (!priceMap[p.product_id]) priceMap[p.product_id] = {};
          priceMap[p.product_id][p.chain_id] = p.price;
        }

        // Total cost of the user's actual historical items, per chain — not
        // an average price like the general ranking, since this answers
        // "which chain would have been cheapest for what you actually buy".
        const totals: Record<string, { sum: number; count: number }> = {};
        for (const item of items ?? []) {
          const perChain = priceMap[item.product_id as string] ?? {};
          for (const [chainId, price] of Object.entries(perChain)) {
            if (!totals[chainId]) totals[chainId] = { sum: 0, count: 0 };
            totals[chainId].sum += price * (item.quantity_value ?? 1);
            totals[chainId].count += 1;
          }
        }

        const ranking = (chains ?? [])
          .filter((c) => totals[c.id] && totals[c.id].count > 0)
          .map((c) => ({
            chain_id: c.id,
            name_he: c.name_he,
            name_en: c.name_en,
            color_hex: c.color_hex,
            total_cost: Math.round(totals[c.id].sum * 100) / 100,
            items_covered: totals[c.id].count,
          }))
          .sort((a, b) => a.total_cost - b.total_cost);

        return NextResponse.json({ ranking });
      }

      case 'monthly_basket': {
        const userId = searchParams.get('user_id');
        if (!userId) return NextResponse.json({ error: 'user_id is required' }, { status: 400 });

        const now = new Date();
        const monthParam = searchParams.get('month'); // YYYY-MM, defaults to current month
        const [year, month] = (monthParam ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
          .split('-').map(Number);
        const monthStart = new Date(Date.UTC(year, month - 1, 1));
        const monthEnd = new Date(Date.UTC(year, month, 1));

        const allCustomEntries = await fetchUserCustomMarketEntries(supabase, userId);
        const customEntriesThisMonth = allCustomEntries
          .filter((e) => {
            const d = new Date(e.spent_at);
            return d >= monthStart && d < monthEnd;
          })
          .sort((a, b) => b.spent_at.localeCompare(a.spent_at));
        const customTotalThisMonth = Math.round(customEntriesThisMonth.reduce((s, e) => s + Number(e.amount), 0) * 100) / 100;

        const { data: baskets, error: basketsErr } = await supabase
          .from('baskets')
          .select('id')
          .eq('user_id', userId)
          .gte('created_at', monthStart.toISOString())
          .lt('created_at', monthEnd.toISOString());
        if (basketsErr) throw basketsErr;
        const basketIds = (baskets ?? []).map((b) => b.id);
        if (basketIds.length === 0) {
          return NextResponse.json({ products: [], total_items: 0, custom_entries: customEntriesThisMonth, custom_total: customTotalThisMonth });
        }

        const { data: items, error: itemsErr } = await supabase
          .from('basket_items')
          .select('product_id, quantity_value')
          .in('basket_id', basketIds)
          .not('product_id', 'is', null);
        if (itemsErr) throw itemsErr;

        const qtyByProduct: Record<string, number> = {};
        for (const i of items ?? []) {
          const pid = i.product_id as string;
          qtyByProduct[pid] = (qtyByProduct[pid] ?? 0) + (i.quantity_value ?? 1);
        }

        const productIds = Object.keys(qtyByProduct);
        if (productIds.length === 0) {
          return NextResponse.json({ products: [], total_items: 0, custom_entries: customEntriesThisMonth, custom_total: customTotalThisMonth });
        }

        const [{ data: products, error: productsErr }, minPrices] = await Promise.all([
          supabase.from('products').select('id, name_he, name_en, category').in('id', productIds),
          minPriceByProduct(supabase, productIds),
        ]);
        if (productsErr) throw productsErr;

        const result = productIds
          .map((id) => {
            const p = products?.find((row) => row.id === id);
            return {
              product_id: id,
              name_he: p?.name_he ?? id,
              name_en: p?.name_en ?? null,
              category: p?.category ?? 'other',
              total_qty: qtyByProduct[id],
              cheapest_price: minPrices[id] ?? null,
            };
          })
          .sort((a, b) => b.total_qty - a.total_qty);

        const totalItems = Object.values(qtyByProduct).reduce((s, q) => s + q, 0);

        return NextResponse.json({
          products: result,
          total_items: totalItems,
          custom_entries: customEntriesThisMonth,
          custom_total: customTotalThisMonth,
        });
      }

      case 'custom_markets': {
        const userId = searchParams.get('user_id');
        if (!userId) return NextResponse.json({ error: 'user_id is required' }, { status: 400 });

        const { data: markets, error: marketsErr } = await supabase
          .from('custom_markets')
          .select('id, name, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: true });

        if (marketsErr) {
          // Table doesn't exist yet if migration 009 hasn't been applied —
          // degrade to an empty list rather than a 500, same pattern as
          // is_online (migration 006) before that migration landed.
          if (marketsErr.code === 'PGRST205') return NextResponse.json({ markets: [] });
          throw marketsErr;
        }

        const marketIds = (markets ?? []).map((m) => m.id);
        const { data: entries, error: entriesErr } = marketIds.length > 0
          ? await supabase.from('custom_market_entries').select('id, market_id, amount, note, spent_at')
              .in('market_id', marketIds).order('spent_at', { ascending: false })
          : { data: [] as Array<{ id: string; market_id: string; amount: number; note: string | null; spent_at: string }>, error: null };
        if (entriesErr) throw entriesErr;

        const result = (markets ?? []).map((m) => {
          const marketEntries = (entries ?? []).filter((e) => e.market_id === m.id);
          const total = marketEntries.reduce((s, e) => s + Number(e.amount), 0);
          return {
            id: m.id,
            name: m.name,
            total_spent: Math.round(total * 100) / 100,
            recent_entries: marketEntries.slice(0, 5),
          };
        });

        return NextResponse.json({ markets: result });
      }

      default:
        return NextResponse.json({ error: 'Unknown or missing type. Use one of: savings, chain_ranking, price_drops, top_products, price_trend, spending_overview, personal_chain_ranking, monthly_basket, custom_markets' }, { status: 400 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Analytics query failed';
    console.error('[analytics]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
