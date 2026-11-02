'use client';

/**
 * Food preferences, per person (Plan v2, phase 6; migration 026 person_profiles).
 * Shown on the Profile screen. Your household can read them, so suggestions
 * for a shared meal follow everyone who eats it. Saved as you change them.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Plus, X, Utensils } from 'lucide-react';
import { supabase } from '@/utils/supabase';
import { AVOIDS, Avoid, DIETS, Diet, FoodPrefs, GOALS, Goal, NO_PREFS, loadPrefs, savePrefs } from '@/lib/suggest';

type Lang = 'he' | 'en';

export const PREF_TEXT = {
  he: {
    title: 'העדפות אוכל', intro: 'משפיעות על ההצעות ב"מה לבשל?". בני הבית רואים אותן, כך שארוחה משותפת מתאימה לכל מי שאוכל.',
    diet: 'תזונה', diets: { any: 'הכול', pescatarian: 'פסקטריאני', vegetarian: 'צמחוני', vegan: 'טבעוני' } as Record<Diet, string>,
    kosherLabel: 'כשר', kosher: 'כשר', kosherHint: 'בלי חזיר ופירות ים, ובלי בשר עם חלב',
    avoid: 'להימנע מ…', avoids: { gluten: 'גלוטן', lactose: 'לקטוז / חלב', nuts: 'אגוזים', peanuts: 'בוטנים', eggs: 'ביצים', fish: 'דגים', shellfish: 'פירות ים', sesame: 'שומשום', soy: 'סויה' } as Record<Avoid, string>,
    dislikes: 'לא אוהב/ת', dislikesPh: 'למשל כוסברה, פטריות', add: 'הוספה',
    goal: 'מטרות (משנות רק את הסדר)', goals: { lighter: 'ארוחות קלות', protein: 'יותר חלבון', less_sugar: 'פחות סוכר', more_veg: 'יותר ירקות' } as Record<Goal, string>,
    noX: (x: string) => `בלי ${x}`, saved: 'נשמר', error: 'השמירה נכשלה',
  },
  en: {
    title: 'Food preferences', intro: 'They shape the suggestions in "What can I cook?". Your household sees them, so a shared meal suits everyone eating.',
    diet: 'Diet', diets: { any: 'Everything', pescatarian: 'Pescatarian', vegetarian: 'Vegetarian', vegan: 'Vegan' } as Record<Diet, string>,
    kosherLabel: 'Kosher', kosher: 'Kosher', kosherHint: 'No pork or shellfish, no meat with dairy',
    avoid: 'Avoid', avoids: { gluten: 'Gluten', lactose: 'Lactose / dairy', nuts: 'Tree nuts', peanuts: 'Peanuts', eggs: 'Eggs', fish: 'Fish', shellfish: 'Shellfish', sesame: 'Sesame', soy: 'Soy' } as Record<Avoid, string>,
    dislikes: "Don't like", dislikesPh: 'e.g. coriander, mushrooms', add: 'Add',
    goal: 'Goals (change the order only)', goals: { lighter: 'Lighter meals', protein: 'More protein', less_sugar: 'Less sugar', more_veg: 'More vegetables' } as Record<Goal, string>,
    noX: (x: string) => `no ${x.toLowerCase()}`, saved: 'Saved', error: "Couldn't save",
  },
};

export function FoodPrefsSection({ userId, lang }: { userId: string; lang: Lang }) {
  const tx = PREF_TEXT[lang];
  const [prefs, setPrefs] = useState<FoodPrefs>(NO_PREFS);
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [dislike, setDislike] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadPrefs(supabase, [userId]).then((m) => { if (m[userId]) setPrefs(m[userId]); }).catch(() => {}).finally(() => setLoaded(true));
  }, [userId]);

  const update = (next: FoodPrefs) => {
    setPrefs(next);
    if (timer.current) clearTimeout(timer.current);
    setState('saving');
    timer.current = setTimeout(async () => {
      try { await savePrefs(supabase, userId, next); setState('saved'); } catch { setState('error'); }
    }, 500);
  };
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const addDislike = () => {
    const v = dislike.trim();
    if (v && !prefs.dislikes.some((d) => d.toLowerCase() === v.toLowerCase())) update({ ...prefs, dislikes: [...prefs.dislikes, v] });
    setDislike('');
  };

  const pill = (on: boolean) => `min-h-[40px] px-3.5 rounded-full text-sm font-medium border flex items-center gap-1.5 transition-colors ${on
    ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)] border-transparent'
    : 'border-[var(--color-border)] text-[var(--color-text-secondary)] bg-[var(--color-bg-subtle)]/50'}`;
  const label = 'block text-sm font-medium text-[var(--color-text-muted)] mb-2';

  return (
    <div className="bg-[var(--color-bg-panel)]/60 backdrop-blur-xl rounded-3xl p-6 md:p-8 border border-[var(--color-border)]">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)] flex items-center gap-2"><Utensils className="w-5 h-5" /> {tx.title}</h3>
        <span className="text-xs text-[var(--color-text-muted)] flex items-center gap-1" aria-live="polite">
          {state === 'saving' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {state === 'saved' && <><Check className="w-3.5 h-3.5 text-[var(--color-success)]" /> {tx.saved}</>}
          {state === 'error' && <span className="text-[var(--color-danger,#dc2626)]">{tx.error}</span>}
        </span>
      </div>
      <p className="text-sm text-[var(--color-text-secondary)] mb-6">{tx.intro}</p>

      {!loaded ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-[var(--color-accent)]" /></div>
      ) : (
        <div className="flex flex-col gap-6">
          <div>
            <span className={label}>{tx.diet}</span>
            <div className="flex flex-wrap gap-2">
              {DIETS.map((d) => (
                <button key={d} type="button" aria-pressed={prefs.diet === d} onClick={() => update({ ...prefs, diet: d })} className={pill(prefs.diet === d)}>{tx.diets[d]}</button>
              ))}
            </div>
          </div>

          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span>
              <span className="block text-sm font-medium text-[var(--color-text-primary)]">{tx.kosherLabel}</span>
              <span className="block text-xs text-[var(--color-text-muted)]">{tx.kosherHint}</span>
            </span>
            <input type="checkbox" checked={prefs.kosher} onChange={(e) => update({ ...prefs, kosher: e.target.checked })} className="w-5 h-5 accent-[var(--color-accent)]" />
          </label>

          <div>
            <span className={label}>{tx.avoid}</span>
            <div className="flex flex-wrap gap-2">
              {AVOIDS.map((a) => (
                <button key={a} type="button" aria-pressed={prefs.avoid.includes(a)} onClick={() => update({ ...prefs, avoid: toggle(prefs.avoid, a) })} className={pill(prefs.avoid.includes(a))}>{tx.avoids[a]}</button>
              ))}
            </div>
          </div>

          <div>
            <span className={label}>{tx.dislikes}</span>
            <form onSubmit={(e) => { e.preventDefault(); addDislike(); }} className="flex gap-2 mb-2">
              <input value={dislike} onChange={(e) => setDislike(e.target.value)} placeholder={tx.dislikesPh} dir="auto"
                className="flex-1 min-w-0 min-h-[44px] bg-[var(--color-bg-subtle)]/50 border border-[var(--color-border)] rounded-xl px-4 text-sm text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
              <button type="submit" aria-label={tx.add} className="min-h-[44px] min-w-[44px] rounded-xl bg-[var(--color-accent)] text-[var(--color-accent-text)] flex items-center justify-center"><Plus className="w-4 h-4" /></button>
            </form>
            <div className="flex flex-wrap gap-2">
              {prefs.dislikes.map((d) => (
                <span key={d} className="min-h-[36px] ps-3 pe-1.5 rounded-full text-xs font-semibold flex items-center gap-1 bg-[var(--color-bg-subtle)] text-[var(--color-text-primary)] border border-[var(--color-border)]" dir="auto">
                  {d}
                  <button type="button" aria-label={`remove ${d}`} onClick={() => update({ ...prefs, dislikes: prefs.dislikes.filter((x) => x !== d) })} className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-black/10"><X className="w-3.5 h-3.5" /></button>
                </span>
              ))}
            </div>
          </div>

          <div>
            <span className={label}>{tx.goal}</span>
            <div className="flex flex-wrap gap-2">
              {GOALS.map((g) => (
                <button key={g} type="button" aria-pressed={prefs.goals.includes(g)} onClick={() => update({ ...prefs, goals: toggle(prefs.goals, g) })} className={pill(prefs.goals.includes(g))}>{tx.goals[g]}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
