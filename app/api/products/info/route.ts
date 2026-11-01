import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { requestUserId } from '@/lib/authServer';
import { OFF_FIELDS, OFF_USER_AGENT, ProductInfoRow, fromOffProduct, isRetailBarcode, isStale, notFoundRow } from '@/lib/off';

// POST /api/products/info   { ids: string[] }   (Authorization: Bearer <access token>)
//
// Photo, nutrition and health grade for catalog products (Plan v2, phase 5).
// Answers from the product_info cache; products never looked up (or whose
// answer is old) are fetched from Open Food Facts, at most FETCH_PER_CALL per
// request so a long list never waits long — the reply's `pending` says how many
// are still to do, and the client simply asks again. Products without a retail
// barcode are cached as "not found" without asking OFF.
//
// Sign-in required (keeps the OFF lookups to real users); the data itself is
// the same for everyone.

const MAX_IDS = 80;
const FETCH_PER_CALL = 6;
const CONCURRENCY = 3;
const TIMEOUT_MS = 8000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Lookup = { row: ProductInfoRow } | { retry: true };

async function lookup(productId: string, barcode: string, category: string | null): Promise<Lookup> {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}?fields=${OFF_FIELDS}`, {
      headers: { 'User-Agent': OFF_USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    if (res.status === 404) return { row: notFoundRow(productId) };
    if (!res.ok) return { retry: true }; // 429 / 5xx: try again on a later call
    const j = (await res.json()) as { status?: number; product?: Record<string, unknown> };
    if (j.status !== 1 || !j.product) return { row: notFoundRow(productId) };
    return { row: fromOffProduct(productId, j.product, category) };
  } catch {
    return { retry: true }; // timeout / network
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const userId = await requestUserId(req, supabase);
    if (!userId) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
    const ids = [...new Set(Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string' && UUID.test(x)) : [])].slice(0, MAX_IDS);
    if (ids.length === 0) return NextResponse.json({ info: {}, pending: 0 });

    const { data: cached, error: cacheErr } = await supabase.from('product_info').select('*').in('product_id', ids);
    if (cacheErr) throw cacheErr;
    const info: Record<string, ProductInfoRow> = {};
    for (const r of (cached ?? []) as ProductInfoRow[]) info[r.product_id] = r;

    const due = ids.filter((id) => !info[id] || isStale(info[id]));
    if (due.length === 0) return NextResponse.json({ info, pending: 0 });

    const { data: products, error: prodErr } = await supabase.from('products').select('id, barcode, category').in('id', due);
    if (prodErr) throw prodErr;

    const writes: ProductInfoRow[] = [];
    const toFetch: Array<{ id: string; barcode: string; category: string | null }> = [];
    for (const p of products ?? []) {
      if (isRetailBarcode(p.barcode)) toFetch.push({ id: p.id, barcode: p.barcode, category: p.category });
      else writes.push(notFoundRow(p.id));
    }

    const batch = toFetch.slice(0, FETCH_PER_CALL);
    let retries = 0;
    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      const results = await Promise.all(batch.slice(i, i + CONCURRENCY).map((p) => lookup(p.id, p.barcode, p.category)));
      for (const r of results) {
        if ('row' in r) writes.push(r.row);
        else retries++;
      }
    }

    if (writes.length > 0) {
      const { error: upErr } = await supabase.from('product_info').upsert(writes, { onConflict: 'product_id' });
      if (upErr) throw upErr;
      for (const w of writes) info[w.product_id] = w;
    }

    // Still to do: not reached this call, plus OFF hiccups (rate limit, timeout).
    const pending = toFetch.length - batch.length + retries;
    return NextResponse.json({ info, pending });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load product info';
    console.error('[products/info]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
