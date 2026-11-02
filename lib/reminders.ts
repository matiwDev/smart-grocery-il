/**
 * Reminders + web push (bell → Notifications panel, Nov 2026).
 *
 * Shared by the client (presets, labels, calendar file) and the server
 * (`isDue`, messages). Sending lives in lib/pushServer.ts (server only).
 */

export type ReminderKind = 'fill_list' | 'shopping' | 'plan_meals';
export const REMINDER_KINDS: ReminderKind[] = ['fill_list', 'shopping', 'plan_meals'];

export interface Reminder {
  id?: string;
  kind: ReminderKind;
  enabled: boolean;
  /** 0 = Sunday … 6 = Saturday */
  days: number[];
  /** "HH:MM" local time */
  at_time: string;
  tz: string;
  skip_shabbat: boolean;
  lang: 'he' | 'en';
  last_sent_at?: string | null;
}

/** Sensible starting points (an Israeli week: shop Thursday/Friday). */
export const DEFAULTS: Record<ReminderKind, Pick<Reminder, 'days' | 'at_time'>> = {
  fill_list: { days: [3], at_time: '20:00' },  // Wednesday evening
  shopping: { days: [4], at_time: '17:00' },   // Thursday afternoon
  plan_meals: { days: [6], at_time: '20:30' }, // Saturday night
};

export const KIND_TEXT: Record<'he' | 'en', Record<ReminderKind, { title: string; hint: string }>> = {
  he: {
    fill_list: { title: 'למלא את הרשימה', hint: 'תזכורת לכל הבית להוסיף מה שחסר לפני הקנייה' },
    shopping: { title: 'יום קניות', hint: 'תזכורת לצאת לקנות, עם מספר הפריטים ברשימה' },
    plan_meals: { title: 'לתכנן את ארוחות השבוע', hint: 'כדי שהרשימה תתמלא מהתפריט' },
  },
  en: {
    fill_list: { title: 'Fill the list', hint: 'A nudge for everyone to add what’s missing before shopping' },
    shopping: { title: 'Shopping day', hint: 'Time to go shopping, with how many items are on the list' },
    plan_meals: { title: "Plan the week's meals", hint: 'So the list fills itself from the menu' },
  },
};

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Weekday (0 = Sunday) and minutes since midnight in a time zone. */
export function localClock(now: Date, tz: string): { day: number; minutes: number; date: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    day: WEEKDAY[get('weekday')] ?? 0,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
    date: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Friday from 15:00 until Saturday 20:00 (local). */
export function inShabbat(day: number, minutes: number): boolean {
  return (day === 5 && minutes >= 15 * 60) || (day === 6 && minutes < 20 * 60);
}

/** The cron runs every 10 minutes; a reminder fires once in the 40 minutes after its time. */
export const WINDOW_MIN = 40;

export function isDue(r: Reminder, now: Date): boolean {
  if (!r.enabled || r.days.length === 0) return false;
  const { day, minutes } = localClock(now, r.tz);
  if (!r.days.includes(day)) return false;
  const at = timeToMinutes(r.at_time);
  if (minutes < at || minutes >= at + WINDOW_MIN) return false;
  if (r.skip_shabbat && inShabbat(day, minutes)) return false;
  if (r.last_sent_at && now.getTime() - new Date(r.last_sent_at).getTime() < 12 * 3600_000) return false;
  return true;
}

export interface ReminderContext { listCount: number; nextWeekMeals: number; tonight: string | null }

export function reminderMessage(kind: ReminderKind, lang: 'he' | 'en', c: ReminderContext): { title: string; body: string; url: string } {
  if (lang === 'he') {
    if (kind === 'fill_list') return { title: '🛒 הזמן למלא את הרשימה', body: c.listCount ? `יש ${c.listCount} פריטים ברשימה. חסר משהו לפני הקנייה?` : 'הרשימה עדיין ריקה. מה צריך השבוע?', url: '/' };
    if (kind === 'shopping') return { title: '🧺 יום קניות!', body: c.listCount ? `${c.listCount} פריטים מחכים ברשימה${c.tonight ? ` · בערב: ${c.tonight}` : ''}` : 'הרשימה ריקה כרגע. כדאי להוסיף לפני שיוצאים.', url: '/' };
    return { title: '🍳 מתכננים את השבוע?', body: c.nextWeekMeals ? `${c.nextWeekMeals} ארוחות כבר מתוכננות לשבוע הבא. נשלים?` : 'עוד לא תוכננו ארוחות לשבוע הבא. כמה דקות עכשיו חוסכות קניות כפולות.', url: '/?view=MEALS' };
  }
  if (kind === 'fill_list') return { title: '🛒 Time to fill the list', body: c.listCount ? `${c.listCount} items on the list. Anything missing before shopping?` : 'The list is still empty. What do we need this week?', url: '/' };
  if (kind === 'shopping') return { title: '🧺 Shopping day!', body: c.listCount ? `${c.listCount} items waiting on the list${c.tonight ? ` · tonight: ${c.tonight}` : ''}` : 'The list is empty right now. Add things before you go.', url: '/' };
  return { title: '🍳 Plan the week?', body: c.nextWeekMeals ? `${c.nextWeekMeals} meals already planned for next week. Finish it?` : 'No meals planned for next week yet. A few minutes now saves double shopping.', url: '/?view=MEALS' };
}

// ─── "Add to calendar" (works on every phone, no push needed) ───────────────

const ICS_DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function reminderIcs(r: Reminder, appUrl: string): string {
  const t = KIND_TEXT[r.lang][r.kind];
  const [h, m] = r.at_time.split(':');
  const start = new Date();
  // First occurrence: today or the next chosen weekday.
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (r.days.includes(d.getDay())) { start.setTime(d.getTime()); break; }
  }
  const ymd = `${start.getFullYear()}${String(start.getMonth() + 1).padStart(2, '0')}${String(start.getDate()).padStart(2, '0')}`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const esc = (s: string) => s.replace(/[\\,;]/g, (c) => `\\${c}`);
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Smart Grocery IL//Reminders//HE', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${r.kind}-${ymd}@smart-grocery-il`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=${r.tz}:${ymd}T${h.padStart(2, '0')}${m.padStart(2, '0')}00`,
    'DURATION:PT15M',
    `RRULE:FREQ=WEEKLY;BYDAY=${r.days.slice().sort().map((d) => ICS_DAY[d]).join(',')}`,
    `SUMMARY:${esc(`Smart Grocery: ${t.title}`)}`,
    `DESCRIPTION:${esc(`${t.hint} — ${appUrl}`)}`,
    `URL:${appUrl}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(t.title)}`, 'TRIGGER:PT0M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}
