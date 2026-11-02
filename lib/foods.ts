/**
 * Recipe ingredient → Health Ministry food (צמרת) → grams → nutrients
 * (Plan v2, phase 7). Pure functions; the table (lib/data/tzameret.json, built
 * by `npm run tzameret:build`) is passed in, so this only runs on the server.
 *
 * Matching: the ingredient's words must all appear in the food's name (Hebrew,
 * or English for TheMealDB names). Among those, the plainest raw food wins:
 * the name's first part equal to the ingredient, "fresh / raw / dry" preferred,
 * cooked, fried, canned, prepared, with-sauce and brand variants pushed down.
 * `ALIASES` pins common ingredients to a chosen food where the rule picks badly.
 *
 * Grams: kg/g from the measure; otherwise the household measure (tablespoon,
 * cup, unit, clove, slice…) looked up for that food, falling back to typical
 * weights; "to taste" and unknowns get a small default only for seasonings/oils.
 */
import { words } from '@/lib/cook';

export interface FoodRow { c: number; he: string; en: string; n: Array<number | null> }
export interface FoodTable { source: string; built: string; foods: FoodRow[]; measures: Record<string, Array<[number, number]>> }

export const NUTRIENTS = ['kcal', 'protein', 'fat', 'sat_fat', 'carbs', 'sugars', 'fiber', 'sodium'] as const;
export type Nutrient = typeof NUTRIENTS[number];
export type Nutrients = Record<Nutrient, number>;
export const ZERO: Nutrients = { kcal: 0, protein: 0, fat: 0, sat_fat: 0, carbs: 0, sugars: 0, fiber: 0, sodium: 0 };

// ─── Index ──────────────────────────────────────────────────────────────────

interface Indexed { row: FoodRow; heHead: string[]; heSecond: string[]; enSecond: string[]; heAll: string[]; enHead: string[]; enAll: string[]; heRaw: string; enRaw: string }

const cache = new WeakMap<FoodTable, { list: Indexed[]; byCode: Map<number, FoodRow> }>();

function index(t: FoodTable) {
  let ix = cache.get(t);
  if (!ix) {
    const list = t.foods.map((row) => ({
      row,
      heHead: words(row.he.split(',')[0]), heSecond: words(row.he.split(',')[1] ?? ''), heAll: words(row.he),
      enHead: words(row.en.split(',')[0]), enSecond: words(row.en.split(',')[1] ?? ''), enAll: words(row.en),
      heRaw: row.he, enRaw: row.en.toLowerCase(),
    }));
    ix = { list, byCode: new Map(t.foods.map((f) => [f.c, f])) };
    cache.set(t, ix);
  }
  return ix;
}

const RAW_HE = /טרי|טריה|טריים|טריות|לא מבושל|גולמי|יבש|יבשים|יבשה|ללא קליפה|בלי קליפה|שלמה|עלים/;
const COOKED_HE = /מבושל|מטוגן|אפוי|אפויים|בגריל|צלוי|קלוי|משומר|קפוא|מוכן|ברוטב|ממולא|מתערובת|מיובש|אבקה|כבוש|מעושן|מרינדה|במילוי|מנה|סלט|מרק|תבשיל|עוגה|עוגת|פשטידה|מאודה|מוקפץ|מחית/;
const WITH_HE = / עם | ב(שמן|חמאה|מרגרינה)|ללא תוספת/;
const RAW_EN = /\b(raw|fresh|dry|dried|uncooked|whole)\b/;
const COOKED_EN = /\b(cooked|fried|baked|grilled|roasted|canned|frozen|prepared|instant|sauce|stuffed|smoked|pickled|soup|salad|cake|pie|stew|mix|boiled|steamed|marinated|ns as)\b/;

/** First words that only say what kind of food follows. */
const GENERIC = new Set(['גבינת', 'גבינה', 'דג', 'בשר', 'אגוזי', 'תבלינים', 'תבלינ', 'oil', 'spice', 'spices', 'cheese', 'fish'].flatMap((w) => words(w)));

