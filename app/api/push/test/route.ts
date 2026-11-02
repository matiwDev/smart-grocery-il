import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { requestUserId } from '@/lib/authServer';
import { pushConfigured, pushToUser } from '@/lib/pushServer';

// POST /api/push/test  { lang }   (Authorization: Bearer <access token>)
// "Send me a test" in the Notifications panel: one push to the caller's devices.

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const userId = await requestUserId(req, supabase);
  if (!userId) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: 'Push keys not set' }, { status: 503 });
  const { lang } = await req.json().catch(() => ({ lang: 'he' }));
  const sent = await pushToUser(supabase, userId, lang === 'en'
    ? { title: '🔔 Notifications are on', body: 'This is how reminders from Smart Grocery will look.', url: '/', tag: 'test' }
    : { title: '🔔 ההתראות פועלות', body: 'ככה ייראו התזכורות מ-Smart Grocery.', url: '/', tag: 'test' });
  return NextResponse.json({ sent });
}
