'use client';

/**
 * Put a recipe on the meal plan, or change a planned meal (Plan v2, phase 4):
 * which recipe, which day and meal, how many servings, and who eats it
 * (everyone by default). Servings follow the number of eaters until changed
 * by hand. Saves straight to meal_plan_entries (RLS: household members).
 */
import React, { useMemo, useState } from 'react';
import { X, Minus, Plus, Loader2, Trash2, Search, ChefHat } from 'lucide-react';
import { supabase } from '@/utils/supabase';
import { MealEntry, Recipe, Slot, SLOTS, addDays, isoDate, parseIsoDate, weekStart } from '@/lib/recipes';

type Lang = 'he' | 'en';
export interface Member { user_id: string; nickname: string; role: string }

export const SLOT_LABEL: Record<Lang, Record<Slot, string>> = {
  he: { breakfast: 'בוקר', lunch: 'צהריים', dinner: 'ערב' },
  en: { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' },
};
export const DAY_SHORT: Record<Lang, string[]> = {
  he: ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

const TEXT = {
  he: {
    add: 'הוספה לתכנון', edit: 'עריכת ארוחה', recipe: 'מתכון', pick: 'בחרו מתכון', search: 'חיפוש מתכון…', day: 'יום', meal: 'ארוחה',
    servings: 'מנות', eaters: 'מי אוכל', everyone: 'כולם', save: 'שמור', remove: 'הסר מהתכנון', noRecipes: 'אין עדיין מתכונים. הוסיפו מתכון בלשונית מתכונים.',
    error: 'השמירה נכשלה', onList: 'כבר נוסף לרשימה', servingsHint: (n: number) => `המתכון מיועד ל-${n} מנות; הכמויות יותאמו.`,
  },
  en: {
    add: 'Add to meal plan', edit: 'Edit meal', recipe: 'Recipe', pick: 'Pick a recipe', search: 'Search recipes…', day: 'Day', meal: 'Meal',
    servings: 'Servings', eaters: 'Who eats', everyone: 'Everyone', save: 'Save', remove: 'Remove from plan', noRecipes: 'No recipes yet. Add one in the Recipes tab.',
    error: 'Could not save', onList: 'Already added to the list', servingsHint: (n: number) => `The recipe serves ${n}; amounts are scaled.`,
  },
};

export interface PlanMealSheetProps {
  householdId: string;
  lang: Lang;
  members: Member[];
  /** Recipes to pick from (when no recipe is fixed). */
  recipes: Recipe[];
  /** Fixed recipe (opened from a recipe). */
  recipe?: Recipe | null;
  /** Planned meal being edited. */
  entry?: MealEntry | null;
  date: string;
  slot: Slot;
  onSaved: () => void;
  onClose: () => void;
}

export function PlanMealSheet({ householdId, lang, members, recipes, recipe, entry, date: initialDate, slot: initialSlot, onSaved, onClose }: PlanMealSheetProps) {
  const tx = TEXT[lang];
  const [recipeId, setRecipeId] = useState<string | null>(entry?.recipe_id ?? recipe?.id ?? null);
  const [date, setDate] = useState(entry?.plan_date ?? initialDate);
  const [slot, setSlot] = useState<Slot>(entry?.slot ?? initialSlot);
  const [eaters, setEaters] = useState<string[] | null>(entry?.eaters ?? null);
  const eaterCount = eaters ? eaters.length : Math.max(1, members.length);
  const [servings, setServings] = useState<number>(entry ? Number(entry.servings) : eaterCount);
  const [servingsTouched, setServingsTouched] = useState(!!entry);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = recipe ?? recipes.find((r) => r.id === recipeId) ?? null;
  const week = useMemo(() => {
    const start = weekStart(parseIsoDate(date));
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [date]);
  const filtered = recipes.filter((r) => !query.trim() || r.title.toLowerCase().includes(query.trim().toLowerCase()));

  const setEatersAndServings = (next: string[] | null) => {
    setEaters(next);
    if (!servingsTouched) setServings(next ? Math.max(1, next.length) : Math.max(1, members.length));
  };
  const toggleEater = (id: string) => {
    const current = eaters ?? members.map((m) => m.user_id);
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    if (next.length === 0) return;
    setEatersAndServings(next.length === members.length ? null : next);
  };

  const save = async () => {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    const row = { household_id: householdId, plan_date: date, slot, recipe_id: chosen.id, servings, eaters };
    const { error: err } = entry
      ? await supabase.from('meal_plan_entries').update(row).eq('id', entry.id)
      : await supabase.from('meal_plan_entries').insert(row);
    setBusy(false);
    if (err) { setError(tx.error); return; }
    onSaved();
  };

  const remove = async () => {
    if (!entry) return;
    setBusy(true);
    const { error: err } = await supabase.from('meal_plan_entries').delete().eq('id', entry.id);
    setBusy(false);
    if (err) { setError(tx.error); return; }
    onSaved();
  };

  const label = 'block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5';
  const chip = (active: boolean) =>
    `min-h-[40px] px-3 rounded-xl text-sm font-semibold border transition-colors ${active
      ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)] border-transparent'
      : 'bg-[var(--color-bg-subtle)]/60 text-[var(--color-text-secondary)] border-[var(--color-border)]'}`;

  return (
    <div className="fixed inset-0 z-[66] flex flex-col justify-end bg-black/50" onClick={onClose}>
      <div
        role="dialog"
        aria-label={entry ? tx.edit : tx.add}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg mx-auto max-h-[92vh] overflow-y-auto rounded-t-3xl bg-[var(--color-bg-panel)] border border-[var(--color-border)] p-5 flex flex-col gap-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">{entry ? tx.edit : tx.add}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -me-2 flex items-center justify-center text-[var(--color-text-muted)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Recipe */}
        {chosen && (recipe || entry) ? (
          <RecipeLine recipe={chosen} lang={lang} />
        ) : (
          <div>
            <span className={label}>{tx.pick}</span>
            {recipes.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)] py-4 text-center">{tx.noRecipes}</p>
            ) : (
              <>
                {recipes.length > 6 && (
                  <div className="relative mb-2">
                    <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={tx.search}
                      dir="auto"
                      className="w-full min-h-[44px] bg-[var(--color-bg-subtle)]/60 border border-[var(--color-border)] rounded-xl ps-9 pe-3 text-sm text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1.5 max-h-[34vh] overflow-y-auto">
                  {filtered.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRecipeId(r.id)}
                      className={`rounded-xl border text-start ${recipeId === r.id ? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/30' : 'border-[var(--color-border)]'}`}
                    >
                      <RecipeLine recipe={r} lang={lang} />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Day */}
        <div>
          <span className={label}>{tx.day}</span>
          <div className="grid grid-cols-7 gap-1">
            {week.map((d) => {
              const iso = isoDate(d);
              return (
                <button key={iso} type="button" onClick={() => setDate(iso)} className={`${chip(iso === date)} px-0 flex flex-col items-center justify-center leading-tight py-1`}>
                  <span className="text-[11px]">{DAY_SHORT[lang][d.getDay()]}</span>
                  <span className="text-xs font-mono">{d.getDate()}</span>
                </button>
              );
            })}
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="mt-2 w-full min-h-[40px] bg-[var(--color-bg-subtle)]/60 border border-[var(--color-border)] rounded-xl px-3 text-sm text-[var(--color-text-primary)]"
            dir="ltr"
          />
        </div>

        {/* Meal */}
        <div>
          <span className={label}>{tx.meal}</span>
          <div className="grid grid-cols-3 gap-2">
            {SLOTS.map((s) => (
              <button key={s} type="button" onClick={() => setSlot(s)} className={chip(s === slot)}>{SLOT_LABEL[lang][s]}</button>
            ))}
          </div>
        </div>

        {/* Who eats */}
        {members.length > 1 && (
          <div>
            <span className={label}>{tx.eaters}</span>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setEatersAndServings(null)} className={chip(eaters == null)}>{tx.everyone}</button>
              {members.map((m) => (
                <button key={m.user_id} type="button" onClick={() => toggleEater(m.user_id)} className={chip(eaters != null && eaters.includes(m.user_id))}>
                  {m.nickname || '—'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Servings */}
        <div>
          <span className={label}>{tx.servings}</span>
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-xl border border-[var(--color-border)]">
              <button type="button" aria-label="−" onClick={() => { setServingsTouched(true); setServings((s) => Math.max(1, s - 1)); }} className="w-11 h-11 flex items-center justify-center text-[var(--color-text-secondary)]">
                <Minus className="w-4 h-4" />
              </button>
              <span className="min-w-[32px] text-center font-mono font-bold text-[var(--color-text-primary)]">{servings}</span>
              <button type="button" aria-label="+" onClick={() => { setServingsTouched(true); setServings((s) => Math.min(50, s + 1)); }} className="w-11 h-11 flex items-center justify-center text-[var(--color-text-secondary)]">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {chosen && chosen.servings !== servings && (
              <p className="text-[11px] text-[var(--color-text-muted)] flex-1">{tx.servingsHint(chosen.servings)}</p>
            )}
          </div>
        </div>

        {entry?.added_to_list_at && <p className="text-[11px] text-[var(--color-success)]">✓ {tx.onList}</p>}
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

        <button
          type="button"
          disabled={!chosen || busy}
          onClick={save}
          className="w-full min-h-[48px] bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-accent-text)] rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} {tx.save}
        </button>
        {entry && (
          <button type="button" disabled={busy} onClick={remove} className="w-full min-h-[44px] text-sm font-semibold text-[var(--color-danger)] flex items-center justify-center gap-2">
            <Trash2 className="w-4 h-4" /> {tx.remove}
          </button>
        )}
      </div>
    </div>
  );
}

export function RecipeThumb({ recipe, size = 44 }: { recipe: Pick<Recipe, 'image_url'>; size?: number }) {
  return recipe.image_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={recipe.image_url} alt="" style={{ width: size, height: size }} className="rounded-xl object-cover shrink-0 bg-[var(--color-bg-subtle)]" />
  ) : (
    <span style={{ width: size, height: size }} className="rounded-xl shrink-0 bg-[var(--color-accent)]/10 text-[var(--color-accent)] flex items-center justify-center">
      <ChefHat className="w-5 h-5" />
    </span>
  );
}

export function recipeMeta(recipe: Recipe, lang: Lang): string {
  const n = recipe.recipe_ingredients?.length ?? 0;
  return lang === 'he' ? `${recipe.servings} מנות · ${n} מרכיבים` : `Serves ${recipe.servings} · ${n} ingredients`;
}

function RecipeLine({ recipe, lang }: { recipe: Recipe; lang: Lang }) {
  return (
    <span className="flex items-center gap-3 p-2">
      <RecipeThumb recipe={recipe} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[var(--color-text-primary)] truncate" dir="auto">{recipe.title}</span>
        <span className="block text-[11px] text-[var(--color-text-muted)]">
          {recipeMeta(recipe, lang)}
        </span>
      </span>
    </span>
  );
}
