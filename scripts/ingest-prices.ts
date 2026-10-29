/**
 * Real price ingestion logic — fetches real price feeds published under
 * Israel's Food Act (2014) transparency requirement and loads them into
 * chain_prices: one estimated price per product per chain (the price most of
 * the chain's stores charge). Talks to Supabase via plain REST (PostgREST)
 * with the service-role key rather than @supabase/supabase-js: the
 * standalone-script caller (scripts/run-ingest-cli.ts) runs on Node 20, and
 * realtime-js (a supabase-js dependency) requires a native WebSocket only
 * available from Node 22+, which crashes standalone scripts.
 *
 * This module only exports runIngestion() and has no process-level side
 * effects (no requireEnv() gate, no process.exit, no auto-run) — it's
 * imported by two different callers with different needs:
 *   - scripts/run-ingest-cli.ts, the `npm run ingest` CLI entry point
 *     (what the daily GitHub Action runs)
 *   - app/api/prices/ingest/route.ts's GET handler (manual calls only; it
 *     can't finish within Vercel's 300s function limit)
 *
 * Every chain feed is a set of per-store files. The store id (externalId) is
 * only used to count how many stores carry a product and to pick the most
 * common price; stores themselves are not stored (Plan v2, phase 1).
 */
import { restFetch, chunk, mapWithConcurrency, rollupMonthlyPrices } from './supabase-rest';
import { fetchShufersalTotalPages, fetchShufersalFileLinks, fetchShufersalFileLinksPage, fetchAndParseShufersalFile } from './shufersal-feed';
import { ParsedBranchFeed } from './parsers/types';
import { fetchAndParse as fetchAndParseVictory } from './parsers/victory';
import { fetchAndParse as fetchAndParseMahsaneiHashuk } from './parsers/mahsanei-hashuk';
import { fetchAndParse as fetchAndParseYohananof } from './parsers/yohananof';
import { fetchAndParse as fetchAndParseOsherAd } from './parsers/osher-ad';
import { fetchAndParse as fetchAndParseKeshetTeamim } from './parsers/keshet-teamim';
import { fetchAndParse as fetchAndParseRamiLevy } from './parsers/rami-levy';

// How many per-branch Shufersal files to download and parse in one run.
// Defaults to every branch file the listing publishes (Phase 18) — override
// with a real number via env var for a bounded/faster test run.
const SHUFERSAL_STORE_LIMIT = Number(process.env.SHUFERSAL_STORE_LIMIT || Infinity);
const SHUFERSAL_DOWNLOAD_CONCURRENCY = 8;

// ─── Shared types ───────────────────────────────────────────────────────────

interface FeedItem {
  barcode: string;
  price: number;
  unitQty: number;
  unitType: string;
  isSale: boolean;
}

interface BranchGroup {
  externalId: string | null;
  items: FeedItem[];
}

interface IngestResult {
  chainId: string;
  fetched: number;
  matched: number;
  inserted: number;
  errorText: string | null;
}

// ─── Matching + insert (shared by every chain) ─────────────────────────────

async function buildBarcodeToProductId(items: FeedItem[]): Promise<Map<string, string>> {
  const uniqueBarcodes = [...new Set(items.map((i) => i.barcode).filter(Boolean))];
  const map = new Map<string, string>();

  for (const batch of chunk(uniqueBarcodes, 200)) {
    const filter = `barcode=in.(${batch.map((b) => `"${b}"`).join(',')})`;
    const res = await restFetch(`products?select=id,barcode&${filter}`);
    if (!res.ok) {
      throw new Error(`Failed to look up products by barcode: HTTP ${res.status} ${await res.text()}`);
    }
    const rows = (await res.json()) as Array<{ id: string; barcode: string }>;
    for (const row of rows) map.set(row.barcode, row.id);
  }

  return map;
}

