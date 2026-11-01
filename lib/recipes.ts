/**
 * Recipes and the meal plan (Plan v2, phase 4).
 *
 * A recipe's ingredients are kept as written (name + measure, e.g. "1/2 tsp")
 * and, separately, as what goes on the shopping list: an amount and a unit
 * ('unit' = a count, 'kg' = a weight, 'none' = "need some", never summed),
 * an optional link to a catalog product or a household product, and the name
 * to put on the list (Hebrew for TheMealDB's English recipes when we know it).
 *
 * "Add week to list" turns the planned meals into list items: amounts are
 * scaled by servings, the same product from several meals is merged into one
 * line, and items already on the list are topped up instead of duplicated.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type Slot = 'breakfast' | 'lunch' | 'dinner';
export const SLOTS: Slot[] = ['breakfast', 'lunch', 'dinner'];
export type ListUnit = 'unit' | 'kg' | 'none';

export interface RecipeIngredient {
  id?: string;
  position: number;
  name: string;
  measure: string | null;
  amount: number | null;
  unit: ListUnit;
  list_name: string | null;
  product_id: string | null;
  custom_product_id: string | null;
  skip_list: boolean;
  /** Display name of the linked product (joined in the app, not a column). */
  linked_name?: string | null;
}

export interface Recipe {
  id: string;
  household_id: string;
  title: string;
  lang: 'he' | 'en';
  servings: number;
  instructions: string | null;
  image_url: string | null;
  category: string | null;
  source: 'own' | 'mealdb';
  source_id: string | null;
  source_url: string | null;
  created_at?: string;
  recipe_ingredients?: RecipeIngredient[];
}

export interface MealEntry {
  id: string;
  household_id: string;
  plan_date: string; // YYYY-MM-DD
  slot: Slot;
  recipe_id: string;
  servings: number;
  /** Member user ids; null = everyone in the household. */
  eaters: string[] | null;
  added_to_list_at: string | null;
}

export const RECIPE_SELECT =
  'id, household_id, title, lang, servings, instructions, image_url, category, source, source_id, source_url, created_at, ' +
  'recipe_ingredients(id, position, name, measure, amount, unit, list_name, product_id, custom_product_id, skip_list)';

export function sortIngredients(r: Recipe): RecipeIngredient[] {
  return [...(r.recipe_ingredients ?? [])].sort((a, b) => a.position - b.position);
}

// ─── Dates (weeks start on Sunday, as in Israel) ────────────────────────────

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseIsoDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// ─── Reading amounts ("1/2 tsp", "200g", "2 large", "1 ק״ג") ───────────────

const FRACTIONS: Record<string, number> = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125 };

