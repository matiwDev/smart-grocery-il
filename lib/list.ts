/**
 * Shopping list model (Plan v2, phase 2): list items, household edits to
 * catalog products, estimated prices and trip estimates. Prices are always
 * ESTIMATES: one price per product per chain from the nightly feed
 * (active_chain_prices), unless the household typed its own price.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeCategory } from '@/lib/categories';

export interface ChainPrice {
  chain_id: string;
  price: number;
  is_sale?: boolean;
  unit_qty?: number | null;
  unit_type?: string | null;
  captured_at?: string;
}

export interface ChainMeta {
  id: string;
  name_he: string;
  name_en: string;
  color_hex: string;
  // 'in_development' = feed integration not finished: never shown or priced.
  status?: 'active' | 'in_development';
}

export interface BasketItem {
  /** Stable row key: product id for catalog items, `free:<row id>` for free text. */
  id: string;
  dbId?: string;
  /** Catalog product, or null for the household's own items. */
  productId: string | null;
  /** The household's own product ("My products"), or null. */
  customProductId: string | null;
  /** Catalog values (or the free-text item's own). Household edits live in ProductOverride. */
  name_he: string;
  name_en: string | null;
  category: string | null;
  barcode: string | null;
  prices: Record<string, ChainPrice>;
  /** Cheapest active chain's price, or null when no chain carries it. */
  min_price: number | null;
  quantity: number;
  checked: boolean;
  /** Own price/photo of a household product (custom_products) or older free-text row. */
  customPrice: number | null;
  imageUrl: string | null;
}

/** A household's edits to a catalog product (table product_overrides). */
export interface ProductOverride {
  product_id: string;
  name: string | null;
  category: string | null;
  price: number | null;
  image_url: string | null;
}

export type OverrideMap = Record<string, ProductOverride>;

/** A household's own product ("My products", table custom_products). */
export interface CustomProduct {
  id: string;
  name: string;
  category: string | null;
  price: number | null;
  image_url: string | null;
}

const CHEAPER_MIN_DIFF = 0.05; // ₪

/**
 * When another active chain sells this item for less than the user's chain,
 * that chain and price (for the small "cheaper at …" hint). Null when the
 * household set its own price, or the user's chain doesn't carry the item.
 */
export function cheaperElsewhere(item: BasketItem, overrides: OverrideMap, homeChainId: string | null) {
  if (!homeChainId || effective(item, overrides).myPrice != null) return null;
  const home = item.prices[homeChainId]?.price;
  if (home == null) return null;
  const best = Object.values(item.prices)
    .filter((p) => p.chain_id !== homeChainId)
    .sort((a, b) => a.price - b.price)[0];
  return best && best.price < home - CHEAPER_MIN_DIFF ? { chainId: best.chain_id, price: Number(best.price) } : null;
}

/** What the list shows for an item: household edits applied over catalog values. */
export function effective(item: BasketItem, overrides: OverrideMap) {
  const o = item.productId ? overrides[item.productId] : undefined;
  return {
    name: o?.name || item.name_he,
    category: normalizeCategory(o?.category || item.category),
    myPrice: o?.price ?? item.customPrice ?? null,
    image: o?.image_url || item.imageUrl || null,
    edited: !!o,
  };
}

export type PriceSource = 'custom' | 'chain' | 'cheapest' | 'none';

/** Estimated unit price of an item, at a chain or (chainId null) anywhere. */
export function unitPrice(item: BasketItem, overrides: OverrideMap, chainId: string | null): { price: number | null; source: PriceSource } {
  const { myPrice } = effective(item, overrides);
  if (myPrice != null) return { price: Number(myPrice), source: 'custom' };
  if (chainId) {
    const p = item.prices[chainId]?.price;
    return p != null ? { price: Number(p), source: 'chain' } : { price: null, source: 'none' };
  }
  return item.min_price != null ? { price: Number(item.min_price), source: 'cheapest' } : { price: null, source: 'none' };
}

export function estimate(items: BasketItem[], overrides: OverrideMap, chainId: string | null) {
  let total = 0;
  let priced = 0;
  for (const item of items) {
    const { price } = unitPrice(item, overrides, chainId);
    if (price != null) {
      total += price * item.quantity;
      priced++;
    }
  }
  return { total: Math.round(total * 100) / 100, priced, count: items.length };
}

/** Row shape returned by GET /api/baskets/{id}/items. */
export interface BasketItemRow {
  db_id: string;
  product_id: string | null;
  custom_product_id: string | null;
  quantity_value: number;
  checked: boolean;
  name_he: string;
  name_en: string | null;
  category: string | null;
  barcode: string | null;
  custom_price: number | null;
  image_url: string | null;
  prices: ChainPrice[];
}

export function rowToBasketItem(row: BasketItemRow): BasketItem {
  const prices: Record<string, ChainPrice> = {};
  for (const p of row.prices) prices[p.chain_id] = { ...p, price: Number(p.price) };
  const values = Object.values(prices).map((p) => p.price);
  return {
    id: row.product_id ?? (row.custom_product_id ? `custom:${row.custom_product_id}` : `free:${row.db_id}`),
    dbId: row.db_id,
    productId: row.product_id,
    customProductId: row.custom_product_id ?? null,
    name_he: row.name_he,
    name_en: row.name_en,
    category: row.category,
    barcode: row.barcode,
    prices,
    min_price: values.length > 0 ? Math.min(...values) : null,
    quantity: Number(row.quantity_value ?? 1),
    checked: !!row.checked,
    customPrice: row.custom_price != null ? Number(row.custom_price) : null,
    imageUrl: row.image_url,
  };
}

/** basket_items columns to copy an item into another basket (saved lists). */
export function itemToRow(item: BasketItem, basketId: string) {
  return {
    basket_id: basketId,
    product_id: item.productId,
    custom_product_id: item.customProductId,
    product_name: item.name_he,
    quantity_value: item.quantity,
    category: item.productId ? null : item.category,
    custom_price: item.productId ? null : item.customPrice,
    image_url: item.productId ? null : item.imageUrl,
    checked: false,
  };
}

export async function loadOverrides(supabase: SupabaseClient, householdId: string): Promise<OverrideMap> {
  const { data } = await supabase
    .from('product_overrides')
    .select('product_id, name, category, price, image_url')
    .eq('household_id', householdId);
  const map: OverrideMap = {};
  for (const row of data ?? []) map[row.product_id] = { ...row, price: row.price != null ? Number(row.price) : null };
  return map;
}

/**
 * Shrinks a photo to at most 800px on its long side (JPEG) and uploads it to
 * the item-photos bucket under the user's own folder. Returns its public URL.
 */
export async function uploadItemPhoto(supabase: SupabaseClient, userId: string, file: File): Promise<string> {
  const blob = await downscale(file, 800);
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from('item-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return supabase.storage.from('item-photos').getPublicUrl(path).data.publicUrl;
}

async function downscale(file: File, maxSide: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process the photo'))), 'image/jpeg', 0.82)
  );
}
