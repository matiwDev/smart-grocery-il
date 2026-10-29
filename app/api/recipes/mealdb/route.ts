import { NextRequest, NextResponse } from 'next/server';
import type { MealFull, MealSummary } from '@/lib/recipes';

// GET /api/recipes/mealdb — recipe ideas from TheMealDB (shown in English, as published).
//   ?s=<text>          search by name
//   ?c=<category>      meals in a category (summaries only)
//   ?i=<idMeal>        one meal with ingredients
//   ?list=categories   category names
//   ?random=1          one random meal
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

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  try {
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
