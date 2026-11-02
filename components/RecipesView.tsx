'use client';

/**
 * Recipes tab (Plan v2, phase 4): the household's own recipes (usually Hebrew)
 * and ideas from TheMealDB (English, as published). From a recipe: add it to
 * the meal plan, send its ingredients to the list, edit or delete it. Ideas can
 * be saved to the household's recipes. Recipe changes by anyone in the
 * household arrive live. Phase 6 adds a third tab, "What can I cook?"
 * (components/CookView.tsx).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Search, Loader2, ChefHat, Globe2, BookOpen, Check, CookingPot } from 'lucide-react';
import { supabase } from '@/utils/supabase';
import {
  ListNeed, MealFull, MealSummary, Recipe, importMeal, isoDate, loadRecipes, needsFor,
} from '@/lib/recipes';
import { PlanMealSheet, Member, RecipeThumb, recipeMeta } from '@/components/PlanMealSheet';
import { RecipeSheet } from '@/components/RecipeSheet';
import { RecipeEditor } from '@/components/RecipeEditor';
import { CookView } from '@/components/CookView';
import { Have, withOnly } from '@/lib/cook';

type Lang = 'he' | 'en';

const TEXT = {
  he: {
    title: 'מתכונים', ours: 'המתכונים שלנו', ideas: 'רעיונות', cook: 'מה לבשל?', newRecipe: 'מתכון חדש', search: 'חיפוש במתכונים שלנו…',
    emptyOurs: 'עוד אין מתכונים. כתבו מתכון משלכם, או שמרו רעיון מ-TheMealDB.', ideasSearch: 'חיפוש באנגלית (למשל chicken)…',
    ideasNote: 'מתכונים מ-TheMealDB מוצגים באנגלית, כפי שפורסמו.', noIdeas: 'לא נמצאו מתכונים', ideasError: 'לא הצלחנו לטעון רעיונות כרגע',
    all: 'הכול', saved: 'שמור', added: (a: number, u: number) => `נוספו ${a} פריטים לרשימה${u ? `, ${u} עודכנו` : ''}`, nothing: 'אין מה להוסיף לרשימה',
    deleted: 'המתכון נמחק', planned: 'נוסף לתכנון הארוחות', savedToast: 'המתכון נשמר',
  },
  en: {
    title: 'Recipes', ours: 'Our recipes', ideas: 'Ideas', cook: 'What can I cook?', newRecipe: 'New recipe', search: 'Search our recipes…',
    emptyOurs: 'No recipes yet. Write your own, or save an idea from TheMealDB.', ideasSearch: 'Search (e.g. chicken)…',
    ideasNote: 'TheMealDB recipes are shown in English, as published.', noIdeas: 'No recipes found', ideasError: "Couldn't load ideas right now",
    all: 'All', saved: 'Saved', added: (a: number, u: number) => `${a} items added to the list${u ? `, ${u} updated` : ''}`, nothing: 'Nothing to add to the list',
    deleted: 'Recipe deleted', planned: 'Added to the meal plan', savedToast: 'Recipe saved',
  },
};

export interface RecipesViewProps {
  householdId: string | null;
  userId: string | null;
  lang: Lang;
  members: Member[];
  homeChainId: string | null;
  /** Items on the household's current list (for "What can I cook?"). */
  listItems: Have[];
  onEditPrefs: () => void;
  onAddNeeds: (needs: ListNeed[]) => Promise<{ added: number; updated: number }>;
  showToast: (msg: string) => void;
}

