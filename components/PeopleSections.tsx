'use client';

/**
 * Profile sections for phase 7 (migration 027):
 * - BodySection: your birth year, sex, activity, height and weight. Private to
 *   you; only the daily targets computed from them are shared with the household.
 * - HouseholdPeopleSection: people without an account (e.g. children) with the
 *   same body fields and food preferences, managed by every household member.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Activity as ActivityIcon, Baby, Loader2, Lock, Pencil, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '@/utils/supabase';
import { ACTIVITIES, Activity, Body, EMPTY_BODY, Sex, Targets, ageFrom, targetsFor } from '@/lib/nutrition';
import { HouseholdPerson, deletePerson, loadOwnBody, loadPeople, saveOwnBody, savePerson } from '@/lib/people';
import { NO_PREFS } from '@/lib/suggest';
import { FoodPrefsEditor, SaveState, fieldLabelCls, pillCls } from '@/components/FoodPrefsSection';

type Lang = 'he' | 'en';

export const BODY_TEXT = {
  he: {
    bodyTitle: 'גוף ופעילות', bodyIntro: 'משמשים לחישוב יעדי התזונה היומיים. הנתונים האלה פרטיים לך: בני הבית רואים רק את היעדים.',
    private: 'פרטי', birthYear: 'שנת לידה', sex: 'מין', male: 'זכר', female: 'נקבה', height: 'גובה (ס״מ)', weight: 'משקל (ק״ג)',
    activity: 'רמת פעילות',
    activities: { sedentary: 'יושבני', light: 'פעילות קלה', active: 'פעיל', very_active: 'פעיל מאוד' } as Record<Activity, string>,
    activityHints: { sedentary: 'בעיקר ישיבה', light: 'הליכה של 30–60 דקות ביום', active: 'כשעה פעילות ביום', very_active: 'ספורט או עבודה פיזית רבה' } as Record<Activity, string>,
    targets: 'יעדים ליום', approx: 'משוער: לא הוזנו גובה ומשקל, אז השתמשנו בערכים טיפוסיים לגיל.',
    needAge: 'הזינו שנת לידה ומין כדי לחשב יעדים.', baby: 'לתינוקות מתחת לגיל שנתיים אין יעדים באפליקציה. כדאי להתייעץ עם טיפת חלב.',
    kcal: 'קלוריות', protein: 'חלבון', fat: 'שומן', carbs: 'פחמימות', fiber: 'סיבים', sodium: 'נתרן', satFat: 'שומן רווי', sugars: 'סוכרים',
    atLeast: 'לפחות', atMost: 'עד', g: 'ג׳', mg: 'מ״ג',
    targetsNote: 'טווחים מוערכים לפי טבלאות מקובלות (DRI), לא המלצה רפואית.',
    peopleTitle: 'אנשים בלי חשבון', peopleIntro: 'למשל ילדים: אפשר לבחור אותם ב"מי אוכל", ולהם יעדים והעדפות משלהם. כל בני הבית יכולים לערוך.',
    addPerson: 'הוספת אדם', name: 'שם', save: 'שמירה', cancel: 'ביטול', remove: 'מחיקה', confirmRemove: 'למחוק? הם יוסרו גם מהארוחות המתוכננות.',
    noPeople: 'עוד לא נוספו אנשים.', years: (n: number) => `בן/בת ${n}`, prefs: 'העדפות אוכל', edit: 'עריכה',
  },
  en: {
    bodyTitle: 'Body & activity', bodyIntro: 'Used to work out your daily nutrition targets. These numbers are private to you: the household only sees the targets.',
    private: 'Private', birthYear: 'Birth year', sex: 'Sex', male: 'Male', female: 'Female', height: 'Height (cm)', weight: 'Weight (kg)',
    activity: 'Activity level',
    activities: { sedentary: 'Sedentary', light: 'Lightly active', active: 'Active', very_active: 'Very active' } as Record<Activity, string>,
    activityHints: { sedentary: 'Mostly sitting', light: '30–60 min walking a day', active: 'About an hour of activity a day', very_active: 'Sport or hard physical work' } as Record<Activity, string>,
    targets: 'Daily targets', approx: 'Approximate: no height and weight, so typical values for the age were used.',
    needAge: 'Enter birth year and sex to get targets.', baby: 'No targets for babies under 2. Ask your baby clinic.',
    kcal: 'Calories', protein: 'Protein', fat: 'Fat', carbs: 'Carbs', fiber: 'Fiber', sodium: 'Sodium', satFat: 'Saturated fat', sugars: 'Sugars',
    atLeast: 'at least', atMost: 'up to', g: 'g', mg: 'mg',
    targetsNote: 'Estimated ranges from standard reference tables (DRI), not medical advice.',
    peopleTitle: 'People without an account', peopleIntro: 'For example children: they can be picked in "Who eats" and get their own targets and preferences. Anyone in the household can edit them.',
    addPerson: 'Add a person', name: 'Name', save: 'Save', cancel: 'Cancel', remove: 'Delete', confirmRemove: 'Delete? They are also removed from planned meals.',
    noPeople: 'No people added yet.', years: (n: number) => `${n} years`, prefs: 'Food preferences', edit: 'Edit',
  },
};

const card = 'bg-[var(--color-bg-panel)]/60 backdrop-blur-xl rounded-3xl p-6 md:p-8 border border-[var(--color-border)]';
const input = 'w-full min-h-[44px] bg-[var(--color-bg-subtle)]/50 border border-[var(--color-border)] rounded-xl px-4 text-sm text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]';

function numOrNull(v: string): number | null {
  const n = Number(v.replace(',', '.'));
  return v.trim() === '' || !Number.isFinite(n) ? null : n;
}

/** Birth year, sex, activity, height, weight — controlled. */
export function BodyFields({ value, onChange, lang }: { value: Body; onChange: (b: Body) => void; lang: Lang }) {
  const tx = BODY_TEXT[lang];
  const thisYear = new Date().getFullYear();
  // Text drafts so typing "17" on the way to "175" doesn't get rejected.
  const [draft, setDraft] = useState({ birth: value.birth_year?.toString() ?? '', h: value.height_cm?.toString() ?? '', w: value.weight_kg?.toString() ?? '' });
  const set = (k: 'birth' | 'h' | 'w', v: string) => {
    setDraft((d) => ({ ...d, [k]: v }));
    const n = numOrNull(v);
    if (k === 'birth') onChange({ ...value, birth_year: n != null && n >= 1900 && n <= thisYear ? Math.round(n) : null });
    if (k === 'h') onChange({ ...value, height_cm: n != null && n >= 40 && n <= 250 ? n : null });
    if (k === 'w') onChange({ ...value, weight_kg: n != null && n >= 2 && n <= 400 ? n : null });
  };
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-3">
        <label className="col-span-1">
          <span className={fieldLabelCls}>{tx.birthYear}</span>
          <input inputMode="numeric" value={draft.birth} onChange={(e) => set('birth', e.target.value)} placeholder="1990" className={input} dir="ltr" />
        </label>
        <label>
          <span className={fieldLabelCls}>{tx.height}</span>
          <input inputMode="decimal" value={draft.h} onChange={(e) => set('h', e.target.value)} placeholder="170" className={input} dir="ltr" />
        </label>
        <label>
          <span className={fieldLabelCls}>{tx.weight}</span>
          <input inputMode="decimal" value={draft.w} onChange={(e) => set('w', e.target.value)} placeholder="70" className={input} dir="ltr" />
        </label>
      </div>
      <div>
        <span className={fieldLabelCls}>{tx.sex}</span>
        <div className="flex gap-2">
          {(['female', 'male'] as Sex[]).map((s) => (
            <button key={s} type="button" aria-pressed={value.sex === s} onClick={() => onChange({ ...value, sex: s })} className={pillCls(value.sex === s)}>{tx[s]}</button>
          ))}
        </div>
      </div>
      <div>
        <span className={fieldLabelCls}>{tx.activity}</span>
        <div className="grid grid-cols-2 gap-2">
          {ACTIVITIES.map((a) => (
            <button key={a} type="button" aria-pressed={value.activity === a} onClick={() => onChange({ ...value, activity: a })}
              className={`min-h-[52px] px-3 py-2 rounded-2xl border text-start transition-colors ${value.activity === a
                ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)] border-transparent'
                : 'border-[var(--color-border)] bg-[var(--color-bg-subtle)]/50 text-[var(--color-text-primary)]'}`}>
              <span className="block text-sm font-semibold">{tx.activities[a]}</span>
              <span className={`block text-[11px] ${value.activity === a ? 'opacity-90' : 'text-[var(--color-text-muted)]'}`}>{tx.activityHints[a]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The computed daily targets, compact. */
export function TargetsSummary({ targets, body, lang }: { targets: Targets | null; body?: Body; lang: Lang }) {
  const tx = BODY_TEXT[lang];
  const age = body ? ageFrom(body.birth_year) : null;
  if (!targets) {
    return <p className="text-sm text-[var(--color-text-muted)]">{age != null && age < 2 ? tx.baby : tx.needAge}</p>;
  }
  const n = (x: number) => x.toLocaleString(lang === 'he' ? 'he-IL' : 'en-US');
  const rows: Array<[string, string]> = [
    [tx.kcal, `${n(targets.kcal[0])}–${n(targets.kcal[1])}`],
    [tx.protein, `${targets.protein_g[0]}–${targets.protein_g[1]} ${tx.g}`],
    [tx.fat, `${targets.fat_g[0]}–${targets.fat_g[1]} ${tx.g}`],
    [tx.carbs, `${targets.carbs_g[0]}–${targets.carbs_g[1]} ${tx.g}`],
    [tx.fiber, `${tx.atLeast} ${targets.fiber_g_min} ${tx.g}`],
    [tx.sodium, `${tx.atMost} ${n(targets.sodium_mg_max)} ${tx.mg}`],
    [tx.satFat, `${tx.atMost} ${targets.sat_fat_g_max} ${tx.g}`],
    [tx.sugars, `${tx.atMost} ${targets.sugars_g_max} ${tx.g}`],
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {rows.map(([k, v]) => (
          <div key={k} className="rounded-xl bg-[var(--color-bg-subtle)] px-3 py-2">
            <span className="block text-[11px] text-[var(--color-text-muted)]">{k}</span>
            <span className="block text-sm font-semibold text-[var(--color-text-primary)] tabular-nums">{v}</span>
          </div>
        ))}
      </div>
      {targets.approx && <p className="text-[11px] text-amber-600 dark:text-amber-400">{tx.approx}</p>}
      <p className="text-[11px] text-[var(--color-text-muted)]">{tx.targetsNote}</p>
    </div>
  );
}

/** Your own body data (private) + your targets (shared). Autosaves. */
export function BodySection({ userId, lang }: { userId: string; lang: Lang }) {
  const tx = BODY_TEXT[lang];
  const [body, setBody] = useState<Body | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { loadOwnBody(supabase, userId).then(setBody).catch(() => setBody(EMPTY_BODY)); }, [userId]);

  const update = (next: Body) => {
    setBody(next);
    if (timer.current) clearTimeout(timer.current);
    setState('saving');
    timer.current = setTimeout(async () => {
      try { await saveOwnBody(supabase, userId, next); setState('saved'); } catch { setState('error'); }
    }, 700);
  };

  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
          <ActivityIcon className="w-5 h-5" /> {tx.bodyTitle}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--color-bg-subtle)] text-[10px] font-semibold text-[var(--color-text-muted)]"><Lock className="w-3 h-3" /> {tx.private}</span>
        </h3>
        <SaveState state={state} lang={lang} />
      </div>
      <p className="text-sm text-[var(--color-text-secondary)] mb-6">{tx.bodyIntro}</p>
      {!body ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-[var(--color-accent)]" /></div>
      ) : (
        <div className="flex flex-col gap-6">
          <BodyFields value={body} onChange={update} lang={lang} />
          <div>
            <span className={fieldLabelCls}>{tx.targets}</span>
            <TargetsSummary targets={targetsFor(body)} body={body} lang={lang} />
          </div>
        </div>
      )}
    </div>
  );
}

