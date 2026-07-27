export interface ParsedProduct {
  barcode: string;
  name_he: string;
  price: number;
  unit_qty?: number;
  unit_type?: string;
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
