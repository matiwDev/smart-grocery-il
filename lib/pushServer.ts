/**
 * Server-only: sending web push with VAPID keys (env NEXT_PUBLIC_VAPID_PUBLIC_KEY,
 * VAPID_PRIVATE_KEY, VAPID_SUBJECT). Subscriptions the push service says are
 * gone (404/410) are deleted.
 */
import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';

let configured = false;
export function pushConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://smart-grocery-il.vercel.app', pub, priv);
  configured = true;
  return true;
}

export interface PushPayload { title: string; body: string; url?: string; tag?: string }

/** Sends to every device of a user; returns how many accepted it. */
export async function pushToUser(supabase: SupabaseClient, userId: string, payload: PushPayload): Promise<number> {
  if (!pushConfigured()) return 0;
  const { data: subs } = await supabase.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId);
  let ok = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
        JSON.stringify(payload),
        { TTL: 6 * 3600, urgency: 'normal' },
      );
      ok++;
      await supabase.from('push_subscriptions').update({ last_ok_at: new Date().toISOString() }).eq('id', s.id);
    } catch (err: unknown) {
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) await supabase.from('push_subscriptions').delete().eq('id', s.id);
      else console.error('[push]', status, (err as Error)?.message);
    }
  }));
  return ok;
}
