/**
 * Shared client for the Cerberus FTP Server price-feed platform at
 * url.retail.publishedprices.co.il — confirmed live (Phase 11 probe) for
 * Yohananof, Osher Ad, and Keshet Teamim. Real FTP protocol (port 21), login
 * with a chain-specific username and a BLANK password — this is the public,
 * documented access method for this platform (see
 * github.com/OpenIsraeliSupermarkets/israeli-supermarket-scarpers), not a
 * credential bypass.
 *
 * The root directory lists every historical snapshot still on the server
 * (many timestamped files per store per day), so this keeps only the newest
 * "Price*.gz" file per store.
 */
import * as ftp from 'basic-ftp';
import { Writable } from 'stream';
import { parseGovXml, gunzipToText, GovFeedItem } from './gov-xml';

const CERBERUS_HOST = 'url.retail.publishedprices.co.il';

// Matches e.g. "Price7290803800003-000-001-20260727-224000.gz" ->
// storeKey "7290803800003-000-001", stamp "20260727-224000".
const PRICE_FILE_PATTERN = /^Price([\d-]+)-(\d{8}-\d{6})\.gz$/;

function latestPriceFilePerStore(fileNames: string[]): string[] {
  const latest = new Map<string, { file: string; stamp: string }>();
  for (const name of fileNames) {
    const match = PRICE_FILE_PATTERN.exec(name);
    if (!match) continue;
    const [, storeKey, stamp] = match;
    const existing = latest.get(storeKey);
    if (!existing || stamp > existing.stamp) latest.set(storeKey, { file: name, stamp });
  }
  return [...latest.values()].map((v) => v.file);
}

// One result per branch (one file = one store on this platform). storeId
// prefers the XML root's own <StoreID> (confirmed identical to the filename's
// trailing segment against a live Yohananof file) and falls back to the
// filename if the XML is ever missing it — same raw, zero-padded convention
// scripts/seed-branches.ts's fetchCerberusBranches() already uses for
// external_id, so branch matching lines up without extra normalization.
export interface CerberusBranchFeed {
  storeId: string;
  items: GovFeedItem[];
}

// storeLimit caps how many stores' price files get downloaded per run,
// mirroring SHUFERSAL_STORE_LIMIT's role for the Shufersal feed. Pass
// Infinity to fetch every store.
export async function fetchCerberusItems(ftpUsername: string, storeLimit: number): Promise<CerberusBranchFeed[]> {
  const client = new ftp.Client(30000);
  const results: CerberusBranchFeed[] = [];
  try {
    await client.access({ host: CERBERUS_HOST, user: ftpUsername, password: '', secure: false });
    const listing = await client.list();
    const fileNames = listing.map((entry) => entry.name);
    const filesToFetch = latestPriceFilePerStore(fileNames).slice(0, storeLimit);

    for (const fileName of filesToFetch) {
      const chunks: Buffer[] = [];
      const sink = new Writable({
        write(chunk: Buffer, _encoding, callback) {
          chunks.push(chunk);
          callback();
        },
      });
      await client.downloadTo(sink, fileName);
      const buffer = Buffer.concat(chunks);
      const { storeId, items } = parseGovXml(gunzipToText(buffer));

      const match = PRICE_FILE_PATTERN.exec(fileName);
      const filenameStoreId = match ? match[1].split('-').pop() ?? null : null;
      results.push({ storeId: storeId ?? filenameStoreId ?? fileName, items });
    }
  } finally {
    client.close();
  }
  return results;
}