// ─── Price model ─────────────────────────────────────────────────────────────
// One row per (product, chain) in chain_prices: the price MOST of the chain's
// stores charge in today's feed (mode; ties → lower), plus min/max across
// stores and how many stores carry it. Monthly summaries for tracked products
// are rolled up at the end of the run (rollupMonthlyPrices).

interface ChainPriceRow {
  product_id: string;
  chain_id: string;
  price: number;
  min_price: number;
  max_price: number;
  branch_count: number;
  unit_qty: number;
  unit_type: string;
  is_sale: boolean;
  captured_at: string;
}

async function upsertRows(table: string, onConflict: string, rows: object[], batchSize = 500): Promise<number> {
  let written = 0;
  for (const batch of chunk(rows, batchSize)) {
    const res = await restFetch(`${table}?on_conflict=${onConflict}`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      throw new Error(`Failed to upsert ${table} batch: HTTP ${res.status} ${await res.text()}`);
    }
    written += batch.length;
  }
  return written;
}

// Pure: collapses per-store observations into one chain row per product.
export function collapseToChainPrices(
  chainId: string,
  observations: Array<{ productId: string; storeId: string | null; item: FeedItem }>,
  now: string
): ChainPriceRow[] {
  // productId -> storeKey -> item (last one wins for duplicate lines in the
  // same store file). Feeds with no store id use a single '_' key.
  const byProduct = new Map<string, Map<string, FeedItem>>();
  for (const obs of observations) {
    if (!Number.isFinite(obs.item.price) || obs.item.price <= 0) continue;
    let perStore = byProduct.get(obs.productId);
    if (!perStore) byProduct.set(obs.productId, (perStore = new Map()));
    perStore.set(obs.storeId ?? '_', obs.item);
  }

  const chainRows: ChainPriceRow[] = [];
  for (const [productId, perStore] of byProduct) {
    const items = [...perStore.values()];
    const counts = new Map<number, number>();
    let min = Infinity;
    let max = -Infinity;
    for (const item of items) {
      const p = Math.round(item.price * 100) / 100;
      counts.set(p, (counts.get(p) ?? 0) + 1);
      if (p < min) min = p;
      if (p > max) max = p;
    }
    let mode = min;
    let modeCount = 0;
    for (const [p, c] of counts) {
      if (c > modeCount || (c === modeCount && p < mode)) {
        mode = p;
        modeCount = c;
      }
    }
    const sample = items.find((i) => Math.round(i.price * 100) / 100 === mode)!;
    chainRows.push({
      product_id: productId,
      chain_id: chainId,
      price: mode,
      min_price: min,
      max_price: max,
      branch_count: items.length,
      unit_qty: sample.unitQty,
      unit_type: sample.unitType,
      is_sale: sample.isSale,
      captured_at: now,
    });
  }
  return chainRows;
}

// Shared by every chain: one batched barcode lookup across all of a chain's
// store files, then one chain_prices upsert.
async function matchAndInsertGrouped(
  chainId: string,
  groups: BranchGroup[]
): Promise<{ matched: number; inserted: number }> {
  const barcodeToProductId = await buildBarcodeToProductId(groups.flatMap((g) => g.items));
  const runStartedAt = new Date().toISOString();
  const observations: Array<{ productId: string; storeId: string | null; item: FeedItem }> = [];

  for (const group of groups) {
    for (const item of group.items) {
      const productId = barcodeToProductId.get(item.barcode);
      if (!productId) continue;
      observations.push({ productId, storeId: group.externalId, item });
    }
  }

  const chainRows = collapseToChainPrices(chainId, observations, runStartedAt);
  console.log(`[${chainId}] ${observations.length} matched observations → ${chainRows.length} chain prices`);
  const inserted = await upsertRows('chain_prices', 'product_id,chain_id', chainRows);
  return { matched: observations.length, inserted };
}

