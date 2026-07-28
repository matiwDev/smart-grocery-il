/**
 * Seeds public.branches from every chain that has a working ingest feed
 * (Phase 11/14) — Shufersal (dedicated Stores feed: StoreID/StoreName/
 * Address/City), Victory + Mahsanei Hashuk (laibcatalog.co.il
 * `getbranches?edi=` endpoint: branch `number` + `name`, no address), and
 * Yohananof + Osher Ad + Keshet Teamim (Cerberus FTP platform — confirmed
 * live this session that it publishes NO store-metadata feed at all, only
 * Price*.gz and Promo*.gz files whose XML root has ChainID/SubChainID/
 * StoreID/BikoretNo and nothing else; the StoreID embedded in the filename is the
 * only identifier available, so those branches get a synthesized
 * "<chain> - סניף <StoreID>" name instead of a real one). Rami Levy has no
 * working feed at all (see CLAUDE.md "Price ingestion pipeline") and is
 * skipped.
 *
 * Dedup is via a (chain_id, external_id) unique index (migration
 * 007_branches_external_id.sql) instead of the previous Shufersal-only
 * client-side (name_he, address) check — external_id is a stable per-chain
 * identifier that exists even for the Cerberus chains, which have no real
 * name/address to key off of.
 *
 * None of these feeds expose lat/lng (confirmed by inspecting a live
 * Shufersal Stores file this session — no GPSLat/GPSLng/Latitude/Longitude
 * fields present).
 *
 * Run with: npm run seed:branches
 */
import { gunzipSync } from 'zlib';
import { XMLParser } from 'fast-xml-parser';
import * as ftp from 'basic-ftp';
import { requireEnv, restFetch, fetchWithRetry, chunk } from './supabase-rest';
import { fetchShufersalStoresFileUrl } from './shufersal-feed';

requireEnv();

interface BranchRow {
  chain_id: string;
  external_id: string;
  name_he: string;
  city_he: string | null;
  address: string | null;
  lat: null;
  lng: null;
  is_active: boolean;
}

