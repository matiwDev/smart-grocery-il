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
import { fetchWithRetry } from '../supabase-rest';
import { parseGovXml, gunzipToText, GovFeedItem } from './gov-xml';

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
  return parseGovXml(gunzipToText(buffer));
}

// branchLimit caps how many branches' price files get downloaded per run —
// mirrors SHUFERSAL_STORE_LIMIT's role for the Shufersal feed (avoid pulling
// every branch on every ingest run).
export async function fetchLaibcatalogItems(chainId: string, branchLimit: number): Promise<GovFeedItem[]> {
  const files = await fetchFileList(chainId);
  const latestPerBranch = latestPriceFilePerBranch(files).slice(0, branchLimit);

  const allItems: GovFeedItem[] = [];
  for (const file of latestPerBranch) {
    allItems.push(...(await downloadAndParse(chainId, file.fileName)));
  }
  return allItems;
}