// Never allowed to throw: this used to be an unprotected `await restFetch(...)`
// call sitting AFTER each chain's own try/catch in ingestShufersal/
// ingestFromParser — a transient network blip while writing the log (a
// `fetch failed`/DNS hiccup, not even related to the chain's own ingest
// work) propagated all the way out of runIngestion() and killed the entire
// multi-hour, multi-chain CLI process, discarding every chain that hadn't
// run yet. Observed live during this session's full run: Shufersal's 2.3M
// fetched items matched/inserted successfully, then the run died here on a
// one-off ENOTFOUND resolving the Supabase host, before ever reaching
// Rami Levy/Victory/etc.
async function writeIngestLog(result: IngestResult, startedAt: string): Promise<void> {
  try {
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
  } catch (err) {
    console.warn(`  (failed to write ingest_log, continuing anyway: ${err instanceof Error ? err.message : err})`);
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
    console.log(`\n[shufersal] Fetching branch file listing (all pages)...`);
    const totalPages = await fetchShufersalTotalPages();
    const allLinks: string[] = [];
    for (let page = 1; page <= totalPages; page++) {
      const links = page === 1 ? await fetchShufersalFileLinks() : await fetchShufersalFileLinksPage(page);
      allLinks.push(...links);
    }
    const uniqueLinks = [...new Set(allLinks)];
    if (uniqueLinks.length === 0) throw new Error('No PriceFull file links found in Shufersal listing page');

    const filesToProcess = uniqueLinks.slice(0, SHUFERSAL_STORE_LIMIT);
    console.log(`[shufersal] Found ${uniqueLinks.length} branch files across ${totalPages} pages, processing ${filesToProcess.length}`);

    // Plain HTTPS (Azure Blob SAS URLs) — safe to download several branch
    // files at once instead of one at a time (Phase 18 removed the old
    // 3-file cap, so a full run is 400+ files).
    const groups: BranchGroup[] = await mapWithConcurrency(filesToProcess, SHUFERSAL_DOWNLOAD_CONCURRENCY, async (url) => {
      const { storeId, items } = await fetchAndParseShufersalFile(url);
      // Normalize: the PriceFull feed zero-pads StoreID ("001") but the
      // Stores feed publishes it unpadded ("1"); normalized so the same store
      // always counts once.
      const externalId = storeId ? String(parseInt(storeId, 10)) : null;
      console.log(`[shufersal]   ${items.length} items from ${url.split('/').pop()?.split('?')[0]} (store ${externalId ?? 'unknown'})`);
      return {
        externalId: externalId && !Number.isNaN(Number(externalId)) ? externalId : null,
        items: items.map((item) => ({ barcode: item.barcode, price: item.price, unitQty: item.unitQty, unitType: item.unitType, isSale: false })),
      };
    });
    fetched = groups.reduce((sum, g) => sum + g.items.length, 0);

    console.log(`[shufersal] Matching ${fetched} fetched items against products.barcode...`);
    const result = await matchAndInsertGrouped(chainId, groups);
    matched = result.matched;
    inserted = result.inserted;

  } catch (err) {
    errorText = err instanceof Error ? err.message : String(err);
    console.error(`[shufersal] ERROR: ${errorText}`);
  }

  const result: IngestResult = { chainId, fetched, matched, inserted, errorText };
  await writeIngestLog(result, startedAt);
  return result;
}

// ─── Phase 11/15/17 chains (Victory, Mahsanei Hashuk, Yohananof, Osher Ad,
// Keshet Teamim, Rami Levy) ─────────────────────────────────────────────
// All six publish the same Food Act XML schema as Shufersal (confirmed by
// probing each live feed — see CLAUDE.md "Phase 11"/"Phase 15"/"Phase 17"),
// so their parsers (scripts/parsers/*.ts) all reduce to one fetchAndParse():
// ParsedBranchFeed[] shape and share this single ingest wrapper instead of
// six near-duplicates of ingestShufersal(). Note: Yohananof, Osher Ad,
// Keshet Teamim, and Rami Levy all fetch over real FTP (not HTTPS, same
// Cerberus platform) — this works from the GitHub Actions daily workflow and
// from local runs, but outbound FTP is not reliably available from Vercel's
// serverless functions, so these four will likely fail (and log to
// ingest_log, without blocking the other chains) if ever triggered through
// the GET /api/prices/ingest cron route instead of `npm run ingest`.