function toArray<T>(value: T | T[] | undefined): T[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

// ---- Shufersal: catID=5 "Stores" feed ----
async function fetchShufersalBranches(): Promise<BranchRow[]> {
  const fileUrl = await fetchShufersalStoresFileUrl();
  const res = await fetchWithRetry(fileUrl);
  if (!res.ok) throw new Error(`Shufersal stores file fetch failed: HTTP ${res.status}`);
  const xml = gunzipSync(Buffer.from(await res.arrayBuffer())).toString('utf8');
  const parsed = new XMLParser().parse(xml);
  const subChains = toArray(parsed?.Chain?.SubChains?.SubChain);

  const rows: BranchRow[] = [];
  for (const sc of subChains) {
    for (const s of toArray(sc?.Stores?.Store)) {
      const externalId = String(s.StoreID ?? '').trim();
      const name_he = String(s.StoreName ?? '').trim();
      if (!externalId || !name_he) continue;
      rows.push({
        chain_id: 'shufersal',
        external_id: externalId,
        name_he,
        city_he: s.City != null ? String(s.City).trim() : null,
        address: s.Address ? String(s.Address).trim() : null,
        lat: null,
        lng: null,
        is_active: true,
      });
    }
  }
  return rows;
}

// ---- laibcatalog.co.il: Victory, Mahsanei Hashuk ----
interface LaibcatalogBranch {
  number: number;
  name: string;
}

async function fetchLaibcatalogBranches(chainId: string, edi: string): Promise<BranchRow[]> {
  const res = await fetchWithRetry(`https://laibcatalog.co.il/webapi/api/getbranches?edi=${edi}`);
  if (!res.ok) throw new Error(`laibcatalog getbranches failed for ${chainId}: HTTP ${res.status}`);
  const branches = (await res.json()) as LaibcatalogBranch[];
  return branches
    .filter((b) => b.name && b.name.trim())
    .map((b) => ({
      chain_id: chainId,
      external_id: String(b.number),
      name_he: b.name.trim(),
      city_he: null,
      address: null,
      lat: null,
      lng: null,
      is_active: true,
    }));
}

// ---- Cerberus FTP: Yohananof, Osher Ad, Keshet Teamim ----
// No store-metadata feed on this platform (confirmed live this session) —
// only the StoreID segment of each Price*.gz filename is available.
const CERBERUS_CHAIN_NAME_HE: Record<string, string> = {
  yohananof: 'יוחננוף',
  osher_ad: 'אושר עד',
  keshet_teamim: 'קשת טעמים',
};

const PRICE_FILE_PATTERN = /^Price([\d-]+)-(\d{8}-\d{6})\.gz$/;

async function fetchCerberusBranches(chainId: string, ftpUsername: string): Promise<BranchRow[]> {
  const client = new ftp.Client(30000);
  try {
    await client.access({ host: 'url.retail.publishedprices.co.il', user: ftpUsername, password: '', secure: false });
    const listing = await client.list();
    const storeIds = new Set<string>();
    for (const entry of listing) {
      const match = PRICE_FILE_PATTERN.exec(entry.name);
      if (!match) continue;
      const parts = match[1].split('-');
      const storeId = parts[parts.length - 1];
      if (storeId) storeIds.add(storeId);
    }
    const chainNameHe = CERBERUS_CHAIN_NAME_HE[chainId] ?? chainId;
    return [...storeIds].map((storeId) => ({
      chain_id: chainId,
      external_id: storeId,
      name_he: `${chainNameHe} - סניף ${storeId}`,
      city_he: null,
      address: null,
      lat: null,
      lng: null,
      is_active: true,
    }));
  } finally {
    client.close();
  }
}

async function getBranchCount(): Promise<number> {
  const res = await restFetch('branches?select=id', { method: 'HEAD', headers: { Prefer: 'count=exact' } });
  if (!res.ok) throw new Error(`Failed to count branches: HTTP ${res.status}`);
  const range = res.headers.get('content-range');
  const total = range ? Number(range.split('/')[1]) : NaN;
  if (!Number.isFinite(total)) throw new Error(`Could not parse branch count from content-range: ${range}`);
  return total;
}

async function getChainCount(chainId: string): Promise<number> {
  const res = await restFetch(`branches?chain_id=eq.${chainId}&select=id`, {
    method: 'HEAD',
    headers: { Prefer: 'count=exact' },
  });
  if (!res.ok) throw new Error(`Failed to count ${chainId} branches: HTTP ${res.status}`);
  const range = res.headers.get('content-range');
  return range ? Number(range.split('/')[1]) : 0;
}

async function upsertBranches(chainId: string, rows: BranchRow[]): Promise<void> {
  if (rows.length === 0) return;
  for (const batch of chunk(rows, 200)) {
    const res = await restFetch('branches?on_conflict=chain_id,external_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      throw new Error(`Failed to upsert ${chainId} branches: HTTP ${res.status} ${await res.text()}`);
    }
  }
}

interface ChainSpec {
  id: string;
  label: string;
  fetch: () => Promise<BranchRow[]>;
}

const CHAINS: ChainSpec[] = [
  { id: 'shufersal', label: 'Shufersal', fetch: fetchShufersalBranches },
  { id: 'victory', label: 'Victory', fetch: () => fetchLaibcatalogBranches('victory', '7290696200003') },
  { id: 'mahsanei_hashuk', label: 'Mahsanei Hashuk', fetch: () => fetchLaibcatalogBranches('mahsanei_hashuk', '7290661400001') },
  { id: 'yohananof', label: 'Yohananof', fetch: () => fetchCerberusBranches('yohananof', 'yohananof') },
  { id: 'osher_ad', label: 'Osher Ad', fetch: () => fetchCerberusBranches('osher_ad', 'osherad') },
  { id: 'keshet_teamim', label: 'Keshet Teamim', fetch: () => fetchCerberusBranches('keshet_teamim', 'Keshet') },
];

async function main() {
  const countBefore = await getBranchCount();
  console.log(`[seed-branches] Total branches before: ${countBefore}`);

  const summary: Array<{ chain: string; before: number; after: number; foundInFeed: number; withCoords: number }> = [];

  for (const chain of CHAINS) {
    const before = await getChainCount(chain.id);
    console.log(`\n[seed-branches] Fetching ${chain.label}...`);
    let rows: BranchRow[] = [];
    try {
      rows = await chain.fetch();
    } catch (err) {
      console.error(`[seed-branches] ${chain.label} fetch failed:`, err instanceof Error ? err.message : err);
      summary.push({ chain: chain.id, before, after: before, foundInFeed: 0, withCoords: 0 });
      continue;
    }
    console.log(`[seed-branches] ${chain.label}: ${rows.length} branches found in feed, upserting...`);
    try {
      await upsertBranches(chain.id, rows);
    } catch (err) {
      console.error(`[seed-branches] ${chain.label} upsert failed:`, err instanceof Error ? err.message : err);
      summary.push({ chain: chain.id, before, after: before, foundInFeed: rows.length, withCoords: 0 });
      continue;
    }
    const after = await getChainCount(chain.id);
    const withCoords = rows.filter((r) => r.lat != null && r.lng != null).length;
    summary.push({ chain: chain.id, before, after, foundInFeed: rows.length, withCoords });
  }

  const countAfter = await getBranchCount();
  console.log(`\n[seed-branches] ==== Summary ====`);
  for (const s of summary) {
    console.log(`  ${s.chain}: ${s.before} -> ${s.after} branches (${s.foundInFeed} in feed, ${s.withCoords} with lat/lng)`);
  }
  console.log(`[seed-branches] Total branches: ${countBefore} -> ${countAfter}`);
}

main().catch((err) => {
  console.error('[seed-branches] ERROR:', err instanceof Error ? err.message : err);
  process.exit(1);
});
