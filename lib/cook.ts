/**
 * "What can I cook?" (Plan v2, phase 6).
 *
 * The household says what it has: ingredients picked as chips, and/or the
 * items on the current list. Our recipes are scored against ALL their
 * ingredients (staples such as salt, oil and water never count as missing);
 * TheMealDB ideas are found per ingredient (the free key filters by one
 * ingredient per call) and ranked by how many of ours each meal uses.
 *
 * Matching is by words, not by exact name, so a catalog item like
 * "חלב תנובה 3% 1 ליטר" counts as "חלב", and a chip "עוף" covers "חזה עוף".
 * Hebrew plurals/singulars and English plurals are folded together.
 */
import { EN_HE, MealFull, Recipe, RecipeIngredient, mealToRecipe, sortIngredients } from '@/lib/recipes';

/** Something the household has. */
export interface Have {
  label: string;
  productId?: string | null;
  customProductId?: string | null;
}

// ─── Words ──────────────────────────────────────────────────────────────────

const FINALS: Record<string, string> = { 'ם': 'מ', 'ן': 'נ', 'ץ': 'צ', 'ך': 'כ', 'ף': 'פ' };
const NOISE = new Set([
  'of', 'and', 'or', 'the', 'a', 'fresh', 'chopped', 'sliced', 'diced', 'minced', 'large', 'small', 'medium', 'whole', 'ripe',
  'ו', 'של', 'טרי', 'טריה', 'טריים', 'טריות', 'ארוז', 'ארוזה', 'קפוא', 'קפואה', 'קפואים', 'גדול', 'גדולה', 'קטן', 'קטנה', 'מארז', 'יח',
  'ליטר', 'גרם', 'מל', 'קג', 'ml', 'g', 'kg', 'l',
]);
/** First words of products that are made WITH an ingredient, not the ingredient
 *  itself: "שוקולד חלב" is not milk, "רוטב עגבניות" is not tomatoes. */
const MADE_WITH = new Set([
  'שוקולד', 'עוגה', 'עוגת', 'עוגיות', 'חטיף', 'חטיפ', 'רוטב', 'מעדנ', 'מעדן', 'משקה', 'גלידה', 'גלידת', 'קרמ', 'סבונ', 'שמפו', 'מרככ',
  'ופל', 'ממרח', 'תבלינ', 'ביסלי', 'במבה', 'דגני', 'ציר', 'אבקת',
  'chocolate', 'cake', 'cookie', 'snack', 'sauce', 'drink', 'ice', 'soap', 'shampoo', 'spread', 'stock', 'cereal',
]);

/** Hebrew words whose ending is not a plural/feminine suffix: שמנת (cream) must not become שמן (oil). */
const KEEP = new Set(['שמנת', 'זית', 'ריבת', 'קקאו']);

function stem(w: string): string {
  if (/^[a-z]+$/.test(w)) {
    if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
    if (w.length > 4 && w.endsWith('oes')) return w.slice(0, -2);
    if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
    return w;
  }
  if (KEEP.has(w)) return w;
  let x = w;
  if (x.length > 3 && (x.endsWith('ים') || x.endsWith('ות'))) x = x.slice(0, -2);
  else if (x.length > 3 && (x.endsWith('ה') || x.endsWith('ת'))) x = x.slice(0, -1);
  return x.replace(/[םןץךף]/g, (c) => FINALS[c]);
}