// Exported (not just used internally by runIngestion()) so a single chain
// can be retried standalone — e.g. after a third-party feed's own transient
// outage, without re-running every other already-successful chain.
export async function ingestFromParser(chainId: string, fetchAndParse: () => Promise<ParsedBranchFeed[]>): Promise<IngestResult> {
  const startedAt = new Date().toISOString();
  let fetched = 0;
  let matched = 0;
  let inserted = 0;
  let errorText: string | null = null;

  try {
    console.log(`\n[${chainId}] Fetching feed (all branches)...`);
    const branchFeeds = await fetchAndParse();
    fetched = branchFeeds.reduce((sum, g) => sum + g.items.length, 0);
    console.log(`[${chainId}] Fetched ${fetched} items across ${branchFeeds.length} branches`);

    const groups: BranchGroup[] = branchFeeds.map((feed) => ({
      externalId: feed.externalId || null,
      items: feed.items.map((p) => ({ barcode: p.barcode, price: p.price, unitQty: p.unit_qty ?? 1, unitType: p.unit_type ?? 'unit', isSale: false })),
    }));

    console.log(`[${chainId}] Matching ${fetched} fetched items against products.barcode...`);
    const result = await matchAndInsertGrouped(chainId, groups);
    matched = result.matched;
    inserted = result.inserted;

  } catch (err) {
    errorText = err instanceof Error ? err.message : String(err);
    console.error(`[${chainId}] ERROR: ${errorText}`);
  }

  const result: IngestResult = { chainId, fetched, matched, inserted, errorText };
  await writeIngestLog(result, startedAt);
  return result;
}

// ─── Entry point ────────────────────────────────────────────────────────────

// Shared by scripts/run-ingest-cli.ts (`npm run ingest`) and by the GET
// /api/prices/ingest cron route (app/api/prices/ingest/route.ts).
export async function runIngestion(): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  // Defense in depth: each ingestX() already has its own internal try/catch
  // around fetch/match/insert, but this outer guard makes sure a completely
  // unanticipated throw (not just a network blip during logging, see
  // writeIngestLog's own comment above) still can't take the rest of the
  // chains down with it.
  const chainRunners: Array<[string, () => Promise<IngestResult>]> = [
    ['shufersal', ingestShufersal],
    ['rami_levy', () => ingestFromParser('rami_levy', fetchAndParseRamiLevy)],
    ['victory', () => ingestFromParser('victory', fetchAndParseVictory)],
    ['mahsanei_hashuk', () => ingestFromParser('mahsanei_hashuk', fetchAndParseMahsaneiHashuk)],
    ['yohananof', () => ingestFromParser('yohananof', fetchAndParseYohananof)],
    ['osher_ad', () => ingestFromParser('osher_ad', fetchAndParseOsherAd)],
    ['keshet_teamim', () => ingestFromParser('keshet_teamim', fetchAndParseKeshetTeamim)],
  ];
  for (const [chainId, run] of chainRunners) {
    try {
      results.push(await run());
    } catch (err) {
      console.error(`[${chainId}] UNEXPECTED ERROR outside its own try/catch, continuing to next chain:`, err instanceof Error ? err.message : err);
      results.push({ chainId, fetched: 0, matched: 0, inserted: 0, errorText: err instanceof Error ? err.message : String(err) });
    }
  }

  // Monthly price summary for tracked products only (migration 012).
  try {
    const rolled = await rollupMonthlyPrices();
    console.log(`\nMonthly rollup: ${rolled} tracked product x chain rows updated.`);
  } catch (err) {
    console.error('Monthly rollup FAILED (current prices are still written):', err instanceof Error ? err.message : err);
  }

  return results;
}