export function RecipesView({ householdId, userId, lang, members, homeChainId, listItems, onEditPrefs, onAddNeeds, showToast }: RecipesViewProps) {
  const tx = TEXT[lang];
  const [tab, setTab] = useState<'ours' | 'ideas' | 'cook'>('ours');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<{ recipe?: Recipe; meal?: MealFull } | null>(null);
  const [editing, setEditing] = useState<{ recipe: Recipe | null } | null>(null);
  const [planning, setPlanning] = useState<Recipe | null>(null);

  // Ideas
  const [ideaQuery, setIdeaQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [ideas, setIdeas] = useState<MealSummary[]>([]);
  const [ideasState, setIdeasState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [openingIdea, setOpeningIdea] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!householdId) return;
    try { setRecipes(await loadRecipes(supabase, householdId)); } catch { /* keep the old list */ }
    setLoading(false);
  }, [householdId]);

  useEffect(() => { reload(); }, [reload]);

  // Live: any household member adding or editing a recipe.
  useEffect(() => {
    if (!householdId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const later = () => { if (timer) clearTimeout(timer); timer = setTimeout(reload, 400); };
    const channel = supabase
      .channel(`recipes:${householdId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes', filter: `household_id=eq.${householdId}` }, later)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'recipes' }, later)
      .subscribe();
    return () => { if (timer) clearTimeout(timer); supabase.removeChannel(channel); };
  }, [householdId, reload]);

  // Keep an open recipe in step with reloads (after editing it).
  useEffect(() => {
    setOpen((o) => (o?.recipe ? { recipe: recipes.find((r) => r.id === o.recipe!.id) ?? o.recipe } : o));
  }, [recipes]);

  // Ideas: categories once, then search / category results (debounced).
  useEffect(() => {
    if (tab !== 'ideas' || categories.length > 0) return;
    fetch('/api/recipes/mealdb?list=categories').then((r) => r.json()).then((d) => setCategories(d.categories ?? [])).catch(() => {});
  }, [tab, categories.length]);

  useEffect(() => {
    if (tab !== 'ideas') return;
    const timer = setTimeout(async () => {
      setIdeasState('loading');
      try {
        const url = category && !ideaQuery.trim()
          ? `/api/recipes/mealdb?c=${encodeURIComponent(category)}`
          : `/api/recipes/mealdb?s=${encodeURIComponent(ideaQuery.trim())}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setIdeas(data.meals ?? []);
        setIdeasState('idle');
      } catch {
        setIdeas([]);
        setIdeasState('error');
      }
    }, ideaQuery ? 350 : 0);
    return () => clearTimeout(timer);
  }, [tab, ideaQuery, category]);

  const openIdea = async (m: MealSummary) => {
    const saved = recipes.find((r) => r.source === 'mealdb' && r.source_id === m.id);
    if (saved) { setOpen({ recipe: saved }); return; }
    setOpeningIdea(m.id);
    try {
      const res = await fetch(`/api/recipes/mealdb?i=${encodeURIComponent(m.id)}`);
      const data = await res.json();
      if (data.meal) setOpen({ meal: data.meal });
      else showToast(tx.ideasError);
    } catch {
      showToast(tx.ideasError);
    }
    setOpeningIdea(null);
  };

  const importIdea = async (meal: MealFull): Promise<Recipe> => {
    if (!householdId) throw new Error('No household');
    const r = await importMeal(supabase, householdId, meal);
    await reload();
    showToast(tx.savedToast);
    return r;
  };

  const addRecipeToList = async (r: Recipe) => {
    const needs = needsFor([{ servings: r.servings, recipe: r }]);
    if (needs.length === 0) { showToast(tx.nothing); return; }
    const { added, updated } = await onAddNeeds(needs);
    showToast(tx.added(added, updated));
  };

  const addMissingToList = async (r: Recipe, missing: Recipe['recipe_ingredients']) => {
    const needs = needsFor([{ servings: r.servings, recipe: withOnly(r, missing ?? []) }]);
    if (needs.length === 0) { showToast(tx.nothing); return; }
    const { added, updated } = await onAddNeeds(needs);
    showToast(tx.added(added, updated));
  };

  const deleteRecipe = async (r: Recipe) => {
    const { error } = await supabase.from('recipes').delete().eq('id', r.id);
    if (error) throw error;
    setOpen(null);
    setRecipes((prev) => prev.filter((x) => x.id !== r.id));
    showToast(tx.deleted);
  };

  const shown = recipes.filter((r) => !filter.trim() || r.title.toLowerCase().includes(filter.trim().toLowerCase()));
  const savedIds = new Set(recipes.filter((r) => r.source === 'mealdb').map((r) => r.source_id));

  const tabBtn = (active: boolean) =>
    `flex-1 min-w-0 min-h-[44px] px-1 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-1 transition-colors ${active
      ? 'bg-[var(--color-bg-panel)] text-[var(--color-text-primary)] shadow-sm'
      : 'text-[var(--color-text-muted)]'}`;
  const searchInput = 'w-full min-h-[48px] bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-2xl ps-11 pe-4 text-sm text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{tx.title}</h1>
        {tab === 'ours' && householdId && (
          <button
            type="button"
            onClick={() => setEditing({ recipe: null })}
            className="min-h-[44px] px-4 rounded-xl bg-[var(--color-accent)] text-[var(--color-accent-text)] text-sm font-bold flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> {tx.newRecipe}
          </button>
        )}
      </div>

      <div className="flex gap-1 p-1 rounded-2xl bg-[var(--color-bg-subtle)]" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'ours'} onClick={() => setTab('ours')} className={tabBtn(tab === 'ours')}>
          <BookOpen className="w-4 h-4" /> {tx.ours}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'ideas'} onClick={() => setTab('ideas')} className={tabBtn(tab === 'ideas')}>
          <Globe2 className="w-4 h-4" /> {tx.ideas}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'cook'} onClick={() => setTab('cook')} className={tabBtn(tab === 'cook')}>
          <CookingPot className="w-4 h-4" /> {tx.cook}
        </button>
      </div>

      {tab === 'ours' && (
        <>
          {recipes.length > 4 && (
            <div className="relative">
              <Search className="w-4 h-4 absolute start-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={tx.search} className={searchInput} dir="auto" />
            </div>
          )}
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-accent)]" /></div>
          ) : recipes.length === 0 ? (
            <div className="flex flex-col items-center text-center gap-3 py-12 px-6 text-[var(--color-text-muted)]">
              <ChefHat className="w-12 h-12 opacity-40" />
              <p className="text-sm">{tx.emptyOurs}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {shown.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setOpen({ recipe: r })}
                  className="flex items-center gap-3 p-2.5 rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-bg-panel)] text-start hover:bg-[var(--color-bg-hover)]"
                >
                  <RecipeThumb recipe={r} size={56} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[var(--color-text-primary)] truncate" dir="auto">{r.title}</span>
                    <span className="block text-[11px] text-[var(--color-text-muted)]">{recipeMeta(r, lang)}</span>
                    {r.source === 'mealdb' && <span className="text-[10px] text-[var(--color-text-muted)]">TheMealDB · EN</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'ideas' && (
        <>
          <div className="relative">
            <Search className="w-4 h-4 absolute start-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input value={ideaQuery} onChange={(e) => setIdeaQuery(e.target.value)} placeholder={tx.ideasSearch} className={searchInput} dir="ltr" />
          </div>
          {categories.length > 0 && !ideaQuery.trim() && (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" dir="ltr">
              {[null, ...categories].map((c) => (
                <button
                  key={c ?? '__all'}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`shrink-0 min-h-[36px] px-3 rounded-full text-xs font-semibold border ${category === c
                    ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)] border-transparent'
                    : 'border-[var(--color-border)] text-[var(--color-text-secondary)] bg-[var(--color-bg-panel)]'}`}
                >
                  {c ?? tx.all}
                </button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-[var(--color-text-muted)]">{tx.ideasNote}</p>
          {ideasState === 'loading' ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-accent)]" /></div>
          ) : ideasState === 'error' ? (
            <p className="text-sm text-center text-[var(--color-text-muted)] py-10">{tx.ideasError}</p>
          ) : ideas.length === 0 ? (
            <p className="text-sm text-center text-[var(--color-text-muted)] py-10">{tx.noIdeas}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3" dir="ltr">
              {ideas.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => openIdea(m)}
                  className="relative rounded-2xl overflow-hidden border border-[var(--color-border)]/60 bg-[var(--color-bg-panel)] text-start"
                >
                  {m.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`${m.image}/preview`} alt="" loading="lazy" className="w-full aspect-square object-cover bg-[var(--color-bg-subtle)]" />
                  )}
                  <span className="block p-2 text-xs font-semibold text-[var(--color-text-primary)] line-clamp-2 min-h-[40px]">{m.title}</span>
                  {savedIds.has(m.id) && (
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-[var(--color-success)] text-white text-[10px] font-bold flex items-center gap-1">
                      <Check className="w-3 h-3" /> {tx.saved}
                    </span>
                  )}
                  {openingIdea === m.id && (
                    <span className="absolute inset-0 bg-black/30 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-white" /></span>
                  )}
                </button>
              ))}
            </div>
          )}
          <p className="text-[10px] text-[var(--color-text-muted)] text-center" dir="ltr">
            Recipe ideas and photos: <a className="underline" href="https://www.themealdb.com" target="_blank" rel="noopener noreferrer">TheMealDB</a>
          </p>
        </>
      )}

      {tab === 'cook' && (
        <CookView
          lang={lang}
          recipes={recipes}
          listItems={listItems}
          members={members}
          userId={userId}
          openingIdea={openingIdea}
          onOpenRecipe={(r) => setOpen({ recipe: r })}
          onOpenIdea={openIdea}
          onAddMissing={addMissingToList}
          onEditPrefs={onEditPrefs}
        />
      )}

      {open && (
        <RecipeSheet
          lang={lang}
          recipe={open.recipe}
          meal={open.meal}
          onClose={() => setOpen(null)}
          onPlan={(r) => setPlanning(r)}
          onAddToList={addRecipeToList}
          onEdit={(r) => setEditing({ recipe: r })}
          onDelete={deleteRecipe}
          onImport={importIdea}
        />
      )}

      {editing && householdId && userId && (
        <RecipeEditor
          recipe={editing.recipe}
          householdId={householdId}
          userId={userId}
          homeChainId={homeChainId}
          lang={lang}
          onClose={() => setEditing(null)}
          onSaved={async (id) => {
            setEditing(null);
            const list = await loadRecipes(supabase, householdId);
            setRecipes(list);
            const saved = list.find((r) => r.id === id);
            if (saved) setOpen({ recipe: saved });
            showToast(tx.savedToast);
          }}
        />
      )}

      {planning && householdId && (
        <PlanMealSheet
          householdId={householdId}
          lang={lang}
          members={members}
          recipes={recipes}
          recipe={planning}
          date={isoDate(new Date())}
          slot="dinner"
          onClose={() => setPlanning(null)}
          onSaved={() => { setPlanning(null); showToast(tx.planned); }}
        />
      )}
    </div>
  );
}
