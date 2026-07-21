/**
 * Seeds public.products with real Shufersal catalog data so barcode matching
 * in scripts/ingest-prices.ts actually has something to match against — the
 * hand-seeded barcodes (supabase/schema.sql era) are fictional and match 0
 * real feed items (see CLAUDE.md "Price ingestion pipeline").
 *
 * Reuses the Shufersal fetch/parse logic from ./shufersal-feed (same module
 * scripts/ingest-prices.ts uses), collects every unique barcode seen across
 * the first SHUFERSAL_STORE_LIMIT branch files, inserts only the ones not
 * already in products (existing rows are left untouched — re-running this
 * script is safe and only adds new catalog items), and inserts a matching
 * price_history row for each newly-added product.
 *
 * The real feed has no ItemSection/SubSection field (verified against the
 * live feed — only ItemName, ManufactureName, price/unit fields exist), so
 * category is inferred from Hebrew keywords in ItemName instead.
 *
 * Run with: npm run seed:products
 */
import { requireEnv, restFetch, chunk, refreshLatestPrices } from './supabase-rest';
import { fetchShufersalFileLinks, fetchAndParseShufersalFile, ShufersalItem } from './shufersal-feed';

requireEnv();

// Read up to 20 branch files by default (Phase 7 — was 5) — a single branch
// file often repeats the same catalog with only price differences, so more
// files means more unique barcodes surfaced.
const SHUFERSAL_STORE_LIMIT = Number(process.env.SHUFERSAL_STORE_LIMIT || 20);

type Category = 'dairy' | 'bread' | 'produce' | 'meat' | 'beverage' | 'other';

// Keywords are matched against whole tokens (words), not raw substrings —
// e.g. "ספריי" (spray) contains "פרי" (fruit) as a mid-word substring, which
// misclassified hair spray as produce before this was tokenized. A keyword
// matches a token if the token starts with it, to still catch plural/suffixed
// forms (e.g. "פירות" for "פרי").
const CATEGORY_KEYWORDS: Array<[Category, string[]]> = [
  ['dairy', ['חלב', 'גבינ', 'קוטג', 'יוגורט', 'שמנת', 'חמאה', 'לבן', 'קפיר']],
  ['bread', ['לחם', 'חלה', 'פיתה', 'בגט', 'לחמני', 'קרואסון', 'טוסט', 'מאפ']],
  ['meat', ['עוף', 'בקר', 'בשר', 'הודו', 'דג', 'דגים', 'נקניק', 'קבב', 'שניצל', 'המבורגר', 'סטייק']],
  ['beverage', ['מים', 'מיץ', 'קולה', 'משקה', 'בירה', 'יין', 'סודה', 'שתיה', 'תה', 'קפה']],
  ['produce', ['עגבני', 'מלפפון', 'תפוח', 'בננה', 'ירק', 'פרי', 'פירות', 'בצל', 'גזר', 'חסה', 'פלפל', 'תפוא']],
];

function classifyCategory(name: string): Category {
  const tokens = name.split(/[\s,."'\-()]+/).filter(Boolean);
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (tokens.some((token) => keywords.some((kw) => token.startsWith(kw)))) return category;
  }
  return 'other';
}

async function collectUniqueItems(): Promise<ShufersalItem[]> {
  console.log('[seed] Fetching Shufersal branch file listing...');
  const links = await fetchShufersalFileLinks();
  if (links.length === 0) throw new Error('No PriceFull file links found in Shufersal listing page');

  const filesToProcess = links.slice(0, SHUFERSAL_STORE_LIMIT);
  console.log(`[seed] Found ${links.length} branch files, processing ${filesToProcess.length}`);

  const seenBarcodes = new Set<string>();
  const unique: ShufersalItem[] = [];

  for (const url of filesToProcess) {
    const items = await fetchAndParseShufersalFile(url);
    console.log(`[seed]   ${items.length} items from ${url.split('/').pop()?.split('?')[0]}`);
    for (const item of items) {
      if (seenBarcodes.has(item.barcode)) continue;
      seenBarcodes.add(item.barcode);
      unique.push(item);
    }
  }

  return unique;
}

async function getProductCount(): Promise<number> {
  const res = await restFetch('products?select=id', { method: 'HEAD', headers: { Prefer: 'count=exact' } });
  if (!res.ok) throw new Error(`Failed to count products: HTTP ${res.status}`);
  const range = res.headers.get('content-range');
  const total = range ? Number(range.split('/')[1]) : NaN;
  if (!Number.isFinite(total)) throw new Error(`Could not parse product count from content-range: ${range}`);
  return total;
}

// Inserts only barcodes not already present in products — existing rows are
// left untouched (resolution=ignore-duplicates), so this is safe to re-run.
// Returns just the newly-inserted rows (PostgREST omits ignored conflicts
// from the response), which is exactly what's needed to seed price_history
// for new products only.
async function insertNewProducts(items: ShufersalItem[]): Promise<Map<string, string>> {
  const rows = items.map((item) => ({
    barcode: item.barcode,
    name_he: item.name,
    name_en: null,
    category: classifyCategory(item.name),
  }));

  const barcodeToId = new Map<string, string>();

  for (const batch of chunk(rows, 100)) {
    const res = await restFetch('products?on_conflict=barcode', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      throw new Error(`Failed to insert products: HTTP ${res.status} ${await res.text()}`);
    }
    const inserted = (await res.json()) as Array<{ id: string; barcode: string }>;
    for (const row of inserted) barcodeToId.set(row.barcode, row.id);
  }

  return barcodeToId;
}

async function insertPrices(items: ShufersalItem[], barcodeToId: Map<string, string>): Promise<number> {
  const now = new Date().toISOString();
  const rows = items
    .filter((item) => barcodeToId.has(item.barcode))
    .map((item) => ({
      product_id: barcodeToId.get(item.barcode),
      chain_id: 'shufersal',
      branch_id: null,
      price: item.price,
      unit_qty: item.unitQty,
      unit_type: item.unitType,
      is_sale: false,
      captured_at: now,
      source: 'shufersal_gov_feed',
    }));

  let inserted = 0;
  for (const batch of chunk(rows, 500)) {
    const res = await restFetch('price_history', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      throw new Error(`Failed to insert price_history batch: HTTP ${res.status} ${await res.text()}`);
    }
    inserted += batch.length;
  }
  return inserted;
}

async function main() {
  const countBefore = await getProductCount();
  console.log(`[seed] Products before: ${countBefore}`);

  const items = await collectUniqueItems();
  console.log(`[seed] Collected ${items.length} unique barcodes across ${SHUFERSAL_STORE_LIMIT} branch files`);

  console.log('[seed] Inserting new products (existing barcodes skipped)...');
  const barcodeToId = await insertNewProducts(items);
  console.log(`[seed] Inserted ${barcodeToId.size} new products`);

  const newItems = items.filter((item) => barcodeToId.has(item.barcode));
  console.log('[seed] Inserting price_history rows for new products...');
  const inserted = await insertPrices(newItems, barcodeToId);
  console.log('[seed] Refreshing latest_prices...');
  await refreshLatestPrices();

  const countAfter = await getProductCount();
  console.log(`\n[seed] Products before: ${countBefore}`);
  console.log(`[seed] Products after:  ${countAfter}`);
  console.log(`[seed] New products added: ${barcodeToId.size}`);
  console.log(`[seed] New price_history rows inserted: ${inserted}`);
}

main().catch((err) => {
  console.error('[seed] ERROR:', err instanceof Error ? err.message : err);
  process.exit(1);
});