function readNumber(s: string): { value: number; rest: string } | null {
  let str = s.trim().replace(',', '.');
  for (const [k, v] of Object.entries(FRACTIONS)) str = str.replace(k, ` ${v} `);
  str = str.replace(/\s+/g, ' ').trim();
  // "1 1/2", "1/2", "1.5", "1-2" (take the larger: buy enough)
  const m = str.match(/^(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?(?:\s*\/\s*(\d+))?(?:\s*[-–]\s*(\d+(?:\.\d+)?))?\s*(.*)$/);
  if (!m) return null;
  let value = Number(m[1]);
  if (m[4]) value = value / Number(m[4]);           // "1/2"
  if (m[2] && m[3]) value += Number(m[2]) / Number(m[3]); // "1 1/2"
  if (m[5]) value = Math.max(value, Number(m[5]));   // "1-2"
  // "0.5 0.25" from "½ ¼" style leftovers: add a following bare fraction value
  const rest = m[6].trim();
  const extra = rest.match(/^(0\.\d+)\s*(.*)$/);
  if (extra) return { value: value + Number(extra[1]), rest: extra[2] };
  return Number.isFinite(value) && value > 0 ? { value, rest } : null;
}

const WEIGHT_TO_KG: Record<string, number> = {
  kg: 1, kgs: 1, kilo: 1, kilos: 1, kilogram: 1, kilograms: 1, 'ק"ג': 1, 'ק״ג': 1, "ק'ג": 1, קילו: 1, קילוגרם: 1,
  g: 0.001, gr: 0.001, gm: 0.001, gram: 0.001, grams: 0.001, גרם: 0.001, "ג'": 0.001, 'ג׳': 0.001,
  lb: 0.4536, lbs: 0.4536, pound: 0.4536, pounds: 0.4536,
  oz: 0.02835, ounce: 0.02835, ounces: 0.02835,
};
const COUNT_WORDS = new Set([
  'large', 'medium', 'small', 'whole', 'big', 'ripe', 'fresh', 'can', 'cans', 'tin', 'tins', 'jar', 'jars', 'pack', 'packs',
  'packet', 'packets', 'bunch', 'bunches', 'head', 'heads', 'piece', 'pieces', 'fillet', 'fillets', 'breast', 'breasts',
  'thigh', 'thighs', 'leg', 'legs', 'bag', 'bags', 'bottle', 'bottles',
  "יח'", 'יח׳', 'יח', 'יחידות', 'יחידה', 'גדול', 'גדולה', 'גדולים', 'גדולות', 'בינוני', 'בינונית', 'בינוניים', 'בינוניות',
  'קטן', 'קטנה', 'קטנים', 'קטנות', 'קופסה', 'קופסת', 'קופסאות', 'פחית', 'פחיות', 'חבילה', 'חבילות', 'צרור', 'צרורות',
  'ראש', 'ראשים', 'שקית', 'שקיות', 'בקבוק', 'בקבוקים', 'מגש', 'מגשים',
]);

/** What a written measure means for the shopping list. */
export function parseMeasure(measure: string | null | undefined): { amount: number | null; unit: ListUnit } {
  let s = (measure ?? '').trim();
  if (!s) return { amount: null, unit: 'none' };
  // Hebrew number words at the start: "חצי ק״ג", "רבע קילו", "שני בצלים"
  const HE_WORDS: Record<string, string> = {
    'חצי': '0.5', 'רבע': '0.25', 'אחד': '1', 'אחת': '1', 'שני': '2', 'שתי': '2', 'שניים': '2', 'שתיים': '2',
    'שלושה': '3', 'שלוש': '3', 'ארבעה': '4', 'ארבע': '4', 'חמישה': '5', 'חמש': '5',
  };
  const first = s.split(/\s+/)[0];
  if (HE_WORDS[first]) s = HE_WORDS[first] + s.slice(first.length);
  // Glued forms: "200g", "1kg", "500גרם"
  const spaced = s.replace(/^(\d+(?:[.,]\d+)?)(?=[^\d\s.,/])/, '$1 ');
  const n = readNumber(spaced);
  if (!n) return { amount: null, unit: 'none' };
  const word = (n.rest.split(/\s+/)[0] ?? '').replace(/[.,;:()]+$/, '').toLowerCase();
  const factor = WEIGHT_TO_KG[word];
  if (factor) return { amount: Math.round(n.value * factor * 1000) / 1000, unit: 'kg' };
  if (word === '' || COUNT_WORDS.has(word)) return { amount: n.value, unit: 'unit' };
  return { amount: null, unit: 'none' }; // tsp, cup, ml, cloves, pinch…
}

// ─── TheMealDB ingredients → Hebrew shopping-list names ─────────────────────
// The recipe itself stays in English, as published; only what goes on the
// (Hebrew) shopping list is translated. Unknown ingredients keep their name.

const EN_HE: Record<string, string> = {
  'chicken': 'עוף', 'chicken breast': 'חזה עוף', 'chicken breasts': 'חזה עוף', 'chicken thighs': 'ירכיים עוף', 'chicken legs': 'שוקי עוף',
  'chicken stock': 'ציר עוף', 'beef': 'בשר בקר', 'minced beef': 'בשר טחון', 'beef mince': 'בשר טחון', 'ground beef': 'בשר טחון',
  'lamb': 'בשר כבש', 'lamb mince': 'בשר כבש טחון', 'pork': 'חזיר', 'bacon': 'בייקון', 'sausages': 'נקניקיות', 'turkey': 'הודו',
  'salmon': 'סלמון', 'tuna': 'טונה', 'cod': 'בקלה', 'white fish': 'דג לבן', 'prawns': 'שרימפס', 'king prawns': 'שרימפס',
  'eggs': 'ביצים', 'egg': 'ביצים', 'egg yolks': 'ביצים', 'egg white': 'ביצים', 'milk': 'חלב', 'butter': 'חמאה', 'unsalted butter': 'חמאה',
  'cream': 'שמנת מתוקה', 'double cream': 'שמנת מתוקה', 'heavy cream': 'שמנת מתוקה', 'single cream': 'שמנת לבישול',
  'sour cream': 'שמנת חמוצה', 'creme fraiche': 'שמנת חמוצה', 'yogurt': 'יוגורט', 'greek yogurt': 'יוגורט יווני',
  'cheese': 'גבינה צהובה', 'cheddar cheese': 'גבינת צ׳דר', 'parmesan': 'פרמזן', 'parmesan cheese': 'פרמזן', 'mozzarella': 'מוצרלה',
  'feta': 'פטה', 'feta cheese': 'פטה', 'cream cheese': 'גבינת שמנת', 'ricotta': 'ריקוטה',
  'onion': 'בצל', 'onions': 'בצל', 'red onions': 'בצל סגול', 'red onion': 'בצל סגול', 'spring onions': 'בצל ירוק', 'shallots': 'בצלי שאלוט',
  'garlic': 'שום', 'garlic clove': 'שום', 'ginger': 'ג׳ינג׳ר', 'tomatoes': 'עגבניות', 'tomato': 'עגבניות', 'cherry tomatoes': 'עגבניות שרי',
  'chopped tomatoes': 'עגבניות מרוסקות', 'tinned tomatoes': 'עגבניות מרוסקות', 'tomato puree': 'רסק עגבניות', 'tomato paste': 'רסק עגבניות',
  'potatoes': 'תפוחי אדמה', 'potato': 'תפוחי אדמה', 'sweet potatoes': 'בטטה', 'carrots': 'גזר', 'carrot': 'גזר', 'celery': 'סלרי',
  'cucumber': 'מלפפון', 'lettuce': 'חסה', 'spinach': 'תרד', 'cabbage': 'כרוב', 'broccoli': 'ברוקולי', 'cauliflower': 'כרובית',
  'zucchini': 'קישוא', 'courgettes': 'קישוא', 'courgette': 'קישוא', 'aubergine': 'חציל', 'eggplant': 'חציל', 'mushrooms': 'פטריות',
  'red pepper': 'פלפל אדום', 'green pepper': 'פלפל ירוק', 'yellow pepper': 'פלפל צהוב', 'peppers': 'פלפלים', 'red chilli': 'צ׳ילי אדום',
  'green chilli': 'צ׳ילי ירוק', 'chilli': 'צ׳ילי', 'avocado': 'אבוקדו', 'lemon': 'לימון', 'lemons': 'לימון', 'lemon juice': 'לימון',
  'lime': 'ליים', 'orange': 'תפוז', 'apples': 'תפוחים', 'apple': 'תפוחים', 'bananas': 'בננות', 'banana': 'בננות', 'peas': 'אפונה',
  'sweetcorn': 'תירס', 'corn': 'תירס', 'parsley': 'פטרוזיליה', 'coriander': 'כוסברה', 'cilantro': 'כוסברה', 'basil': 'בזיליקום',
  'mint': 'נענע', 'dill': 'שמיר', 'thyme': 'טימין', 'rosemary': 'רוזמרין',
  'rice': 'אורז', 'basmati rice': 'אורז בסמטי', 'pasta': 'פסטה', 'spaghetti': 'ספגטי', 'penne': 'פסטה פנה', 'noodles': 'אטריות',
  'egg noodles': 'אטריות ביצים', 'couscous': 'קוסקוס', 'bulgur': 'בורגול', 'lentils': 'עדשים', 'red lentils': 'עדשים כתומות',
  'chickpeas': 'חומוס גרגרים', 'kidney beans': 'שעועית אדומה', 'black beans': 'שעועית שחורה', 'flour': 'קמח', 'plain flour': 'קמח',
  'self-raising flour': 'קמח תופח', 'bread': 'לחם', 'breadcrumbs': 'פירורי לחם', 'tortillas': 'טורטיות', 'pita': 'פיתות',
  'sugar': 'סוכר', 'caster sugar': 'סוכר', 'brown sugar': 'סוכר חום', 'icing sugar': 'אבקת סוכר', 'honey': 'דבש',
  'olive oil': 'שמן זית', 'vegetable oil': 'שמן', 'sunflower oil': 'שמן חמניות', 'oil': 'שמן', 'sesame oil': 'שמן שומשום',
  'vinegar': 'חומץ', 'soy sauce': 'רוטב סויה', 'tahini': 'טחינה', 'mustard': 'חרדל', 'ketchup': 'קטשופ', 'mayonnaise': 'מיונז',
  'tomato ketchup': 'קטשופ', 'coconut milk': 'חלב קוקוס', 'peanut butter': 'חמאת בוטנים', 'chocolate': 'שוקולד',
  'dark chocolate': 'שוקולד מריר', 'cocoa': 'קקאו', 'baking powder': 'אבקת אפייה', 'yeast': 'שמרים', 'vanilla extract': 'תמצית וניל',
  'paprika': 'פפריקה', 'cumin': 'כמון', 'turmeric': 'כורכום', 'cinnamon': 'קינמון', 'curry powder': 'אבקת קארי', 'oregano': 'אורגנו',
  'bay leaf': 'עלי דפנה', 'bay leaves': 'עלי דפנה', 'nutmeg': 'אגוז מוסקט', 'chilli powder': 'צ׳ילי גרוס', 'garam masala': 'גרם מסאלה',
  'almonds': 'שקדים', 'walnuts': 'אגוזי מלך', 'peanuts': 'בוטנים', 'cashew nuts': 'קשיו', 'pine nuts': 'צנובר', 'raisins': 'צימוקים',
  'oats': 'שיבולת שועל', 'tofu': 'טופו', 'stock': 'ציר', 'vegetable stock': 'ציר ירקות', 'beef stock': 'ציר בקר', 'white wine': 'יין לבן',
  'red wine': 'יין אדום',
};

/** Usually in the kitchen already: not added to the list (each can be switched back on). */
const SKIP_BY_DEFAULT = new Set(['water', 'cold water', 'boiling water', 'warm water', 'hot water', 'ice', 'salt', 'sea salt', 'pepper', 'black pepper', 'salt and pepper', 'מים', 'מלח', 'פלפל שחור', 'קרח']);

export function hebrewListName(englishName: string): string | null {
  return EN_HE[englishName.trim().toLowerCase()] ?? null;
}

export function skipByDefault(name: string): boolean {
  return SKIP_BY_DEFAULT.has(name.trim().toLowerCase());
}

// ─── TheMealDB (through /api/recipes/mealdb) ────────────────────────────────

export interface MealSummary { id: string; title: string; image: string | null; category?: string | null; area?: string | null }
export interface MealFull extends MealSummary {
  instructions: string;
  source_url: string | null;
  youtube: string | null;
  ingredients: Array<{ name: string; measure: string }>;
}

export function mealToRecipe(meal: MealFull, householdId: string) {
  const recipe = {
    household_id: householdId,
    title: meal.title,
    lang: 'en' as const,
    servings: 4, // TheMealDB gives no servings; most recipes serve about four
    instructions: meal.instructions,
    image_url: meal.image,
    category: meal.category ?? null,
    source: 'mealdb' as const,
    source_id: meal.id,
    source_url: meal.source_url || `https://www.themealdb.com/meal/${meal.id}`,
  };
  const ingredients = meal.ingredients.map((ing, i) => {
    const { amount, unit } = parseMeasure(ing.measure);
    return {
      position: i,
      name: ing.name,
      measure: ing.measure || null,
      amount,
      unit,
      list_name: hebrewListName(ing.name),
      product_id: null,
      custom_product_id: null,
      skip_list: skipByDefault(ing.name),
    };
  });
  return { recipe, ingredients };
}

/** Saves a TheMealDB recipe into the household (once; returns the existing copy otherwise). */
export async function importMeal(supabase: SupabaseClient, householdId: string, meal: MealFull): Promise<Recipe> {
  const { data: existing } = await supabase.from('recipes').select(RECIPE_SELECT)
    .eq('household_id', householdId).eq('source', 'mealdb').eq('source_id', meal.id).maybeSingle();
  if (existing) return existing as unknown as Recipe;
  const { recipe, ingredients } = mealToRecipe(meal, householdId);
  const { data: created, error } = await supabase.from('recipes').insert(recipe).select('id').single();
  if (error || !created) throw error ?? new Error('Could not save the recipe');
  if (ingredients.length > 0) {
    const { error: ingErr } = await supabase.from('recipe_ingredients').insert(ingredients.map((x) => ({ ...x, recipe_id: created.id })));
    if (ingErr) throw ingErr;
  }
  const { data: full, error: readErr } = await supabase.from('recipes').select(RECIPE_SELECT).eq('id', created.id).single();
  if (readErr || !full) throw readErr ?? new Error('Could not read the recipe');
  return full as unknown as Recipe;
}

/** Creates or updates a household recipe and replaces its ingredients. */
export async function saveRecipe(
  supabase: SupabaseClient,
  householdId: string,
  values: Omit<Recipe, 'id' | 'household_id' | 'recipe_ingredients'> & { id?: string },
  ingredients: RecipeIngredient[],
): Promise<string> {
  const row = {
    household_id: householdId,
    title: values.title.trim(),
    lang: values.lang,
    servings: values.servings,
    instructions: values.instructions?.trim() || null,
    image_url: values.image_url,
    category: values.category,
    source: values.source,
    source_id: values.source_id,
    source_url: values.source_url,
    updated_at: new Date().toISOString(),
  };
  let id = values.id;
  if (id) {
    const { error } = await supabase.from('recipes').update(row).eq('id', id);
    if (error) throw error;
    const { error: delErr } = await supabase.from('recipe_ingredients').delete().eq('recipe_id', id);
    if (delErr) throw delErr;
  } else {
    const { data, error } = await supabase.from('recipes').insert(row).select('id').single();
    if (error || !data) throw error ?? new Error('Could not save the recipe');
    id = data.id as string;
  }
  const rows = ingredients
    .filter((x) => x.name.trim())
    .map((x, i) => ({
      recipe_id: id,
      position: i,
      name: x.name.trim(),
      measure: x.measure?.trim() || null,
      amount: x.amount,
      unit: x.unit,
      list_name: x.list_name?.trim() || null,
      product_id: x.product_id,
      custom_product_id: x.custom_product_id,
      skip_list: x.skip_list,
    }));
  if (rows.length > 0) {
    const { error } = await supabase.from('recipe_ingredients').insert(rows);
    if (error) throw error;
  }
  return id!;
}

// ─── Meal plan → shopping list ──────────────────────────────────────────────

export interface ListNeed {
  key: string;
  productId: string | null;
  customProductId: string | null;
  name: string;
  amount: number;
  unit: ListUnit;
  meals: string[];
}

function needKey(ing: RecipeIngredient, name: string): string {
  if (ing.product_id) return `p:${ing.product_id}`;
  if (ing.custom_product_id) return `c:${ing.custom_product_id}`;
  return `n:${name.trim().toLowerCase()}`;
}

/** Everything a set of planned meals needs, merged per product, scaled by servings. */
export function needsFor(entries: Array<{ servings: number; recipe: Recipe }>): ListNeed[] {
  const byKey = new Map<string, ListNeed>();
  for (const { servings, recipe } of entries) {
    const scale = servings / Math.max(1, recipe.servings);
    for (const ing of sortIngredients(recipe)) {
      if (ing.skip_list) continue;
      const name = (ing.list_name || ing.name).trim();
      if (!name) continue;
      const key = needKey(ing, name);
      const amount = ing.unit !== 'none' && ing.amount ? ing.amount * scale : 1;
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, { key, productId: ing.product_id, customProductId: ing.custom_product_id, name, amount, unit: ing.unit, meals: [recipe.title] });
        continue;
      }
      if (!prev.meals.includes(recipe.title)) prev.meals.push(recipe.title);
      if (prev.unit === ing.unit && ing.unit !== 'none') prev.amount += amount;
      else if (prev.unit === 'none' && ing.unit !== 'none') { prev.unit = ing.unit; prev.amount = amount; }
    }
  }
  return [...byKey.values()].map((n) => ({ ...n, amount: roundForList(n.amount, n.unit) }));
}

