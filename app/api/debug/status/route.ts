import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { requireDebugUser } from '@/lib/debugServer';

// GET  /api/debug/status → database + per-chain data status (debug_db_stats())
// POST /api/debug/status { action: 'rollup' } → run the monthly price rollup now
// Gated by requireDebugUser (see lib/debugServer.ts). 404 for everyone else so
// the route's existence isn't advertised.

export async function GET(req: NextRequest) {
  if (!(await requireDebugUser(req))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc('debug_db_stats');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    ...data,
    server: {
      node_env: process.env.NODE_ENV,
      vercel_env: process.env.VERCEL_ENV ?? null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      region: process.env.VERCEL_REGION ?? null,
    },
  });
}

export async function POST(req: NextRequest) {
  if (!(await requireDebugUser(req))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  const supabase = createServerClient();

  if (action === 'rollup') {
    const { data, error } = await supabase.rpc('rollup_monthly_prices');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, rows_updated: data });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
