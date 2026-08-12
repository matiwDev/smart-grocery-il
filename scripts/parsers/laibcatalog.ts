/**
 * Shared client for the laibcatalog.co.il ("ניביט"/Nibit) price-feed platform
 * — confirmed live (Phase 11 probe) as the replacement for the old, now
 * DNS-dead matrixcatalog.co.il domain. Plain HTTPS JSON API, no auth. Covers
 * Victory and Mahsanei Hashuk (each identified by their own EDI/chain-ID
 * value, passed in by the caller).
 *
 * API shape (reverse-engineered from github.com/OpenIsraeliSupermarkets/
 * israeli-supermarket-scarpers, verified against the live site):
 *   GET /webapi/api/getbranches?edi={chainId}        -> [{number, name}, ...]
 *   GET /webapi/api/getfiles?edi={chainId}            -> [{fileName, fileType, fileDate, ...}, ...]
 *   GET /webapi/{chainId}/{fileName}                  -> gzipped XML (same schema as Shufersal)
 * getfiles returns every branch's files in one response (branchNumber field
 * per entry), not just the requested branch — so one call is enough per chain.
 */
import { fetchWithRetry, mapWithConcurrency } from '../supabase-rest';
import { parseGovXml, gunzipToText, GovFeedItem } from './gov-xml';

// Plain HTTPS, no shared connection state — safe to download several
// branches' files at once instead of one at a time (Phase 18 removed the
// old branch-count cap, so a full chain can be 70+ files).
const DOWNLOAD_CONCURRENCY = 8;

const LAIBCATALOG_BASE = 'https://laibcatalog.co.il';

interface LaibcatalogFileEntry {
  branchNumber: number;
  fileName: string;
  fileType: 'price' | 'promo' | string;
  fileDate: string;
}

async function fetchFileList(chainId: string): Promise<LaibcatalogFileEntry[]> {
  const res = await fetchWithRetry(`${LAIBCATALOG_BASE}/webapi/api/getfiles?edi=${chainId}`);
  if (!res.ok) throw new Error(`laibcatalog getfiles failed for ${chainId}: HTTP ${res.status}`);
  return (await res.json()) as LaibcatalogFileEntry[];
}

// Keep only the newest "price" file per branch — getfiles returns every
// historical snapshot still on the server, not just the latest.
function latestPriceFilePerBranch(files: LaibcatalogFileEntry[]): LaibcatalogFileEntry[] {
  const latest = new Map<number, LaibcatalogFileEntry>();
  for (const file of files) {
    if (file.fileType !== 'price') continue;
    const existing = latest.get(file.branchNumber);
    if (!existing || file.fileDate > existing.fileDate) latest.set(file.branchNumber, file);
  }
  return [...latest.values()];
}

async function downloadAndParse(chainId: string, fileName: string): Promise<GovFeedItem[]> {
  const res = await fetchWithRetry(`${LAIBCATALOG_BASE}/webapi/${chainId}/${fileName}`);
  if (!res.ok) throw new Error(`laibcatalog file download failed for ${fileName}: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  // laibcatalog's getfiles response already carries branchNumber per file
  // (see fetchLaibcatalogItems below), so the XML root's own <StoreID> isn't
  // needed here — only the items.
  return parseGovXml(gunzipToText(buffer)).items;
}

// One result per branch. branchNumber comes straight from getfiles'
// `branchNumber` field (a plain JSON number, e.g. 60) — matches
// scripts/seed-branches.ts's fetchLaibcatalogBranches(), which keys
// branches.external_id off the same platform's getbranches `number` field,
// so no padding/normalization is needed to match them up.
export interface LaibcatalogBranchFeed {
  branchNumber: string;
  items: GovFeedItem[];
}

// branchLimit caps how many branches' price files get downloaded per run —
// mirrors SHUFERSAL_STORE_LIMIT's role for the Shufersal feed (avoid pulling
// every branch on every ingest run). Pass Infinity to fetch every branch.
export async function fetchLaibcatalogItems(chainId: string, branchLimit: number): Promise<LaibcatalogBranchFeed[]> {
  const files = await fetchFileList(chainId);
  const latestPerBranch = latestPriceFilePerBranch(files).slice(0, branchLimit);

  return mapWithConcurrency(latestPerBranch, DOWNLOAD_CONCURRENCY, async (file) => {
    const items = await downloadAndParse(chainId, file.fileName);
    return { branchNumber: String(file.branchNumber), items };
  });
}
