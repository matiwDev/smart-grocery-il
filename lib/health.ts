/**
 * Health grade of a product (Plan v2, phase 5), from nutrition per 100 g / 100 ml.
 *
 * Two things, both calculated from the same values:
 *  - Israel's red front-of-pack labels (Ministry of Health, stage 2, in force
 *    since 1 Jan 2021): high in sodium / sugars / saturated fat.
 *      solids  (per 100 g):  sodium > 400 mg, sugars > 10 g, saturated fat > 4 g
 *      liquids (per 100 ml): sodium > 300 mg, sugars > 5 g,  saturated fat > 3 g
 *    (The regulation exempts some foods, e.g. single-ingredient ones; this is
 *    information for the shopper, not the official label.)
 *  - Nutri-Score, 2023 algorithm, for general foods and for beverages. For
 *    fats/oils/nuts, cheese and red meat the rules differ: we only show the
 *    grade Open Food Facts itself gives for those, never one of our own.
 *
 * OFF's own Nutri-Score always wins over ours when it has one.
 */

export interface Per100 {
  kcal?: number;
  sugars?: number;
  sat_fat?: number;
  salt?: number;
  sodium_mg?: number;
  protein?: number;
  fiber?: number;
  /** % fruit, vegetables and legumes. */
  fvl?: number;
  sweeteners?: boolean;
}

export type Grade = 'a' | 'b' | 'c' | 'd' | 'e';
export type RedFlag = 'sodium' | 'sugar' | 'sat_fat';

export const RED_LIMITS = {
  solid: { sodium_mg: 400, sugars: 10, sat_fat: 4 },
  liquid: { sodium_mg: 300, sugars: 5, sat_fat: 3 },
} as const;

function sodiumMg(p: Per100): number | undefined {
  if (p.sodium_mg != null) return p.sodium_mg;
  if (p.salt != null) return (p.salt / 2.5) * 1000;
  return undefined;
}

function saltG(p: Per100): number | undefined {
  if (p.salt != null) return p.salt;
  if (p.sodium_mg != null) return (p.sodium_mg / 1000) * 2.5;
  return undefined;
}

/** Red labels the values call for. Unknown values never trigger one. */
export function redFlags(p: Per100, liquid: boolean): RedFlag[] {
  const lim = liquid ? RED_LIMITS.liquid : RED_LIMITS.solid;
  const out: RedFlag[] = [];
  const na = sodiumMg(p);
  if (na != null && na > lim.sodium_mg) out.push('sodium');
  if (p.sugars != null && p.sugars > lim.sugars) out.push('sugar');
  if (p.sat_fat != null && p.sat_fat > lim.sat_fat) out.push('sat_fat');
  return out;
}

/** Points: how many of the ascending thresholds the value is above. */
function points(value: number, thresholds: number[]): number {
  let n = 0;
  for (const t of thresholds) if (value > t) n++;
  return n;
}

// ─── Nutri-Score 2023: general foods ─────────────────────────────────────────
const G_ENERGY_KJ = [335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350];
const G_SUGARS = [3.4, 6.8, 10, 14, 17, 20, 24, 27, 31, 34, 37, 41, 44, 48, 51];
const G_SAT_FAT = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const G_SALT = [0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.4, 2.6, 2.8, 3, 3.2, 3.4, 3.6, 3.8, 4];
const G_PROTEIN = [2.4, 4.8, 7.2, 9.6, 12, 14, 17];
const G_FIBER = [3, 4.1, 5.2, 6.3, 7.4];

// ─── Nutri-Score 2023: beverages ─────────────────────────────────────────────
const B_ENERGY_KJ = [30, 90, 150, 210, 240, 270, 300, 330, 360, 390];
const B_SUGARS = [0.5, 2, 3.5, 5, 6, 7, 8, 9, 10, 11];
const B_PROTEIN = [1.2, 1.5, 1.8, 2.1, 2.4, 2.7, 3];

function fvlPoints(fvl: number, beverage: boolean): number {
  if (beverage) return fvl > 80 ? 6 : fvl > 60 ? 4 : fvl > 40 ? 2 : 0;
  return fvl > 80 ? 5 : fvl > 60 ? 2 : fvl > 40 ? 1 : 0;
}

/**
 * Nutri-Score we calculate, or null when a required value (energy, sugars,
 * saturated fat, salt) is missing. Protein, fibre and fruit/veg count as 0 when
 * unknown, which can only make the grade worse, never better.
 */
export function nutriScore(p: Per100, beverage: boolean, opts: { water?: boolean } = {}): { grade: Grade; score: number } | null {
  if (beverage && opts.water) return { grade: 'a', score: -99 };
  const salt = saltG(p);
  if (p.kcal == null || p.sugars == null || p.sat_fat == null || salt == null) return null;
  const kj = p.kcal * 4.184;
  const fvl = fvlPoints(p.fvl ?? 0, beverage);
  const fiber = points(p.fiber ?? 0, G_FIBER);

  if (beverage) {
    const neg = points(kj, B_ENERGY_KJ) + points(p.sugars, B_SUGARS) + points(p.sat_fat, G_SAT_FAT) + points(salt, G_SALT) + (p.sweeteners ? 4 : 0);
    const score = neg - (points(p.protein ?? 0, B_PROTEIN) + fiber + fvl);
    const grade: Grade = score <= 2 ? 'b' : score <= 6 ? 'c' : score <= 9 ? 'd' : 'e';
    return { grade, score };
  }

  const neg = points(kj, G_ENERGY_KJ) + points(p.sugars, G_SUGARS) + points(p.sat_fat, G_SAT_FAT) + points(salt, G_SALT);
  const protein = points(p.protein ?? 0, G_PROTEIN);
  // Protein only counts when the negative points are below 11.
  const pos = neg >= 11 ? fiber + fvl : protein + fiber + fvl;
  const score = neg - pos;
  const grade: Grade = score <= 0 ? 'a' : score <= 2 ? 'b' : score <= 10 ? 'c' : score <= 18 ? 'd' : 'e';
  return { grade, score };
}

/** OFF category tags for which our general / beverage formula does not apply. */
const SPECIAL_CATEGORIES = [
  'en:fats', 'en:vegetable-oils', 'en:olive-oils', 'en:butters', 'en:margarines', 'en:nuts', 'en:seeds',
  'en:nut-butters', 'en:cheeses', 'en:red-meats', 'en:beef', 'en:lamb', 'en:pork',
];

export function isSpecialCategory(categoryTags: string[]): boolean {
  return categoryTags.some((t) => SPECIAL_CATEGORIES.includes(t));
}

// ─── Display ─────────────────────────────────────────────────────────────────

/** Official Nutri-Score colours. */
export const GRADE_COLOR: Record<Grade, string> = {
  a: '#038141', b: '#85BB2F', c: '#FECB02', d: '#EE8100', e: '#E63E11',
};

export const RED_FLAG_TEXT: Record<RedFlag, { he: string; en: string }> = {
  sodium: { he: 'נתרן', en: 'sodium' },
  sugar: { he: 'סוכרים', en: 'sugars' },
  sat_fat: { he: 'שומן רווי', en: 'saturated fat' },
};
