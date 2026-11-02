'use client';

/**
 * Create or edit a household recipe (Plan v2, phase 4). Each ingredient is
 * typed as written ("עגבניות", "1 ק״ג"); the amount is read from that for the
 * shopping list. Under "⋯" an ingredient can be linked to a product (so it gets
 * a price), get a different name on the list, or be left off the list, and
 * (phase 7) be matched by hand to a food in the Health Ministry table, with grams.
 * Imported TheMealDB recipes are edited the same way (their text stays English).
 */
import React, { useEffect, useRef, useState } from 'react';
import { X, Camera, Loader2, Plus, Trash2, MoreHorizontal, Link2, Unlink, Search, Minus, Apple, RotateCcw } from 'lucide-react';
import { supabase } from '@/utils/supabase';
import { uploadItemPhoto } from '@/lib/list';
import {
  Recipe, RecipeIngredient, parseMeasure, saveRecipe, skipByDefault, sortIngredients, withLinkedNames, listAmountLabel,
} from '@/lib/recipes';

type Lang = 'he' | 'en';

const TEXT = {
  he: {
    newTitle: 'מתכון חדש', editTitle: 'עריכת מתכון', name: 'שם המתכון', namePh: 'למשל: שקשוקה', servings: 'מספר מנות',
    ingredients: 'מרכיבים', ingName: 'מרכיב', ingMeasure: 'כמות', measurePh: '2 / 500 גרם / כוס', addIng: 'הוסף מרכיב',
    instructions: 'אופן ההכנה', save: 'שמור מתכון', error: 'השמירה נכשלה', photoError: 'העלאת התמונה נכשלה',
    onList: 'על הרשימה', notOnList: 'לא יתווסף לרשימה', listName: 'שם ברשימת הקניות', skip: 'לא להוסיף לרשימה (יש בבית)',
    link: 'קישור למוצר (למחיר)', linked: 'מקושר ל:', unlink: 'בטל קישור', searchPh: 'חפשו מוצר…', mine: 'שלי', removeIng: 'הסר מרכיב',
    more: 'אפשרויות', photo: 'תמונה',
    food: 'ערכים תזונתיים (מאגר משרד הבריאות)', foodAuto: 'מותאם אוטומטית', foodNone: 'עוד לא הותאם (יחושב כשתצפו בתזונה)', foodMine: 'נבחר ידנית',
    foodSearch: 'חפשו מזון בטבלה…', grams: 'גרם במתכון כולו', foodReset: 'חזרה להתאמה אוטומטית', per100: 'קק״ל ל-100 ג׳',
  },
  en: {
    newTitle: 'New recipe', editTitle: 'Edit recipe', name: 'Recipe name', namePh: 'e.g. Shakshuka', servings: 'Servings',
    ingredients: 'Ingredients', ingName: 'Ingredient', ingMeasure: 'Amount', measurePh: '2 / 500 g / 1 cup', addIng: 'Add ingredient',
    instructions: 'Method', save: 'Save recipe', error: 'Could not save', photoError: 'Photo upload failed',
    onList: 'On the list', notOnList: 'Not added to the list', listName: 'Name on the shopping list', skip: "Don't add to the list (we have it)",
    link: 'Link to a product (for a price)', linked: 'Linked to:', unlink: 'Unlink', searchPh: 'Search products…', mine: 'mine', removeIng: 'Remove ingredient',
    more: 'Options', photo: 'Photo',
    food: 'Nutrition (Health Ministry table)', foodAuto: 'Matched automatically', foodNone: 'Not matched yet (worked out when you view nutrition)', foodMine: 'Chosen by hand',
    foodSearch: 'Search the food table…', grams: 'Grams in the whole recipe', foodReset: 'Back to automatic', per100: 'kcal per 100 g',
  },
};

const blankIngredient = (position: number): RecipeIngredient => ({
  position, name: '', measure: '', amount: null, unit: 'none', list_name: null, product_id: null, custom_product_id: null, skip_list: false,
});

interface ProductHit { id: string; name: string; kind: 'product' | 'custom'; price?: number | null }

