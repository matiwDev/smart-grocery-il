/**
 * Real price ingestion logic — fetches real price feeds published under
 * Israel's Food Act (2014) transparency requirement and loads them into
 * chain_prices + branch_price_overrides (migration 012). Talks to Supabase via plain REST (PostgREST) with the
 * service-role key rather than @supabase/supabase-js: the standalone-script
 * caller (scripts/run-ingest-cli.ts) runs on Node 20, and realtime-js (a
 * supabase-js dependency) requires a native WebSocket only available from
 * Node 22+, which crashes standalone scripts.
 *
 * This module only exports runIngestion() and has no process-level side
 * effects (no requireEnv() gate, no process.exit, no auto-run) — it's
 * imported by two different callers with different needs:
 *   - scripts/run-ingest-cli.ts, the `npm run ingest` CLI entry point
 *   - app/api/prices/ingest/route.ts's GET handler (Vercel/GitHub Actions
 *     cron target, Phase 6) — a process.exit() here would kill the whole
 *     serverless function, not just fail one request
 *
 * Phase 18 (branch-level pricing): every chain feed is a set of per-branch
 * files (one file = one physical store), not one flat catalog — each
 * fetchAndParse() now returns items grouped by the store that published
 * them (ParsedBranchFeed[] / an equivalent per-chain shape). Every
 * branch observation gets a real branch_id: resolveBranchId()
 * looks up (chain_id, external_id) in branches (as already seeded by
 * scripts/seed-branches.ts) and, if a store isn't there yet, creates a
 * placeholder branch row on the fly so no price is ever silently dropped.
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

const CHAIN_NAME_HE: Record<string, string> = {
  shufersal: 'שופרסל',
  rami_levy: 'רמי לוי',
  victory: 'ויקטורי',
  mahsanei_hashuk: 'מחסני השוק',
  yohananof: 'יוחננוף',
  osher_ad: 'אושר עד',
  keshet_teamim: 'קשת טעמים',
};

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
  overridesWritten: number;
  branchesResolved: number;
  branchesCreated: number;
  errorText: string | null;
}

// ─── Branch resolution (shared by every chain) ─────────────────────────────
// One physical store per feed file — resolves to the real branches row
// scripts/seed-branches.ts already seeded, keyed on (chain_id, external_id).
// If a store shows up in the price feed that seeding hasn't caught yet (e.g.
// a brand-new store, or a chain seed-branches.ts doesn't cover), it creates a
// minimal placeholder branch (no address/lat/lng) rather than dropping the
// price or leaving branch_id null — a later scripts/seed-branches.ts run can
// still enrich it since it upserts on the same (chain_id, external_id) key.

async function findBranchId(chainId: string, externalId: string): Promise<string | null> {
  const res = await restFetch(
    `branches?chain_id=eq.${encodeURIComponent(chainId)}&external_id=eq.${encodeURIComponent(externalId)}&select=id&limit=1`
  );
  if (!res.ok) throw new Error(`Branch lookup failed for ${chainId}/${externalId}: HTTP ${res.status} ${await res.text()}`);
  const rows = (await res.json()) as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

async function createPlaceholderBranch(chainId: string, externalId: string): Promise<string | null> {
  const res = await restFetch('branches', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      chain_id: chainId,
      external_id: externalId,
      name_he: `${CHAIN_NAME_HE[chainId] ?? chainId} - סניף ${externalId}`,
      city_he: null,
      address: null,
      lat: null,
      lng: null,
      is_active: true,
    }),
  });
  if (res.ok) {
    const [created] = (await res.json()) as Array<{ id: string }>;
    return created?.id ?? null;
  }
  // Likely a concurrent insert raced us on the (chain_id, external_id) unique
  // index (007_branches_external_id.sql) — re-fetch instead of failing.
  const text = await res.text();
  if (text.includes('duplicate key') || res.status === 409) {
    return findBranchId(chainId, externalId);
  }
  throw new Error(`Failed to create placeholder branch ${chainId}/${externalId}: HTTP ${res.status} ${text}`);
}

async function resolveOrCreateBranchId(
  chainId: string,
  externalId: string,
  cache: Map<string, string>,
  stats: { resolved: number; created: number }
): Promise<string | null> {
  const key = `${chainId}:${externalId}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const existing = await findBranchId(chainId, externalId);
  if (existing) {
    cache.set(key, existing);
    stats.resolved++;
    return existing;
  }

  const created = await createPlaceholderBranch(chainId, externalId);
  if (created) {
    cache.set(key, created);
    stats.created++;
  }
  return created;
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

// ─── Price model (migration 012) ────────────────────────────────────────────
// price_history was dropped (710 MB — over the free tier). One row per
// product x branch would be ~5-10M rows, so each chain's feed is collapsed to:
//   chain_prices            one row per (product, chain) = the price MOST of
//                           the chain's branches charge (mode; ties → lower)
//   branch_price_overrides  one row per (product, branch) only where that
//                           branch differs from the mode
// History is kept only as monthly summaries for tracked products
// (product_price_monthly, see rollupMonthlyPrices at the end of the run).

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

interface OverrideRow {
  product_id: string;
  branch_id: string;
  chain_id: string;
  price: number;
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

// Overrides for the branches processed in this run that weren't re-written
// (captured_at older than the run start) are stale: that branch now charges
// the chain price again, or no longer carries the product. Scoped to the
// branches actually fetched, so a partial feed (e.g. some FTP files failed)
// never wipes overrides of branches this run didn't see.
async function deleteStaleOverrides(chainId: string, branchIds: string[], runStartedAt: string): Promise<void> {
  for (const batch of chunk(branchIds, 100)) {
    const res = await restFetch(
      `branch_price_overrides?chain_id=eq.${encodeURIComponent(chainId)}&branch_id=in.(${batch.join(',')})&captured_at=lt.${encodeURIComponent(runStartedAt)}`,
      { method: 'DELETE', headers: { Prefer: 'return=minimal' } }
    );
    if (!res.ok) {
      console.warn(`  (failed to delete stale overrides for ${chainId}: HTTP ${res.status} ${await res.text()})`);
    }
  }
}

// Pure: collapses per-branch observations into chain rows + override rows.
export function collapseToChainPrices(
  chainId: string,
  observations: Array<{ productId: string; branchId: string | null; item: FeedItem }>,
  now: string
): { chainRows: ChainPriceRow[]; overrides: OverrideRow[] } {
  // productId -> branchKey -> observation (last one wins for duplicate lines
  // in the same branch file). Feeds with no store id use a single '_' key.
  const byProduct = new Map<string, Map<string, { branchId: string | null; item: FeedItem }>>();
  for (const obs of observations) {
    if (!Number.isFinite(obs.item.price) || obs.item.price <= 0) continue;
    let perBranch = byProduct.get(obs.productId);
    if (!perBranch) byProduct.set(obs.productId, (perBranch = new Map()));
    perBranch.set(obs.branchId ?? '_', { branchId: obs.branchId, item: obs.item });
  }

  const chainRows: ChainPriceRow[] = [];
  const overrides: OverrideRow[] = [];

  for (const [productId, perBranch] of byProduct) {
    const entries = [...perBranch.values()];
    const counts = new Map<number, number>();
    let min = Infinity;
    let max = -Infinity;
    for (const { item } of entries) {
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
    const sample = entries.find((e) => Math.round(e.item.price * 100) / 100 === mode)!.item;
    chainRows.push({
      product_id: productId,
      chain_id: chainId,
      price: mode,
      min_price: min,
      max_price: max,
      branch_count: entries.length,
      unit_qty: sample.unitQty,
      unit_type: sample.unitType,
      is_sale: sample.isSale,
      captured_at: now,
    });

    for (const { branchId, item } of entries) {
      const p = Math.round(item.price * 100) / 100;
      if (!branchId || p === mode) continue;
      overrides.push({ product_id: productId, branch_id: branchId, chain_id: chainId, price: p, is_sale: item.isSale, captured_at: now });
    }
  }

  return { chainRows, overrides };
}

// Shared by every chain: flattens barcode matching across all of a chain's
// branch groups (one batched lookup instead of one per branch), resolves/
// creates a branch per group, then writes chain_prices + overrides.
async function matchAndInsertGrouped(
  chainId: string,
  groups: BranchGroup[]
): Promise<{ matched: number; inserted: number; overridesWritten: number; branchesResolved: number; branchesCreated: number }> {
  const barcodeToProductId = await buildBarcodeToProductId(groups.flatMap((g) => g.items));
  const branchCache = new Map<string, string>();
  const branchStats = { resolved: 0, created: 0 };
  const runStartedAt = new Date().toISOString();
  const observations: Array<{ productId: string; branchId: string | null; item: FeedItem }> = [];

  for (const group of groups) {
    const branchId = group.externalId
      ? await resolveOrCreateBranchId(chainId, group.externalId, branchCache, branchStats)
      : null;

    for (const item of group.items) {
      const productId = barcodeToProductId.get(item.barcode);
      if (!productId) continue;
      observations.push({ productId, branchId, item });
    }
  }

  const { chainRows, overrides } = collapseToChainPrices(chainId, observations, runStartedAt);
  console.log(
    `[${chainId}] ${observations.length} matched observations → ${chainRows.length} chain prices + ${overrides.length} branch overrides`
  );

  const inserted = await upsertRows('chain_prices', 'product_id,chain_id', chainRows);
  const overridesWritten = await upsertRows('branch_price_overrides', 'product_id,branch_id', overrides);
  await deleteStaleOverrides(chainId, [...new Set(branchCache.values())], runStartedAt);

  return {
    matched: observations.length,
    inserted,
    overridesWritten,
    branchesResolved: branchStats.resolved,
    branchesCreated: branchStats.created,
  };
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
        overrides_written: result.overridesWritten,
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
  let overridesWritten = 0;
  let branchesResolved = 0;
  let branchesCreated = 0;
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
      // Stores feed (catID=5, what scripts/seed-branches.ts seeds
      // branches.external_id from) publishes it unpadded ("1") — see
      // scripts/shufersal-feed.ts's ShufersalBranchFeed doc comment.
      const externalId = storeId ? String(parseInt(storeId, 10)) : null;
      console.log(`[shufersal]   ${items.length} items from ${url.split('/').pop()?.split('?')[0]} (store ${externalId ?? 'unknown'})`);
      return {
        externalId: externalId && !Number.isNaN(Number(externalId)) ? externalId : null,
        items: items.map((item) => ({ barcode: item.barcode, price: item.price, unitQty: item.unitQty, unitType: item.unitType, isSale: false })),
      };
    });
    fetched = groups.reduce((sum, g) => sum + g.items.length, 0);

    console.log(`[shufersal] Matching ${fetched} fetched items against products.barcode, resolving branches...`);
    const result = await matchAndInsertGrouped(chainId, groups);
    matched = result.matched;
    inserted = result.inserted;
    overridesWritten = result.overridesWritten;
    branchesResolved = result.branchesResolved;
    branchesCreated = result.branchesCreated;

  } catch (err) {
    errorText = err instanceof Error ? err.message : String(err);
    console.error(`[shufersal] ERROR: ${errorText}`);
  }

  const result: IngestResult = { chainId, fetched, matched, inserted, overridesWritten, branchesResolved, branchesCreated, errorText };
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
  let overridesWritten = 0;
  let branchesResolved = 0;
  let branchesCreated = 0;
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

    console.log(`[${chainId}] Matching ${fetched} fetched items against products.barcode, resolving branches...`);
    const result = await matchAndInsertGrouped(chainId, groups);
    matched = result.matched;
    inserted = result.inserted;
    overridesWritten = result.overridesWritten;
    branchesResolved = result.branchesResolved;
    branchesCreated = result.branchesCreated;

  } catch (err) {
    errorText = err instanceof Error ? err.message : String(err);
    console.error(`[${chainId}] ERROR: ${errorText}`);
  }

  const result: IngestResult = { chainId, fetched, matched, inserted, overridesWritten, branchesResolved, branchesCreated, errorText };
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
      results.push({ chainId, fetched: 0, matched: 0, inserted: 0, overridesWritten: 0, branchesResolved: 0, branchesCreated: 0, errorText: err instanceof Error ? err.message : String(err) });
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