/** Buy whole units, and kilos to the next 100 g. */
export function roundForList(amount: number, unit: ListUnit): number {
  if (unit === 'kg') return Math.max(0.1, Math.ceil(amount * 10 - 1e-9) / 10);
  if (unit === 'unit') return Math.max(1, Math.ceil(amount - 1e-9));
  return 1;
}

/**
 * Puts the needs on a list. Ingredients without a product become household
 * products ("My products"), like free text typed in search. An item already on
 * the list is topped up (counts and kilos add; "need some" items stay as they
 * are) and tagged with the meals it is for.
 */
export async function addNeedsToList(
  supabase: SupabaseClient,
  basketId: string,
  householdId: string,
  needs: ListNeed[],
): Promise<{ added: number; updated: number }> {
  if (needs.length === 0) return { added: 0, updated: 0 };

  // 1. Ingredients without a product → the household's own products (find by name, else create).
  const loose = needs.filter((n) => !n.productId && !n.customProductId);
  if (loose.length > 0) {
    const { data: mine } = await supabase.from('custom_products').select('id, name').eq('household_id', householdId);
    const byName = new Map((mine ?? []).map((c) => [String(c.name).trim().toLowerCase(), c.id as string]));
    const missing = [...new Set(loose.map((n) => n.name).filter((name) => !byName.has(name.toLowerCase())))];
    if (missing.length > 0) {
      const categories = await Promise.all(missing.map(async (name) => {
        const { data } = await supabase.rpc('categorize_product', { p_name: name });
        return typeof data === 'string' ? data : 'other';
      }));
      const { data: created, error } = await supabase.from('custom_products')
        .insert(missing.map((name, i) => ({ household_id: householdId, name, category: categories[i] })))
        .select('id, name');
      if (error) throw error;
      for (const c of created ?? []) byName.set(String(c.name).trim().toLowerCase(), c.id as string);
    }
    for (const n of loose) n.customProductId = byName.get(n.name.toLowerCase()) ?? null;
  }

  // 2. Merge into what is already on the list.
  const { data: rows, error: readErr } = await supabase.from('basket_items')
    .select('id, product_id, custom_product_id, quantity_value, quantity_unit, checked, from_meals')
    .eq('basket_id', basketId);
  if (readErr) throw readErr;
  const existing = new Map<string, { id: string; quantity_value: number; quantity_unit: string; checked: boolean; from_meals: string[] | null }>();
  for (const r of rows ?? []) {
    if (r.product_id) existing.set(`p:${r.product_id}`, r);
    else if (r.custom_product_id) existing.set(`c:${r.custom_product_id}`, r);
  }

  let added = 0;
  let updated = 0;
  const inserts: Record<string, unknown>[] = [];
  for (const n of needs) {
    const key = n.productId ? `p:${n.productId}` : n.customProductId ? `c:${n.customProductId}` : null;
    if (!key) continue;
    const listUnit = n.unit === 'kg' ? 'kg' : 'unit';
    const row = existing.get(key);
    if (row) {
      const meals = [...new Set([...(row.from_meals ?? []), ...n.meals])];
      const sameUnit = (row.quantity_unit === 'kg' ? 'kg' : 'unit') === listUnit;
      let quantity = Number(row.quantity_value);
      if (row.checked) quantity = n.amount;                        // already in the cart: this is a new need
      else if (n.unit !== 'none' && sameUnit) quantity = Math.round((quantity + n.amount) * 100) / 100;
      const { error } = await supabase.from('basket_items')
        .update({ quantity_value: quantity, quantity_unit: row.checked ? listUnit : row.quantity_unit, checked: false, from_meals: meals })
        .eq('id', row.id);
      if (error) throw error;
      updated++;
    } else {
      inserts.push({
        basket_id: basketId,
        product_id: n.productId,
        custom_product_id: n.productId ? null : n.customProductId,
        product_name: n.name,
        quantity_value: n.amount,
        quantity_unit: listUnit,
        from_meals: n.meals,
      });
      added++;
    }
  }
  if (inserts.length > 0) {
    const { error } = await supabase.from('basket_items').insert(inserts);
    if (error) throw error;
  }
  return { added, updated };
}

