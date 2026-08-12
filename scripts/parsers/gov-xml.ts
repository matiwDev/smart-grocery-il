/**
 * Shared parser for the Food Act (2014) government price-feed XML schema —
 * <Root><Items><Item>...</Item></Items></Root> with ItemCode/ItemName/
 * ItemPrice/Quantity/UnitOfMeasure fields. Every chain probed in Phase 11
 * (Victory, Mahsanei Hashuk via laibcatalog.co.il; Yohananof, Osher Ad,
 * Keshet Teamim via the Cerberus FTP platform) publishes the identical
 * schema to Shufersal (confirmed by inspecting real downloaded files from
 * each), so this factors out the gunzip+parse logic instead of repeating
 * scripts/shufersal-feed.ts's fetchAndParseShufersalFile() five more times.
 */
import { gunzipSync } from 'zlib';
import { XMLParser } from 'fast-xml-parser';

export interface GovFeedItem {
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

// Every file in this schema represents exactly ONE branch — the root carries
// ChainID/SubChainID/StoreID/BikoretNo alongside <Items> (confirmed live
// against Shufersal and the Cerberus-platform chains, see CLAUDE.md "Data
// architecture"). storeId is returned raw, exactly as published — different
// platforms zero-pad differently (e.g. Shufersal's Stores feed publishes
// unpadded IDs like "756" while its own PriceFull files publish the same
// store as zero-padded "001"), so callers normalize per their own chain's
// established branches.external_id convention rather than this shared parser
// guessing at one.
export interface GovFeedFile {
  storeId: string | null;
  items: GovFeedItem[];
}

export function parseGovXml(xml: string): GovFeedFile {
  const parser = new XMLParser();
  const parsed = parser.parse(xml);
  const storeIdRaw = parsed?.Root?.StoreID;
  const storeId = storeIdRaw != null && String(storeIdRaw).trim() !== '' ? String(storeIdRaw).trim() : null;
  const rawItems = toArray(parsed?.Root?.Items?.Item);

  const items = rawItems
    .map((raw): GovFeedItem | null => {
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
    .filter((item): item is GovFeedItem => item !== null);

  return { storeId, items };
}

export function gunzipToText(buffer: Buffer): string {
  return gunzipSync(buffer).toString('utf8');
}