function subset(a: string[], b: string[]) { return a.length > 0 && a.every((w) => b.includes(w)); }

function score(ing: string[], f: Indexed, lang: 'he' | 'en'): number {
  const head = lang === 'he' ? f.heHead : f.enHead;
  const second = lang === 'he' ? f.heSecond : f.enSecond;
  const all = lang === 'he' ? f.heAll : f.enAll;
  const raw = lang === 'he' ? f.heRaw : f.enRaw;
  if (!subset(ing, all)) return -Infinity;
  let s = 0;
  // "בזיליקום" is not "לחם בזיליקום", but "מוצרלה" is "גבינת מוצרלה" and "כורכום" is "תבלינים, כורכום".
  const lead = head[0] === ing[0] || (GENERIC.has(head[0]) && (head[1] === ing[0] || second[0] === ing[0]));
  s += lead ? 3 : -4;
  if (GENERIC.has(head[0]) && second.length === ing.length && subset(ing, second)) s += 8; // "תבלינים, כורכום"
  if (head.length === ing.length && subset(ing, head)) s += 12;
  else if (subset(ing, head)) s += 6;
  else if (head.length && subset(head, ing)) s += 3;
  if (lang === 'he') {
    if (RAW_HE.test(raw)) s += 4;
    if (COOKED_HE.test(raw)) s -= 6;
    if (WITH_HE.test(raw)) s -= 3;
  } else {
    if (RAW_EN.test(raw)) s += 4;
    if (COOKED_EN.test(raw)) s -= 6;
    if (/\bwith\b/.test(raw)) s -= 3;
  }
  s -= Math.max(0, all.length - ing.length) * 0.4; // plainer names first
  s -= (raw.split(',').length - 1) * 0.5;
  return s;
}

