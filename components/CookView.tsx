'use client';

/**
 * "What can I cook?" (Plan v2, phase 6) — the third tab of Recipes.
 * Pick what you have (chips) and/or use what's on the current list, and who
 * is eating. Suggestions must use at least one thing you have, never break
 * an eater's rules (diet, kosher, allergies, dislikes) and are ordered by
 * overlap + a health estimate + goals; less healthy dishes sink and get a
 * badge. Missing ingredients go to the list in one tap.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { X, Plus, Loader2, ListChecks, ShoppingCart, Check, ChefHat, Leaf, Users, SlidersHorizontal } from 'lucide-react';
import { supabase } from '@/utils/supabase';
import type { MealFull, MealSummary, Recipe, RecipeIngredient } from '@/lib/recipes';
import { Have, englishCandidates, ingredientSuggestions, matchRecipes, mealAsRecipe } from '@/lib/cook';
import { FoodPrefs, Health, NO_PREFS, Suggestion, combinePrefs, healthyPicks, loadPrefs, rankSuggestions } from '@/lib/suggest';
import { Member, RecipeThumb } from '@/components/PlanMealSheet';
import { PREF_TEXT } from '@/components/FoodPrefsSection';

type Lang = 'he' | 'en';
type Idea = MealFull & { uses: string[] };

const TEXT = {
  he: {
    intro: 'מה יש לכם בבית? הוסיפו מצרכים, או השתמשו במה שברשימה.',
    add: 'הוסיפו מצרך (למשל עוף, אורז)…', useList: 'השתמשו ברשימה', listCount: (n: number) => `${n} פריטים`, clear: 'נקו הכול',
    who: 'מי אוכל?', everyone: 'כולם', rules: 'מתאים ל: ', noRules: 'בלי הגבלות', editPrefs: 'העדפות אוכל',
    ours: 'מהמתכונים שלנו', ideas: 'רעיונות מ-TheMealDB', ready: 'יש הכול!', missing: 'לקנות: ', of: (h: number, t: number) => `${h} מתוך ${t} מצרכים`,
    addMissing: 'הוסיפו את החסר לרשימה', picks: 'בריא ומתאים לכם', empty: 'הוסיפו מצרך אחד או יותר כדי לראות מה אפשר לבשל.',
    noOurs: 'אף מתכון שלנו לא מתאים כרגע.', noIdeas: 'לא נמצאו רעיונות מתאימים.', hidden: (n: number) => `${n} מתכונים לא הוצגו בגלל העדפות האוכל.`,
    ideasUsed: (names: string) => `חיפשנו לפי: ${names}`, ideasNone: 'לא מצאנו שם באנגלית למצרכים האלה ב-TheMealDB.',
    ideasError: 'לא הצלחנו לטעון רעיונות כרגע', staples: 'מלח, שמן, סוכר ומים נחשבים כאילו כבר בבית.',
    healthy: 'בריא', occasional: 'לפעמים', dessert: 'קינוח',
    healthNote: 'הערכת בריאות לפי המצרכים ושיטת ההכנה, לא ערכים תזונתיים.',
  },
  en: {
    intro: 'What do you have at home? Add ingredients, or use what is on the list.',
    add: 'Add an ingredient (e.g. chicken, rice)…', useList: 'Use my list', listCount: (n: number) => `${n} items`, clear: 'Clear all',
    who: "Who's eating?", everyone: 'Everyone', rules: 'Suits: ', noRules: 'No restrictions', editPrefs: 'Food preferences',
    ours: 'From our recipes', ideas: 'Ideas from TheMealDB', ready: 'You have everything!', missing: 'To buy: ', of: (h: number, t: number) => `${h} of ${t} ingredients`,
    addMissing: 'Add missing to list', picks: 'Healthy picks for you', empty: 'Add one or more ingredients to see what you can cook.',
    noOurs: 'None of our recipes fit right now.', noIdeas: 'No matching ideas found.', hidden: (n: number) => `${n} recipes not shown because of food preferences.`,
    ideasUsed: (names: string) => `Searched for: ${names}`, ideasNone: "We don't know these ingredients' English names on TheMealDB.",
    ideasError: "Couldn't load ideas right now", staples: 'Salt, oil, sugar and water count as already at home.',
    healthy: 'Healthy', occasional: 'Occasional', dessert: 'Dessert',
    healthNote: 'Health is estimated from the ingredients and method, not from nutrition values.',
  },
};

const LS_HAVE = 'sg_cook_have';
const LS_USE_LIST = 'sg_cook_use_list';
const MAX_IDEA_GROUPS = 6;

function lsGet(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function lsSet(key: string, v: string) { try { localStorage.setItem(key, v); } catch { /* private mode */ } }

