/**
 * Insights (Plan v2, phase 8): what the household spent, what it buys most,
 * and how healthy that is — computed in the browser from data the household
 * can already read (RLS): shopping_trips + trip_items ("Done shopping"),
 * product_price_monthly, product_info (phase 5) and the meal plan (phase 4/6).
 * All money is the app's ESTIMATE at the time of the trip, not a receipt.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeCategory } from '@/lib/categories';
import { loadRecipes, Recipe } from '@/lib/recipes';
import { HealthBand, healthOf } from '@/lib/suggest';

export interface Trip { id: string; user_id: string; chain_id: string | null; store_label: string | null; done_at: string; est_total: number; item_count: number; priced_count: number }
export interface TripItem { trip_id: string; product_id: string | null; custom_product_id: string | null; name: string; category: string | null; quantity: number; quantity_unit: string | null; unit_price: number | null }
export interface Chain { id: string; name_he: string; name_en: string | null; color_hex: string | null }
interface Info { product_id: string; status: string; nutriscore: string | null; red_flags: string[] | null }
interface Monthly { product_id: string; chain_id: string; month: string; avg_price: number }

export interface InsightData {
  trips: Trip[];
  items: TripItem[];
  chains: Chain[];
  info: Map<string, Info>;
  monthly: Monthly[];
  recipes: Recipe[];
  meals: Array<{ plan_date: string; recipe_id: string }>;
  since: Date;
}

const NON_FOOD = new Set(['personal_care', 'household', 'baby']);

export function monthKey(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
}

function chunks<T>(list: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

/** Everything the Insights screen needs for the last `months` months (this one included). */
export async function loadInsightData(supabase: SupabaseClient, householdId: string, months: number): Promise<InsightData> {
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const [tripsRes, chainsRes, recipes, mealsRes] = await Promise.all([
    supabase.from('shopping_trips').select('id, user_id, chain_id, store_label, done_at, est_total, item_count, priced_count')
      .eq('household_id', householdId).gte('done_at', since.toISOString()).order('done_at'),
    supabase.from('chains').select('id, name_he, name_en, color_hex'),
    loadRecipes(supabase, householdId).catch(() => [] as Recipe[]),
    supabase.from('meal_plan_entries').select('plan_date, recipe_id').eq('household_id', householdId)
      .gte('plan_date', since.toISOString().slice(0, 10)),
  ]);
  if (tripsRes.error) throw tripsRes.error;
  const trips = ((tripsRes.data ?? []) as Trip[]).map((t) => ({ ...t, est_total: Number(t.est_total) || 0 }));

  const items: TripItem[] = [];
  for (const ids of chunks(trips.map((t) => t.id), 150)) {
    const { data, error } = await supabase.from('trip_items')
      .select('trip_id, product_id, custom_product_id, name, category, quantity, quantity_unit, unit_price').in('trip_id', ids);
    if (error) throw error;
    items.push(...((data ?? []) as TripItem[]).map((i) => ({ ...i, quantity: Number(i.quantity) || 0, unit_price: i.unit_price == null ? null : Number(i.unit_price) })));
  }

  const productIds = [...new Set(items.map((i) => i.product_id).filter((x): x is string => !!x))];
  const info = new Map<string, Info>();
  const monthly: Monthly[] = [];
  const fromMonth = new Date(since.getFullYear(), since.getMonth() - 3, 1).toISOString().slice(0, 10);
  for (const ids of chunks(productIds, 150)) {
    const [a, b] = await Promise.all([
      supabase.from('product_info').select('product_id, status, nutriscore, red_flags').in('product_id', ids),
      supabase.from('product_price_monthly').select('product_id, chain_id, month, avg_price').in('product_id', ids).gte('month', fromMonth),
    ]);
    for (const r of (a.data ?? []) as Info[]) info.set(r.product_id, r);
    monthly.push(...((b.data ?? []) as Monthly[]).map((m) => ({ ...m, avg_price: Number(m.avg_price) })));
  }

  return {
    trips, items, chains: (chainsRes.data ?? []) as Chain[], info, monthly, recipes,
    meals: (mealsRes.data ?? []) as Array<{ plan_date: string; recipe_id: string }>, since,
  };
}

// ─── Spending ───────────────────────────────────────────────────────────────

export interface MonthSpend { month: string; total: number; trips: number }

