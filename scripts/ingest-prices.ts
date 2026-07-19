/**
 * Standalone price ingestion script — fetches real price feeds published under
 * Israel's Food Act (2014) transparency requirement and loads them into
 * price_history. Talks to Supabase via plain REST (PostgREST) with the
 * service-role key rather than @supabase/supabase-js: this repo runs on
 * Node 20, and realtime-js (a supabase-js dependency) requires a native
 * WebSocket only available from Node 22+, which crashes standalone scripts.
 *
 * Run with: npm run ingest
 */
import { requireEnv, restFetch, fetchWithRetry, chunk, refreshLatestPrices } from './supabase-rest';
import { fetchShufersalFileLinks, fetchAndParseShufersalFile } from './shufersal-feed';

requireEnv();

// How many per-branch Shufersal files to download and parse in one run.
// The public listing has one PriceFull file per branch (hundreds of them);
// pulling all of them isn't necessary to prove the pipeline works end to end.
const SHUFERSAL_STORE_LIMIT = Number(process.env.SHUFERSAL_STORE_LIMIT || 3);

// Note: this URL resolves (unlike the earlier url.rami-levy.co.il host) but
// currently 404s (verified via curl as of this writing) — see CLAUDE.md
// "Price ingestion pipeline" for details. Kept as the documented correct
// endpoint; the script logs and continues per-chain on failure either way.
const RAMI_LEVY_URL = 'https://www.rami-levy.co.il/api/delivery/prices';

// ─── Shared types ───────────────────────────────────────────────────────────

interface FeedItem {
  barcode: string;
  price: number;
  unitQty: number;
  unitType: string;
  isSale: boolean;
}

interface IngestResult {
  chainId: string;
  fetched: number;
  matched: number;
  inserted: number;
  errorText: string | null;
}

// ─── Matching + insert (shared by every chain) ─────────────────────────────

async function matchAndInsert(chainId: string, items: FeedItem[]): Promise<{ matched: number; inserted: number }> {
  const uniqueBarcodes = [...new Set(items.map((i) => i.barcode).filter(Boolean))];
  const barcodeToProductId = new Map<string, string>();

  for (const batch of chunk(uniqueBarcodes, 200)) {
    const filter = `barcode=in.(${batch.map((b) => `"${b}"`).join(',')})`;
    const res = await restFetch(`products?select=id,barcode&${filter}`);
    if (!res.ok) {
      throw new Error(`Failed to look up products by barcode: HTTP ${res.status} ${await res.text()}`);
    }
    const rows = (await res.json()) as Array<{ id: string; barcode: string }>;
    for (const row of rows) barcodeToProductId.set(row.barcode, row.id);
  }

  const now = new Date().toISOString();
  const rowsToInsert = items
    .filter((item) => barcodeToProductId.has(item.barcode))
    .map((item) => ({
      product_id: barcodeToProductId.get(item.barcode),
      chain_id: chainId,
      branch_id: null,
      price: item.price,
      unit_qty: item.unitQty,
      unit_type: item.unitType,
      is_sale: item.isSale,
      captured_at: now,
      source: `${chainId}_gov_feed`,
    }));

  let inserted = 0;
  for (const batch of chunk(rowsToInsert, 500)) {
    const res = await restFetch('price_history', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      throw new Error(`Failed to insert price_history batch: HTTP ${res.status} ${await res.text()}`);
    }
    inserted += batch.length;
  }

  return { matched: rowsToInsert.length, inserted };
}

async function writeIngestLog(result: IngestResult, startedAt: string): Promise<void> {
  const res = await restFetch('ingest_log', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      chain_id: result.chainId,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      products_fetched: result.fetched,
      products_matched: result.matched,
      products_inserted: result.inserted,
      error_text: result.errorText,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (body.includes('PGRST205')) {
      console.warn(`  (skipped ingest_log write — table not found; apply supabase/migrations/004_ingest_log.sql)`);
    } else {
      console.warn(`  (failed to write ingest_log: HTTP ${res.status} ${body})`);
    }
  }
}

// ─── Shufersal (XML, gzipped, one file per branch) ─────────────────────────
// Fetch/parse mechanics live in ./shufersal-feed (shared with seed-products-from-feed.ts).

