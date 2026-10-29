import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The signed-in user behind an API request, from its Supabase access token
 * (Authorization: Bearer …). API routes use the service-role client, which
 * bypasses RLS, so they must never trust a user id sent by the client.
 */
export async function requestUserId(req: NextRequest, supabase: SupabaseClient): Promise<string | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  return error || !data?.user ? null : data.user.id;
}