/** Loads recipes by id with ingredients (for the meal plan). */
export async function loadRecipes(supabase: SupabaseClient, householdId: string): Promise<Recipe[]> {
  const { data, error } = await supabase.from('recipes').select(RECIPE_SELECT)
    .eq('household_id', householdId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Recipe[];
}

// ─── Sample recipes (debug panel) ───────────────────────────────────────────

export const SAMPLE_RECIPES: Array<{ title: string; servings: number; instructions: string; ingredients: Array<[string, string]> }> = [
  {
    title: 'שקשוקה', servings: 4,
    instructions: 'מטגנים בצל ושום בשמן זית. מוסיפים פלפל ועגבניות ומבשלים 15 דקות. שוברים פנימה את הביצים, מכסים ומבשלים עד שהחלבון מתייצב.',
    ingredients: [['ביצים', '6'], ['עגבניות', '1 ק״ג'], ['בצל', '1'], ['פלפל אדום', '1'], ['שום', '3 שיניים'], ['שמן זית', '3 כפות'], ['פפריקה', '1 כפית'], ['מלח', 'לפי הטעם']],
  },
  {
    title: 'פסטה ברוטב עגבניות', servings: 4,
    instructions: 'מבשלים פסטה. בינתיים מטגנים שום בשמן זית, מוסיפים עגבניות מרוסקות ובזיליקום ומבשלים 10 דקות. מערבבים עם הפסטה ומגישים עם פרמזן.',
    ingredients: [['פסטה', '500 גרם'], ['עגבניות מרוסקות', '1 קופסה'], ['שום', '2 שיניים'], ['שמן זית', '2 כפות'], ['בזיליקום', 'חופן'], ['פרמזן', '100 גרם']],
  },
  {
    title: 'סלט ישראלי', servings: 4,
    instructions: 'קוצצים דק עגבניות, מלפפונים ובצל. מתבלים בלימון, שמן זית ומלח.',
    ingredients: [['עגבניות', '4'], ['מלפפון', '4'], ['בצל סגול', '1'], ['לימון', '1'], ['שמן זית', '2 כפות'], ['פטרוזיליה', 'צרור']],
  },
  {
    title: 'חזה עוף בתנור עם תפוחי אדמה', servings: 4,
    instructions: 'חותכים תפוחי אדמה, מתבלים בשמן זית, פפריקה ומלח. מניחים מעל חזה עוף ואופים ב-200 מעלות כ-40 דקות.',
    ingredients: [['חזה עוף', '800 גרם'], ['תפוחי אדמה', '1 ק״ג'], ['שמן זית', '3 כפות'], ['פפריקה', '1 כף'], ['שום', '4 שיניים'], ['מלח', 'לפי הטעם']],
  },
  {
    title: 'יוגורט עם גרנולה ופירות', servings: 2,
    instructions: 'מחלקים יוגורט לקערות, מוסיפים גרנולה, בננה פרוסה ודבש.',
    ingredients: [['יוגורט', '2'], ['גרנולה', '1 חבילה'], ['בננות', '2'], ['דבש', '1 כף']],
  },
];

export async function seedSampleRecipes(supabase: SupabaseClient, householdId: string): Promise<number> {
  let count = 0;
  for (const s of SAMPLE_RECIPES) {
    const { data: exists } = await supabase.from('recipes').select('id').eq('household_id', householdId).eq('title', s.title).maybeSingle();
    if (exists) continue;
    await saveRecipe(supabase, householdId, {
      title: s.title, lang: 'he', servings: s.servings, instructions: s.instructions, image_url: null,
      category: null, source: 'own', source_id: null, source_url: null,
    }, s.ingredients.map(([name, measure], i) => ({
      position: i, name, measure, ...parseMeasure(measure), list_name: null,
      product_id: null, custom_product_id: null, skip_list: skipByDefault(name),
    })));
    count++;
  }
  return count;
}

/** Fills empty dinner (and some breakfast) slots of a week with household recipes. */
export async function fillWeekWithMeals(supabase: SupabaseClient, householdId: string, start: Date, servings: number): Promise<number> {
  const recipes = await loadRecipes(supabase, householdId);
  if (recipes.length === 0) return 0;
  const from = isoDate(start);
  const to = isoDate(addDays(start, 6));
  const { data: taken } = await supabase.from('meal_plan_entries').select('plan_date, slot')
    .eq('household_id', householdId).gte('plan_date', from).lte('plan_date', to);
  const used = new Set((taken ?? []).map((e) => `${e.plan_date}|${e.slot}`));
  const rows: Record<string, unknown>[] = [];
  for (let d = 0; d < 7; d++) {
    const date = isoDate(addDays(start, d));
    if (!used.has(`${date}|dinner`)) rows.push({ household_id: householdId, plan_date: date, slot: 'dinner', recipe_id: recipes[d % recipes.length].id, servings });
    if (d % 2 === 0 && !used.has(`${date}|breakfast`)) rows.push({ household_id: householdId, plan_date: date, slot: 'breakfast', recipe_id: recipes[(d + 3) % recipes.length].id, servings });
  }
  if (rows.length > 0) {
    const { error } = await supabase.from('meal_plan_entries').insert(rows);
    if (error) throw error;
  }
  return rows.length;
}

/** Names of the products ingredients are linked to (for showing the link). */
export async function withLinkedNames(supabase: SupabaseClient, ingredients: RecipeIngredient[]): Promise<RecipeIngredient[]> {
  const pIds = [...new Set(ingredients.map((x) => x.product_id).filter((x): x is string => !!x))];
  const cIds = [...new Set(ingredients.map((x) => x.custom_product_id).filter((x): x is string => !!x))];
  const [p, c] = await Promise.all([
    pIds.length ? supabase.from('products').select('id, name_he').in('id', pIds) : Promise.resolve({ data: [] as { id: string; name_he: string }[] }),
    cIds.length ? supabase.from('custom_products').select('id, name').in('id', cIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const names = new Map<string, string>();
  for (const r of (p.data ?? []) as { id: string; name_he: string }[]) names.set(r.id, r.name_he);
  for (const r of (c.data ?? []) as { id: string; name: string }[]) names.set(r.id, r.name);
  return ingredients.map((x) => ({ ...x, linked_name: names.get(x.product_id ?? x.custom_product_id ?? '') ?? null }));
}

/** "0.5 ק״ג", "2 יח׳", "1" — what one ingredient puts on the list. */
export function listAmountLabel(ing: Pick<RecipeIngredient, 'amount' | 'unit'>, lang: 'he' | 'en'): string {
  if (ing.unit === 'kg' && ing.amount) return `${roundForList(ing.amount, 'kg')} ${lang === 'he' ? 'ק״ג' : 'kg'}`;
  if (ing.unit === 'unit' && ing.amount) return `${roundForList(ing.amount, 'unit')} ${lang === 'he' ? 'יח׳' : 'pcs'}`;
  return lang === 'he' ? '1' : '1';
}