type Draft = Omit<HouseholdPerson, 'id' | 'targets'> & { id?: string };

/** People without an account, managed by the household. */
export function HouseholdPeopleSection({ householdId, lang, onChanged }: { householdId: string; lang: Lang; onChanged?: () => void }) {
  const tx = BODY_TEXT[lang];
  const [people, setPeople] = useState<HouseholdPerson[] | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const reload = async () => { try { setPeople(await loadPeople(supabase, householdId)); } catch { setPeople([]); } };
  useEffect(() => { reload(); }, [householdId]); // eslint-disable-line react-hooks/exhaustive-deps

  const blank = (): Draft => ({ household_id: householdId, name: '', ...EMPTY_BODY, ...NO_PREFS });
  const save = async () => {
    if (!editing || !editing.name.trim()) return;
    setBusy(true);
    try { await savePerson(supabase, editing); setEditing(null); await reload(); onChanged?.(); } catch { /* keep the sheet open */ }
    setBusy(false);
  };
  const remove = async () => {
    if (!editing?.id) return;
    setBusy(true);
    try { await deletePerson(supabase, editing.id); setEditing(null); await reload(); onChanged?.(); } catch { /* ignore */ }
    setBusy(false);
  };

  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)] flex items-center gap-2"><Baby className="w-5 h-5" /> {tx.peopleTitle}</h3>
        <button type="button" onClick={() => { setConfirmDelete(false); setEditing(blank()); }}
          className="min-h-[40px] px-3 rounded-xl bg-[var(--color-accent)] text-[var(--color-accent-text)] text-sm font-bold flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> {tx.addPerson}
        </button>
      </div>
      <p className="text-sm text-[var(--color-text-secondary)] mb-4">{tx.peopleIntro}</p>
      {people == null ? (
        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-[var(--color-accent)]" /></div>
      ) : people.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">{tx.noPeople}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {people.map((p) => {
            const age = ageFrom(p.birth_year);
            return (
              <button key={p.id} type="button" onClick={() => { setConfirmDelete(false); setEditing({ ...p }); }}
                className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-bg-subtle)]/40 text-start hover:bg-[var(--color-bg-hover)]">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[var(--color-text-primary)] truncate" dir="auto">{p.name}</span>
                  <span className="block text-[11px] text-[var(--color-text-muted)]">
                    {[age != null ? tx.years(age) : null, p.targets ? `${p.targets.kcal[0]}–${p.targets.kcal[1]} kcal` : null].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <Pencil className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => !busy && setEditing(null)}>
          <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-[var(--color-bg-panel)] rounded-t-3xl sm:rounded-3xl p-5 flex flex-col gap-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-[var(--color-text-primary)]">{editing.id ? tx.edit : tx.addPerson}</h3>
              <button type="button" aria-label={tx.cancel} onClick={() => setEditing(null)} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-[var(--color-bg-hover)]"><X className="w-5 h-5" /></button>
            </div>
            <label>
              <span className={fieldLabelCls}>{tx.name}</span>
              <input value={editing.name} maxLength={40} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={input} dir="auto" autoFocus />
            </label>
            <BodyFields key={editing.id ?? 'new'} value={editing} onChange={(b) => setEditing({ ...editing, ...b })} lang={lang} />
            <div>
              <span className={fieldLabelCls}>{tx.targets}</span>
              <TargetsSummary targets={targetsFor(editing)} body={editing} lang={lang} />
            </div>
            <div>
              <span className="block text-sm font-semibold text-[var(--color-text-primary)] mb-3">{tx.prefs}</span>
              <FoodPrefsEditor value={editing} onChange={(p) => setEditing({ ...editing, ...p })} lang={lang} />
            </div>
            <div className="flex gap-2 pt-2">
              {editing.id && (
                confirmDelete ? (
                  <button type="button" disabled={busy} onClick={remove} className="min-h-[48px] px-4 rounded-2xl bg-red-600 text-white text-sm font-bold">{tx.remove}</button>
                ) : (
                  <button type="button" onClick={() => setConfirmDelete(true)} aria-label={tx.remove} className="min-h-[48px] min-w-[48px] rounded-2xl border border-[var(--color-border)] text-red-600 flex items-center justify-center"><Trash2 className="w-5 h-5" /></button>
                )
              )}
              <button type="button" disabled={busy || !editing.name.trim()} onClick={save}
                className="flex-1 min-h-[48px] rounded-2xl bg-[var(--color-accent)] text-[var(--color-accent-text)] text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} {tx.save}
              </button>
            </div>
            {confirmDelete && <p className="text-xs text-red-600 -mt-3">{tx.confirmRemove}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
