'use client';

/**
 * "What can I cook?" (Plan v2, phase 6) — the third tab of Recipes.
 * Pick what you have (chips) and/or use what's on the current list; see our
 * recipes ranked by fewest missing ingredients, and TheMealDB ideas ranked by
 * how many of your ingredients they use. Missing ingredients go to the list
 * in one tap.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { X, Plus, Loader2, ListChecks, ShoppingCart, Check, ChefHat } from 'lucide-react';
import type { MealSummary, Recipe, RecipeIngredient } from '@/lib/recipes';
import { Have, englishCandidates, ingredientSuggestions, matchRecipes } from '@/lib/cook';
import { RecipeThumb } from '@/components/PlanMealSheet';

type Lang = 'he' | 'en';
type Idea = MealSummary & { uses: string[] };

const TEXT = {
  he: {
    intro: 'מה יש לכם בבית? הוסיפו מצרכים, או השתמשו במה שברשימה.',
    add: 'הוסיפו מצרך (למשל עוף, אורז)…', useList: 'השתמשו ברשימה', listCount: (n: number) => `${n} פריטים`, clear: 'נקו הכול',
    ours: 'מהמתכונים שלנו', ideas: 'רעיונות מ-TheMealDB', ready: 'יש הכול!', missing: 'חסר: ', of: (h: number, t: number) => `${h} מתוך ${t} מצרכים`,
    addMissing: 'הוסיפו את החסר לרשימה', empty: 'הוסיפו מצרך אחד או יותר כדי לראות מה אפשר לבשל.',
    noOurs: 'אף מתכון שלנו לא משתמש במצרכים האלה.', noIdeas: 'לא נמצאו רעיונות למצרכים האלה.',
    ideasUsed: (names: string) => `חיפשנו לפי: ${names}`, ideasNone: 'לא מצאנו שם באנגלית למצרכים האלה ב-TheMealDB.',
    ideasError: 'לא הצלחנו לטעון רעיונות כרגע', uses: (n: number) => `${n} מהמצרכים שלכם`, staples: 'מלח, שמן, סוכר ומים נחשבים כאילו כבר בבית.',
  },
  en: {
    intro: 'What do you have at home? Add ingredients, or use what is on the list.',
    add: 'Add an ingredient (e.g. chicken, rice)…', useList: 'Use my list', listCount: (n: number) => `${n} items`, clear: 'Clear all',
    ours: 'From our recipes', ideas: 'Ideas from TheMealDB', ready: 'You have everything!', missing: 'Missing: ', of: (h: number, t: number) => `${h} of ${t} ingredients`,
    addMissing: 'Add missing to list', empty: 'Add one or more ingredients to see what you can cook.',
    noOurs: 'None of our recipes use these ingredients.', noIdeas: 'No ideas found for these ingredients.',
    ideasUsed: (names: string) => `Searched for: ${names}`, ideasNone: "We don't know these ingredients' English names on TheMealDB.",
    ideasError: "Couldn't load ideas right now", uses: (n: number) => `uses ${n} of yours`, staples: 'Salt, oil, sugar and water count as already at home.',
  },
};

const LS_HAVE = 'sg_cook_have';
const LS_USE_LIST = 'sg_cook_use_list';
const MAX_IDEA_GROUPS = 6;

function lsGet(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function lsSet(key: string, v: string) { try { localStorage.setItem(key, v); } catch { /* private mode */ } }

export interface CookViewProps {
  lang: Lang;
  recipes: Recipe[];
  /** Items on the household's current list. */
  listItems: Have[];
  savedIdeaIds: Set<string | null>;
  openingIdea: string | null;
  onOpenRecipe: (r: Recipe) => void;
  onOpenIdea: (m: MealSummary) => void;
  onAddMissing: (r: Recipe, missing: RecipeIngredient[]) => Promise<void>;
}

