import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { Reminder, ReminderContext, ReminderKind, isDue, localClock, reminderMessage } from '@/lib/reminders';
import { pushConfigured, pushToUser } from '@/lib/pushServer';

// POST /api/reminders/run   (x-cron-secret: REMINDERS_CRON_SECRET)
// Called every 10 minutes by Supabase pg_cron (migration 030). Sends every
// reminder that is due now as a web push to the user's devices, with a line of
// household context (items on the list, meals planned, tonight's dinner).

export const dynamic = 'force-dynamic';

type Row = Reminder & { id: string; user_id: string; household_id: string | null };

async function context(supabase: ReturnType<typeof createServerClient>, householdId: string | null, tz: string): Promise<ReminderContext> {
  if (!householdId) return { listCount: 0, nextWeekMeals: 0, tonight: null };
  const { data: basket } = await supabase.from('baskets').select('id').eq('household_id', householdId).eq('is_archived', false)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  const { count } = basket
    ? await supabase.from('basket_items').select('id', { count: 'exact', head: true }).eq('basket_id', basket.id).eq('checked', false)
    : { count: 0 };
  const today = localClock(new Date(), tz);
  const d = new Date(`${today.date}T12:00:00Z`);
  const nextSun = new Date(d); nextSun.setUTCDate(d.getUTCDate() + (7 - today.day));
  const nextSat = new Date(nextSun); nextSat.setUTCDate(nextSun.getUTCDate() + 6);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const [{ count: meals }, { data: dinner }] = await Promise.all([
    supabase.from('meal_plan_entries').select('id', { count: 'exact', head: true }).eq('household_id', householdId).gte('plan_date', iso(nextSun)).lte('plan_date', iso(nextSat)),
    supabase.from('meal_plan_entries').select('recipes(title)').eq('household_id', householdId).eq('plan_date', today.date).eq('slot', 'dinner').limit(1).maybeSingle(),
  ]);
  const tonight = (dinner as unknown as { recipes?: { title?: string } | null } | null)?.recipes?.title ?? null;
  return { listCount: count ?? 0, nextWeekMeals: meals ?? 0, tonight };
}

export async function POST(req: NextRequest) {
  const secret = process.env.REMINDERS_CRON_SECRET;
  if (!secret || req.headers.get('x-cron-secret') !== secret) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!pushConfigured()) return NextResponse.json({ error: 'Push keys not set' }, { status: 503 });

  const supabase = createServerClient();
  const { data, error } = await supabase.from('reminders')
    .select('id, user_id, household_id, kind, enabled, days, at_time, tz, skip_shabbat, lang, last_sent_at').eq('enabled', true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = new Date();
  const due = ((data ?? []) as Row[]).map((r) => ({ ...r, at_time: String(r.at_time).slice(0, 5) })).filter((r) => isDue(r, now));
  let sent = 0;
  for (const r of due) {
    const c = await context(supabase, r.household_id, r.tz);
    const msg = reminderMessage(r.kind as ReminderKind, r.lang, c);
    const n = await pushToUser(supabase, r.user_id, { ...msg, tag: `reminder-${r.kind}` });
    // Marked even when no device took it, so a phone without notifications isn't retried all evening.
    await supabase.from('reminders').update({ last_sent_at: now.toISOString() }).eq('id', r.id);
    sent += n;
  }
  return NextResponse.json({ checked: data?.length ?? 0, due: due.length, sent });
}
