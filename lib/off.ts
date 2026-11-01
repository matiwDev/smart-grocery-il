/**
 * Open Food Facts → our product_info row (Plan v2, phase 5). Pure functions,
 * shared by the API route and the tests. OFF data is ODbL: the product sheet
 * shows "Open Food Facts" as the source.
 */
import { Grade, Per100, isSpecialCategory, nutriScore, redFlags } from '@/lib/health';

export const OFF_USER_AGENT = 'SmartGroceryIL/0.5 (household grocery planner; https://smart-grocery-il.vercel.app)';
export const OFF_FIELDS = [
  'code', 'product_name', 'product_name_he', 'image_front_small_url', 'nutriscore_grade', 'nutriments',
  'categories_tags', 'additives_tags', 'quantity', 'nutrition_data_per',
].join(',');

/** Barcodes OFF can know: EAN-13 / EAN-8 / UPC-A. Store-internal codes never are. */
export function isRetailBarcode(barcode: string | null | undefined): barcode is string {
  return !!barcode && /^(\d{8}|\d{12,13})$/.test(barcode);
}

export interface ProductInfoRow {
  product_id: string;
  status: 'found' | 'not_found';
  fetched_at: string;
  off_name: string | null;
  image_url: string | null;
  is_beverage: boolean;
  per100: Per100 | null;
  nutriscore: Grade | null;
  nutriscore_source: 'off' | 'calc' | null;
  red_flags: string[];
}

export function notFoundRow(productId: string): ProductInfoRow {
  return {
    product_id: productId, status: 'not_found', fetched_at: new Date().toISOString(), off_name: null, image_url: null,
    is_beverage: false, per100: null, nutriscore: null, nutriscore_source: null, red_flags: [],
  };
}

/** Days before a cached answer is looked up again. */
export const RECHECK_DAYS = { found: 180, not_found: 45 } as const;

export function isStale(row: Pick<ProductInfoRow, 'status' | 'fetched_at'>, now = Date.now()): boolean {
  const ageDays = (now - new Date(row.fetched_at).getTime()) / 86_400_000;
  return ageDays > RECHECK_DAYS[row.status];
}

// Intense sweeteners (E950–E969): Nutri-Score 2023 adds 4 points to a drink with any.
const SWEETENER = /^en:e9(5\d|6\d)[a-z]*$/;

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined;
}

function isLiquidQuantity(quantity: unknown): boolean {
  return typeof quantity === 'string' && /\d\s*(ml|cl|dl|l|ליטר|מ"ל|מ״ל|מל)\b/i.test(quantity);
}

/**
 * Our row from an OFF product (the `product` object of /api/v2/product/<code>).
 * `ourCategory` is the aisle we already know (drinks → beverage when OFF has no
 * categories).
 */
export function fromOffProduct(productId: string, p: Record<string, unknown>, ourCategory: string | null): ProductInfoRow {
  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  const cats = Array.isArray(p.categories_tags) ? (p.categories_tags as string[]) : [];
  const additives = Array.isArray(p.additives_tags) ? (p.additives_tags as string[]) : [];
  // Values are per 100 g unless OFF says the label was per serving and gave no _100g.
  const per100: Per100 = {};
  const kcal = num(n['energy-kcal_100g']) ?? (num(n['energy_100g']) != null ? num(n['energy_100g'])! / 4.184 : undefined);
  if (kcal != null) per100.kcal = Math.round(kcal * 10) / 10;
  const set = (key: keyof Per100, v: number | undefined, scale = 1) => {
    if (v != null) (per100[key] as number) = Math.round(v * scale * 100) / 100;
  };
  set('sugars', num(n['sugars_100g']));
  set('sat_fat', num(n['saturated-fat_100g']));
  set('salt', num(n['salt_100g']));
  set('sodium_mg', num(n['sodium_100g']), 1000); // OFF gives sodium in g
  set('protein', num(n['proteins_100g']));
  set('fiber', num(n['fiber_100g']));
  set('fvl', num(n['fruits-vegetables-legumes-estimate-from-ingredients_100g']) ?? num(n['fruits-vegetables-nuts-estimate-from-ingredients_100g']));
  if (additives.some((a) => SWEETENER.test(a))) per100.sweeteners = true;
  const hasNutrition = per100.kcal != null || per100.sugars != null || per100.sat_fat != null || per100.salt != null;

  const beverage = cats.includes('en:beverages') || (cats.length === 0 && ourCategory === 'drinks');
  const liquid = beverage || isLiquidQuantity(p.quantity);
  const water = cats.includes('en:waters') && !per100.sweeteners && (per100.sugars ?? 0) === 0;

  const offGrade = typeof p.nutriscore_grade === 'string' && /^[a-e]$/.test(p.nutriscore_grade) ? (p.nutriscore_grade as Grade) : null;
  let nutriscore: Grade | null = offGrade;
  let source: 'off' | 'calc' | null = offGrade ? 'off' : null;
  if (!offGrade && hasNutrition && !isSpecialCategory(cats)) {
    const calc = nutriScore(per100, beverage, { water });
    if (calc) { nutriscore = calc.grade; source = 'calc'; }
  }

  const name = (typeof p.product_name_he === 'string' && p.product_name_he.trim()) || (typeof p.product_name === 'string' && p.product_name.trim()) || null;
  return {
    product_id: productId,
    status: 'found',
    fetched_at: new Date().toISOString(),
    off_name: name,
    image_url: typeof p.image_front_small_url === 'string' ? p.image_front_small_url : null,
    is_beverage: beverage,
    per100: hasNutrition ? per100 : null,
    nutriscore,
    nutriscore_source: source,
    red_flags: hasNutrition ? redFlags(per100, liquid) : [],
  };
}

/** A bigger version of an OFF image URL (…/front_he.12.200.jpg → .400.jpg). */
export function largerOffImage(url: string | null): string | null {
  return url ? url.replace(/\.(100|200)\.jpg$/, '.400.jpg') : null;
}
