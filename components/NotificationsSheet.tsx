'use client';

/**
 * The bell → Notifications panel (Nov 2026). Turn on notifications on this
 * device, then choose reminders: fill the list, shopping day, plan the week's
 * meals — days, time, Shabbat pause. Each reminder can also go to the phone's
 * calendar instead (an .ics file), which works everywhere without push.
 * Saved per user (reminders table) as you change it.
 */
import React, { useEffect, useRef, useState } from 'react';
import { X, Bell, BellOff, Loader2, CalendarPlus, Smartphone, Send, Moon, Share } from 'lucide-react';
import { supabase } from '@/utils/supabase';
import { authFetch } from '@/utils/authFetch';
import { DEFAULTS, KIND_TEXT, REMINDER_KINDS, Reminder, ReminderKind, reminderIcs } from '@/lib/reminders';
import { PushState, disablePush, enablePush, isIos, pushState } from '@/lib/push';

type Lang = 'he' | 'en';

const TEXT = {
  he: {
    title: 'התראות ותזכורות', device: 'בטלפון הזה', on: 'התראות פועלות', off: 'התראות כבויות', turnOn: 'הפעלת התראות', turnOff: 'כיבוי',
    denied: 'ההתראות נחסמו בדפדפן. אפשר לאפשר אותן בהגדרות האתר.', unsupported: 'הדפדפן הזה לא תומך בהתראות. אפשר להשתמש ב"הוספה ליומן".',
    needsInstall: 'באייפון: לחצו על שיתוף ← "הוספה למסך הבית", ופתחו את האפליקציה משם. אחר כך תוכלו להפעיל התראות.',
    test: 'שליחת בדיקה', testSent: 'נשלחה התראת בדיקה', testNone: 'לא נמצא מכשיר להתראות', notReady: 'ההתראות עוד לא הוגדרו בשרת',
    reminders: 'תזכורות', days: ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'], at: 'בשעה', shabbat: 'בלי התראות בשבת',
    shabbatHint: 'משישי 15:00 עד מוצאי שבת 20:00', calendar: 'הוספה ליומן', saved: 'נשמר', error: 'השמירה נכשלה',
    note: 'התזכורות אישיות: כל אחד בבית בוחר את שלו.',
  },
  en: {
    title: 'Notifications & reminders', device: 'On this device', on: 'Notifications are on', off: 'Notifications are off', turnOn: 'Turn on notifications', turnOff: 'Turn off',
    denied: 'Notifications are blocked in this browser. Allow them in the site settings.', unsupported: "This browser can't show notifications. Use “Add to calendar” instead.",
    needsInstall: 'On iPhone: tap Share → “Add to Home Screen”, then open the app from there. After that you can turn notifications on.',
    test: 'Send a test', testSent: 'Test notification sent', testNone: 'No device to notify yet', notReady: 'Notifications aren’t set up on the server yet',
    reminders: 'Reminders', days: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'], at: 'at', shabbat: 'No notifications on Shabbat',
    shabbatHint: 'Friday 15:00 until Saturday 20:00', calendar: 'Add to calendar', saved: 'Saved', error: "Couldn't save",
    note: 'Reminders are personal: everyone in the household picks their own.',
  },
};

const blank = (kind: ReminderKind, lang: Lang): Reminder => ({
  kind, enabled: false, ...DEFAULTS[kind], tz: 'Asia/Jerusalem', skip_shabbat: true, lang,
});