export function CookView({ lang, recipes, listItems, savedIdeaIds, openingIdea, onOpenRecipe, onOpenIdea, onAddMissing }: CookViewProps) {
  const tx = TEXT[lang];
  const [chips, setChips] = useState<string[]>([]);
  const [useList, setUseList] = useState(false);
  const [input, setInput] = useState('');
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [ideasUsed, setIdeasUsed] = useState<string[]>([]);
  const [ideasState, setIdeasState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [adding, setAdding] = useState<string | null>(null);

  // Remembered per browser.
  useEffect(() => {
    try { const v = JSON.parse(lsGet(LS_HAVE) ?? '[]'); if (Array.isArray(v)) setChips(v.filter((x) => typeof x === 'string')); } catch { /* ignore */ }
    setUseList(lsGet(LS_USE_LIST) === '1');
  }, []);

  const saveChips = (next: string[]) => { setChips(next); lsSet(LS_HAVE, JSON.stringify(next)); };
  const addChip = (raw: string) => {
    const v = raw.trim();
    if (!v || chips.some((c) => c.toLowerCase() === v.toLowerCase())) { setInput(''); return; }
    saveChips([...chips, v]);
    setInput('');
  };
  const toggleList = () => { const n = !useList; setUseList(n); lsSet(LS_USE_LIST, n ? '1' : '0'); };

  const haves: Have[] = useMemo(
    () => [...chips.map((label) => ({ label })), ...(useList ? listItems : [])],
    [chips, useList, listItems],
  );
  const matches = useMemo(() => matchRecipes(recipes, haves), [recipes, haves]);
  const suggestions = useMemo(() => ingredientSuggestions(lang), [lang]);

  // TheMealDB: chips first, then list items, up to 6 that have an English name.
  const ideaQuery = useMemo(() => {
    const groups: string[] = [];
    const seen = new Set<string>();
    for (const h of haves) {
      const cands = englishCandidates(h.label);
      if (cands.length === 0 || seen.has(cands[0])) continue;
      seen.add(cands[0]);
      groups.push(cands.join('|'));
      if (groups.length >= MAX_IDEA_GROUPS) break;
    }
    return groups.join(',');
  }, [haves]);

  useEffect(() => {
    if (!ideaQuery) { setIdeas([]); setIdeasUsed([]); setIdeasState('idle'); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setIdeasState('loading');
      try {
        const res = await fetch(`/api/recipes/mealdb?ing=${encodeURIComponent(ideaQuery)}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (cancelled) return;
        setIdeas(data.meals ?? []);
        setIdeasUsed(data.used ?? []);
        setIdeasState('idle');
      } catch {
        if (!cancelled) { setIdeas([]); setIdeasState('error'); }
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [ideaQuery]);

  const addMissing = async (r: Recipe, missing: RecipeIngredient[]) => {
    setAdding(r.id);
    try { await onAddMissing(r, missing); } finally { setAdding(null); }
  };

  const chipCls = 'shrink-0 min-h-[36px] ps-3 pe-1.5 rounded-full text-xs font-semibold flex items-center gap-1 bg-[var(--color-accent)] text-[var(--color-accent-text)]';
  const sectionTitle = 'text-sm font-bold text-[var(--color-text-primary)]';

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--color-text-secondary)]">{tx.intro}</p>

      <form onSubmit={(e) => { e.preventDefault(); addChip(input); }} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={tx.add}
          list="cook-suggestions"
          dir="auto"
          className="flex-1 min-w-0 min-h-[48px] bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-2xl px-4 text-sm text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
        <datalist id="cook-suggestions">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
        <button type="submit" aria-label={tx.add} className="min-h-[48px] min-w-[48px] rounded-2xl bg-[var(--color-accent)] text-[var(--color-accent-text)] flex items-center justify-center">
          <Plus className="w-5 h-5" />
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={toggleList}
          aria-pressed={useList}
          className={`min-h-[36px] px-3 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${useList
            ? 'bg-[var(--color-success)] text-white border-transparent'
            : 'border-[var(--color-border)] text-[var(--color-text-secondary)] bg-[var(--color-bg-panel)]'}`}
        >
          {useList ? <Check className="w-3.5 h-3.5" /> : <ListChecks className="w-3.5 h-3.5" />}
          {tx.useList} · {tx.listCount(listItems.length)}
        </button>
        {chips.map((c) => (
          <span key={c} className={chipCls} dir="auto">
            {c}
            <button type="button" aria-label={`remove ${c}`} onClick={() => saveChips(chips.filter((x) => x !== c))} className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-black/15">
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        ))}
        {chips.length > 1 && (
          <button type="button" onClick={() => saveChips([])} className="min-h-[36px] px-2 text-xs text-[var(--color-text-muted)] underline">{tx.clear}</button>
        )}
      </div>

      {haves.length === 0 ? (
        <div className="flex flex-col items-center text-center gap-3 py-10 px-6 text-[var(--color-text-muted)]">
          <ChefHat className="w-12 h-12 opacity-40" />
          <p className="text-sm">{tx.empty}</p>
        </div>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h2 className={sectionTitle}>{tx.ours}</h2>
            {matches.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)] py-2">{tx.noOurs}</p>
            ) : matches.map(({ recipe: r, have, missing, total }) => (
              <div key={r.id} className="flex flex-col gap-2 p-2.5 rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-bg-panel)]">
                <button type="button" onClick={() => onOpenRecipe(r)} className="flex items-center gap-3 text-start">
                  <RecipeThumb recipe={r} size={56} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[var(--color-text-primary)] truncate" dir="auto">{r.title}</span>
                    {missing.length === 0 ? (
                      <span className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full bg-[var(--color-success)] text-white text-[11px] font-bold">
                        <Check className="w-3 h-3" /> {tx.ready}
                      </span>
                    ) : (
                      <>
                        <span className="block text-[11px] text-[var(--color-text-muted)]">{tx.of(have.length, total)}</span>
                        <span className="block text-[11px] text-[var(--color-text-secondary)] line-clamp-2" dir="auto">
                          {tx.missing}{missing.map((i) => i.list_name || i.name).join(', ')}
                        </span>
                      </>
                    )}
                  </span>
                  <span className="shrink-0 text-xs font-bold text-[var(--color-accent)] tabular-nums">{Math.round((have.length / total) * 100)}%</span>
                </button>
                {missing.length > 0 && (
                  <button
                    type="button"
                    disabled={adding === r.id}
                    onClick={() => addMissing(r, missing)}
                    className="min-h-[40px] rounded-xl border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-primary)] flex items-center justify-center gap-1.5 hover:bg-[var(--color-bg-hover)] disabled:opacity-60"
                  >
                    {adding === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />} {tx.addMissing} ({missing.length})
                  </button>
                )}
              </div>
            ))}
            <p className="text-[11px] text-[var(--color-text-muted)]">{tx.staples}</p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className={sectionTitle}>{tx.ideas}</h2>
            {!ideaQuery ? (
              <p className="text-sm text-[var(--color-text-muted)] py-2">{tx.ideasNone}</p>
            ) : ideasState === 'loading' ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-accent)]" /></div>
            ) : ideasState === 'error' ? (
              <p className="text-sm text-[var(--color-text-muted)] py-2">{tx.ideasError}</p>
            ) : (
              <>
                {ideasUsed.length > 0 && <p className="text-[11px] text-[var(--color-text-muted)]" dir="auto">{tx.ideasUsed(ideasUsed.join(', '))}</p>}
                {ideas.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-muted)] py-2">{ideasUsed.length ? tx.noIdeas : tx.ideasNone}</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3" dir="ltr">
                    {ideas.map((m) => (
                      <button key={m.id} type="button" onClick={() => onOpenIdea(m)} className="relative rounded-2xl overflow-hidden border border-[var(--color-border)]/60 bg-[var(--color-bg-panel)] text-start">
                        {m.image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`${m.image}/preview`} alt="" loading="lazy" className="w-full aspect-square object-cover bg-[var(--color-bg-subtle)]" />
                        )}
                        <span className="block px-2 pt-2 text-xs font-semibold text-[var(--color-text-primary)] line-clamp-2">{m.title}</span>
                        <span className="block px-2 pb-2 text-[10px] text-[var(--color-text-muted)] line-clamp-2">{m.uses.join(', ')}</span>
                        {ideasUsed.length > 1 && (
                          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-bold">{m.uses.length}/{ideasUsed.length}</span>
                        )}
                        {savedIdeaIds.has(m.id) && (
                          <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-[var(--color-success)] text-white text-[10px] font-bold flex items-center gap-1"><Check className="w-3 h-3" /></span>
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
          </section>
        </>
      )}
    </div>
  );
}