export function spendByMonth(d: InsightData, months: number): MonthSpend[] {
  const keys: string[] = [];
  for (let i = 0; i < months; i++) keys.push(monthKey(new Date(d.since.getFullYear(), d.since.getMonth() + i, 1)));
  const by = new Map(keys.map((k) => [k, { month: k, total: 0, trips: 0 }]));
  for (const t of d.trips) {
    const row = by.get(monthKey(t.done_at));
    if (row) { row.total += t.est_total; row.trips++; }
  }
  return keys.map((k) => by.get(k)!);
}

export function spendByChain(d: InsightData): Array<{ chain: Chain | null; label: string; total: number; trips: number }> {
  const by = new Map<string, { total: number; trips: number }>();
  for (const t of d.trips) {
    const k = t.chain_id ?? `label:${t.store_label ?? ''}`;
    const row = by.get(k) ?? { total: 0, trips: 0 };
    row.total += t.est_total; row.trips++;
    by.set(k, row);
  }
  return [...by.entries()].map(([k, v]) => {
    const chain = d.chains.find((c) => c.id === k) ?? null;
    return { chain, label: chain ? chain.name_he : (k.slice(6) || '—'), ...v };
  }).sort((a, b) => b.total - a.total);
}

export function spendByAisle(d: InsightData): Array<{ category: string; total: number }> {
  const by = new Map<string, number>();
  for (const i of d.items) {
    if (i.unit_price == null) continue;
    const c = normalizeCategory(i.category);
    by.set(c, (by.get(c) ?? 0) + i.unit_price * i.quantity);
  }
  return [...by.entries()].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
}

// ─── Most bought ────────────────────────────────────────────────────────────

export interface TopProduct {
  key: string; name: string; productId: string | null; times: number; spend: number;
  lastPrice: number | null;
  /** Average price this month vs about three months ago at the chain they're usually bought at (%). */
  priceChange: number | null;
}

