// Builds lib/data/tzameret.json from the Ministry of Health food composition
// files (צמרת, data.gov.il "nutrition-database") in data/tzameret/:
//   moh_mitzrachim.csv                  foods, nutrients per 100 g
//   moh_yehidot_mida_lemitzrachim.csv   grams per household measure, per food
// Run: npm run tzameret:build   (only when the Ministry publishes a new version)
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), 'data', 'tzameret');

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"' && field === '') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  const keys = head.map((h) => h.replace(/^﻿/, '').trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

const num = (s) => { if (s === '' || s == null) return null; const n = Number(s); return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; };

// Household measures worth keeping (see moh_yehidot_mida.csv for names).
const KEEP_UNITS = new Set([100, 101, 102, 103, 104, 105, 200, 201, 207, 300, 301, 302, 400, 401, 402, 500, 501, 502, 503,
  800, 802, 901, 903, 906, 1104, 1203, 1205, 1211, 1215, 1217, 1218, 1224, 1226, 1227]);

const foods = parseCsv(fs.readFileSync(path.join(dir, 'moh_mitzrachim.csv'), 'utf8')).map((r) => ({
  c: Number(r.Code),
  he: r.shmmitzrach.replace(/\s+/g, ' ').trim(),
  en: (r.english_name || '').replace(/\s+/g, ' ').trim(),
  // kcal, protein, fat, saturated fat, carbs, sugars, fiber, sodium (mg) — per 100 g
  n: [num(r.food_energy), num(r.protein), num(r.total_fat), num(r.saturated_fat), num(r.carbohydrates),
    num(r.total_sugars), num(r.total_dietary_fiber), num(r.sodium)],
})).filter((f) => f.c && f.he && f.n[0] != null);

const measures = {};
for (const r of parseCsv(fs.readFileSync(path.join(dir, 'moh_yehidot_mida_lemitzrachim.csv'), 'utf8'))) {
  const food = Number(r.mmitzrach), unit = Number(r.mida), g = num(r.mishkal);
  if (!food || !KEEP_UNITS.has(unit) || !g || g <= 0) continue;
  (measures[food] ??= []).push([unit, g]);
}

const out = {
  source: 'Israel Ministry of Health, Tzameret food composition database (data.gov.il, nutrition-database)',
  built: new Date().toISOString().slice(0, 10),
  foods,
  measures,
};
const file = path.join(process.cwd(), 'lib', 'data', 'tzameret.json');
fs.writeFileSync(file, JSON.stringify(out));
console.log(`${foods.length} foods, ${Object.keys(measures).length} with measures → ${file} (${Math.round(fs.statSync(file).size / 1024)} KB)`);
