export interface ParsedProduct {
  barcode: string;
  name_he: string;
  price: number;
  unit_qty?: number;
  unit_type?: string;
}

// One entry per branch — every chain parser now fetches per-branch files
// (see scripts/parsers/cerberus.ts / laibcatalog.ts), so fetchAndParse()
// returns the items already grouped by which physical store published them
// instead of one flattened array. externalId matches the chain's own
// branches.external_id convention (see scripts/seed-branches.ts) so
// scripts/ingest-prices.ts can resolve/create the right branch per group.
export interface ParsedBranchFeed {
  externalId: string;
  items: ParsedProduct[];
}

export interface GovFeedItemLike {
  barcode: string;
  name: string;
  price: number;
  unitQty: number;
  unitType: string;
}

export function toParsedProducts(items: GovFeedItemLike[]): ParsedProduct[] {
  return items.map((item) => ({
    barcode: item.barcode,
    name_he: item.name,
    price: item.price,
    unit_qty: item.unitQty,
    unit_type: item.unitType,
  }));
}