// Common ingredients pinned to a chosen food code, Hebrew list names and
// English TheMealDB names. Checked before the rule.
const ALIAS_SRC: Array<[number, string]> = [
  [1561, 'ביצים'],
  [1561, 'ביצה'],
  [1561, 'egg'],
  [1561, 'eggs'],
  [1561, 'egg yolks'],
  [1561, 'egg white'],
  [2617, 'פסטה'],
  [2617, 'פסטה פנה'],
  [2617, 'pasta'],
  [2617, 'penne'],
  [2617, 'macaroni'],
  [2617, 'rigatoni'],
  [2617, 'fusilli'],
  [2617, 'ספגטי'],
  [2617, 'spaghetti'],
  [2617, 'linguine'],
  [2617, 'tagliatelle'],
  [2617, 'אטריות'],
  [2617, 'noodles'],
  [2617, 'אטריות ביצים'],
  [2617, 'egg noodles'],
  [415, 'פרמזן'],
  [415, 'parmesan'],
  [415, 'parmesan cheese'],
  [415, 'parmigiano'],
  [8606, 'גבינה צהובה'],
  [8606, 'cheese'],
  [413, 'גבינת צ׳דר'],
  [413, 'cheddar'],
  [413, 'cheddar cheese'],
  [8803, 'חזה עוף'],
  [8803, 'chicken breast'],
  [8803, 'chicken breasts'],
  [883, 'עוף'],
  [883, 'chicken'],
  [883, 'ירכיים עוף'],
  [883, 'chicken thighs'],
  [883, 'chicken thigh'],
  [857, 'שוקי עוף'],
  [857, 'chicken legs'],
  [857, 'chicken drumsticks'],
  [655, 'בשר טחון'],
  [655, 'minced beef'],
  [655, 'ground beef'],
  [655, 'beef mince'],
  [655, 'mince'],
  [731, 'בשר כבש טחון'],
  [731, 'lamb mince'],
  [731, 'minced lamb'],
  [589, 'בשר בקר'],
  [589, 'beef'],
  [589, 'stewing beef'],
  [589, 'beef brisket'],
  [946, 'הודו'],
  [946, 'turkey'],
  [946, 'turkey breast'],
  [1297, 'סלמון'],
  [1297, 'salmon'],
  [1344, 'טונה'],
  [1344, 'tuna'],
  [1183, 'בקלה'],
  [1183, 'cod'],
  [1150, 'דג לבן'],
  [1150, 'white fish'],
  [1373, 'שרימפס'],
  [1373, 'prawns'],
  [1373, 'king prawns'],
  [1373, 'shrimp'],
  [2730, 'אורז'],
  [2730, 'rice'],
  [2730, 'אורז בסמטי'],
  [2730, 'basmati rice'],
  [2730, 'long grain rice'],
  [3449, 'תפוחי אדמה'],
  [3449, 'potatoes'],
  [3449, 'potato'],
  [3820, 'בצל'],
  [3820, 'onion'],
  [3820, 'onions'],
  [3820, 'בצל סגול'],
  [3820, 'red onion'],
  [3820, 'red onions'],
  [8234, 'בצלי שאלוט'],
  [8234, 'shallots'],
  [8234, 'shallot'],
  [1910, 'קמח'],
  [1910, 'flour'],
  [1910, 'plain flour'],
  [1911, 'קמח תופח'],
  [1911, 'self-raising flour'],
  [4500, 'סוכר'],
  [4500, 'sugar'],
  [4500, 'caster sugar'],
  [4500, 'granulated sugar'],
  [4501, 'אבקת סוכר'],
  [4501, 'icing sugar'],
  [15, 'חלב'],
  [15, 'milk'],
  [62, 'יוגורט'],
  [62, 'yogurt'],
  [62, 'natural yogurt'],
  [62, 'יוגורט יווני'],
  [62, 'greek yogurt'],
  [3663, 'עגבניות שרי'],
  [3663, 'cherry tomatoes'],
  [3767, 'כרוב'],
  [3767, 'cabbage'],
  [3848, 'קישוא'],
  [3848, 'courgette'],
  [3848, 'courgettes'],
  [3848, 'zucchini'],
  [3835, 'צ׳ילי'],
  [3835, 'chilli'],
  [3835, 'red chilli'],
  [3835, 'green chilli'],
  [3835, 'צ׳ילי אדום'],
  [3835, 'צ׳ילי ירוק'],
  [3201, 'תפוחים'],
  [3201, 'apple'],
  [3201, 'apples'],
  [3833, 'אפונה'],
  [3833, 'peas'],
  [1672, 'עדשים'],
  [1672, 'lentils'],
  [1672, 'עדשים כתומות'],
  [1672, 'red lentils'],
  [1655, 'חומוס גרגרים'],
  [1655, 'chickpeas'],
  [1615, 'שעועית שחורה'],
  [1615, 'black beans'],
  [1919, 'לחם'],
  [1919, 'bread'],
  [1955, 'פיתות'],
  [1955, 'pita'],
  [4432, 'שמן'],
  [4432, 'oil'],
  [4432, 'vegetable oil'],
  [4273, 'חרדל'],
  [4273, 'mustard'],
  [4644, 'שוקולד'],
  [4644, 'chocolate'],
  [4644, 'milk chocolate'],
  [8779, 'קינמון'],
  [8779, 'cinnamon'],
  [8786, 'אורגנו'],
  [8786, 'oregano'],
  [8787, 'פפריקה'],
  [8787, 'paprika'],
  [8235, 'עגבניות מרוסקות'],
  [8235, 'chopped tomatoes'],
  [8235, 'tinned tomatoes'],
  [8235, 'canned tomatoes'],
  [3716, 'רסק עגבניות'],
  [3716, 'tomato puree'],
  [3716, 'tomato paste'],
  [706, 'בייקון'],
  [706, 'bacon'],
  [271, 'שמנת מתוקה'],
  [271, 'double cream'],
  [271, 'heavy cream'],
  [271, 'cream'],
  [2768, 'קוסקוס'],
  [2768, 'couscous'],
  [1530, 'ציר עוף'],
  [1530, 'chicken stock'],
  [8993, 'ציר ירקות'],
  [8993, 'vegetable stock'],
  [8993, 'ציר'],
  [8993, 'stock'],
  [4949, 'מים'],
  [4949, 'water'],
  [4497, 'מלח'],
  [4497, 'salt'],
  [1096, 'נקניקיות'],
  [1096, 'sausages'],
  [4072, 'שמרים'],
  [4072, 'yeast'],
  [3829, 'בזיליקום'], [3829, 'basil'], [3829, 'fresh basil'], [3565, 'ג׳ינג׳ר'], [3565, 'ginger'], [3565, 'fresh ginger'],
  [4443, 'olive oil'], [4443, 'extra virgin olive oil'], [3798, 'garlic'], [3798, 'garlic clove'], [3798, 'garlic cloves'],
  [4387, 'butter'], [4387, 'unsalted butter'], [3115, 'lemon'], [3115, 'lemon juice'], [3663, 'tomato'], [3663, 'tomatoes'],
  [3626, 'carrot'], [3626, 'carrots'], [4502, 'brown sugar'], [1898, 'tahini'], [4443, 'שמן זית']
];

