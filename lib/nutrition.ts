/**
 * Daily nutrition targets per person (Plan v2, phase 7).
 *
 * Energy: the US/Canadian Dietary Reference Intakes "Estimated Energy
 * Requirement" equations (IOM 2005), which use age, sex, height, weight and
 * physical activity, for children and adults alike. Shown as a ±10% range:
 * these are population estimates, not a prescription.
 * Macros: the Acceptable Macronutrient Distribution Ranges (share of energy).
 * Fiber 14 g per 1,000 kcal. Sodium: the Chronic Disease Risk Reduction
 * intake by age. Saturated fat and sugars: under 10% of energy (WHO / Israel's
 * Ministry of Health guidance; we only know TOTAL sugars, so it's a guide).
 *
 * Missing height or weight → a typical value for the age and sex is used and
 * the targets are marked approximate. Under 2 years: no targets (babies' needs
 * are a matter for the clinic, not an app).
 */

export type Sex = 'male' | 'female';
export type Activity = 'sedentary' | 'light' | 'active' | 'very_active';
export const ACTIVITIES: Activity[] = ['sedentary', 'light', 'active', 'very_active'];

export interface Body {
  birth_year: number | null;
  sex: Sex | null;
  activity: Activity;
  height_cm: number | null;
  weight_kg: number | null;
}

export const EMPTY_BODY: Body = { birth_year: null, sex: null, activity: 'light', height_cm: null, weight_kg: null };

export type Range = [number, number];

export interface Targets {
  kcal: Range;
  protein_g: Range;
  fat_g: Range;
  carbs_g: Range;
  fiber_g_min: number;
  sodium_mg_max: number;
  sat_fat_g_max: number;
  sugars_g_max: number;
  /** A typical height/weight was used for this age. */
  approx: boolean;
  age: number;
}

// Physical-activity coefficients (IOM 2005): sedentary, low active, active, very active.
const PA: Record<'child' | 'adult', Record<Sex, Record<Activity, number>>> = {
  child: {
    male: { sedentary: 1.0, light: 1.13, active: 1.26, very_active: 1.42 },
    female: { sedentary: 1.0, light: 1.16, active: 1.31, very_active: 1.56 },
  },
  adult: {
    male: { sedentary: 1.0, light: 1.11, active: 1.25, very_active: 1.48 },
    female: { sedentary: 1.0, light: 1.12, active: 1.27, very_active: 1.45 },
  },
};

// Typical (about median) weight kg / height cm by age, for when they weren't entered.
const TYPICAL: Record<Sex, Record<number, [number, number]>> = {
  male: {
    2: [12.5, 87], 3: [14.3, 96], 4: [16.3, 103], 5: [18.4, 110], 6: [20.7, 116], 7: [23, 122], 8: [25.6, 128], 9: [28.6, 133],
    10: [32, 138], 11: [35.6, 143], 12: [39.9, 149], 13: [45.3, 156], 14: [50.8, 164], 15: [56, 170], 16: [60.8, 173],
    17: [64.4, 175], 18: [66.9, 176], 19: [77, 176],
  },
  female: {
    2: [12, 86], 3: [14, 95], 4: [15.9, 102], 5: [17.9, 109], 6: [20.2, 115], 7: [22.4, 121], 8: [25, 127], 9: [28.2, 133],
    10: [32, 138], 11: [36.9, 144], 12: [41.5, 151], 13: [45.8, 157], 14: [49.4, 160], 15: [52, 162], 16: [53.9, 162],
    17: [56, 163], 18: [56.6, 163], 19: [63, 163],
  },
};

export function ageFrom(birthYear: number | null, now = new Date()): number | null {
  if (!birthYear) return null;
  const a = now.getFullYear() - birthYear;
  return a >= 0 && a < 120 ? a : null;
}

/** Estimated energy requirement, kcal/day (IOM 2005). */
function eer(age: number, sex: Sex, activity: Activity, kg: number, m: number): number {
  if (age < 3) return 89 * kg - 100 + 20;
  if (age < 19) {
    const pa = PA.child[sex][activity];
    const growth = age <= 8 ? 20 : 25;
    return sex === 'male'
      ? 88.5 - 61.9 * age + pa * (26.7 * kg + 903 * m) + growth
      : 135.3 - 30.8 * age + pa * (10.0 * kg + 934 * m) + growth;
  }
  const pa = PA.adult[sex][activity];
  return sex === 'male'
    ? 662 - 9.53 * age + pa * (15.91 * kg + 539.6 * m)
    : 354 - 6.91 * age + pa * (9.36 * kg + 726 * m);
}

const round = (n: number, step: number) => Math.round(n / step) * step;

/** Daily targets, or null when age or sex is unknown, or for children under 2. */
export function targetsFor(body: Body, now = new Date()): Targets | null {
  const age = ageFrom(body.birth_year, now);
  if (age == null || !body.sex || age < 2) return null;
  const typical = TYPICAL[body.sex][Math.min(19, age)];
  const kg = body.weight_kg ?? typical[0];
  const cm = body.height_cm ?? typical[1];
  const approx = body.weight_kg == null || body.height_cm == null;
  const kcal = Math.max(800, eer(age, body.sex, body.activity, kg, cm / 100));

  const amdr = age <= 3
    ? { protein: [0.05, 0.20], fat: [0.30, 0.40], carbs: [0.45, 0.65] }
    : age <= 18
      ? { protein: [0.10, 0.30], fat: [0.25, 0.35], carbs: [0.45, 0.65] }
      : { protein: [0.10, 0.35], fat: [0.20, 0.35], carbs: [0.45, 0.65] };
  const grams = (share: number[], kcalPerG: number): Range => [round((kcal * share[0]) / kcalPerG, 5), round((kcal * share[1]) / kcalPerG, 5)];
  // Never below the protein RDA (g per kg body weight).
  const rda = (age <= 3 ? 1.05 : age <= 13 ? 0.95 : age <= 18 ? 0.85 : 0.8) * kg;
  const protein = grams(amdr.protein, 4);
  protein[0] = Math.max(protein[0], round(rda, 5));

  return {
    kcal: [round(kcal * 0.9, 50), round(kcal * 1.1, 50)],
    protein_g: protein,
    fat_g: grams(amdr.fat, 9),
    carbs_g: grams(amdr.carbs, 4),
    fiber_g_min: Math.round((kcal / 1000) * 14),
    sodium_mg_max: age <= 3 ? 1200 : age <= 8 ? 1500 : age <= 13 ? 1800 : 2300,
    sat_fat_g_max: Math.round((kcal * 0.1) / 9),
    sugars_g_max: Math.round((kcal * 0.1) / 4),
    approx,
    age,
  };
}
