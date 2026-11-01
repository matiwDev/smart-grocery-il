/**
 * Phase 5, step 1: how much of our catalog does Open Food Facts know?
 *
 * Takes a fixed random sample of products with a retail barcode (300 Israeli
 * "729…", 100 imported; store-internal codes are skipped, they are never in
 * OFF) and looks each one up in the OFF API. Prints coverage per group and per
 * aisle: found at all, has a front photo, has a Nutri-Score (a–e), has
 * nutrition per 100 g.
 *
 * Resumable: every answer is appended to scripts/.off-coverage.jsonl and
 * skipped on the next run, so it can be stopped and started again.
 *
 *   npm run off:coverage                 # whole sample
 *   npm run off:coverage -- --limit 40   # 40 more lookups, then the report
 *   npm run off:coverage -- --report     # report only
 *
 * OFF asks for a descriptive User-Agent and at most 100 product reads a minute;
 * we stay well under that (one read every 1.5 s).
 */
import { appendFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { requireEnv, restFetch, sleep } from './supabase-rest';

requireEnv();

const OUT = join(__dirname, '.off-coverage.jsonl');
const UA = 'SmartGroceryIL/0.5 (household grocery planner; https://smart-grocery-il.vercel.app)';
const FIELDS = 'code,product_name,product_name_he,image_front_small_url,nutriscore_grade,nutriments,nova_group';
const DELAY_MS = 1500;
const SAMPLE = { il: 300, import: 100 };

interface Row { barcode: string; category: string | null }
interface Result {
  barcode: string; group: 'il' | 'import'; category: string;
  found: boolean; image: boolean; grade: string | null; nutrition: boolean; nova: number | null; name: string | null;
  error?: string;
}

const args = process.argv.slice(2);
const limitArg = args.indexOf('--limit');
const LIMIT = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;
const REPORT_ONLY = args.includes('--report');

async function loadCatalog(): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const res = await restFetch(`products?select=barcode,category&order=barcode&offset=${from}&limit=1000`);
    if (!res.ok) throw new Error(`products: HTTP ${res.status} ${await res.text()}`);
    const page = (await res.json()) as Row[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

/** Same sample every run: order by a hash of the barcode. */
function pickSample(rows: Row[]): Array<Row & { group: 'il' | 'import' }> {
  const retail = rows.filter((r) => /^\d{13}$/.test(r.barcode) || /^\d{8}$/.test(r.barcode));
  const key = (b: string) => createHash('md5').update(b + 's5').digest('hex');
  const sorted = [...retail].sort((a, b) => (key(a.barcode) < key(b.barcode) ? -1 : 1));
  const il = sorted.filter((r) => r.barcode.startsWith('729')).slice(0, SAMPLE.il).map((r) => ({ ...r, group: 'il' as const }));
  const im = sorted.filter((r) => !r.barcode.startsWith('729')).slice(0, SAMPLE.import).map((r) => ({ ...r, group: 'import' as const }));
  return [...il, ...im];
}

function loadDone(): Map<string, Result> {
  const done = new Map<string, Result>();
  if (!existsSync(OUT)) return done;
  for (const line of readFileSync(OUT, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const r = JSON.parse(line) as Result;
    if (!r.error) done.set(r.barcode, r);
  }
  return done;
}

async function lookup(barcode: string): Promise<Omit<Result, 'barcode' | 'group' | 'category'>> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}?fields=${FIELDS}`, {
    headers: { 'User-Agent': UA },
  });
  if (res.status === 404) return { found: false, image: false, grade: null, nutrition: false, nova: null, name: null };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = (await res.json()) as { status: number; product?: Record<string, unknown> };
  const p = j.product;
  if (j.status !== 1 || !p) return { found: false, image: false, grade: null, nutrition: false, nova: null, name: null };
  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  const grade = typeof p.nutriscore_grade === 'string' && /^[a-e]$/.test(p.nutriscore_grade) ? p.nutriscore_grade : null;
  return {
    found: true,
    image: typeof p.image_front_small_url === 'string',
    grade,
    nutrition: n['energy-kcal_100g'] != null || n['energy_100g'] != null,
    nova: typeof p.nova_group === 'number' ? p.nova_group : null,
    name: (p.product_name_he as string) || (p.product_name as string) || null,
  };
}

function pct(n: number, d: number) { return d ? `${Math.round((n / d) * 100)}%`.padStart(4) : '   –'; }

function report(results: Result[]) {
  const line = (label: string, rs: Result[]) => {
    const f = rs.filter((r) => r.found);
    console.log(
      `${label.padEnd(16)} n=${String(rs.length).padStart(3)}  found ${pct(f.length, rs.length)}  photo ${pct(rs.filter((r) => r.image).length, rs.length)}` +
      `  grade ${pct(rs.filter((r) => r.grade).length, rs.length)}  nutrition ${pct(rs.filter((r) => r.nutrition).length, rs.length)}`,
    );
  };
  console.log('\nOpen Food Facts coverage (share of the sample)\n');
  line('ALL', results);
  line('Israeli (729)', results.filter((r) => r.group === 'il'));
  line('Imported', results.filter((r) => r.group === 'import'));
  const food = new Set(['produce', 'bread', 'dairy_eggs', 'meat_fish', 'pantry', 'snacks', 'drinks', 'frozen', 'baby']);
  line('Food aisles', results.filter((r) => food.has(r.category)));
  console.log('\nBy aisle');
  const cats = [...new Set(results.map((r) => r.category))].sort();
  for (const c of cats) line(`  ${c}`, results.filter((r) => r.category === c));
  const grades: Record<string, number> = {};
  for (const r of results) if (r.grade) grades[r.grade] = (grades[r.grade] ?? 0) + 1;
  console.log('\nNutri-Score mix:', JSON.stringify(grades));
}

async function main() {
  const sample = pickSample(await loadCatalog());
  const done = loadDone();
  if (!REPORT_ONLY) {
    const todo = sample.filter((s) => !done.has(s.barcode)).slice(0, LIMIT);
    console.log(`Sample ${sample.length}, done ${done.size}, looking up ${todo.length} now…`);
    for (const [i, s] of todo.entries()) {
      const base = { barcode: s.barcode, group: s.group, category: s.category ?? 'other' };
      try {
        const r: Result = { ...base, ...(await lookup(s.barcode)) };
        appendFileSync(OUT, JSON.stringify(r) + '\n');
        done.set(r.barcode, r);
      } catch (e) {
        console.warn(`  ${s.barcode}: ${(e as Error).message}`);
      }
      if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${todo.length}`);
      await sleep(DELAY_MS);
    }
  }
  report(sample.map((s) => done.get(s.barcode)).filter((r): r is Result => !!r));
}

main().catch((e) => { console.error(e); process.exit(1); });
