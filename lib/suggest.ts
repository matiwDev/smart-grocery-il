/**
 * Healthy, personal suggestions for "What can I cook?" (Plan v2, phase 6).
 *
 * Everything here is free, rule-based and runs in the browser:
 * - Food preferences per person (`person_profiles`, migration 026), combined
 *   for whoever eats: hard rules (diet, kosher, avoid, dislikes) apply if ANY
 *   eater has them; goals only change the ranking.
 * - A health ESTIMATE (0–100) from the ingredients, the category and the
 *   method. It is not nutrition: phase 7 brings real values per serving.
 * - The final order blends overlap with what you have, health and goals.
 *   Less healthy recipes are ranked lower and carry a badge, never hidden.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Recipe, RecipeIngredient } from '@/lib/recipes';
import { sortIngredients } from '@/lib/recipes';
import { CookMatch, words } from '@/lib/cook';

// ─── Preferences ────────────────────────────────────────────────────────────

export type Diet = 'any' | 'pescatarian' | 'vegetarian' | 'vegan';
export const DIETS: Diet[] = ['any', 'pescatarian', 'vegetarian', 'vegan'];
export type Avoid = 'gluten' | 'lactose' | 'nuts' | 'peanuts' | 'eggs' | 'fish' | 'shellfish' | 'sesame' | 'soy';
export const AVOIDS: Avoid[] = ['gluten', 'lactose', 'nuts', 'peanuts', 'eggs', 'fish', 'shellfish', 'sesame', 'soy'];
export type Goal = 'lighter' | 'protein' | 'less_sugar' | 'more_veg';
export const GOALS: Goal[] = ['lighter', 'protein', 'less_sugar', 'more_veg'];

export interface FoodPrefs {
  diet: Diet;
  kosher: boolean;
  avoid: Avoid[];
  dislikes: string[];
  goals: Goal[];
}

export const NO_PREFS: FoodPrefs = { diet: 'any', kosher: false, avoid: [], dislikes: [], goals: [] };

/** The rules for a group eating together: strictest diet, every restriction, every goal. */
export function combinePrefs(list: FoodPrefs[]): FoodPrefs {
  const rank = (d: Diet) => DIETS.indexOf(d);
  return {
    diet: list.reduce<Diet>((d, p) => (rank(p.diet) > rank(d) ? p.diet : d), 'any'),
    kosher: list.some((p) => p.kosher),
    avoid: [...new Set(list.flatMap((p) => p.avoid))],
    dislikes: [...new Set(list.flatMap((p) => p.dislikes.map((d) => d.trim()).filter(Boolean)))],
    goals: [...new Set(list.flatMap((p) => p.goals))],
  };
}

export async function loadPrefs(supabase: SupabaseClient, userIds: string[]): Promise<Record<string, FoodPrefs>> {
  if (userIds.length === 0) return {};
  const { data, error } = await supabase.from('person_profiles').select('user_id, diet, kosher, avoid, dislikes, goals').in('user_id', userIds);
  if (error) throw error;
  const out: Record<string, FoodPrefs> = {};
  for (const r of data ?? []) {
    out[r.user_id as string] = {
      diet: (r.diet as Diet) ?? 'any', kosher: !!r.kosher,
      avoid: (r.avoid as Avoid[]) ?? [], dislikes: (r.dislikes as string[]) ?? [], goals: (r.goals as Goal[]) ?? [],
    };
  }
  return out;
}

