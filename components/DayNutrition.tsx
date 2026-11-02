'use client';

/**
 * Daily nutrition per person from the PLANNED meals (Plan v2, phase 7) — not
 * a food diary. Each eater of a planned meal is counted as eating one serving.
 * Per-serving values come from /api/nutrition/recipes (Health Ministry food
 * table, צמרת); targets from person_profiles / household_people (lib/people).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Info, Settings2 } from 'lucide-react';
import { authFetch } from '@/utils/authFetch';
import { supabase } from '@/utils/supabase';
import type { MealEntry } from '@/lib/recipes';
import { SLOTS, isoDate } from '@/lib/recipes';
import type { Nutrients } from '@/lib/foods';
import type { Targets } from '@/lib/nutrition';
import { loadTargets } from '@/lib/people';
import type { Member } from '@/components/PlanMealSheet';

type Lang = 'he' | 'en';
type Status = 'low' | 'ok' | 'high' | 'none';

const TEXT = {
  he: {
    week: 'ממוצע שבועי', meals: (n: number) => `${n} מתוך 3 ארוחות מתוכננות`, mealsWeek: (n: number) => `${n} ארוחות בשבוע`,
    noTargets: 'אין יעדים: הזינו שנת לידה ומין בפרופיל.', setUp: 'לפרופיל', nothing: 'אין ארוחות מתוכננות ביום הזה.',
    kcal: 'קלוריות', protein: 'חלבון', fat: 'שומן', carbs: 'פחמימות', fiber: 'סיבים', sodium: 'נתרן', sat_fat: 'שומן רווי', sugars: 'סוכרים',
    low: 'נמוך', ok: 'בטווח', high: 'גבוה', g: 'ג׳', mg: 'מ״ג',
    partial: 'רק הארוחות המתוכננות נספרות, אז ביום חלקי הערכים יהיו נמוכים מהיעד.',
    coverage: (p: number) => `חישבנו ${p}% מהמצרכים; השאר לא זוהו בטבלה או בלי כמות.`,
    source: 'ערכים תזונתיים: מאגר צמרת, משרד הבריאות. הערכה בלבד, לא ייעוץ תזונתי.', error: 'לא הצלחנו לחשב כרגע',
  },
  en: {
    week: 'Week average', meals: (n: number) => `${n} of 3 meals planned`, mealsWeek: (n: number) => `${n} meals this week`,
    noTargets: 'No targets: add birth year and sex in Profile.', setUp: 'Profile', nothing: 'No meals planned this day.',
    kcal: 'Calories', protein: 'Protein', fat: 'Fat', carbs: 'Carbs', fiber: 'Fiber', sodium: 'Sodium', sat_fat: 'Sat. fat', sugars: 'Sugars',
    low: 'Low', ok: 'In range', high: 'High', g: 'g', mg: 'mg',
    partial: 'Only planned meals count, so a partly planned day comes out below target.',
    coverage: (p: number) => `${p}% of ingredients counted; the rest weren't found in the table or had no amount.`,
    source: 'Nutrition values: Tzameret database, Israel Ministry of Health. An estimate, not dietary advice.', error: "Couldn't work it out right now",
  },
};

const DAY_SHORT: Record<Lang, string[]> = { he: ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };

interface RecipeNutrition { perServing: Nutrients; coverage: number; unmatched: string[] }

function statusFor(v: number, lo: number | null, hi: number | null): Status {
  if (lo != null && v < lo) return 'low';
  if (hi != null && v > hi) return 'high';
  return lo == null && hi == null ? 'none' : 'ok';
}

const STATUS_CLS: Record<Status, string> = {
  low: 'text-amber-600 dark:text-amber-400',
  ok: 'text-[var(--color-success)]',
  high: 'text-red-600 dark:text-red-400',
  none: 'text-[var(--color-text-muted)]',
};
const BAR_CLS: Record<Status, string> = { low: 'bg-amber-500', ok: 'bg-[var(--color-success)]', high: 'bg-red-500', none: 'bg-[var(--color-text-muted)]' };

export interface DayNutritionProps {
  lang: Lang;
  days: Date[];
  entries: MealEntry[];

  members: Member[];
  onOpenProfile?: () => void;
}

export function DayNutrition({ lang, days, entries, members, onOpenProfile }: DayNutritionProps) {
  const tx = TEXT[lang];
  const todayIso = isoDate(new Date());
  const isos = days.map(isoDate);
  const [day, setDay] = useState<string>(() => (isos.includes(todayIso) ? todayIso : isos[0]));
  const [byRecipe, setByRecipe] = useState<Record<string, RecipeNutrition>>({});
  const [targets, setTargets] = useState<Record<string, Targets | null>>({});
  const [state, setState] = useState<'loading' | 'idle' | 'error'>('loading');

  useEffect(() => { if (!isos.includes(day) && day !== 'week') setDay(isos.includes(todayIso) ? todayIso : isos[0]); }, [isos.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const recipeIds = useMemo(() => [...new Set(entries.map((e) => e.recipe_id))].sort(), [entries]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState('loading');
      try {
        if (recipeIds.length) {
          const res = await authFetch('/api/nutrition/recipes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: recipeIds }) });
          if (!res.ok) throw new Error();
          const data = await res.json();
          if (!cancelled) setByRecipe(data.recipes ?? {});
        }
        if (!cancelled) setState('idle');
      } catch { if (!cancelled) setState('error'); }
    })();
    return () => { cancelled = true; };
  }, [recipeIds.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const memberIds = members.map((m) => m.user_id);
  useEffect(() => { loadTargets(supabase, memberIds).then(setTargets).catch(() => {}); }, [memberIds.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  // Per person: totals for the chosen day (or the week's daily average).
  const people = useMemo(() => {
    const chosen = day === 'week' ? entries : entries.filter((e) => e.plan_date === day);
    const divide = day === 'week' ? 7 : 1;
    return members.map((m) => {
      const mine = chosen.filter((e) => (e.eaters ?? memberIds).includes(m.user_id));
      const sum: Nutrients = { kcal: 0, protein: 0, fat: 0, sat_fat: 0, carbs: 0, sugars: 0, fiber: 0, sodium: 0 };
      let covW = 0; let covN = 0;
      for (const e of mine) {
        const n = byRecipe[e.recipe_id];
        if (!n) continue;
        (Object.keys(sum) as Array<keyof Nutrients>).forEach((k) => { sum[k] += n.perServing[k] / divide; });
        covW += n.coverage; covN++;
      }
      const slots = day === 'week' ? mine.length : new Set(mine.map((e) => e.slot)).size;
      return { member: m, sum, meals: slots, coverage: covN ? covW / covN : 1 };
    });
  }, [day, entries, members, byRecipe]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (v: number) => Math.round(v).toLocaleString(lang === 'he' ? 'he-IL' : 'en-US');
  const chip = (on: boolean) => `shrink-0 min-h-[36px] min-w-[40px] px-2.5 rounded-full text-xs font-semibold border ${on
    ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)] border-transparent'
    : 'border-[var(--color-border)] text-[var(--color-text-secondary)] bg-[var(--color-bg-panel)]'}`;

  const lowCoverage = people.some((p) => p.meals > 0 && p.coverage < 0.8);
  const avgCoverage = Math.round(100 * (people.filter((p) => p.meals > 0).reduce((s, p) => s + p.coverage, 0) / Math.max(1, people.filter((p) => p.meals > 0).length)));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {days.map((d, i) => (
          <button key={isos[i]} type="button" onClick={() => setDay(isos[i])} className={chip(day === isos[i])}>
            {DAY_SHORT[lang][d.getDay()]}{isos[i] === todayIso ? ' •' : ''}
          </button>
        ))}
        <button type="button" onClick={() => setDay('week')} className={chip(day === 'week')}>{tx.week}</button>
      </div>

      {state === 'loading' ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-accent)]" /></div>
      ) : state === 'error' ? (
        <p className="text-sm text-center text-[var(--color-text-muted)] py-8">{tx.error}</p>
      ) : (
        <>
          {people.map(({ member, sum, meals }) => {
            const t = targets[member.user_id] ?? null;
            const rows: Array<{ key: keyof Nutrients; label: string; unit: string; lo: number | null; hi: number | null }> = [
              { key: 'kcal', label: tx.kcal, unit: '', lo: t?.kcal[0] ?? null, hi: t?.kcal[1] ?? null },
              { key: 'protein', label: tx.protein, unit: tx.g, lo: t?.protein_g[0] ?? null, hi: t?.protein_g[1] ?? null },
              { key: 'fat', label: tx.fat, unit: tx.g, lo: t?.fat_g[0] ?? null, hi: t?.fat_g[1] ?? null },
              { key: 'carbs', label: tx.carbs, unit: tx.g, lo: t?.carbs_g[0] ?? null, hi: t?.carbs_g[1] ?? null },
              { key: 'fiber', label: tx.fiber, unit: tx.g, lo: t?.fiber_g_min ?? null, hi: null },
              { key: 'sodium', label: tx.sodium, unit: tx.mg, lo: null, hi: t?.sodium_mg_max ?? null },
              { key: 'sat_fat', label: tx.sat_fat, unit: tx.g, lo: null, hi: t?.sat_fat_g_max ?? null },
              { key: 'sugars', label: tx.sugars, unit: tx.g, lo: null, hi: t?.sugars_g_max ?? null },
            ];
            return (
              <section key={member.user_id} className="rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-bg-panel)] p-3 flex flex-col gap-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-bold text-[var(--color-text-primary)] truncate" dir="auto">{member.nickname || '—'}</h3>
                  <span className="text-[11px] text-[var(--color-text-muted)]">{day === 'week' ? tx.mealsWeek(meals) : tx.meals(meals)}</span>
                </div>
                {meals === 0 && day !== 'week' ? (
                  <p className="text-xs text-[var(--color-text-muted)]">{tx.nothing}</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {rows.map((r) => {
                      const v = sum[r.key];
                      const st = statusFor(v, r.lo, r.hi);
                      const scale = Math.max(r.hi ?? 0, r.lo ?? 0, v, 1) * (r.hi ? 1.15 : 1.4);
                      return (
                        <div key={r.key} className={r.key === 'kcal' ? 'pb-1' : ''}>
                          <div className="flex items-baseline justify-between gap-2 text-xs">
                            <span className={`text-[var(--color-text-secondary)] ${r.key === 'kcal' ? 'font-semibold' : ''}`}>{r.label}</span>
                            <span className="tabular-nums">
                              <span className="font-semibold text-[var(--color-text-primary)]">{fmt(v)}{r.unit && ` ${r.unit}`}</span>
                              {(r.lo != null || r.hi != null) && (
                                <span className="text-[var(--color-text-muted)]"> / {r.lo != null && r.hi != null ? `${fmt(r.lo)}–${fmt(r.hi)}` : r.lo != null ? `≥${fmt(r.lo)}` : `≤${fmt(r.hi!)}`}</span>
                              )}
                              {st !== 'none' && <span className={`ms-1.5 font-semibold ${STATUS_CLS[st]}`}>{tx[st]}</span>}
                            </span>
                          </div>
                          <div className="relative h-1.5 mt-1 rounded-full bg-[var(--color-bg-subtle)] overflow-hidden" aria-hidden>
                            {r.lo != null && r.hi != null && (
                              <span className="absolute inset-y-0 bg-[var(--color-success)]/20" style={{ insetInlineStart: `${(r.lo / scale) * 100}%`, width: `${((r.hi - r.lo) / scale) * 100}%` }} />
                            )}
                            <span className={`absolute inset-y-0 start-0 rounded-full ${BAR_CLS[st]}`} style={{ width: `${Math.min(100, (v / scale) * 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    {!t && (
                      <p className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1.5">
                        <Settings2 className="w-3.5 h-3.5 shrink-0" /> {tx.noTargets}
                        {onOpenProfile && <button type="button" onClick={onOpenProfile} className="underline text-[var(--color-accent)]">{tx.setUp}</button>}
                      </p>
                    )}
                  </div>
                )}
              </section>
            );
          })}
          <div className="flex flex-col gap-1 text-[11px] text-[var(--color-text-muted)]">
            {day !== 'week' && people.some((p) => p.meals > 0 && p.meals < SLOTS.length) && <p className="flex gap-1.5"><Info className="w-3.5 h-3.5 shrink-0 mt-px" /> {tx.partial}</p>}
            {lowCoverage && <p>{tx.coverage(avgCoverage)}</p>}
            <p>{tx.source}</p>
          </div>
        </>
      )}
    </div>
  );
}