export function aliasKey(name: string): string { return words(name).join(' '); }

/** Common ingredients pinned to a chosen food (keys as words() writes them). */
export const ALIASES: Record<string, number> = Object.fromEntries(ALIAS_SRC.map(([c, n]) => [aliasKey(n), c]));

const MIN_SCORE = 4;

export interface FoodMatch { code: number; name: string; score: number }

/** The best food for an ingredient name, or null when nothing fits. */
export function matchFood(t: FoodTable, name: string | null | undefined): FoodMatch | null {
  if (!name?.trim()) return null;
  const { list, byCode } = index(t);
  const alias = ALIASES[aliasKey(name)];
  if (alias && byCode.has(alias)) return { code: alias, name: byCode.get(alias)!.he, score: 99 };
  const ing = words(name);
  if (ing.length === 0) return null;
  const lang: 'he' | 'en' = /[֐-׿]/.test(name) ? 'he' : 'en';
  let best: Indexed | null = null;
  let bestScore = -Infinity;
  for (const f of list) {
    const s = score(ing, f, lang);
    if (s > bestScore) { bestScore = s; best = f; }
  }
  return best && bestScore >= MIN_SCORE ? { code: best.row.c, name: best.row.he, score: bestScore } : null;
}

export function foodByCode(t: FoodTable, code: number): FoodRow | undefined { return index(t).byCode.get(code); }

// ─── Grams ──────────────────────────────────────────────────────────────────

// Tzameret household-measure codes.
const U = { unit: 100, small: 102, medium: 103, large: 104, cup: 200, tbsp: 300, tsp: 400, slice: 500, clove: 1211, head: 1215, handful: 1218, leaf: 1203, pita: 1226, can: 1104, box: 906, pack: 901, bag: 903, portion: 802, bun: 1224 };

