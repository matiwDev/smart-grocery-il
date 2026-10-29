import type { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { debugEmails } from '@/lib/debug';

/**
 * Server-side gate for /api/debug/*: the caller must send its Supabase access
 * token (Authorization: Bearer …) and its verified email must be in
 * NEXT_PUBLIC_DEBUG_EMAILS. In local development any request is allowed.
 * Returns the user's email, or null if not allowed.
 */
export async function requireDebugUser(req: NextRequest): Promise<string | null> {
  if (process.env.NODE_ENV === 'development') return 'development';
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const supabase = createServerClient();
  const { data, error } = await supabase.auth.getUser(token);
  const email = data?.user?.email?.toLowerCase();
  if (error || !email) return null;
  return debugEmails().includes(email) ? email : null;
}
