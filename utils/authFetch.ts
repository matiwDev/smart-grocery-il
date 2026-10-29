import { supabase } from '@/utils/supabase';

/** fetch() with the signed-in user's access token, for our own API routes. */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
