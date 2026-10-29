'use client';

/**
 * One recipe (Plan v2, phase 4): photo, ingredients with what each puts on the
 * shopping list, and the method. A household recipe can be planned, sent to
 * the list, edited or deleted; a TheMealDB idea (English, as published) can be
 * saved to the household's recipes, or planned / sent to the list, which saves
 * it first.
 */
import React, { useEffect, useState } from 'react';
import { X, CalendarPlus, ShoppingCart, Pencil, Trash2, Loader2, BookmarkPlus, ExternalLink, Check, Link2 } from 'lucide-react';
import { supabase } from '@/utils/supabase';
import {
  MealFull, Recipe, RecipeIngredient, listAmountLabel, mealToRecipe, sortIngredients, withLinkedNames,
} from '@/lib/recipes';
import { recipeMeta } from '@/components/PlanMealSheet';

type Lang = 'he' | 'en';

const TEXT = {
  he: {
    ingredients: 'מרכיבים', method: 'אופן ההכנה', plan: 'לתכנון הארוחות', toList: 'הוסף מרכיבים לרשימה', edit: 'עריכה', delete: 'מחיקה',
    confirmDelete: 'למחוק את המתכון? הוא יוסר גם מתכנון הארוחות.', yesDelete: 'כן, למחוק', cancel: 'ביטול',
    save: 'שמור למתכונים שלנו', saved: 'שמור במתכונים שלנו', fromMealDb: 'מתכון מ-TheMealDB (באנגלית, כפי שפורסם)', source: 'מקור',
    notOnList: 'לא לרשימה', onListAs: 'ברשימה:', mealdbNote: 'השמות ברשימת הקניות מתורגמים לעברית כשאפשר; ניתן לשנות בעריכה.',
  },
  en: {
    ingredients: 'Ingredients', method: 'Method', plan: 'Add to meal plan', toList: 'Add ingredients to list', edit: 'Edit', delete: 'Delete',
    confirmDelete: 'Delete this recipe? It is also removed from the meal plan.', yesDelete: 'Yes, delete', cancel: 'Cancel',
    save: 'Save to our recipes', saved: 'Saved in our recipes', fromMealDb: 'Recipe from TheMealDB (English, as published)', source: 'Source',
    notOnList: 'not for the list', onListAs: 'on the list:', mealdbNote: 'Names on the shopping list are translated to Hebrew where we can; change them in Edit.',
  },
};

export interface RecipeSheetProps {
  lang: Lang;
  /** A household recipe… */
  recipe?: Recipe | null;
  /** …or a TheMealDB idea not saved yet. */
  meal?: MealFull | null;
  onPlan: (recipe: Recipe) => void;
  onAddToList: (recipe: Recipe) => Promise<void>;
  onEdit: (recipe: Recipe) => void;
  onDelete: (recipe: Recipe) => Promise<void>;
  /** Saves a TheMealDB idea (once) and returns the household copy. */
  onImport: (meal: MealFull) => Promise<Recipe>;
  onClose: () => void;
}

