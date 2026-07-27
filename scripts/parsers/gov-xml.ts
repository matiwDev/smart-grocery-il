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

export function parseGovXml(xml: string): GovFeedItem[] {
  const parser = new XMLParser();
  const parsed = parser.parse(xml);
  const rawItems = toArray(parsed?.Root?.Items?.Item);

  return rawItems
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
}

export function gunzipToText(buffer: Buffer): string {
  return gunzipSync(buffer).toString('utf8');
}
