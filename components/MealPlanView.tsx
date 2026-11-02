'use client';

/**
 * Meals tab (Plan v2, phase 4): the week as days × breakfast / lunch / dinner.
 * Tap + to plan a recipe, tap a meal to change servings / who eats / remove.
 * "Add week to list" sends every planned meal not yet on the list: amounts
 * scaled by servings, the same product from several meals merged, items
 * already on the list topped up (lib/recipes.ts). Shared and live for the
 * whole household. Phase 7: a "Nutrition" view per person per day from the
 * planned meals (components/DayNutrition.tsx).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, ShoppingCart, Loader2, CalendarDays, Check, RotateCcw, Users, UtensilsCrossed, HeartPulse } from 'lucide-react';
import { DayNutrition } from '@/components/DayNutrition';
import { supabase } from '@/utils/supabase';
import {
  ListNeed, MealEntry, Recipe, SLOTS, Slot, addDays, isoDate, loadRecipes, needsFor, weekStart,
} from '@/lib/recipes';
import { PlanMealSheet, Member, RecipeThumb, SLOT_LABEL } from '@/components/PlanMealSheet';

type Lang = 'he' | 'en';

const TEXT = {
  he: {
    title: 'תכנון ארוחות', thisWeek: 'השבוע', today: 'היום', prev: 'שבוע קודם', next: 'שבוע הבא',
    addWeek: (n: number) => `הוסף את השבוע לרשימה (${n} ארוחות)`, allOnList: 'כל הארוחות של השבוע כבר ברשימה', again: 'הוסף שוב',
    planned: (n: number, s: number) => `${n} ארוחות · ${s} מנות`, empty: 'עוד לא תוכננו ארוחות לשבוע הזה. לחצו + כדי להוסיף.',
    noRecipes: 'כדי לתכנן ארוחות, הוסיפו קודם מתכון בלשונית מתכונים.', toRecipes: 'למתכונים',
    added: (a: number, u: number) => `נוספו ${a} פריטים לרשימה${u ? `, ${u} עודכנו` : ''}`, nothing: 'אין מרכיבים להוסיף', failed: 'ההוספה לרשימה נכשלה',
    servings: 'מנות', everyone: 'כולם', onList: 'ברשימה', plan: 'תכנון', nutrition: 'תזונה',
  },
  en: {
    title: 'Meal plan', thisWeek: 'This week', today: 'Today', prev: 'Previous week', next: 'Next week',
    addWeek: (n: number) => `Add week to list (${n} meals)`, allOnList: "All of this week's meals are on the list", again: 'Add again',
    planned: (n: number, s: number) => `${n} meals · ${s} servings`, empty: 'No meals planned for this week yet. Tap + to add one.',
    noRecipes: 'To plan meals, first add a recipe in the Recipes tab.', toRecipes: 'Go to Recipes',
    added: (a: number, u: number) => `${a} items added to the list${u ? `, ${u} updated` : ''}`, nothing: 'No ingredients to add', failed: 'Could not add to the list',
    servings: 'servings', everyone: 'Everyone', onList: 'on list', plan: 'Plan', nutrition: 'Nutrition',
  },
};

const DAY_NAME: Record<Lang, string[]> = {
  he: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

export interface MealPlanViewProps {
  householdId: string | null;
  lang: Lang;
  members: Member[];
  onAddNeeds: (needs: ListNeed[]) => Promise<{ added: number; updated: number }>;
  onGoToRecipes: () => void;
  onOpenProfile?: () => void;
  showToast: (msg: string) => void;
}

export function MealPlanView({ householdId, lang, members, onAddNeeds, onGoToRecipes, onOpenProfile, showToast }: MealPlanViewProps) {
  const tx = TEXT[lang];
  const [start, setStart] = useState(() => weekStart(new Date()));
  const [entries, setEntries] = useState<MealEntry[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<{ date: string; slot: Slot; entry?: MealEntry } | null>(null);
  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState<'plan' | 'nutrition'>('plan');

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const from = isoDate(start);
  const to = isoDate(addDays(start, 6));
  const todayIso = isoDate(new Date());
  const isThisWeek = from === isoDate(weekStart(new Date()));

  const reload = useCallback(async () => {
    if (!householdId) return;
    const [{ data }, list] = await Promise.all([
      supabase.from('meal_plan_entries')
        .select('id, household_id, plan_date, slot, recipe_id, servings, eaters, added_to_list_at')
        .eq('household_id', householdId).gte('plan_date', from).lte('plan_date', to)
        .order('created_at', { ascending: true }),
      loadRecipes(supabase, householdId).catch(() => null),
    ]);
    setEntries(((data ?? []) as MealEntry[]).map((e) => ({ ...e, servings: Number(e.servings) })));
    if (list) setRecipes(list);
    setLoading(false);
  }, [householdId, from, to]);

  useEffect(() => { setLoading(true); reload(); }, [reload]);

  // Live: the household plans together.
  useEffect(() => {
    if (!householdId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const later = () => { if (timer) clearTimeout(timer); timer = setTimeout(reload, 350); };
    const channel = supabase
      .channel(`meals:${householdId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_plan_entries', filter: `household_id=eq.${householdId}` }, later)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'meal_plan_entries' }, later)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes', filter: `household_id=eq.${householdId}` }, later)
      .subscribe();
    return () => { if (timer) clearTimeout(timer); supabase.removeChannel(channel); };
  }, [householdId, reload]);

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const pending = entries.filter((e) => !e.added_to_list_at && recipeById.has(e.recipe_id));
  const totalServings = entries.reduce((s, e) => s + e.servings, 0);

  const addToList = async (which: MealEntry[]) => {
    const needs = needsFor(which.filter((e) => recipeById.has(e.recipe_id)).map((e) => ({ servings: e.servings, recipe: recipeById.get(e.recipe_id)! })));
    if (needs.length === 0) { showToast(tx.nothing); return; }
    setAdding(true);
    try {
      const { added, updated } = await onAddNeeds(needs);
      const now = new Date().toISOString();
      await supabase.from('meal_plan_entries').update({ added_to_list_at: now }).in('id', which.map((e) => e.id));
      setEntries((prev) => prev.map((e) => (which.some((w) => w.id === e.id) ? { ...e, added_to_list_at: now } : e)));
      showToast(tx.added(added, updated));
    } catch {
      showToast(tx.failed);
    }
    setAdding(false);
  };

  const memberName = (id: string) => members.find((m) => m.user_id === id)?.nickname || '?';
  const fmtDate = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`;
  const Prev = lang === 'he' ? ChevronRight : ChevronLeft;
  const Next = lang === 'he' ? ChevronLeft : ChevronRight;

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{tx.title}</h1>
        {!isThisWeek && (
          <button type="button" onClick={() => setStart(weekStart(new Date()))} className="min-h-[40px] px-3 rounded-xl border border-[var(--color-border)] text-xs font-semibold text-[var(--color-accent)] flex items-center gap-1.5">
            <CalendarDays className="w-4 h-4" /> {tx.thisWeek}
          </button>
        )}
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-panel)] px-1">
        <button type="button" aria-label={tx.prev} onClick={() => setStart((s) => addDays(s, -7))} className="w-11 h-11 flex items-center justify-center text-[var(--color-text-secondary)]">
          <Prev className="w-5 h-5" />
        </button>
        <div className="text-center">
          <p className="text-sm font-bold text-[var(--color-text-primary)] font-mono" dir="ltr">{fmtDate(days[0])} – {fmtDate(days[6])}</p>
          <p className="text-[11px] text-[var(--color-text-muted)]">{tx.planned(entries.length, totalServings)}</p>
        </div>
        <button type="button" aria-label={tx.next} onClick={() => setStart((s) => addDays(s, 7))} className="w-11 h-11 flex items-center justify-center text-[var(--color-text-secondary)]">
          <Next className="w-5 h-5" />
        </button>
      </div>

      <div className="flex gap-1 p-1 rounded-2xl bg-[var(--color-bg-subtle)]" role="tablist">
        {(['plan', 'nutrition'] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
            className={`flex-1 min-h-[44px] rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${mode === m
              ? 'bg-[var(--color-bg-panel)] text-[var(--color-text-primary)] shadow-sm' : 'text-[var(--color-text-muted)]'}`}>
            {m === 'plan' ? <UtensilsCrossed className="w-4 h-4" /> : <HeartPulse className="w-4 h-4" />} {tx[m]}
          </button>
        ))}
      </div>

      {mode === 'nutrition' && !loading && (
        <DayNutrition lang={lang} days={days} entries={entries.filter((e) => recipeById.has(e.recipe_id))} members={members} onOpenProfile={onOpenProfile} />
      )}

      {mode === 'plan' && !loading && recipes.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] p-4 text-center flex flex-col items-center gap-2">
          <p className="text-sm text-[var(--color-text-muted)]">{tx.noRecipes}</p>
          <button type="button" onClick={onGoToRecipes} className="min-h-[44px] px-4 rounded-xl bg-[var(--color-accent)] text-[var(--color-accent-text)] text-sm font-bold">{tx.toRecipes}</button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-accent)]" /></div>
      ) : mode === 'plan' && (
        <div className="flex flex-col gap-3">
          {days.map((d) => {
            const iso = isoDate(d);
            const isToday = iso === todayIso;
            return (
              <section key={iso} className={`rounded-2xl border bg-[var(--color-bg-panel)] p-3 ${isToday ? 'border-[var(--color-accent)]' : 'border-[var(--color-border)]/60'}`}>
                <h2 className="text-sm font-bold text-[var(--color-text-primary)] mb-2 flex items-center gap-2">
                  {DAY_NAME[lang][d.getDay()]} <span className="font-mono font-normal text-xs text-[var(--color-text-muted)]">{fmtDate(d)}</span>
                  {isToday && <span className="px-2 py-0.5 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] text-[10px]">{tx.today}</span>}
                </h2>
                <div className="flex flex-col gap-1.5">
                  {SLOTS.map((slot) => {
                    const here = entries.filter((e) => e.plan_date === iso && e.slot === slot);
                    return (
                      <div key={slot} className="flex items-start gap-2">
                        <span className="w-14 shrink-0 pt-2.5 text-[11px] font-semibold text-[var(--color-text-muted)]">{SLOT_LABEL[lang][slot]}</span>
                        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                          {here.map((e) => {
                            const r = recipeById.get(e.recipe_id);
                            if (!r) return null;
                            return (
                              <button
                                key={e.id}
                                type="button"
                                onClick={() => setSheet({ date: iso, slot, entry: e })}
                                className="flex items-center gap-2 p-1.5 rounded-xl bg-[var(--color-bg-subtle)]/60 border border-[var(--color-border)]/50 text-start min-h-[44px]"
                              >
                                <RecipeThumb recipe={r} size={32} />
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-semibold text-[var(--color-text-primary)] truncate" dir="auto">{r.title}</span>
                                  <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
                                    {e.servings} {tx.servings}
                                    {members.length > 1 && (
                                      <>
                                        <span>·</span><Users className="w-3 h-3" />
                                        <span className="truncate">{e.eaters ? e.eaters.map(memberName).join(', ') : tx.everyone}</span>
                                      </>
                                    )}
                                    {e.added_to_list_at && <span className="ms-1 text-[var(--color-success)] flex items-center gap-0.5"><Check className="w-3 h-3" />{tx.onList}</span>}
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            aria-label={`+ ${SLOT_LABEL[lang][slot]}`}
                            onClick={() => setSheet({ date: iso, slot })}
                            className={`min-h-[36px] rounded-xl border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] flex items-center justify-center ${here.length > 0 ? 'w-10 self-start' : 'w-full'}`}
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {entries.length === 0 && recipes.length > 0 && <p className="text-sm text-center text-[var(--color-text-muted)]">{tx.empty}</p>}
        </div>
      )}

      {mode === 'plan' && entries.length > 0 && (
        <div className="sticky bottom-[calc(72px+env(safe-area-inset-bottom,16px))] z-10 flex flex-col gap-1.5">
          {pending.length > 0 ? (
            <button
              type="button"
              disabled={adding}
              onClick={() => addToList(pending)}
              className="w-full min-h-[52px] rounded-2xl bg-[var(--color-success)] text-white text-sm font-bold shadow-lg flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />} {tx.addWeek(pending.length)}
            </button>
          ) : (
            <div className="w-full rounded-2xl bg-[var(--color-bg-panel)] border border-[var(--color-border)] shadow-lg px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-xs text-[var(--color-success)] font-semibold flex items-center gap-1"><Check className="w-4 h-4" /> {tx.allOnList}</span>
              <button type="button" disabled={adding} onClick={() => addToList(entries)} className="min-h-[40px] px-3 rounded-xl text-xs font-semibold text-[var(--color-accent)] flex items-center gap-1 shrink-0">
                {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} {tx.again}
              </button>
            </div>
          )}
        </div>
      )}

      {sheet && householdId && (
        <PlanMealSheet
          householdId={householdId}
          lang={lang}
          members={members}
          recipes={recipes}
          entry={sheet.entry}
          date={sheet.date}
          slot={sheet.slot}
          onClose={() => setSheet(null)}
          onSaved={() => { setSheet(null); reload(); }}
        />
      )}
    </div>
  );
}
