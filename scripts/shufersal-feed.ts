/**
 * Shared Shufersal price-feed fetch + parse logic (Israel Food Act transparency
 * feed). Used by both scripts/ingest-prices.ts (price_history ingestion) and
 * scripts/seed-products-from-feed.ts (product catalog seeding), so the
 * fetch/gunzip/XML-parse mechanics live here once.
 *
 * The public listing page links to one gzipped PriceFull*.gz XML file per
 * branch (Azure Blob Storage, short-lived SAS-signed URLs, hundreds of files).
 */
import { gunzipSync } from 'zlib';
import { XMLParser } from 'fast-xml-parser';
import { fetchWithRetry } from './supabase-rest';

export const SHUFERSAL_LISTING_URL = 'https://prices.shufersal.co.il/FileObject/UpdateCategory?catID=2&storeId=0';

// Raw shape of a single <Item> in a PriceFull XML file, keeping ItemName
// alongside the price fields since product seeding needs the name too
// (fields confirmed against the live feed — no ItemSection/SubSection exists,
// contrary to earlier assumptions; category is inferred from ItemName instead).
export interface ShufersalItem {
  barcode: string;
  name: string;
  price: number;
  unitQty: number;
  unitType: string;
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export async function fetchShufersalFileLinks(): Promise<string[]> {
  const res = await fetchWithRetry(SHUFERSAL_LISTING_URL);
  if (!res.ok) throw new Error(`Shufersal listing fetch failed: HTTP ${res.status}`);
  const html = await res.text();
  const linkPattern = /href="(https:\/\/pricesprodpublic\.blob\.core\.windows\.net\/pricefull\/[^"]+)"/g;
  const links = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(html)) !== null) {
    links.add(match[1].replace(/&amp;/g, '&'));
  }
  return [...links];
}

export async function fetchAndParseShufersalFile(url: string): Promise<ShufersalItem[]> {
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`Shufersal file fetch failed: HTTP ${res.status}`);
  const gzBuffer = Buffer.from(await res.arrayBuffer());
  const xml = gunzipSync(gzBuffer).toString('utf8');

  const parser = new XMLParser();
  const parsed = parser.parse(xml);
  const rawItems = toArray(parsed?.Root?.Items?.Item);

  return rawItems
    .map((raw): ShufersalItem | null => {
      const barcode = String(raw.ItemCode ?? '').trim();
      const price = Number(raw.ItemPrice);
      const name = String(raw.ItemName ?? '').trim();
      if (!barcode || !name || !Number.isFinite(price)) return null;
      return {
        barcode,
        name,
        price,
        unitQty: Number(raw.Quantity) || 1,
        unitType: String(raw.UnitOfMeasure ?? raw.UnitQty ?? 'unit').trim(),
      };
    })
    .filter((item): item is ShufersalItem => item !== null);
}
