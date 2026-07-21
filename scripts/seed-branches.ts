/**
 * Seeds public.branches with real Shufersal store metadata so the Location
 * view has more than the 8 hand-seeded branches to filter/display.
 *
 * Uses the "Stores" category of the same Food Act transparency feed as
 * scripts/ingest-prices.ts / scripts/seed-products-from-feed.ts (catID=5,
 * see scripts/shufersal-feed.ts) — a single chain-wide gzipped XML file
 * shaped as Chain > SubChains > SubChain > Stores > Store, distinct from the
 * per-branch PriceFull files. Each <Store> has StoreID, StoreName, Address,
 * City, ZIPCode — no lat/lng, so those are left null per the task spec.
 *
 * Note on City: it is NOT a free-text city name — it's Israel's numeric
 * government settlement code (סמל יישוב), e.g. "5000". There is no name
 * field in this feed and no lookup table in this repo, so it's stored as-is
 * in city_he (as a string) rather than guessed at. This differs from the 8
 * hand-seeded branches, whose city_he is a real Hebrew city name — a future
 * pass could join against Israel's CBS settlement-code table to backfill
 * real names.
 *
 * branches has no unique constraint to on_conflict against (unlike
 * products.barcode), so this script dedupes client-side against existing
 * (name_he, address) pairs already in the table before inserting — safe to
 * re-run.
 *
 * Run with: npm run seed:branches
 */
import { gunzipSync } from 'zlib';
import { XMLParser } from 'fast-xml-parser';
import { requireEnv, restFetch, fetchWithRetry, chunk } from './supabase-rest';
import { fetchShufersalStoresFileUrl } from './shufersal-feed';

requireEnv();

interface RawStore {
  StoreID: number | string;
  StoreName?: string;
  Address?: string;
  City?: number | string;
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

async function fetchStores(): Promise<RawStore[]> {
  console.log('[seed-branches] Fetching Shufersal stores file listing...');
  const fileUrl = await fetchShufersalStoresFileUrl();
  console.log(`[seed-branches] Downloading ${fileUrl.split('/').pop()?.split('?')[0]}...`);
  const res = await fetchWithRetry(fileUrl);
  if (!res.ok) throw new Error(`Stores file fetch failed: HTTP ${res.status}`);
  const gz = Buffer.from(await res.arrayBuffer());
  const xml = gunzipSync(gz).toString('utf8');

  const parser = new XMLParser();
  const parsed = parser.parse(xml);
  const subChains = toArray(parsed?.Chain?.SubChains?.SubChain);
  if (subChains.length === 0) throw new Error('No SubChains found in Shufersal stores file');

  const stores: RawStore[] = [];
  for (const sc of subChains) {
    stores.push(...toArray(sc?.Stores?.Store));
  }
  return stores;
}

async function getExistingKeys(): Promise<Set<string>> {
  const res = await restFetch('branches?chain_id=eq.shufersal&select=name_he,address');
  if (!res.ok) throw new Error(`Failed to fetch existing branches: HTTP ${res.status} ${await res.text()}`);
  const rows = (await res.json()) as Array<{ name_he: string; address: string | null }>;
  return new Set(rows.map((r) => `${r.name_he}|${r.address ?? ''}`));
}

async function getBranchCount(): Promise<number> {
  const res = await restFetch('branches?select=id', { method: 'HEAD', headers: { Prefer: 'count=exact' } });
  if (!res.ok) throw new Error(`Failed to count branches: HTTP ${res.status}`);
  const range = res.headers.get('content-range');
  const total = range ? Number(range.split('/')[1]) : NaN;
  if (!Number.isFinite(total)) throw new Error(`Could not parse branch count from content-range: ${range}`);
  return total;
}

async function main() {
  const countBefore = await getBranchCount();
  console.log(`[seed-branches] Branches before: ${countBefore}`);

  const stores = await fetchStores();
  console.log(`[seed-branches] Fetched ${stores.length} stores from the feed`);

  const existingKeys = await getExistingKeys();
  const seenInBatch = new Set<string>();
  const rows: Array<{ chain_id: string; name_he: string; city_he: string; address: string | null; lat: null; lng: null; is_active: boolean }> = [];

  for (const s of stores) {
    const name_he = String(s.StoreName ?? '').trim();
    const address = s.Address ? String(s.Address).trim() : null;
    if (!name_he) continue;
    const key = `${name_he}|${address ?? ''}`;
    if (existingKeys.has(key) || seenInBatch.has(key)) continue;
    seenInBatch.add(key);
    rows.push({
      chain_id: 'shufersal',
      name_he,
      city_he: String(s.City ?? '').trim(),
      address,
      lat: null,
      lng: null,
      is_active: true,
    });
  }

  console.log(`[seed-branches] Inserting ${rows.length} new branches (${stores.length - rows.length} already present)...`);
  for (const batch of chunk(rows, 200)) {
    const res = await restFetch('branches', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      throw new Error(`Failed to insert branches batch: HTTP ${res.status} ${await res.text()}`);
    }
  }

  const countAfter = await getBranchCount();
  console.log(`\n[seed-branches] Branches before: ${countBefore}`);
  console.log(`[seed-branches] Branches after:  ${countAfter}`);
  console.log(`[seed-branches] New branches added: ${rows.length}`);
}

main().catch((err) => {
  console.error('[seed-branches] ERROR:', err instanceof Error ? err.message : err);
  process.exit(1);
});