export interface RecipeEditorProps {
  recipe?: Recipe | null;
  householdId: string;
  userId: string;
  homeChainId: string | null;
  lang: Lang;
  onSaved: (id: string) => void;
  onClose: () => void;
}

export function RecipeEditor({ recipe, householdId, userId, homeChainId, lang, onSaved, onClose }: RecipeEditorProps) {
  const tx = TEXT[lang];
  const [title, setTitle] = useState(recipe?.title ?? '');
  const [servings, setServings] = useState(recipe?.servings ?? 4);
  const [instructions, setInstructions] = useState(recipe?.instructions ?? '');
  const [image, setImage] = useState<string | null>(recipe?.image_url ?? null);
  const [items, setItems] = useState<RecipeIngredient[]>(() => {
    const list = recipe ? sortIngredients(recipe) : [];
    return list.length > 0 ? list : [blankIngredient(0), blankIngredient(1), blankIngredient(2)];
  });
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [busy, setBusy] = useState<'save' | 'photo' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recipeLang: Lang = recipe?.lang ?? 'he';

  useEffect(() => {
    if (!recipe) return;
    // Once per opened recipe: a live reload of the list must not wipe edits in progress.
    withLinkedNames(supabase, sortIngredients(recipe)).then((list) => {
      if (list.length) setItems((prev) => prev.map((x, i) => ({ ...x, linked_name: list[i]?.linked_name ?? x.linked_name })));
    });
    // Names of the matched foods (the table lives on the server).
    const codes = [...new Set(sortIngredients(recipe).map((x) => x.food_code).filter((c): c is number => c != null))];
    if (codes.length) {
      fetch(`/api/nutrition/foods?codes=${codes.join(',')}`).then((r) => r.json()).then((d: { foods?: Array<{ code: number; he: string }> }) => {
        const names = new Map((d.foods ?? []).map((f) => [f.code, f.he]));
        setItems((prev) => prev.map((x) => (x.food_code != null ? { ...x, food_name: names.get(x.food_code) ?? x.food_name } : x)));
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe?.id]);

  const patch = (i: number, p: Partial<RecipeIngredient>) =>
    setItems((prev) => prev.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const setName = (i: number, name: string) => {
    const wasDefaultSkip = skipByDefault(items[i].name) === items[i].skip_list;
    patch(i, { name, ...(wasDefaultSkip ? { skip_list: skipByDefault(name) } : {}) });
  };
  const setMeasure = (i: number, measure: string) => patch(i, { measure, ...parseMeasure(measure) });

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy('photo');
    setError(null);
    try { setImage(await uploadItemPhoto(supabase, userId, file)); }
    catch { setError(tx.photoError); }
    setBusy(null);
  };

  const save = async () => {
    if (!title.trim()) return;
    setBusy('save');
    setError(null);
    try {
      const id = await saveRecipe(supabase, householdId, {
        id: recipe?.id,
        title,
        lang: recipeLang,
        servings,
        instructions,
        image_url: image,
        category: recipe?.category ?? null,
        source: recipe?.source ?? 'own',
        source_id: recipe?.source_id ?? null,
        source_url: recipe?.source_url ?? null,
      }, items);
      onSaved(id);
    } catch {
      setError(tx.error);
      setBusy(null);
    }
  };

  const label = 'block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5';
  const input = 'w-full min-h-[44px] bg-[var(--color-bg-subtle)]/60 border border-[var(--color-border)] rounded-xl px-3 text-sm text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]';

  return (
    <div className="fixed inset-0 z-[67] flex flex-col justify-end bg-black/50" onClick={onClose}>
      <div
        role="dialog"
        aria-label={recipe ? tx.editTitle : tx.newTitle}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg mx-auto max-h-[94vh] overflow-y-auto rounded-t-3xl bg-[var(--color-bg-panel)] border border-[var(--color-border)] p-5 flex flex-col gap-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">{recipe ? tx.editTitle : tx.newTitle}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -me-2 flex items-center justify-center text-[var(--color-text-muted)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-4 items-start">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label={tx.photo}
            className="w-20 h-20 shrink-0 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-subtle)] flex items-center justify-center overflow-hidden text-[var(--color-text-muted)]"
          >
            {busy === 'photo' ? <Loader2 className="w-5 h-5 animate-spin" /> : image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="w-full h-full object-cover" />
            ) : <Camera className="w-6 h-6" />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
          <div className="flex-1 min-w-0 flex flex-col gap-3">
            <div>
              <label className={label} htmlFor="recipe-title">{tx.name}</label>
              <input id="recipe-title" className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tx.namePh} dir="auto" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[var(--color-text-secondary)]">{tx.servings}</span>
              <div className="flex items-center rounded-xl border border-[var(--color-border)]">
                <button type="button" aria-label="−" onClick={() => setServings((s) => Math.max(1, s - 1))} className="w-10 h-10 flex items-center justify-center text-[var(--color-text-secondary)]"><Minus className="w-4 h-4" /></button>
                <span className="min-w-[28px] text-center font-mono font-bold text-[var(--color-text-primary)]">{servings}</span>
                <button type="button" aria-label="+" onClick={() => setServings((s) => Math.min(50, s + 1))} className="w-10 h-10 flex items-center justify-center text-[var(--color-text-secondary)]"><Plus className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        </div>

        <div>
          <span className={label}>{tx.ingredients}</span>
          <div className="flex flex-col gap-2">
            {items.map((ing, i) => (
              <div key={i} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-subtle)]/30 p-2 flex flex-col gap-1.5">
                <div className="flex gap-1.5">
                  <input aria-label={tx.ingName} className={`${input} flex-[3] min-w-0`} value={ing.name} onChange={(e) => setName(i, e.target.value)} placeholder={tx.ingName} dir="auto" />
                  <input aria-label={tx.ingMeasure} className={`${input} flex-[2] min-w-0`} value={ing.measure ?? ''} onChange={(e) => setMeasure(i, e.target.value)} placeholder={tx.measurePh} dir="auto" />
                  <button
                    type="button"
                    aria-label={tx.more}
                    aria-expanded={openRow === i}
                    onClick={() => setOpenRow(openRow === i ? null : i)}
                    className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center ${openRow === i ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`}
                  >
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                </div>
                {ing.name.trim() && (
                  <p className="text-[11px] text-[var(--color-text-muted)] px-1 flex flex-wrap items-center gap-1">
                    {ing.skip_list ? tx.notOnList : (
                      <>
                        {tx.onList}: <span className="font-semibold text-[var(--color-text-secondary)]" dir="auto">{ing.linked_name || ing.list_name || ing.name}</span>
                        <span className="font-mono">× {listAmountLabel(ing, lang)}</span>
                        {(ing.product_id || ing.custom_product_id) && <Link2 className="w-3 h-3 text-[var(--color-accent)]" />}
                      </>
                    )}
                  </p>
                )}
                {openRow === i && (
                  <IngredientOptions
                    ing={ing}
                    lang={lang}
                    householdId={householdId}
                    homeChainId={homeChainId}
                    onChange={(p) => patch(i, p)}
                    onRemove={() => { setItems((prev) => prev.filter((_, j) => j !== i)); setOpenRow(null); }}
                  />
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => { setItems((prev) => [...prev, blankIngredient(prev.length)]); setOpenRow(null); }}
            className="mt-2 min-h-[44px] w-full rounded-xl border border-dashed border-[var(--color-border)] text-sm font-semibold text-[var(--color-accent)] flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> {tx.addIng}
          </button>
        </div>

        <div>
          <label className={label} htmlFor="recipe-instructions">{tx.instructions}</label>
          <textarea
            id="recipe-instructions"
            className={`${input} min-h-[120px] py-2.5 leading-relaxed`}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            dir={recipeLang === 'en' ? 'ltr' : 'auto'}
          />
        </div>

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        <button
          type="button"
          disabled={!title.trim() || busy != null}
          onClick={save}
          className="w-full min-h-[48px] bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-accent-text)] rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />} {tx.save}
        </button>
      </div>
    </div>
  );
}

function IngredientOptions({ ing, lang, householdId, homeChainId, onChange, onRemove }: {
  ing: RecipeIngredient; lang: Lang; householdId: string; homeChainId: string | null;
  onChange: (p: Partial<RecipeIngredient>) => void; onRemove: () => void;
}) {
  const tx = TEXT[lang];
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [searching, setSearching] = useState(false);
  const linked = !!(ing.product_id || ing.custom_product_id);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setHits([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const chain = homeChainId ? `&chain=${encodeURIComponent(homeChainId)}` : '';
        const [res, mine] = await Promise.all([
          fetch(`/api/products/search?q=${encodeURIComponent(term)}&limit=6${chain}`).then((r) => r.json()).catch(() => ({ products: [] })),
          supabase.from('custom_products').select('id, name, price').eq('household_id', householdId).ilike('name', `%${term.replace(/[%_]/g, '')}%`).limit(4),
        ]);
        setHits([
          ...((mine.data ?? []) as { id: string; name: string; price: number | null }[]).map((c) => ({ id: c.id, name: c.name, kind: 'custom' as const, price: c.price })),
          ...((res.products ?? []) as { id: string; name_he: string; chain_price?: number | null; min_price?: number | null }[])
            .map((p) => ({ id: p.id, name: p.name_he, kind: 'product' as const, price: p.chain_price ?? p.min_price ?? null })),
        ]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, homeChainId, householdId]);

  const input = 'w-full min-h-[40px] bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-xl px-3 text-sm text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]';

  return (
    <div className="flex flex-col gap-2 px-1 pb-1">
      <label className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] min-h-[36px]">
        <input type="checkbox" checked={ing.skip_list} onChange={(e) => onChange({ skip_list: e.target.checked })} className="w-4 h-4 accent-[var(--color-accent)]" />
        {tx.skip}
      </label>
      {!ing.skip_list && (
        <>
          <div>
            <span className="block text-[11px] font-semibold text-[var(--color-text-muted)] mb-1">{tx.listName}</span>
            <input className={input} value={ing.list_name ?? ''} onChange={(e) => onChange({ list_name: e.target.value })} placeholder={ing.name} dir="auto" disabled={linked} />
          </div>
          <div>
            <span className="block text-[11px] font-semibold text-[var(--color-text-muted)] mb-1">{tx.link}</span>
            {linked ? (
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-[var(--color-text-secondary)] min-w-0 truncate" dir="auto">{tx.linked} <b>{ing.linked_name ?? '…'}</b></span>
                <button type="button" onClick={() => onChange({ product_id: null, custom_product_id: null, linked_name: null })} className="min-h-[36px] px-2 flex items-center gap-1 text-[var(--color-danger)] font-semibold shrink-0">
                  <Unlink className="w-3.5 h-3.5" /> {tx.unlink}
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  {searching
                    ? <Loader2 className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 animate-spin text-[var(--color-accent)]" />
                    : <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />}
                  <input className={`${input} ps-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder={ing.list_name || ing.name || tx.searchPh} dir="auto" />
                </div>
                {hits.length > 0 && (
                  <div className="mt-1 flex flex-col rounded-xl border border-[var(--color-border)] overflow-hidden">
                    {hits.map((h) => (
                      <button
                        key={`${h.kind}:${h.id}`}
                        type="button"
                        onClick={() => {
                          onChange(h.kind === 'product'
                            ? { product_id: h.id, custom_product_id: null, linked_name: h.name }
                            : { custom_product_id: h.id, product_id: null, linked_name: h.name });
                          setQ('');
                          setHits([]);
                        }}
                        className="min-h-[40px] px-3 flex items-center justify-between gap-2 text-start text-sm bg-[var(--color-bg-panel)] hover:bg-[var(--color-bg-hover)] border-b last:border-b-0 border-[var(--color-border)]"
                      >
                        <span className="min-w-0 truncate text-[var(--color-text-primary)]" dir="auto">
                          {h.kind === 'custom' && <span className="me-1 px-1.5 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] text-[10px] font-semibold">{tx.mine}</span>}
                          {h.name}
                        </span>
                        {h.price != null && <span className="font-mono text-xs text-[var(--color-text-muted)] shrink-0">₪{Number(h.price).toFixed(2)}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
      <FoodMatch ing={ing} lang={lang} onChange={onChange} />
      <button type="button" onClick={onRemove} className="self-start min-h-[36px] flex items-center gap-1.5 text-xs font-semibold text-[var(--color-danger)]">
        <Trash2 className="w-3.5 h-3.5" /> {tx.removeIng}
      </button>
    </div>
  );
}

interface FoodHit { code: number; he: string; en: string; kcal: number | null; grams: number | null }

/** The ingredient's food in the Health Ministry table, and its grams: automatic, or chosen by hand. */
function FoodMatch({ ing, lang, onChange }: { ing: RecipeIngredient; lang: Lang; onChange: (p: Partial<RecipeIngredient>) => void }) {
  const tx = TEXT[lang];
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<FoodHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [gramsText, setGramsText] = useState(ing.grams != null ? String(ing.grams) : '');

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ q: term, name: ing.list_name || ing.name, measure: ing.measure ?? '' });
        const d = await fetch(`/api/nutrition/foods?${params}`).then((r) => r.json());
        setHits(d.foods ?? []);
      } catch { setHits([]); }
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [q, ing.list_name, ing.name, ing.measure]);

  const status = ing.food_set_by === 'user' ? tx.foodMine : ing.food_code != null ? tx.foodAuto : tx.foodNone;
  const input = 'w-full min-h-[40px] bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-xl px-3 text-sm text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]';

  return (
    <div className="flex flex-col gap-1.5 pt-1 border-t border-[var(--color-border)]/60">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-text-muted)] mt-1"><Apple className="w-3.5 h-3.5" /> {tx.food}</span>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="min-w-0 text-[var(--color-text-secondary)]" dir="auto">
          {ing.food_name ? <b className="block truncate">{ing.food_name}</b> : null}
          <span className="text-[11px] text-[var(--color-text-muted)]">{status}{ing.grams != null ? ` · ${ing.grams} g` : ''}</span>
        </span>
        {ing.food_set_by === 'user' && (
          <button type="button" onClick={() => { onChange({ food_code: null, grams: null, food_set_by: null, food_name: null }); setGramsText(''); }}
            className="shrink-0 min-h-[36px] px-2 flex items-center gap-1 text-[var(--color-accent)] font-semibold">
            <RotateCcw className="w-3.5 h-3.5" /> {tx.foodReset}
          </button>
        )}
      </div>
      <div className="relative">
        {searching
          ? <Loader2 className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 animate-spin text-[var(--color-accent)]" />
          : <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />}
        <input className={`${input} ps-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx.foodSearch} dir="auto" />
      </div>
      {hits.length > 0 && (
        <div className="flex flex-col rounded-xl border border-[var(--color-border)] overflow-hidden max-h-60 overflow-y-auto">
          {hits.map((h) => (
            <button key={h.code} type="button"
              onClick={() => {
                const grams = ing.food_set_by === 'user' && ing.grams != null ? ing.grams : h.grams != null ? Math.round(h.grams) : null;
                onChange({ food_code: h.code, food_name: h.he, food_set_by: 'user', grams });
                setGramsText(grams != null ? String(grams) : '');
                setQ(''); setHits([]);
              }}
              className="min-h-[44px] px-3 py-1.5 flex items-center justify-between gap-2 text-start text-sm bg-[var(--color-bg-panel)] hover:bg-[var(--color-bg-hover)] border-b last:border-b-0 border-[var(--color-border)]/60">
              <span className="min-w-0 text-[var(--color-text-primary)] line-clamp-2" dir="auto">{h.he}</span>
              {h.kcal != null && <span className="font-mono text-[10px] text-[var(--color-text-muted)] shrink-0" title={tx.per100}>{Math.round(h.kcal)} kcal</span>}
            </button>
          ))}
        </div>
      )}
      {ing.food_set_by === 'user' && (
        <label className="flex items-center justify-between gap-2 text-xs text-[var(--color-text-secondary)]">
          {tx.grams}
          <input inputMode="decimal" value={gramsText} dir="ltr"
            onChange={(e) => {
              setGramsText(e.target.value);
              const n = Number(e.target.value.replace(',', '.'));
              onChange({ grams: e.target.value.trim() === '' || !Number.isFinite(n) || n < 0 ? null : Math.round(n * 10) / 10 });
            }}
            className="w-24 min-h-[40px] bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-xl px-3 text-sm text-end outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
        </label>
      )}
    </div>
  );
}
