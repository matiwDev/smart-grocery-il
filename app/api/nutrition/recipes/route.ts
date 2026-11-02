import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { requestUserId } from '@/lib/authServer';
import { FoodTable, Nutrients, ZERO, addInto, foodByCode, gramsFor, matchFood, nutrientsFor } from '@/lib/foods';
import tzameret from '@/lib/data/tzameret.json';

// POST /api/nutrition/recipes   { ids: string[] }   (Authorization: Bearer <access token>)
//
// Nutrition per serving for household recipes (Plan v2, phase 7), from the
// Health Ministry food table (צמרת) that ships with the app. The first time,
// each ingredient is matched to a food and its grams are estimated from the
// written measure; the result is saved on recipe_ingredients (food_set_by =
// 'auto') so later calls are just arithmetic. A user's own choice is kept.
//
// Reply: { recipes: { [id]: { perServing, coverage, unmatched[] } }, source }
//   coverage = share of the recipe's ingredients we could weigh and match (0–1).

const TABLE = tzameret as unknown as FoodTable;
const MAX_IDS = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface IngRow {
  id: string; recipe_id: string; name: string; list_name: string | null; measure: string | null;
  food_code: number | null; grams: number | null; food_set_by: 'auto' | 'user' | null; food_checked_at: string | null;
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const userId = await requestUserId(req, supabase);
  if (!userId) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? [...new Set((body.ids as unknown[]).filter((x): x is string => typeof x === 'string' && UUID.test(x)))].slice(0, MAX_IDS) : [];
  if (ids.length === 0) return NextResponse.json({ recipes: {}, source: TABLE.source });

  // Only recipes of the caller's household (the service role bypasses RLS).
  const { data: memberships } = await supabase.from('household_members').select('household_id').eq('user_id', userId);
  const households = (memberships ?? []).map((m) => m.household_id as string);
  if (households.length === 0) return NextResponse.json({ recipes: {}, source: TABLE.source });
  const { data: recipes, error } = await supabase.from('recipes').select('id, servings').in('id', ids).in('household_id', households);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const recipeIds = (recipes ?? []).map((r) => r.id as string);
  if (recipeIds.length === 0) return NextResponse.json({ recipes: {}, source: TABLE.source });

  const { data: ingData, error: ingErr } = await supabase.from('recipe_ingredients')
    .select('id, recipe_id, name, list_name, measure, food_code, grams, food_set_by, food_checked_at')
    .in('recipe_id', recipeIds);
  if (ingErr) return NextResponse.json({ error: ingErr.message }, { status: 500 });
  const ings = (ingData ?? []) as IngRow[];

  // Match and weigh what was never tried.
  const updates: Array<Pick<IngRow, 'id' | 'food_code' | 'grams'>> = [];
  for (const ing of ings) {
    if (ing.food_set_by === 'user' || ing.food_checked_at) continue;
    const m = matchFood(TABLE, ing.list_name) ?? matchFood(TABLE, ing.name);
    const g = gramsFor(TABLE, m?.code ?? null, ing.list_name || ing.name, ing.measure);
    ing.food_code = m?.code ?? null;
    ing.grams = g.grams != null ? Math.round(g.grams * 10) / 10 : null;
    updates.push({ id: ing.id, food_code: ing.food_code, grams: ing.grams });
  }
  const now = new Date().toISOString();
  await Promise.all(updates.map((u) => supabase.from('recipe_ingredients')
    .update({ food_code: u.food_code, grams: u.grams, food_set_by: 'auto', food_checked_at: now }).eq('id', u.id)));

  const out: Record<string, { perServing: Nutrients; coverage: number; unmatched: string[] }> = {};
  for (const r of recipes ?? []) {
    const mine = ings.filter((i) => i.recipe_id === r.id);
    const total = { ...ZERO };
    const unmatched: string[] = [];
    let known = 0;
    for (const i of mine) {
      const food = i.food_code != null ? foodByCode(TABLE, i.food_code) : undefined;
      if (food && i.grams != null) { addInto(total, nutrientsFor(food, Number(i.grams))); known++; }
      else unmatched.push(i.list_name || i.name);
    }
    const servings = Math.max(1, Number(r.servings) || 1);
    const perServing = { ...ZERO };
    addInto(perServing, total, 1 / servings);
    out[r.id as string] = { perServing, coverage: mine.length ? known / mine.length : 0, unmatched };
  }
  return NextResponse.json({ recipes: out, source: TABLE.source });
}