const UNIT_WORDS: Array<[RegExp, number[], number]> = [
  // pattern on the measure's words, measure codes to try in order, fallback grams per one
  [/^(כפית|כפיות|tsp|teaspoon|teaspoons)$/, [U.tsp, 401, 402], 5],
  [/^(כף|כפות|tbsp|tbs|tablespoon|tablespoons|tblsp|tbls)$/, [U.tbsp, 301, 302], 15],
  [/^(כוס|כוסות|cup|cups)$/, [U.cup, 201, 207], 200],
  [/^(שן|שיני|שיניים|clove|cloves)$/, [U.clove], 5],
  [/^(פרוסה|פרוסות|slice|slices)$/, [U.slice, 502, 501, 503], 30],
  [/^(ראש|ראשים|head|heads)$/, [U.head], 500],
  [/^(חופן|חופנים|handful|handfuls|bunch|bunches|צרור|צרורות)$/, [U.handful], 30],
  [/^(עלה|עלים|leaf|leaves|sprig|sprigs|ענף|ענפים)$/, [U.leaf], 1],
  [/^(פיתה|פיתות)$/, [U.pita, 1227], 90],
  [/^(פחית|פחיות|can|cans|tin|tins)$/, [U.can, U.box], 400],
  [/^(קופסה|קופסת|קופסאות|jar|jars)$/, [U.box], 400],
  [/^(חבילה|חבילות|pack|packs|packet|packets|package)$/, [U.pack, U.bag], 250],
  [/^(קטן|קטנה|קטנים|קטנות|small)$/, [U.small, U.unit, U.medium], 70],
  [/^(גדול|גדולה|גדולים|גדולות|large|big)$/, [U.large, U.unit, U.medium], 150],
  [/^(בינוני|בינונית|בינוניים|medium)$/, [U.medium, U.unit], 100],
  [/^(יחידה|יחידות|יח|piece|pieces|whole|fillet|fillets|breast|breasts)$/, [U.unit, U.medium], 100],
];
const ML = /^(מ"?ל|מל|ml|milliliters?|millilitres?)$/;
const L = /^(ליטר|ליטרים|l|liter|litre|liters|litres)$/;
const PINCH = /^(קמצוץ|pinch|dash)$/;

const SEASONING = /מלח|פלפל שחור|תבלין|פפריקה|כמון|כורכום|קינמון|אורגנו|salt|pepper|spice|paprika|cumin|turmeric|cinnamon|oregano|thyme|chilli powder|garam/;
const OIL = /שמן|oil|butter|חמאה/;
const HERB = /פטרוזיליה|כוסברה|שמיר|נענע|בזיליקום|parsley|coriander|cilantro|dill|mint|basil/;

const FRACTIONS: Record<string, number> = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125 };
const HE_NUM: Record<string, number> = { 'חצי': 0.5, 'רבע': 0.25, 'שליש': 1 / 3, 'אחד': 1, 'אחת': 1, 'שני': 2, 'שתי': 2, 'שניים': 2, 'שתיים': 2, 'שלוש': 3, 'שלושה': 3, 'ארבע': 4, 'ארבעה': 4, 'חמש': 5, 'חמישה': 5, 'שש': 6, 'שישה': 6 };

