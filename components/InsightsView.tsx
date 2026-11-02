'use client';

/**
 * Insights tab (Plan v2, phase 8; replaces Analytics): spending by month,
 * chain and aisle from the household's "Done shopping" trips, the products it
 * buys most with their price movement, and how healthy the food it buys and
 * the meals it plans are. Everything is an estimate (lib/insights.ts).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Loader2, ShoppingBag, TrendingUp, Leaf, Info } from 'lucide-react';
import { supabase } from '@/utils/supabase';
import { categoryLabel } from '@/lib/categories';
import { GRADE_COLOR } from '@/lib/health';
import {
  GRADES, InsightData, healthMix, loadInsightData, mealsHealth, monthKey, spendByAisle, spendByChain, spendByMonth, topProducts,
} from '@/lib/insights';

type Lang = 'he' | 'en';

const TEXT = {
  he: {
    title: 'תובנות', months: (n: number) => `${n} חודשים`,
    thisMonth: 'החודש עד עכשיו', vsLast: (p: string) => `${p} לעומת החודש שעבר`, lastMonth: 'החודש שעבר', perTrip: 'ממוצע לקנייה', trips: 'קניות',
    byMonth: 'הוצאה לפי חודש', byChain: 'לפי רשת', byAisle: 'לפי מחלקה', top: 'הכי נקנים', times: (n: number) => `${n} פעמים`,
    priceUp: 'התייקר', priceDown: 'הוזל', priceNote: 'שינוי מחיר: ממוצע החודש לעומת לפני כ-3 חודשים, ברשת שבה קונים אותו בדרך כלל.',
    health: 'כמה בריא מה שקונים', graded: (p: number) => `יש דירוג Nutri-Score ל-${p}% מההוצאה על מזון`, red: (p: number) => `${p}% מההוצאה המדורגת עם סימון אדום`,
    ungraded: 'ללא דירוג', meals: 'הארוחות המתוכננות', healthy: 'בריא', balanced: 'מאוזן', occasional: 'לפעמים', mealsNone: 'אין ארוחות מתוכננות בתקופה הזו.',
    empty: 'עוד אין קניות שמורות. בסוף קנייה לחצו "סיימתי לקנות" ברשימה, והתובנות יתחילו להתמלא.',
    estimate: 'כל הסכומים הם הערכה לפי מחירי הרשתות ביום הקנייה, לא קבלה.', error: 'לא הצלחנו לטעון את התובנות',
    other: 'אחר', noGradeYet: 'עוד אין דירוגים: הם נטענים כשמוצרים מופיעים ברשימה.',
  },
  en: {
    title: 'Insights', months: (n: number) => `${n} months`,
    thisMonth: 'This month so far', vsLast: (p: string) => `${p} vs last month`, lastMonth: 'Last month', perTrip: 'Average per trip', trips: 'Trips',
    byMonth: 'Spending by month', byChain: 'By chain', byAisle: 'By aisle', top: 'Bought most often', times: (n: number) => `${n}×`,
    priceUp: 'up', priceDown: 'down', priceNote: 'Price change: this month’s average vs about 3 months ago, at the chain where it’s usually bought.',
    health: 'How healthy is what we buy', graded: (p: number) => `${p}% of food spending has a Nutri-Score`, red: (p: number) => `${p}% of graded spending carries a red label`,
    ungraded: 'No grade', meals: 'Planned meals', healthy: 'Healthy', balanced: 'Balanced', occasional: 'Occasional', mealsNone: 'No meals planned in this period.',
    empty: 'No saved trips yet. When you finish shopping, tap "Done shopping" on the list and Insights start to fill in.',
    estimate: 'All amounts are estimates from chain prices on the day of the trip, not receipts.', error: "Couldn't load insights",
    other: 'Other', noGradeYet: 'No grades yet: they load as products appear on the list.',
  },
};

const MONTH_NAME: Record<Lang, string[]> = {
  he: ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

const card = 'rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-bg-panel)] p-4 flex flex-col gap-3';
const h2 = 'text-sm font-bold text-[var(--color-text-primary)]';

export function InsightsView({ householdId, lang }: { householdId: string | null; lang: Lang }) {
  const tx = TEXT[lang];
  const [months, setMonths] = useState(6);
  const [data, setData] = useState<InsightData | null>(null);
  const [state, setState] = useState<'loading' | 'idle' | 'error'>('loading');
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    if (!householdId) return;
    let cancelled = false;
    setState('loading');
    loadInsightData(supabase, householdId, months)
      .then((d) => { if (!cancelled) { setData(d); setState('idle'); } })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  }, [householdId, months]);

  const money = (v: number, digits = 0) => `₪${v.toLocaleString(lang === 'he' ? 'he-IL' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  const monthLabel = (k: string) => MONTH_NAME[lang][Number(k.slice(5)) - 1];

  const view = useMemo(() => {
    if (!data) return null;
    const byMonth = spendByMonth(data, months);
    const nowKey = monthKey(new Date());
    const cur = byMonth.find((m) => m.month === nowKey)?.total ?? 0;
    const prev = byMonth[byMonth.length - 2]?.total ?? 0;
    const total = data.trips.reduce((s, t) => s + t.est_total, 0);
    const aisles = spendByAisle(data);
    return {
      byMonth, cur, prev, total, perTrip: data.trips.length ? total / data.trips.length : 0,
      chains: spendByChain(data), aisles: aisles.length > 6 ? [...aisles.slice(0, 5), { category: '__other', total: aisles.slice(5).reduce((s, a) => s + a.total, 0) }] : aisles,
      top: topProducts(data, 10), mix: healthMix(data), meals: mealsHealth(data),
    };
  }, [data, months]);

  const chip = (on: boolean) => `min-h-[36px] px-3 rounded-full text-xs font-semibold border ${on
    ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)] border-transparent'
    : 'border-[var(--color-border)] text-[var(--color-text-secondary)] bg-[var(--color-bg-panel)]'}`;

  return (
    <div className="flex-1 flex flex-col gap-4 max-w-lg mx-auto w-full pb-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{tx.title}</h1>
        <div className="flex gap-1.5">
          {[3, 6, 12].map((n) => <button key={n} type="button" onClick={() => setMonths(n)} aria-pressed={months === n} className={chip(months === n)}>{tx.months(n)}</button>)}
        </div>
      </div>

      {state === 'loading' || !view ? (
        state === 'error'
          ? <p className="text-sm text-center text-[var(--color-text-muted)] py-12">{tx.error}</p>
          : <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-accent)]" /></div>
      ) : data!.trips.length === 0 ? (
        <>
          <div className="flex flex-col items-center text-center gap-3 py-12 px-6 text-[var(--color-text-muted)]">
            <ShoppingBag className="w-12 h-12 opacity-40" />
            <p className="text-sm">{tx.empty}</p>
          </div>
          <MealsCard view={view} tx={tx} />
        </>
      ) : (
        <>
          {/* Headline */}
          <section className={card}>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <span className="block text-xs text-[var(--color-text-muted)]">{tx.thisMonth}</span>
                <span className="block text-3xl font-bold text-[var(--color-text-primary)] tabular-nums">{money(view.cur)}</span>
                {view.prev > 0 && (() => {
                  const pct = Math.round(((view.cur - view.prev) / view.prev) * 100);
                  return <span className="block text-xs text-[var(--color-text-secondary)]">{tx.vsLast(`${pct > 0 ? '+' : ''}${pct}%`)} ({tx.lastMonth}: {money(view.prev)})</span>;
                })()}
              </div>
              <div><span className="block text-[11px] text-[var(--color-text-muted)]">{tx.perTrip}</span><span className="text-lg font-semibold tabular-nums text-[var(--color-text-primary)]">{money(view.perTrip)}</span></div>
              <div><span className="block text-[11px] text-[var(--color-text-muted)]">{tx.trips}</span><span className="text-lg font-semibold tabular-nums text-[var(--color-text-primary)]">{data!.trips.length}</span></div>
            </div>
          </section>

          {/* By month */}
          <section className={card}>
            <h2 className={h2}>{tx.byMonth}</h2>
            {(() => {
              const max = Math.max(1, ...view.byMonth.map((m) => m.total));
              const peak = view.byMonth.reduce((a, b) => (b.total > a.total ? b : a), view.byMonth[0]);
              return (
                <div className="flex items-end gap-1.5 h-40 pt-5" role="img" aria-label={tx.byMonth} dir="ltr">
                  {view.byMonth.map((m) => {
                    const show = hover === m.month || m.month === peak.month || m === view.byMonth[view.byMonth.length - 1];
                    return (
                      <div key={m.month} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center gap-1"
                        onMouseEnter={() => setHover(m.month)} onMouseLeave={() => setHover(null)} onClick={() => setHover(hover === m.month ? null : m.month)}
                        title={`${monthLabel(m.month)} ${m.month.slice(0, 4)}: ${money(m.total)} · ${m.trips} ${tx.trips}`}>
                        <span className={`text-[10px] tabular-nums text-[var(--color-text-secondary)] whitespace-nowrap ${show && m.total > 0 ? '' : 'invisible'}`}>{money(m.total)}</span>
                        <div className={`w-full max-w-[36px] rounded-t-[4px] transition-opacity ${m.total > 0 ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-bg-subtle)]'} ${hover && hover !== m.month ? 'opacity-50' : ''}`}
                          style={{ height: `${Math.max(2, (m.total / max) * 100)}%` }} />
                        <span className="text-[10px] text-[var(--color-text-muted)]">{monthLabel(m.month)}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </section>

          {/* By chain + by aisle */}
          <section className={card}>
            <h2 className={h2}>{tx.byChain}</h2>
            <Bars rows={view.chains.map((c) => ({ key: c.chain?.id ?? c.label, label: c.chain ? (lang === 'he' ? c.chain.name_he : c.chain.name_en || c.chain.name_he) : c.label, value: c.total, note: `${c.trips} ${tx.trips}` }))} money={money} />
            <h2 className={`${h2} pt-2`}>{tx.byAisle}</h2>
            <Bars rows={view.aisles.map((a) => ({ key: a.category, label: a.category === '__other' ? tx.other : categoryLabel(a.category, lang), value: a.total }))} money={money} />
          </section>

          {/* Most bought */}
          <section className={card}>
            <h2 className={`${h2} flex items-center gap-1.5`}><TrendingUp className="w-4 h-4" /> {tx.top}</h2>
            <ol className="flex flex-col divide-y divide-[var(--color-border)]/50">
              {view.top.map((p) => (
                <li key={p.key} className="py-2 flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-[var(--color-text-primary)] truncate" dir="auto">{p.name}</span>
                    <span className="block text-[11px] text-[var(--color-text-muted)] tabular-nums">{tx.times(p.times)} · {money(p.spend)}{p.lastPrice != null ? ` · ${money(p.lastPrice, 2)}` : ''}</span>
                  </span>
                  {p.priceChange != null && Math.abs(p.priceChange) >= 1 && (
                    <span className={`shrink-0 inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${p.priceChange > 0 ? 'text-red-600 dark:text-red-400' : 'text-[var(--color-success)]'}`}
                      title={p.priceChange > 0 ? tx.priceUp : tx.priceDown}>
                      {p.priceChange > 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                      {p.priceChange > 0 ? '+' : ''}{p.priceChange}%
                    </span>
                  )}
                </li>
              ))}
            </ol>
            <p className="text-[11px] text-[var(--color-text-muted)]">{tx.priceNote}</p>
          </section>

          {/* Health of what we buy */}
          <section className={card}>
            <h2 className={`${h2} flex items-center gap-1.5`}><Leaf className="w-4 h-4" /> {tx.health}</h2>
            {view.mix.foodSpend - view.mix.ungraded <= 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">{tx.noGradeYet}</p>
            ) : (
              <>
                <div className="flex h-7 rounded-lg overflow-hidden gap-[2px] bg-[var(--color-bg-panel)]" dir="ltr" role="img" aria-label="Nutri-Score">
                  {GRADES.map((g) => {
                    const v = view.mix.byGrade[g];
                    const graded = view.mix.foodSpend - view.mix.ungraded;
                    if (v <= 0) return null;
                    return (
                      <div key={g} style={{ width: `${(v / graded) * 100}%`, background: GRADE_COLOR[g] }} title={`${g.toUpperCase()}: ${Math.round((v / graded) * 100)}%`}
                        className="flex items-center justify-center text-[11px] font-bold text-white min-w-[18px]">{g.toUpperCase()}</div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--color-text-secondary)]" dir="ltr">
                  {GRADES.map((g) => {
                    const graded = view.mix.foodSpend - view.mix.ungraded;
                    return <span key={g} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: GRADE_COLOR[g] }} />{g.toUpperCase()} {Math.round((view.mix.byGrade[g] / graded) * 100)}%</span>;
                  })}
                </div>
                <p className="text-[11px] text-[var(--color-text-muted)]">
                  {tx.graded(Math.round(view.mix.gradedShare * 100))}
                  {view.mix.redShare != null && <> · {tx.red(Math.round(view.mix.redShare * 100))}</>}
                </p>
              </>
            )}
          </section>

          <MealsCard view={view} tx={tx} />

          <p className="text-[11px] text-[var(--color-text-muted)] flex gap-1.5"><Info className="w-3.5 h-3.5 shrink-0 mt-px" /> {tx.estimate}</p>
        </>
      )}
    </div>
  );
}

function MealsCard({ view, tx }: { view: { meals: { healthy: number; balanced: number; occasional: number; total: number } }; tx: typeof TEXT['he'] }) {
  const m = view.meals;
  const rows: Array<[string, number, string]> = [
    [tx.healthy, m.healthy, 'bg-[var(--color-success)]'],
    [tx.balanced, m.balanced, 'bg-[var(--color-text-muted)]'],
    [tx.occasional, m.occasional, 'bg-amber-500'],
  ];
  return (
    <section className={card}>
      <h2 className={h2}>{tx.meals}</h2>
      {m.total === 0 ? <p className="text-xs text-[var(--color-text-muted)]">{tx.mealsNone}</p> : (
        <div className="flex flex-col gap-2">
          {rows.map(([label, n, cls]) => (
            <div key={label} className="flex items-center gap-2 text-xs">
              <span className="w-20 shrink-0 text-[var(--color-text-secondary)]">{label}</span>
              <div className="flex-1 h-2 rounded-full bg-[var(--color-bg-subtle)] overflow-hidden"><div className={`h-full rounded-full ${cls}`} style={{ width: `${(n / m.total) * 100}%` }} /></div>
              <span className="w-12 text-end tabular-nums text-[var(--color-text-primary)]">{n} · {Math.round((n / m.total) * 100)}%</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Bars({ rows, money }: { rows: Array<{ key: string; label: string; value: number; note?: string }>; money: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.key} className="flex flex-col gap-1" title={`${r.label}: ${money(r.value)}${r.note ? ` · ${r.note}` : ''}`}>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-[var(--color-text-secondary)]" dir="auto">{r.label}</span>
            <span className="tabular-nums font-semibold text-[var(--color-text-primary)]">{money(r.value)}{r.note && <span className="font-normal text-[var(--color-text-muted)]"> · {r.note}</span>}</span>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--color-bg-subtle)] overflow-hidden"><div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}