/** Lower-cased, de-pointed, number- and unit-free words, singular. */
export function words(s: string | null | undefined): string[] {
  return (s ?? '')
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '')       // niqqud / cantillation
    .replace(/[׳״'"`]/g, '')               // geresh / gershayim: ק״ג → קג
    .replace(/יי/g, 'י').replace(/וו/g, 'ו') // full spelling: עגבנייה = עגבניה
    .replace(/\d+([.,]\d+)?%?/g, ' ')
    .replace(/[^\p{L}\s-]/gu, ' ')
    .split(/[\s-]+/)
    .filter((w) => w && !NOISE.has(w))
    .map(stem)
    .filter((w) => w && !NOISE.has(w));
}

function subset(a: string[], b: string[]): boolean {
  return a.length > 0 && a.every((w) => b.includes(w));
}

/** Does something the household has cover this ingredient name? */
function wordsCover(have: string[], ing: string[]): boolean {
  if (have.length === 0 || ing.length === 0) return false;
  // "עוף" (have) covers "חזה עוף" (recipe)
  if (subset(have, ing)) return true;
  // "חלב תנובה 3%" (have) covers "חלב" (recipe), but "שוקולד חלב" does not
  if (subset(ing, have)) return !MADE_WITH.has(have[0]) || MADE_WITH.has(ing[0]);
  return false;
}

// ─── Staples: in every kitchen, never "missing" ─────────────────────────────

const STAPLES = new Set(
  ['water', 'cold water', 'boiling water', 'warm water', 'hot water', 'ice', 'salt', 'sea salt', 'pepper', 'black pepper',
    'salt and pepper', 'oil', 'olive oil', 'vegetable oil', 'sunflower oil', 'sugar',
    'מים', 'מלח', 'פלפל שחור', 'מלח ופלפל', 'שמן', 'שמן זית', 'שמן קנולה', 'שמן חמניות', 'סוכר', 'קרח',
  ].map((s) => words(s).join(' ')),
);

export function isStaple(ing: Pick<RecipeIngredient, 'name' | 'list_name' | 'skip_list'>): boolean {
  if (ing.skip_list) return true;
  return STAPLES.has(words(ing.name).join(' ')) || (!!ing.list_name && STAPLES.has(words(ing.list_name).join(' ')));
}

// ─── Our recipes ────────────────────────────────────────────────────────────

export interface CookMatch {
  recipe: Recipe;
  have: RecipeIngredient[];
  missing: RecipeIngredient[];
  /** Ingredients that count (staples left out). */
  total: number;
}

interface PreparedHave { w: string[]; productId: string | null; customProductId: string | null }

function prepare(haves: Have[]): PreparedHave[] {
  return haves.map((h) => ({ w: words(h.label), productId: h.productId ?? null, customProductId: h.customProductId ?? null }));
}

function covered(ing: RecipeIngredient, haves: PreparedHave[]): boolean {
  const names = [words(ing.name), words(ing.list_name), words(ing.linked_name)].filter((w) => w.length > 0);
  return haves.some((h) =>
    (ing.product_id && h.productId === ing.product_id)
    || (ing.custom_product_id && h.customProductId === ing.custom_product_id)
    || names.some((n) => wordsCover(h.w, n)));
}

/**
 * Recipes that use at least one thing the household has, best first:
 * fewest missing ingredients, then the most ingredients used.
 */
export function matchRecipes(recipes: Recipe[], haves: Have[]): CookMatch[] {
  const prepared = prepare(haves).filter((h) => h.w.length > 0 || h.productId || h.customProductId);
  if (prepared.length === 0) return [];
  const out: CookMatch[] = [];
  for (const recipe of recipes) {
    const counted = sortIngredients(recipe).filter((i) => !isStaple(i));
    if (counted.length === 0) continue;
    const have: RecipeIngredient[] = [];
    const missing: RecipeIngredient[] = [];
    for (const ing of counted) (covered(ing, prepared) ? have : missing).push(ing);
    if (have.length === 0) continue;
    out.push({ recipe, have, missing, total: counted.length });
  }
  return out.sort((a, b) =>
    a.missing.length - b.missing.length
    || b.have.length - a.have.length
    || a.recipe.title.localeCompare(b.recipe.title));
}

/** The same recipe with only the given ingredients (for "Add missing to list"). */
export function withOnly(recipe: Recipe, ingredients: RecipeIngredient[]): Recipe {
  return { ...recipe, recipe_ingredients: ingredients };
}

// ─── TheMealDB: our words → its ingredient names ────────────────────────────

const HE_TO_EN: Array<{ he: string[]; en: string }> = Object.entries(EN_HE).map(([en, he]) => ({ he: words(he), en }));

/**
 * English ingredient names TheMealDB might know for something we have, most
 * specific first ("חזה עוף טרי" → chicken breast, chicken breasts, chicken).
 * English input is used as is. Empty when we don't know a translation.
 */
export function englishCandidates(label: string): string[] {
  const raw = label.trim().toLowerCase();
  if (!raw) return [];
  if (/^[a-z\s'-]+$/.test(raw)) return [raw];
  const w = words(raw);
  // Only names wholly inside what we have: "חזה עוף טרי" → chicken breast, chicken;
  // never the other way ("בצל" is not "red onion"), never "שוקולד חלב" → milk.
  const hits = HE_TO_EN.filter((e) => subset(e.he, w) && (!MADE_WITH.has(w[0]) || MADE_WITH.has(e.he[0])));
  hits.sort((a, b) => b.he.length - a.he.length || a.en.length - b.en.length);
  return [...new Set(hits.map((h) => h.en))].slice(0, 4);
}

/** Hebrew + English names for the chip suggestions (datalist). */
export function ingredientSuggestions(lang: 'he' | 'en'): string[] {
  const list = lang === 'he' ? Object.values(EN_HE) : Object.keys(EN_HE);
  return [...new Set(list)].sort((a, b) => a.localeCompare(b, lang));
}

/** A TheMealDB meal shaped like one of our recipes, so it is matched and scored the same way. */
export function mealAsRecipe(meal: MealFull): Recipe {
  const { recipe, ingredients } = mealToRecipe(meal, '');
  return { ...recipe, id: `mealdb:${meal.id}`, recipe_ingredients: ingredients };
}