/** "1 1/2 cups", "½ כוס", "2-3 כפות", "חצי ק״ג", "200g" → amount + the rest. */
function readAmount(measure: string): { value: number; rest: string[] } | null {
  let s = measure.trim().toLowerCase().replace(',', '.');
  for (const [k, v] of Object.entries(FRACTIONS)) s = s.replace(k, ` ${v} `);
  s = s.replace(/^(\d+(?:\.\d+)?)(?=[^\d\s./-])/, '$1 ').replace(/\s+/g, ' ').trim();
  const parts = s.split(' ');
  if (HE_NUM[parts[0]] != null) return { value: HE_NUM[parts[0]], rest: parts.slice(1) };
  const m = s.match(/^(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?(?:\s*\/\s*(\d+))?(?:\s*[-–]\s*(\d+(?:\.\d+)?))?\s*(.*)$/);
  if (!m) return null;
  let v = Number(m[1]);
  if (m[4]) v /= Number(m[4]);
  if (m[2] && m[3]) v += Number(m[2]) / Number(m[3]);
  if (m[5]) v = (v + Number(m[5])) / 2; // "2-3": eat the middle
  let rest = m[6].trim().split(' ').filter(Boolean);
  if (rest[0] && /^0\.\d+$/.test(rest[0])) { v += Number(rest[0]); rest = rest.slice(1); }
  return v > 0 ? { value: v, rest } : null;
}

const WEIGHT_G: Record<string, number> = {
  kg: 1000, kgs: 1000, kilo: 1000, kilos: 1000, 'ק"ג': 1000, 'ק״ג': 1000, קג: 1000, קילו: 1000, קילוגרם: 1000,
  g: 1, gr: 1, gm: 1, gram: 1, grams: 1, גרם: 1, 'ג\'': 1, 'ג׳': 1,
  lb: 453.6, lbs: 453.6, pound: 453.6, pounds: 453.6, oz: 28.35, ounce: 28.35, ounces: 28.35,
};

export interface GramsResult { grams: number | null; how: 'weight' | 'measure' | 'typical' | 'default' | 'none' }

/** Grams of an ingredient, from its written measure and the food's household measures. */
export function gramsFor(t: FoodTable, code: number | null, ingredientName: string, measure: string | null | undefined): GramsResult {
  const name = ingredientName.toLowerCase();
  const m = (measure ?? '').trim();
  const food = code != null ? t.measures[String(code)] ?? [] : [];
  const measureG = (codes: number[]) => { for (const c of codes) { const hit = food.find(([u]) => u === c); if (hit) return hit[1]; } return null; };

  // "כוס", "a cup", "tbsp": one of it.
  let a = m ? readAmount(m) : null;
  if (!a && m) {
    const first = m.toLowerCase().replace(/^(a|an|one)\s+/, '').split(/\s+/)[0]?.replace(/[.,;:()]+$/, '') ?? '';
    if (UNIT_WORDS.some(([re]) => re.test(first))) a = { value: 1, rest: [first] };
  }
  if (a) {
    const word = (a.rest[0] ?? '').replace(/[.,;:()]+$/, '');
    if (WEIGHT_G[word]) return { grams: a.value * WEIGHT_G[word], how: 'weight' };
    if (ML.test(word)) return { grams: a.value, how: 'weight' };
    if (L.test(word)) return { grams: a.value * 1000, how: 'weight' };
    if (PINCH.test(word)) return { grams: 0.4 * a.value, how: 'typical' };
    for (const [re, codes, fallback] of UNIT_WORDS) {
      if (re.test(word)) {
        const g = measureG(codes);
        return g != null ? { grams: a.value * g, how: 'measure' } : { grams: a.value * fallback, how: 'typical' };
      }
    }
    // A count ("3", "2 בצלים", "4 eggs", "1 chopped"): the food's unit weight.
    const g = measureG([U.medium, U.unit, U.large, U.small, U.portion]);
    return g != null ? { grams: a.value * g, how: 'measure' } : { grams: a.value * 100, how: 'typical' };
  } else if (/pinch|קמצוץ/.test(m)) {
    return { grams: 0.4, how: 'typical' };
  }
  // "to taste", "some", nothing written: only seasonings, oil and herbs get a small amount.
  if (SEASONING.test(name)) return { grams: 1, how: 'default' };
  if (OIL.test(name)) return { grams: 10, how: 'default' };
  if (HERB.test(name)) return { grams: 10, how: 'default' };
  return { grams: null, how: 'none' };
}

export function nutrientsFor(row: FoodRow | undefined, grams: number): Nutrients {
  const out = { ...ZERO };
  if (!row) return out;
  NUTRIENTS.forEach((k, i) => { out[k] = ((row.n[i] ?? 0) * grams) / 100; });
  return out;
}

export function addInto(a: Nutrients, b: Nutrients, factor = 1): Nutrients {
  for (const k of NUTRIENTS) a[k] += b[k] * factor;
  return a;
}

export interface FoodHit { code: number; he: string; en: string; kcal: number | null }

/**
 * Foods for a search box (choosing a match by hand): every typed word must
 * start a word of the food's Hebrew or English name. Plain raw foods first.
 */
export function searchFoods(t: FoodTable, q: string, limit = 10): FoodHit[] {
  const qw = words(q);
  if (qw.length === 0) return [];
  const lang: 'he' | 'en' = /[֐-׿]/.test(q) ? 'he' : 'en';
  const hits: Array<{ f: Indexed; s: number }> = [];
  for (const f of index(t).list) {
    const all = lang === 'he' ? f.heAll : f.enAll;
    if (!qw.every((w) => all.some((x) => x.startsWith(w)))) continue;
    const exact = score(qw, f, lang);
    hits.push({ f, s: Number.isFinite(exact) ? exact + 20 : -all.length });
  }
  // The food we'd pick automatically for exactly this name goes first.
  const pinned = ALIASES[aliasKey(q)];
  for (const h of hits) if (h.f.row.c === pinned) h.s = Infinity;
  return hits.sort((a, b) => b.s - a.s).slice(0, limit)
    .map(({ f }) => ({ code: f.row.c, he: f.row.he, en: f.row.en, kcal: f.row.n[0] }));
}