export function RecipeSheet({ lang, recipe: initialRecipe, meal, onPlan, onAddToList, onEdit, onDelete, onImport, onClose }: RecipeSheetProps) {
  const tx = TEXT[lang];
  const [recipe, setRecipe] = useState<Recipe | null>(initialRecipe ?? null);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [busy, setBusy] = useState<'import' | 'list' | 'plan' | 'delete' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (initialRecipe) setRecipe(initialRecipe); }, [initialRecipe]);

  useEffect(() => {
    if (recipe) {
      const list = sortIngredients(recipe);
      setIngredients(list);
      withLinkedNames(supabase, list).then(setIngredients);
    } else if (meal) {
      setIngredients(mealToRecipe(meal, '').ingredients);
    }
  }, [recipe, meal]);

  const title = recipe?.title ?? meal?.title ?? '';
  const image = recipe?.image_url ?? meal?.image ?? null;
  const instructions = recipe?.instructions ?? meal?.instructions ?? '';
  const isEnglish = (recipe?.lang ?? (meal ? 'en' : 'he')) === 'en';
  const fromMealDb = recipe ? recipe.source === 'mealdb' : !!meal;
  const sourceUrl = recipe?.source_url ?? meal?.source_url ?? (meal ? `https://www.themealdb.com/meal/${meal.id}` : null);

  const ensureSaved = async (): Promise<Recipe> => {
    if (recipe) return recipe;
    const saved = await onImport(meal!);
    setRecipe(saved);
    return saved;
  };

  const run = async (kind: 'import' | 'list' | 'plan' | 'delete', fn: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try { await fn(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };

  const btn = 'min-h-[48px] rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50';

  return (
    <div className="fixed inset-0 z-[65] flex flex-col justify-end bg-black/50" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg mx-auto max-h-[94vh] overflow-y-auto rounded-t-3xl bg-[var(--color-bg-panel)] border border-[var(--color-border)] flex flex-col"
      >
        <div className="relative">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="w-full h-48 object-cover rounded-t-3xl" />
          ) : (
            <div className="h-16" />
          )}
          <button type="button" onClick={onClose} aria-label="Close" className="absolute top-3 end-3 w-11 h-11 rounded-full bg-black/40 text-white flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-text-primary)]" dir="auto">{title}</h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              {recipe ? recipeMeta(recipe, lang) : `${[meal?.category, meal?.area].filter(Boolean).join(' · ')}`}
            </p>
            {fromMealDb && <p className="text-[11px] text-[var(--color-text-muted)] mt-1">{tx.fromMealDb}</p>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy != null} onClick={() => run('plan', async () => onPlan(await ensureSaved()))} className={`${btn} bg-[var(--color-accent)] text-[var(--color-accent-text)]`}>
              {busy === 'plan' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarPlus className="w-4 h-4" />} {tx.plan}
            </button>
            <button type="button" disabled={busy != null} onClick={() => run('list', async () => onAddToList(await ensureSaved()))} className={`${btn} bg-[var(--color-bg-subtle)] border border-[var(--color-border)] text-[var(--color-text-primary)]`}>
              {busy === 'list' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />} {tx.toList}
            </button>
          </div>

          {!recipe && meal && (
            <button type="button" disabled={busy != null} onClick={() => run('import', async () => { await ensureSaved(); })} className={`${btn} border border-[var(--color-accent)] text-[var(--color-accent)]`}>
              {busy === 'import' ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookmarkPlus className="w-4 h-4" />} {tx.save}
            </button>
          )}
          {recipe && fromMealDb && (
            <p className="text-xs font-semibold text-[var(--color-success)] flex items-center gap-1"><Check className="w-3.5 h-3.5" /> {tx.saved}</p>
          )}
          {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

          <section>
            <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-2">{tx.ingredients}</h3>
            <ul className="flex flex-col divide-y divide-[var(--color-border)]/60" dir={isEnglish ? 'ltr' : undefined}>
              {ingredients.map((ing, i) => (
                <li key={ing.id ?? i} className="py-2 flex flex-col">
                  <span className="flex justify-between gap-3 text-sm">
                    <span className="text-[var(--color-text-primary)]">{ing.name}</span>
                    <span className="text-[var(--color-text-muted)] shrink-0">{ing.measure}</span>
                  </span>
                  <span className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1" dir={lang === 'he' ? 'rtl' : 'ltr'}>
                    {ing.skip_list ? tx.notOnList : (
                      <>
                        {tx.onListAs} <span dir="auto">{ing.linked_name || ing.list_name || ing.name}</span>
                        <span className="font-mono">× {listAmountLabel(ing, lang)}</span>
                        {(ing.product_id || ing.custom_product_id) && <Link2 className="w-3 h-3 text-[var(--color-accent)]" />}
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {fromMealDb && <p className="text-[11px] text-[var(--color-text-muted)] mt-2">{tx.mealdbNote}</p>}
          </section>

          {instructions && (
            <section>
              <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-2">{tx.method}</h3>
              <p className="text-sm leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-line" dir={isEnglish ? 'ltr' : 'auto'}>{instructions}</p>
            </section>
          )}

          {sourceUrl && fromMealDb && (
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--color-accent)] flex items-center gap-1 self-start min-h-[36px]">
              <ExternalLink className="w-3.5 h-3.5" /> {tx.source}
            </a>
          )}

          {recipe && (
            confirming ? (
              <div className="rounded-xl border border-[var(--color-danger)]/40 p-3 flex flex-col gap-2">
                <p className="text-sm text-[var(--color-text-primary)]">{tx.confirmDelete}</p>
                <div className="flex gap-2">
                  <button type="button" disabled={busy != null} onClick={() => run('delete', () => onDelete(recipe))} className={`${btn} flex-1 bg-[var(--color-danger)] text-white`}>
                    {busy === 'delete' && <Loader2 className="w-4 h-4 animate-spin" />} {tx.yesDelete}
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} className={`${btn} flex-1 border border-[var(--color-border)] text-[var(--color-text-secondary)]`}>{tx.cancel}</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button type="button" onClick={() => onEdit(recipe)} className={`${btn} flex-1 border border-[var(--color-border)] text-[var(--color-text-secondary)]`}>
                  <Pencil className="w-4 h-4" /> {tx.edit}
                </button>
                <button type="button" onClick={() => setConfirming(true)} className={`${btn} flex-1 border border-[var(--color-border)] text-[var(--color-danger)]`}>
                  <Trash2 className="w-4 h-4" /> {tx.delete}
                </button>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