export function HealthChip({ health, lang }: { health: Health; lang: Lang }) {
  const tx = TEXT[lang];
  if (health.band === 'healthy') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--color-success)]/15 text-[var(--color-success)] text-[10px] font-bold">
        <Leaf className="w-3 h-3" /> {tx.healthy}
      </span>
    );
  }
  if (health.band === 'occasional') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-bold">
        {health.dessert ? tx.dessert : tx.occasional}
      </span>
    );
  }
  return null;
}

export interface CookViewProps {
  lang: Lang;
  recipes: Recipe[];
  /** Items on the household's current list. */
  listItems: Have[];
  members: Member[];
  userId: string | null;
  openingIdea: string | null;
  onOpenRecipe: (r: Recipe) => void;
  onOpenIdea: (m: MealSummary) => void;
  onAddMissing: (r: Recipe, missing: RecipeIngredient[]) => Promise<void>;
  onEditPrefs: () => void;
}

export function CookView({
  lang, recipes, listItems, members, userId, openingIdea, onOpenRecipe, onOpenIdea, onAddMissing, onEditPrefs,
}: CookViewProps) {
  const tx = TEXT[lang];
  const pt = PREF_TEXT[lang];
  const [chips, setChips] = useState<string[]>([]);
  const [useList, setUseList] = useState(false);
  const [input, setInput] = useState('');
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [ideasUsed, setIdeasUsed] = useState<string[]>([]);
  const [ideasState, setIdeasState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [adding, setAdding] = useState<string | null>(null);
  const [prefsByUser, setPrefsByUser] = useState<Record<string, FoodPrefs>>({});
  /** null = everyone in the household. */
  const [eaters, setEaters] = useState<string[] | null>(null);

  // Remembered per browser.
  useEffect(() => {
    try { const v = JSON.parse(lsGet(LS_HAVE) ?? '[]'); if (Array.isArray(v)) setChips(v.filter((x) => typeof x === 'string')); } catch { /* ignore */ }
    setUseList(lsGet(LS_USE_LIST) === '1');
  }, []);

  // Everyone's food preferences (household members can read them).
  const memberIds = useMemo(() => {
    const ids = members.map((m) => m.user_id);
    return userId && !ids.includes(userId) ? [userId, ...ids] : ids;
  }, [members, userId]);
  useEffect(() => {
    loadPrefs(supabase, memberIds).then(setPrefsByUser).catch(() => {});
  }, [memberIds]);

  const prefs = useMemo(() => {
    const ids = eaters ?? memberIds;
    return ids.length ? combinePrefs(ids.map((id) => prefsByUser[id] ?? NO_PREFS)) : NO_PREFS;
  }, [eaters, memberIds, prefsByUser]);

  const saveChips = (next: string[]) => { setChips(next); lsSet(LS_HAVE, JSON.stringify(next)); };
  const addChip = (raw: string) => {
    const v = raw.trim();
    if (!v || chips.some((c) => c.toLowerCase() === v.toLowerCase())) { setInput(''); return; }
    saveChips([...chips, v]);
    setInput('');
  };
  const toggleList = () => { const n = !useList; setUseList(n); lsSet(LS_USE_LIST, n ? '1' : '0'); };
  const toggleEater = (id: string) => {
    const cur = eaters ?? memberIds;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    setEaters(next.length === 0 || next.length === memberIds.length ? null : next);
  };

  const haves: Have[] = useMemo(
    () => [...chips.map((label) => ({ label })), ...(useList ? listItems : [])],
    [chips, useList, listItems],
  );
  const suggestions = useMemo(() => ingredientSuggestions(lang), [lang]);

  const ourMatches = useMemo(() => matchRecipes(recipes, haves), [recipes, haves]);
  const ours = useMemo(() => rankSuggestions(ourMatches, prefs), [ourMatches, prefs]);
  const savedMealIds = useMemo(() => new Set(recipes.filter((r) => r.source === 'mealdb').map((r) => r.source_id)), [recipes]);
  const ideaRecipes = useMemo(() => ideas.filter((m) => !savedMealIds.has(m.id)).map(mealAsRecipe), [ideas, savedMealIds]);
  const ideaMatches = useMemo(() => matchRecipes(ideaRecipes, haves), [ideaRecipes, haves]);
  const ideaRanked = useMemo(() => rankSuggestions(ideaMatches, prefs), [ideaMatches, prefs]);
  const picks = useMemo(() => (haves.length === 0 ? healthyPicks(recipes, prefs) : []), [haves.length, recipes, prefs]);
  const hiddenCount = ourMatches.length - ours.length + (ideaMatches.length - ideaRanked.length);

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

  // "Suits: vegetarian · kosher · no nuts"
  const rulesLine = [
    prefs.diet !== 'any' ? pt.diets[prefs.diet] : null,
    prefs.kosher ? pt.kosher : null,
    ...prefs.avoid.map((a) => pt.noX(pt.avoids[a])),
    ...prefs.dislikes.map((d) => pt.noX(d)),
    ...prefs.goals.map((g) => pt.goals[g]),
  ].filter(Boolean).join(' · ');

  const chipCls = 'shrink-0 min-h-[36px] ps-3 pe-1.5 rounded-full text-xs font-semibold flex items-center gap-1 bg-[var(--color-accent)] text-[var(--color-accent-text)]';
  const sectionTitle = 'text-sm font-bold text-[var(--color-text-primary)]';
  const pill = (on: boolean) => `min-h-[36px] px-3 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${on
    ? 'bg-[var(--color-success)] text-white border-transparent'
    : 'border-[var(--color-border)] text-[var(--color-text-secondary)] bg-[var(--color-bg-panel)]'}`;

  const card = (s: Suggestion, idea?: Idea) => {
    const r = s.recipe;
    return (
      <div key={r.id} className="flex flex-col gap-2 p-2.5 rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-bg-panel)]">
        <button
          type="button"
          onClick={() => (idea ? onOpenIdea(idea) : onOpenRecipe(r))}
          className="relative flex items-center gap-3 text-start"
        >
          <RecipeThumb recipe={r} size={56} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-[var(--color-text-primary)] truncate" dir="auto">{r.title}</span>
            <span className="flex flex-wrap items-center gap-1 mt-0.5">
              <HealthChip health={s.health} lang={lang} />
              {s.missing.length === 0 ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--color-success)] text-white text-[10px] font-bold">
                  <Check className="w-3 h-3" /> {tx.ready}
                </span>
              ) : (
                <span className="text-[11px] text-[var(--color-text-muted)]">{tx.of(s.have.length, s.total)}</span>
              )}
              {idea && <span className="text-[10px] text-[var(--color-text-muted)]">TheMealDB · EN</span>}
            </span>
            {s.missing.length > 0 && (
              <span className="block text-[11px] text-[var(--color-text-secondary)] line-clamp-2" dir="auto">
                {tx.missing}{s.missing.map((i) => i.list_name || i.name).join(', ')}
              </span>
            )}
          </span>
          {idea && openingIdea === idea.id && <Loader2 className="w-5 h-5 animate-spin text-[var(--color-accent)]" />}
        </button>
        {s.missing.length > 0 && !idea && (
          <button
            type="button"
            disabled={adding === r.id}
            onClick={() => addMissing(r, s.missing)}
            className="min-h-[40px] rounded-xl border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-primary)] flex items-center justify-center gap-1.5 hover:bg-[var(--color-bg-hover)] disabled:opacity-60"
          >
            {adding === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />} {tx.addMissing} ({s.missing.length})
          </button>
        )}
      </div>
    );
  };

  const ideaById = new Map(ideas.map((m) => [`mealdb:${m.id}`, m]));

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
        <button type="button" onClick={toggleList} aria-pressed={useList} className={pill(useList)}>
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

      {/* Who's eating → whose rules apply */}
      <div className="flex flex-col gap-2 p-3 rounded-2xl bg-[var(--color-bg-subtle)]">
        {members.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[var(--color-text-secondary)] flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {tx.who}</span>
            <button type="button" onClick={() => setEaters(null)} className={pill(eaters === null)}>{tx.everyone}</button>
            {members.map((m) => (
              <button key={m.user_id} type="button" onClick={() => toggleEater(m.user_id)} className={pill(eaters !== null && eaters.includes(m.user_id))} dir="auto">
                {m.nickname || '—'}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] text-[var(--color-text-secondary)]" dir="auto">{tx.rules}{rulesLine || tx.noRules}</p>
          <button type="button" onClick={onEditPrefs} className="shrink-0 min-h-[32px] px-2 rounded-lg text-[11px] font-semibold text-[var(--color-accent)] flex items-center gap-1">
            <SlidersHorizontal className="w-3.5 h-3.5" /> {tx.editPrefs}
          </button>
        </div>
      </div>

      {haves.length === 0 ? (
        <>
          {picks.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className={sectionTitle}>{tx.picks}</h2>
              {picks.map(({ recipe: r, health }) => (
                <button key={r.id} type="button" onClick={() => onOpenRecipe(r)} className="flex items-center gap-3 p-2.5 rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-bg-panel)] text-start">
                  <RecipeThumb recipe={r} size={48} />
                  <span className="min-w-0 flex-1 text-sm font-semibold text-[var(--color-text-primary)] truncate" dir="auto">{r.title}</span>
                  <HealthChip health={health} lang={lang} />
                </button>
              ))}
            </section>
          )}
          <div className="flex flex-col items-center text-center gap-3 py-8 px-6 text-[var(--color-text-muted)]">
            <ChefHat className="w-12 h-12 opacity-40" />
            <p className="text-sm">{tx.empty}</p>
          </div>
        </>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h2 className={sectionTitle}>{tx.ours}</h2>
            {ours.length === 0 ? <p className="text-sm text-[var(--color-text-muted)] py-2">{tx.noOurs}</p> : ours.map((s) => card(s))}
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
                {ideasUsed.length > 0 && <p className="text-[11px] text-[var(--color-text-muted)]" dir="ltr">{tx.ideasUsed(ideasUsed.join(', '))}</p>}
                {ideaRanked.length === 0
                  ? <p className="text-sm text-[var(--color-text-muted)] py-2">{ideasUsed.length ? tx.noIdeas : tx.ideasNone}</p>
                  : ideaRanked.map((s) => card(s, ideaById.get(s.recipe.id)))}
                <p className="text-[10px] text-[var(--color-text-muted)] text-center" dir="ltr">
                  Recipe ideas and photos: <a className="underline" href="https://www.themealdb.com" target="_blank" rel="noopener noreferrer">TheMealDB</a>
                </p>
              </>
            )}
          </section>

          <div className="flex flex-col gap-1">
            {hiddenCount > 0 && <p className="text-[11px] text-[var(--color-text-muted)]">{tx.hidden(hiddenCount)}</p>}
            <p className="text-[11px] text-[var(--color-text-muted)]">{tx.staples}</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">{tx.healthNote}</p>
          </div>
        </>
      )}
    </div>
  );
}
