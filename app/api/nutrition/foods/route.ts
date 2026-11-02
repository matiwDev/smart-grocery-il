import { NextRequest, NextResponse } from 'next/server';
import { FoodTable, foodByCode, gramsFor, searchFoods } from '@/lib/foods';
import tzameret from '@/lib/data/tzameret.json';

// GET /api/nutrition/foods — the Health Ministry food table (צמרת), for
// choosing an ingredient's food by hand in the recipe editor (phase 7).
//   ?q=<text>[&name=<ingredient>&measure=<as written>]  up to 10 foods; with
//                                                        name+measure, each hit
//                                                        carries a grams estimate
//   ?codes=1561,3820                                     names for food codes
// Public reference data (no sign-in needed); cached a day.

const TABLE = tzameret as unknown as FoodTable;
const CACHE = { 'Cache-Control': 'public, max-age=86400' };

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const codes = (p.get('codes') ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 60);
  if (codes.length) {
    const foods = codes.map((c) => foodByCode(TABLE, c)).filter(Boolean).map((f) => ({ code: f!.c, he: f!.he, en: f!.en, kcal: f!.n[0] }));
    return NextResponse.json({ foods }, { headers: CACHE });
  }
  const q = (p.get('q') ?? '').slice(0, 60);
  const name = p.get('name');
  const measure = p.get('measure');
  const foods = searchFoods(TABLE, q).map((f) => ({
    ...f,
    grams: name != null ? gramsFor(TABLE, f.code, name, measure).grams : null,
  }));
  return NextResponse.json({ foods }, { headers: CACHE });
}