export function NotificationsSheet({ userId, householdId, lang, onClose, showToast }: {
  userId: string; householdId: string | null; lang: Lang; onClose: () => void; showToast: (m: string) => void;
}) {
  const tx = TEXT[lang];
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState<'push' | 'test' | null>(null);
  const [items, setItems] = useState<Record<ReminderKind, Reminder> | null>(null);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const timers = useRef<Partial<Record<ReminderKind, ReturnType<typeof setTimeout>>>>({});

  useEffect(() => { pushState().then(setState).catch(() => setState('unsupported')); }, []);
  useEffect(() => {
    supabase.from('reminders').select('id, kind, enabled, days, at_time, tz, skip_shabbat, lang, last_sent_at').eq('user_id', userId).then(({ data }) => {
      const out = Object.fromEntries(REMINDER_KINDS.map((k) => [k, blank(k, lang)])) as Record<ReminderKind, Reminder>;
      for (const r of (data ?? []) as Reminder[]) out[r.kind] = { ...r, at_time: String(r.at_time).slice(0, 5) };
      setItems(out);
    });
  }, [userId, lang]);

  const save = (r: Reminder) => {
    setItems((prev) => (prev ? { ...prev, [r.kind]: r } : prev));
    const t = timers.current[r.kind];
    if (t) clearTimeout(t);
    setSaving('saving');
    timers.current[r.kind] = setTimeout(async () => {
      const { error } = await supabase.from('reminders').upsert({
        user_id: userId, household_id: householdId, kind: r.kind, enabled: r.enabled, days: r.days, at_time: r.at_time,
        tz: r.tz, skip_shabbat: r.skip_shabbat, lang, updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,kind' });
      setSaving(error ? 'error' : 'saved');
    }, 500);
  };

  const togglePush = async () => {
    setBusy('push');
    try {
      if (state === 'on') { await disablePush(supabase); setState('off'); }
      else setState(await enablePush(supabase));
    } catch (e) {
      showToast(e instanceof Error && /configured/.test(e.message) ? tx.notReady : tx.error);
    }
    setBusy(null);
  };

  const test = async () => {
    setBusy('test');
    try {
      const res = await authFetch('/api/push/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang }) });
      const d = await res.json().catch(() => ({}));
      showToast(res.status === 503 ? tx.notReady : d.sent ? tx.testSent : tx.testNone);
    } catch { showToast(tx.error); }
    setBusy(null);
  };

  const downloadIcs = (r: Reminder) => {
    const blob = new Blob([reminderIcs({ ...r, lang }, window.location.origin)], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `smart-grocery-${r.kind}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const anyShabbat = items ? Object.values(items).some((r) => r.skip_shabbat) : true;
  const pill = (on: boolean) => `w-9 h-9 rounded-full text-xs font-semibold border ${on
    ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)] border-transparent'
    : 'border-[var(--color-border)] text-[var(--color-text-secondary)] bg-[var(--color-bg-subtle)]/50'}`;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end sm:justify-center bg-black/50" onClick={onClose}>
      <div role="dialog" aria-label={tx.title} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg mx-auto max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[var(--color-bg-panel)] border border-[var(--color-border)] p-5 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)] flex items-center gap-2"><Bell className="w-5 h-5 text-[var(--color-accent)]" /> {tx.title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -me-2 flex items-center justify-center text-[var(--color-text-muted)]"><X className="w-5 h-5" /></button>
        </div>

        {/* This device */}
        <section className="rounded-2xl bg-[var(--color-bg-subtle)] p-4 flex flex-col gap-3">
          <span className="text-xs font-semibold text-[var(--color-text-muted)] flex items-center gap-1.5"><Smartphone className="w-3.5 h-3.5" /> {tx.device}</span>
          {state == null ? <Loader2 className="w-5 h-5 animate-spin text-[var(--color-accent)]" /> : state === 'needs-install' ? (
            <p className="text-sm text-[var(--color-text-secondary)] flex gap-2"><Share className="w-4 h-4 shrink-0 mt-0.5 text-[var(--color-accent)]" /> {tx.needsInstall}</p>
          ) : state === 'unsupported' ? (
            <p className="text-sm text-[var(--color-text-secondary)]">{tx.unsupported}</p>
          ) : state === 'denied' ? (
            <p className="text-sm text-[var(--color-text-secondary)] flex gap-2"><BellOff className="w-4 h-4 shrink-0 mt-0.5" /> {tx.denied}</p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={`text-sm font-semibold ${state === 'on' ? 'text-[var(--color-success)]' : 'text-[var(--color-text-secondary)]'}`}>{state === 'on' ? tx.on : tx.off}</span>
              <div className="flex gap-2">
                {state === 'on' && (
                  <button type="button" disabled={busy != null} onClick={test} className="min-h-[40px] px-3 rounded-xl border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-primary)] flex items-center gap-1.5">
                    {busy === 'test' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} {tx.test}
                  </button>
                )}
                <button type="button" disabled={busy != null} onClick={togglePush}
                  className={`min-h-[40px] px-4 rounded-xl text-sm font-bold flex items-center gap-1.5 ${state === 'on' ? 'border border-[var(--color-border)] text-[var(--color-text-secondary)]' : 'bg-[var(--color-accent)] text-[var(--color-accent-text)]'}`}>
                  {busy === 'push' && <Loader2 className="w-4 h-4 animate-spin" />} {state === 'on' ? tx.turnOff : tx.turnOn}
                </button>
              </div>
            </div>
          )}
          {isIos() && state === 'off' && <p className="text-[11px] text-[var(--color-text-muted)]">iOS 16.4+</p>}
        </section>

        {/* Reminders */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[var(--color-text-primary)]">{tx.reminders}</h3>
            <span className="text-xs text-[var(--color-text-muted)]" aria-live="polite">{saving === 'saving' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saving === 'saved' ? tx.saved : saving === 'error' ? tx.error : ''}</span>
          </div>
          {!items ? <Loader2 className="w-5 h-5 animate-spin text-[var(--color-accent)]" /> : REMINDER_KINDS.map((k) => {
            const r = items[k];
            const t = KIND_TEXT[lang][k];
            return (
              <div key={k} className={`rounded-2xl border p-3 flex flex-col gap-3 transition-colors ${r.enabled ? 'border-[var(--color-accent)]/40 bg-[var(--color-bg-panel)]' : 'border-[var(--color-border)] bg-[var(--color-bg-subtle)]/40'}`}>
                <label className="flex items-start justify-between gap-3 cursor-pointer">
                  <span>
                    <span className="block text-sm font-semibold text-[var(--color-text-primary)]">{t.title}</span>
                    <span className="block text-[11px] text-[var(--color-text-muted)]">{t.hint}</span>
                  </span>
                  <input type="checkbox" checked={r.enabled} onChange={(e) => save({ ...r, enabled: e.target.checked })} className="w-5 h-5 mt-0.5 shrink-0 accent-[var(--color-accent)]" />
                </label>
                {r.enabled && (
                  <>
                    <div className="flex flex-wrap gap-1.5" dir={lang === 'he' ? 'rtl' : 'ltr'}>
                      {tx.days.map((d, i) => (
                        <button key={i} type="button" aria-pressed={r.days.includes(i)} className={pill(r.days.includes(i))}
                          onClick={() => save({ ...r, days: r.days.includes(i) ? r.days.filter((x) => x !== i) : [...r.days, i].sort() })}>{d}</button>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                        {tx.at}
                        <input type="time" value={r.at_time} onChange={(e) => e.target.value && save({ ...r, at_time: e.target.value })}
                          className="min-h-[40px] bg-[var(--color-bg-subtle)]/60 border border-[var(--color-border)] rounded-xl px-3 text-sm text-[var(--color-text-primary)]" dir="ltr" />
                      </label>
                      <button type="button" disabled={r.days.length === 0} onClick={() => downloadIcs(r)}
                        className="min-h-[40px] px-2 text-xs font-semibold text-[var(--color-accent)] flex items-center gap-1 disabled:opacity-40">
                        <CalendarPlus className="w-4 h-4" /> {tx.calendar}
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
          {items && (
            <label className="flex items-center justify-between gap-3 px-1 cursor-pointer">
              <span>
                <span className="text-sm text-[var(--color-text-primary)] flex items-center gap-1.5"><Moon className="w-4 h-4 text-[var(--color-accent)]" /> {tx.shabbat}</span>
                <span className="block text-[11px] text-[var(--color-text-muted)]">{tx.shabbatHint}</span>
              </span>
              <input type="checkbox" checked={anyShabbat}
                onChange={(e) => REMINDER_KINDS.forEach((k) => save({ ...items[k], skip_shabbat: e.target.checked }))}
                className="w-5 h-5 shrink-0 accent-[var(--color-accent)]" />
            </label>
          )}
          <p className="text-[11px] text-[var(--color-text-muted)]">{tx.note}</p>
        </section>
      </div>
    </div>
  );
}