export function topProducts(d: InsightData, limit = 10): TopProduct[] {
  const tripChain = new Map(d.trips.map((t) => [t.id, t.chain_id]));
  const tripTime = new Map(d.trips.map((t) => [t.id, t.done_at]));
  const by = new Map<string, TopProduct & { tripsSeen: Set<string>; chains: Map<string, number>; lastAt: string }>();
  for (const i of d.items) {
    const key = i.product_id ? `p:${i.product_id}` : i.custom_product_id ? `c:${i.custom_product_id}` : `n:${i.name.trim().toLowerCase()}`;
    const row = by.get(key) ?? { key, name: i.name, productId: i.product_id, times: 0, spend: 0, lastPrice: null, priceChange: null, tripsSeen: new Set(), chains: new Map(), lastAt: '' };
    if (!row.tripsSeen.has(i.trip_id)) { row.tripsSeen.add(i.trip_id); row.times++; }
    if (i.unit_price != null) row.spend += i.unit_price * i.quantity;
    const at = tripTime.get(i.trip_id) ?? '';
    if (at >= row.lastAt) { row.lastAt = at; row.name = i.name; if (i.unit_price != null) row.lastPrice = i.unit_price; }
    const ch = tripChain.get(i.trip_id);
    if (ch) row.chains.set(ch, (row.chains.get(ch) ?? 0) + 1);
    by.set(key, row);
  }
  const list = [...by.values()].sort((a, b) => b.times - a.times || b.spend - a.spend).slice(0, limit);
  for (const p of list) {
    if (!p.productId) continue;
    const chain = [...p.chains.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const rows = d.monthly.filter((m) => m.product_id === p.productId && (!chain || m.chain_id === chain)).sort((a, b) => a.month.localeCompare(b.month));
    if (rows.length >= 2) {
      const last = rows[rows.length - 1];
      const lastDate = new Date(last.month);
      const target = new Date(lastDate.getFullYear(), lastDate.getMonth() - 3, 1).toISOString().slice(0, 10);
      const base = rows.find((r) => r.month >= target) ?? rows[0];
      if (base !== last && base.avg_price > 0) p.priceChange = Math.round(((last.avg_price - base.avg_price) / base.avg_price) * 1000) / 10;
    }
  }
  return list.map(({ key, name, productId, times, spend, lastPrice, priceChange }) => ({ key, name, productId, times, spend, lastPrice, priceChange }));
}

// ─── Health ─────────────────────────────────────────────────────────────────

export type Grade = 'a' | 'b' | 'c' | 'd' | 'e';
export const GRADES: Grade[] = ['a', 'b', 'c', 'd', 'e'];

export interface HealthMix {
  /** Spend on food items by Nutri-Score grade (₪). */
  byGrade: Record<Grade, number>;
  /** Food spend with no grade known. */
  ungraded: number;
  /** Share of graded food spend with at least one Israeli red label. */
  redShare: number | null;
  foodSpend: number;
  gradedShare: number;
}

export function healthMix(d: InsightData): HealthMix {
  const byGrade: Record<Grade, number> = { a: 0, b: 0, c: 0, d: 0, e: 0 };
  let ungraded = 0; let red = 0; let flagged = 0; let food = 0;
  for (const i of d.items) {
    if (NON_FOOD.has(normalizeCategory(i.category))) continue;
    if (i.unit_price == null) continue; // weighted by spend, so unpriced items can't count
    const spend = i.unit_price * i.quantity;
    food += spend;
    const inf = i.product_id ? d.info.get(i.product_id) : undefined;
    const g = (inf?.nutriscore ?? '').toLowerCase() as Grade;
    if (GRADES.includes(g)) byGrade[g] += spend; else ungraded += spend;
    if (inf?.status === 'found') { flagged += spend; if ((inf.red_flags ?? []).length > 0) red += spend; }
  }
  const graded = food - ungraded;
  return { byGrade, ungraded, redShare: flagged > 0 ? red / flagged : null, foodSpend: food, gradedShare: food > 0 ? graded / food : 0 };
}

/** Planned meals in the period by health band (phase 6 estimate). */
export function mealsHealth(d: InsightData): Record<HealthBand, number> & { total: number } {
  const byId = new Map(d.recipes.map((r) => [r.id, r]));
  const out = { healthy: 0, balanced: 0, occasional: 0, total: 0 };
  for (const m of d.meals) {
    const r = byId.get(m.recipe_id);
    if (!r) continue;
    out[healthOf(r).band]++; out.total++;
  }
  return out;
}

// ─── Debug: sample trips ────────────────────────────────────────────────────

/** Debug panel: ~8 trips over the last four months from real catalog products at the user's chain. */
export async function seedSampleTrips(supabase: SupabaseClient, householdId: string, chainId: string): Promise<number> {
  const { data: prices } = await supabase.from('active_chain_prices').select('product_id, price').eq('chain_id', chainId).limit(400);
  const pool = ((prices ?? []) as Array<{ product_id: string; price: number }>).sort(() => Math.random() - 0.5).slice(0, 40);
  if (pool.length === 0) return 0;
  const { data: products } = await supabase.from('products').select('id, name_he, category').in('id', pool.map((p) => p.product_id));
  const meta = new Map(((products ?? []) as Array<{ id: string; name_he: string; category: string | null }>).map((p) => [p.id, p]));
  const staples = pool.slice(0, 12);
  let made = 0;
  for (let k = 0; k < 8; k++) {
    const when = new Date();
    when.setDate(when.getDate() - Math.round(k * 15 + Math.random() * 6));
    const pick = [...staples.filter(() => Math.random() < 0.7), ...pool.slice(12).filter(() => Math.random() < 0.25)];
    const rows = pick.filter((p) => meta.has(p.product_id)).map((p) => {
      const qty = 1 + Math.floor(Math.random() * 3);
      return { product_id: p.product_id, name: meta.get(p.product_id)!.name_he, category: meta.get(p.product_id)!.category, quantity: qty, quantity_unit: 'unit', unit_price: Number(p.price), price_source: 'chain' };
    });
    if (rows.length === 0) continue;
    const total = rows.reduce((s, r) => s + r.unit_price * r.quantity, 0);
    const { data: trip, error } = await supabase.from('shopping_trips').insert({
      household_id: householdId, chain_id: chainId, store_label: 'Sample', done_at: when.toISOString(),
      est_total: Math.round(total * 100) / 100, item_count: rows.length, priced_count: rows.length,
    }).select('id').single();
    if (error || !trip) continue;
    await supabase.from('trip_items').insert(rows.map((r) => ({ ...r, trip_id: trip.id })));
    made++;
  }
  return made;
}