async function ingestShufersal(): Promise<IngestResult> {
  const startedAt = new Date().toISOString();
  const chainId = 'shufersal';
  let fetched = 0;
  let matched = 0;
  let inserted = 0;
  let errorText: string | null = null;

  try {
    console.log(`\n[shufersal] Fetching branch file listing...`);
    const links = await fetchShufersalFileLinks();
    if (links.length === 0) throw new Error('No PriceFull file links found in Shufersal listing page');

    const filesToProcess = links.slice(0, SHUFERSAL_STORE_LIMIT);
    console.log(`[shufersal] Found ${links.length} branch files, processing ${filesToProcess.length}`);

    const allItems: FeedItem[] = [];
    for (const url of filesToProcess) {
      const items = await fetchAndParseShufersalFile(url);
      console.log(`[shufersal]   ${items.length} items from ${url.split('/').pop()?.split('?')[0]}`);
      allItems.push(
        ...items.map((item) => ({
          barcode: item.barcode,
          price: item.price,
          unitQty: item.unitQty,
          unitType: item.unitType,
          isSale: false,
        }))
      );
    }
    fetched = allItems.length;

    console.log(`[shufersal] Matching ${fetched} fetched items against products.barcode...`);
    const result = await matchAndInsert(chainId, allItems);
    matched = result.matched;
    inserted = result.inserted;

    console.log(`[shufersal] Refreshing latest_prices...`);
    await refreshLatestPrices();
  } catch (err) {
    errorText = err instanceof Error ? err.message : String(err);
    console.error(`[shufersal] ERROR: ${errorText}`);
  }

  const result: IngestResult = { chainId, fetched, matched, inserted, errorText };
  await writeIngestLog(result, startedAt);
  return result;
}

// ─── Rami Levy (JSON) ───────────────────────────────────────────────────────

function extractRamiLevyItems(payload: unknown): FeedItem[] {
  // Expected shape per the current integration spec: {data: [{id, name, price}]}
  // (id = barcode). Also accepts a few other plausible shapes in case the API
  // evolves, and otherwise fails loudly rather than guessing silently.
  const candidateArray: unknown = Array.isArray(payload)
    ? payload
    : (payload as Record<string, unknown> | null)?.data ??
      (payload as Record<string, unknown> | null)?.items ??
      (payload as Record<string, unknown> | null)?.products;

  if (!Array.isArray(candidateArray)) {
    throw new Error('Unrecognized Rami Levy JSON response shape (expected an array, or {data:[]}/{items:[]}/{products:[]})');
  }

  return candidateArray
    .map((raw): FeedItem | null => {
      const r = raw as Record<string, unknown>;
      const barcode = String(r.id ?? r.barcode ?? r.itemCode ?? r.ItemCode ?? '').trim();
      const price = Number(r.price ?? r.itemPrice ?? r.ItemPrice);
      if (!barcode || !Number.isFinite(price)) return null;
      return {
        barcode,
        price,
        unitQty: Number(r.quantity ?? r.unitQty) || 1,
        unitType: String(r.unitOfMeasure ?? r.unit ?? 'unit'),
        isSale: false,
      };
    })
    .filter((item): item is FeedItem => item !== null);
}

async function ingestRamiLevy(): Promise<IngestResult> {
  const startedAt = new Date().toISOString();
  const chainId = 'rami_levy';
  let fetched = 0;
  let matched = 0;
  let inserted = 0;
  let errorText: string | null = null;

  try {
    console.log(`\n[rami_levy] Fetching ${RAMI_LEVY_URL}...`);
    const res = await fetchWithRetry(RAMI_LEVY_URL);
    if (!res.ok) throw new Error(`Rami Levy feed fetch failed: HTTP ${res.status}`);
    const payload = await res.json();
    const items = extractRamiLevyItems(payload);
    fetched = items.length;

    console.log(`[rami_levy] Matching ${fetched} fetched items against products.barcode...`);
    const result = await matchAndInsert(chainId, items);
    matched = result.matched;
    inserted = result.inserted;

    console.log(`[rami_levy] Refreshing latest_prices...`);
    await refreshLatestPrices();
  } catch (err) {
    errorText = err instanceof Error ? err.message : String(err);
    console.error(`[rami_levy] ERROR: ${errorText}`);
  }

  const result: IngestResult = { chainId, fetched, matched, inserted, errorText };
  await writeIngestLog(result, startedAt);
  return result;
}

// ─── Entry point ────────────────────────────────────────────────────────────

async function main() {
  const results: IngestResult[] = [];
  results.push(await ingestShufersal());
  results.push(await ingestRamiLevy());

  console.log('\n─── Summary ───────────────────────────────────────');
  for (const r of results) {
    console.log(
      `${r.chainId.padEnd(12)} fetched=${r.fetched}  matched=${r.matched}  inserted=${r.inserted}` +
        (r.errorText ? `  ERROR: ${r.errorText}` : '')
    );
  }

  const anyFailed = results.some((r) => r.errorText);
  process.exit(anyFailed ? 1 : 0);
}

main();
