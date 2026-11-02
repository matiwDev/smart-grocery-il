import { NextRequest, NextResponse } from 'next/server';
import type { MealFull, MealSummary } from '@/lib/recipes';

// GET /api/recipes/mealdb — recipe ideas from TheMealDB (shown in English, as published).
//   ?s=<text>          search by name
//   ?c=<category>      meals in a category (summaries only)
//   ?i=<idMeal>        one meal with ingredients
//   ?list=categories   category names
//   ?random=1          one random meal
//   ?ing=a|b,c         "What can I cook?": meals using our ingredients. Each comma
//                      group is one thing we have, with its English candidates
//                      ("chicken breast|chicken"); the first one TheMealDB knows is
//                      used. One filter call per group (the free key filters by a
//                      single ingredient), at most 6; meals ranked by groups used.
// Proxied (and cached for a day) so the key stays on the server. The free
// development key is "1"; a public launch needs the £10 production key in
// THEMEALDB_API_KEY.
const KEY = process.env.THEMEALDB_API_KEY || '1';
const BASE = `https://www.themealdb.com/api/json/v1/${KEY}`;

type RawMeal = Record<string, string | null>;

function summary(m: RawMeal): MealSummary {
  return { id: String(m.idMeal), title: String(m.strMeal ?? ''), image: m.strMealThumb ?? null, category: m.strCategory ?? null, area: m.strArea ?? null };
}

function full(m: RawMeal): MealFull {
  const ingredients: MealFull['ingredients'] = [];
  for (let i = 1; i <= 20; i++) {
    const name = (m[`strIngredient${i}`] ?? '').trim();
    if (!name) continue;
    ingredients.push({ name, measure: (m[`strMeasure${i}`] ?? '').trim() });
  }
  return {
    ...summary(m),
    instructions: String(m.strInstructions ?? '').replace(/\r\n/g, '\n').trim(),
    source_url: m.strSource || null,
    youtube: m.strYoutube || null,
    ingredients,
  };
}

async function get(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/${path}`, { next: { revalidate: path.startsWith('random') ? 0 : 86400 } });
  if (!res.ok) throw new Error(`TheMealDB ${res.status}`);
  return res.json();
}

const MAX_GROUPS = 6;

/** TheMealDB's ingredient names, lower-cased → as published (cached a day). */
async function knownIngredients(): Promise<Map<string, string>> {
  const data = await get('list.php?i=list');
  const rows = (data.meals as RawMeal[] | null) ?? [];
  return new Map(rows.map((r) => String(r.strIngredient ?? '').trim()).filter(Boolean).map((n) => [n.toLowerCase(), n]));
}

async function byIngredients(groups: string[][]) {
  // If the ingredient list can't be read, try each group's first candidate as is.
  const known = await knownIngredients().catch(() => null);
  const used: Array<{ group: number; name: string }> = [];
  groups.slice(0, MAX_GROUPS).forEach((cands, group) => {
    const hit = known && known.size > 0 ? cands.map((c) => known.get(c.toLowerCase())).find(Boolean) : cands[0];
    if (hit) used.push({ group, name: hit });
  });
  const results = await Promise.all(used.map(async (u) => {
    const data = await get(`filter.php?i=${encodeURIComponent(u.name.replace(/\s+/g, '_'))}`).catch(() => ({ meals: null }));
    return { ...u, meals: (data.meals as RawMeal[] | null) ?? [] };
  }));
  const byId = new Map<string, MealSummary & { uses: string[] }>();
  for (const r of results) {
    for (const m of r.meals) {
      const id = String(m.idMeal);
      const row = byId.get(id) ?? { ...summary(m), uses: [] };
      if (!row.uses.includes(r.name)) row.uses.push(r.name);
      byId.set(id, row);
    }
  }
  const meals = [...byId.values()]
    .sort((a, b) => b.uses.length - a.uses.length || a.title.localeCompare(b.title))
    .slice(0, 40);
  return { meals, used: used.map((u) => u.name), unknown: groups.slice(0, MAX_GROUPS).length - used.length };
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  try {
    if (p.get('ing')) {
      const groups = p.get('ing')!.split(',').map((g) => g.split('|').map((c) => c.trim()).filter(Boolean)).filter((g) => g.length > 0);
      return NextResponse.json(await byIngredients(groups));
    }
    if (p.get('list') === 'categories') {
      const data = await get('list.php?c=list');
      const meals = (data.meals as RawMeal[] | null) ?? [];
      return NextResponse.json({ categories: meals.map((m) => m.strCategory).filter(Boolean) });
    }
    if (p.get('i')) {
      const data = await get(`lookup.php?i=${encodeURIComponent(p.get('i')!)}`);
      const meal = ((data.meals as RawMeal[] | null) ?? [])[0];
      return meal ? NextResponse.json({ meal: full(meal) }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (p.get('random')) {
      const data = await get('random.php');
      const meal = ((data.meals as RawMeal[] | null) ?? [])[0];
      return NextResponse.json({ meal: meal ? full(meal) : null }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (p.get('c')) {
      const data = await get(`filter.php?c=${encodeURIComponent(p.get('c')!)}`);
      return NextResponse.json({ meals: ((data.meals as RawMeal[] | null) ?? []).map(summary) });
    }
    const q = (p.get('s') ?? '').trim();
    const data = await get(`search.php?s=${encodeURIComponent(q)}`);
    return NextResponse.json({ meals: ((data.meals as RawMeal[] | null) ?? []).map(summary) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'TheMealDB request failed';
    console.error('[recipes/mealdb]', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