export async function savePrefs(supabase: SupabaseClient, userId: string, p: FoodPrefs): Promise<void> {
  const { error } = await supabase.from('person_profiles').upsert({
    user_id: userId, diet: p.diet, kosher: p.kosher, avoid: p.avoid,
    dislikes: p.dislikes.map((d) => d.trim()).filter(Boolean).slice(0, 30), goals: p.goals, updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

// ─── What an ingredient is ──────────────────────────────────────────────────
// Keywords go through words() too, so plurals, final letters and spelling
// variants line up. A keyword matches when all its words are in the ingredient.

type Kind =
  | 'meat' | 'red_meat' | 'processed_meat' | 'pork' | 'poultry_lean' | 'fish' | 'shellfish' | 'dairy' | 'dairy_fat' | 'eggs'
  | 'gluten' | 'nuts' | 'peanuts' | 'sesame' | 'soy' | 'honey' | 'gelatin'
  | 'veg' | 'legume' | 'whole_grain' | 'herb' | 'olive_oil' | 'sugar' | 'refined';

const KEYWORDS: Record<Kind, string[]> = {
  meat: ['beef', 'lamb', 'chicken', 'turkey', 'pork', 'bacon', 'ham', 'sausage', 'mince', 'veal', 'duck', 'goat', 'mutton', 'salami', 'chorizo',
    'pepperoni', 'prosciutto', 'pancetta', 'steak', 'meatball', 'liver', 'oxtail', 'brisket', 'gammon', 'venison',
    'בקר', 'בשר', 'עוף', 'הודו', 'כבש', 'טלה', 'חזיר', 'בייקון', 'נקניק', 'נקניקיות', 'סלמי', 'פסטרמה', 'שניצל', 'פרגית', 'כבד', 'קבב',
    'אנטריקוט', 'סטייק', 'שוקיים', 'כנפיים', 'קציצות', 'אווז', 'ברווז'],
  red_meat: ['beef', 'lamb', 'pork', 'mince', 'veal', 'steak', 'goat', 'mutton', 'brisket', 'oxtail', 'venison', 'בקר', 'כבש', 'טלה', 'טחון', 'אנטריקוט', 'סטייק'],
  processed_meat: ['bacon', 'sausage', 'ham', 'salami', 'chorizo', 'pepperoni', 'prosciutto', 'pancetta', 'hot dog', 'gammon',
    'בייקון', 'נקניק', 'נקניקיות', 'סלמי', 'פסטרמה'],
  pork: ['pork', 'bacon', 'ham', 'chorizo', 'pancetta', 'prosciutto', 'lard', 'pepperoni', 'gammon', 'חזיר', 'בייקון'],
  poultry_lean: ['chicken breast', 'turkey', 'turkey breast', 'חזה עוף', 'הודו', 'חזה הודו'],
  fish: ['fish', 'salmon', 'tuna', 'cod', 'haddock', 'mackerel', 'sardine', 'anchovy', 'trout', 'tilapia', 'sea bass', 'hake', 'herring',
    'sea bream', 'monkfish', 'halibut', 'fish sauce', 'דג', 'דגים', 'סלמון', 'טונה', 'בקלה', 'אמנון', 'לברק', 'דניס', 'מושט', 'סרדינים',
    'אנשובי', 'הרינג', 'מקרל', 'פורל', 'הליבוט'],
  shellfish: ['prawn', 'shrimp', 'crab', 'lobster', 'mussel', 'clam', 'oyster', 'scallop', 'squid', 'calamari', 'octopus', 'crayfish',
    'שרימפס', 'סרטן', 'לובסטר', 'מולים', 'צדפות', 'קלמרי', 'תמנון'],
  dairy: ['milk', 'butter', 'cream', 'cheese', 'yogurt', 'yoghurt', 'parmesan', 'mozzarella', 'cheddar', 'feta', 'ricotta', 'mascarpone',
    'creme fraiche', 'ghee', 'paneer', 'gruyere', 'brie', 'halloumi', 'buttermilk',
    'חלב', 'חמאה', 'שמנת', 'גבינה', 'גבינת', 'יוגורט', 'לבנה', 'פרמזן', 'מוצרלה', 'פטה', 'ריקוטה', 'קוטג', 'מסקרפונה', 'חלומי', 'צדר'],
  dairy_fat: ['butter', 'cream', 'cheese', 'mascarpone', 'cheddar', 'parmesan', 'gruyere', 'ghee', 'creme fraiche',
    'חמאה', 'שמנת', 'גבינה צהובה', 'פרמזן', 'מסקרפונה', 'צדר'],
  eggs: ['egg', 'egg yolk', 'egg white', 'mayonnaise', 'ביצה', 'ביצים', 'חלמון', 'מיונז'],
  gluten: ['flour', 'bread', 'pasta', 'spaghetti', 'penne', 'linguine', 'fettuccine', 'tagliatelle', 'lasagne', 'macaroni', 'noodle', 'couscous',
    'bulgur', 'barley', 'breadcrumb', 'pastry', 'tortilla', 'pita', 'wheat', 'semolina', 'soy sauce', 'beer', 'biscuit', 'naan', 'bun',
    'קמח', 'לחם', 'פסטה', 'ספגטי', 'אטריות', 'קוסקוס', 'בורגול', 'פירורי', 'בצק', 'פיתה', 'פיתות', 'טורטיה', 'טורטיות', 'סולת', 'שעורה',
    'רוטב סויה', 'פתיתים', 'לזניה', 'בירה', 'חלה', 'לחמניה'],
  nuts: ['almond', 'walnut', 'cashew', 'pecan', 'pistachio', 'hazelnut', 'pine nut', 'macadamia', 'brazil nut',
    'שקד', 'שקדים', 'אגוז', 'אגוזי', 'קשיו', 'פקאן', 'פיסטוק', 'לוז', 'צנובר'],
  peanuts: ['peanut', 'בוטנים'],
  sesame: ['sesame', 'tahini', 'tahina', 'שומשום', 'טחינה'],
  soy: ['soy', 'soya', 'tofu', 'edamame', 'miso', 'סויה', 'טופו', 'מיסו'],
  honey: ['honey', 'דבש'],
  gelatin: ['gelatin', 'gelatine', 'ג׳לטין', 'זלטין'],
  veg: ['tomato', 'onion', 'garlic', 'carrot', 'red pepper', 'green pepper', 'yellow pepper', 'bell pepper', 'spinach', 'broccoli', 'cauliflower',
    'zucchini', 'courgette', 'aubergine', 'eggplant', 'cabbage', 'kale', 'lettuce', 'cucumber', 'mushroom', 'celery', 'leek', 'peas',
    'green beans', 'sweet potato', 'beetroot', 'squash', 'pumpkin', 'asparagus', 'avocado', 'chard', 'okra', 'radish', 'fennel', 'artichoke',
    'shallot', 'spring onion', 'sweetcorn', 'chilli', 'lemon', 'lime',
    'עגבניה', 'עגבניות', 'בצל', 'שום', 'גזר', 'פלפל אדום', 'פלפל ירוק', 'פלפל צהוב', 'פלפלים', 'תרד', 'ברוקולי', 'כרובית', 'קישוא', 'קישואים',
    'חציל', 'חצילים', 'כרוב', 'חסה', 'מלפפון', 'מלפפונים', 'פטריות', 'סלרי', 'כרשה', 'אפונה', 'שעועית ירוקה', 'בטטה', 'סלק', 'דלעת',
    'אספרגוס', 'אבוקדו', 'במיה', 'צנון', 'שומר', 'ארטישוק', 'תירס', 'לימון', 'מנגולד'],
  legume: ['lentil', 'chickpea', 'kidney beans', 'black beans', 'cannellini beans', 'butter beans', 'beans', 'split peas', 'fava beans',
    'עדשים', 'חומוס', 'שעועית', 'פול'],
  whole_grain: ['brown rice', 'quinoa', 'oats', 'bulgur', 'whole wheat', 'wholemeal', 'wholegrain', 'barley', 'buckwheat', 'freekeh',
    'אורז מלא', 'קינואה', 'שיבולת שועל', 'בורגול', 'קמח מלא', 'לחם מלא', 'כוסמין', 'גריסים', 'כוסמת', 'פריקה'],
  herb: ['parsley', 'coriander', 'cilantro', 'mint', 'dill', 'basil', 'thyme', 'rosemary', 'oregano', 'sage', 'chives',
    'פטרוזיליה', 'כוסברה', 'נענע', 'שמיר', 'בזיליקום', 'טימין', 'רוזמרין', 'אורגנו', 'מרווה', 'עירית'],
  olive_oil: ['olive oil', 'שמן זית'],
  sugar: ['sugar', 'syrup', 'honey', 'condensed milk', 'chocolate', 'caramel', 'jam', 'treacle', 'molasses', 'marshmallow', 'nutella',
    'סוכר', 'סירופ', 'דבש', 'חלב מרוכז', 'שוקולד', 'קרמל', 'ריבה', 'סילאן'],
  refined: ['puff pastry', 'pastry', 'plain flour', 'white flour', 'white bread', 'self raising flour', 'cornflour',
    'בצק עלים', 'קמח לבן', 'לחם לבן'],
};

/** Words that make a kind not apply: coconut milk isn't dairy, butter beans aren't butter. */
const NOT_LISTS: Partial<Record<Kind, string[]>> = {
  dairy: ['coconut', 'almond', 'soy', 'soya', 'oat', 'rice', 'peanut', 'cocoa', 'beans', 'tartar', 'קוקוס', 'שקדים', 'סויה', 'שיבולת', 'אורז', 'בוטנים', 'קקאו', 'שעועית'],
  dairy_fat: ['coconut', 'almond', 'soy', 'peanut', 'cocoa', 'beans', 'tartar', 'קוקוס', 'שקדים', 'סויה', 'בוטנים', 'קקאו', 'שעועית'],
  gluten: ['rice', 'corn', 'gluten free', 'אורז', 'תירס', 'ללא'],
  nuts: ['coconut', 'nutmeg', 'butternut', 'קוקוס', 'מוסקט'],
  eggs: ['eggplant', 'חציל'],
  meat: ['vegetable', 'vegetarian', 'vegan', 'ירקות', 'צמחי', 'טבעוני'],
  sugar: ['free', 'ללא'],
};

const KW = Object.fromEntries(
  Object.entries(KEYWORDS).map(([k, list]) => [k, list.map((s) => words(s)).filter((w) => w.length > 0)]),
) as Record<Kind, string[][]>;
const NOT = Object.fromEntries(
  Object.entries(NOT_LISTS).map(([k, list]) => [k, new Set((list ?? []).flatMap((s) => words(s)))]),
) as Partial<Record<Kind, Set<string>>>;
const KINDS = Object.keys(KW) as Kind[];

function hasKind(w: string[], kind: Kind): boolean {
  const not = NOT[kind];
  if (not && w.some((x) => not.has(x))) return false;
  return KW[kind].some((kw) => kw.every((x) => w.includes(x)));
}

function ingWords(i: Pick<RecipeIngredient, 'name' | 'list_name'>): string[] {
  return [...new Set([...words(i.name), ...words(i.list_name)])];
}

export function kindsOf(i: Pick<RecipeIngredient, 'name' | 'list_name'>): Set<Kind> {
  // English and Hebrew names are checked separately so "Chicken Stock" + "ציר ירקות" can't mix.
  const out = new Set<Kind>();
  for (const w of [words(i.name), words(i.list_name)]) {
    if (w.length === 0) continue;
    for (const k of KINDS) if (hasKind(w, k)) out.add(k);
  }
  return out;
}

// ─── Hard rules ─────────────────────────────────────────────────────────────

export type Reason = 'diet' | 'kosher' | Avoid | 'dislike';

/** Why this recipe can't be suggested to this group (empty = it can). */
export function blockedBy(recipe: Recipe, prefs: FoodPrefs): Reason[] {
  const ings = sortIngredients(recipe);
  const kinds = ings.map(kindsOf);
  const any = (k: Kind) => kinds.some((s) => s.has(k));
  const cat = (recipe.category ?? '').toLowerCase();
  const out = new Set<Reason>();

  const meat = any('meat') || ['beef', 'chicken', 'lamb', 'pork', 'goat'].includes(cat);
  const fish = any('fish') || any('shellfish') || cat === 'seafood';
  if (prefs.diet === 'pescatarian' && meat) out.add('diet');
  if (prefs.diet === 'vegetarian' && (meat || fish || any('gelatin'))) out.add('diet');
  if (prefs.diet === 'vegan' && (meat || fish || any('dairy') || any('eggs') || any('honey') || any('gelatin'))) out.add('diet');

  if (prefs.kosher && (any('pork') || any('shellfish') || cat === 'pork' || (meat && any('dairy')))) out.add('kosher');

  const avoidKind: Record<Avoid, Kind[]> = {
    gluten: ['gluten'], lactose: ['dairy'], nuts: ['nuts'], peanuts: ['peanuts'], eggs: ['eggs'],
    fish: ['fish'], shellfish: ['shellfish'], sesame: ['sesame'], soy: ['soy'],
  };
  for (const a of prefs.avoid) if (avoidKind[a].some(any)) out.add(a);

  const titleW = words(recipe.title);
  for (const d of prefs.dislikes) {
    const dw = words(d);
    if (dw.length === 0) continue;
    if (dw.every((x) => titleW.includes(x)) || ings.some((i) => { const w = ingWords(i); return dw.every((x) => w.includes(x)); })) {
      out.add('dislike');
      break;
    }
  }
  return [...out];
}

// ─── Health estimate ────────────────────────────────────────────────────────

export type HealthBand = 'healthy' | 'balanced' | 'occasional';
export interface Health { score: number; band: HealthBand; dessert: boolean }

const FRIED = /deep[\s-]?fr(y|ied)|טיגון עמוק|בשמן עמוק/i;
const FRIED_TITLE = /\bfried\b|fritters?|tempura|doughnut|מטוגן|מטוגנים|צ׳יפס|\bchips\b/i;
const DESSERT_TITLE = /cake|\bpie\b|\btart\b|pudding|brownie|cookie|biscuit|muffin|ice cream|mousse|trifle|crumble|fudge|doughnut|pancake|עוגה|עוגת|עוגיות|קינוח|פודינג|בראוניז|מאפינס|פנקייק|גלידה/i;

export function healthOf(recipe: Recipe, goals: Goal[] = []): Health {
  const kinds = sortIngredients(recipe).map(kindsOf);
  const count = (k: Kind) => kinds.filter((s) => s.has(k)).length;
  const cat = (recipe.category ?? '').toLowerCase();
  const dessert = cat === 'dessert' || DESSERT_TITLE.test(recipe.title);
  const g = new Set(goals);

  let s = 50;
  s += Math.min(30, count('veg') * 6) * (g.has('more_veg') ? 1.5 : 1);
  s += Math.min(16, count('legume') * 8);
  s += Math.min(10, count('whole_grain') * 5);
  s += count('fish') > 0 ? 8 : 0;
  s += count('poultry_lean') > 0 ? 4 : 0;
  s += count('olive_oil') > 0 ? 3 : 0;
  s += Math.min(6, count('herb') * 2);

  s -= Math.min(18, count('dairy_fat') * 6) * (g.has('lighter') ? 1.5 : 1);
  s -= Math.min(24, count('sugar') * 6) * (g.has('less_sugar') ? 1.5 : 1);
  s -= Math.min(20, count('processed_meat') * 10);
  s -= count('red_meat') > 0 ? 4 : 0;
  s -= Math.min(8, count('refined') * 4);
  if (FRIED.test(recipe.instructions ?? '') || FRIED_TITLE.test(recipe.title)) s -= g.has('lighter') ? 22 : 15;
  if (dessert) s -= 25;
  if (cat === 'vegetarian' || cat === 'vegan') s += 5;
  if (cat === 'seafood') s += 3;

  const score = Math.max(0, Math.min(100, Math.round(s)));
  const band: HealthBand = dessert || score < 45 ? 'occasional' : score >= 68 ? 'healthy' : 'balanced';
  return { score, band, dessert };
}

/** Points for goals that are about what the dish contains. */
function goalBonus(recipe: Recipe, goals: Goal[]): number {
  if (!goals.includes('protein')) return 0;
  const protein = sortIngredients(recipe).map(kindsOf)
    .some((k) => k.has('meat') || k.has('fish') || k.has('eggs') || k.has('legume') || k.has('soy') || k.has('shellfish'));
  return protein ? 8 : -4;
}

// ─── Ranking ────────────────────────────────────────────────────────────────

export interface Suggestion extends CookMatch {
  health: Health;
  score: number;
}

/**
 * Drops what the group can't eat, then orders by a blend of overlap with what
 * you have (up to 50), health (up to 40) and goals (±8). A dish you can make
 * from what you have still beats a healthier one you'd shop for, but a couple
 * of missing items no longer outweigh a much healthier dish.
 */
export function rankSuggestions(matches: CookMatch[], prefs: FoodPrefs): Suggestion[] {
  return matches
    .filter((m) => blockedBy(m.recipe, prefs).length === 0)
    .map((m) => {
      const health = healthOf(m.recipe, prefs.goals);
      const overlap = 50 * (m.have.length / m.total) - 3 * Math.max(0, m.missing.length - 2);
      return { ...m, health, score: overlap + 0.4 * health.score + goalBonus(m.recipe, prefs.goals) };
    })
    .sort((a, b) => b.score - a.score || a.missing.length - b.missing.length);
}

/** Nothing chosen yet: the healthiest of our recipes this group can eat. */
export function healthyPicks(recipes: Recipe[], prefs: FoodPrefs, limit = 5): Array<{ recipe: Recipe; health: Health }> {
  return recipes
    .filter((r) => blockedBy(r, prefs).length === 0)
    .map((r) => ({ recipe: r, health: healthOf(r, prefs.goals) }))
    .filter((x) => x.health.band !== 'occasional')
    .sort((a, b) => b.health.score - a.health.score)
    .slice(0, limit);
}
