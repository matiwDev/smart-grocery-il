'use client';

/**
 * Health grade display (Plan v2, phase 5): a Nutri-Score letter chip and
 * Israel's red labels, plus the item sheet's full panel with nutrition per
 * 100 g and the Open Food Facts attribution (ODbL).
 */
import React from 'react';
import { GRADE_COLOR, Grade, Per100, RED_FLAG_TEXT, RedFlag } from '@/lib/health';
import type { ProductInfoRow } from '@/lib/off';

type Lang = 'he' | 'en';

const TEXT = {
  he: {
    health: 'בריאות ותזונה', nutri: 'Nutri-Score', calc: 'מחושב מהערכים התזונתיים', off: 'לפי Open Food Facts',
    high: (what: string) => `כמות גבוהה של ${what}`, noRed: 'אין סימון אדום', per100: (liquid: boolean) => (liquid ? 'ל-100 מ״ל' : 'ל-100 גרם'),
    kcal: 'אנרגיה (קק״ל)', sugars: 'סוכרים (ג׳)', sat_fat: 'שומן רווי (ג׳)', sodium: 'נתרן (מ״ג)', protein: 'חלבונים (ג׳)', fiber: 'סיבים (ג׳)',
    noData: 'אין ערכים תזונתיים למוצר הזה ב-Open Food Facts.', notFound: 'המוצר לא נמצא ב-Open Food Facts.',
    source: 'מקור: Open Food Facts (ODbL). הסימון האדום מחושב לפי ספי משרד הבריאות ואינו הסימון הרשמי.',
    redTitle: (n: number) => `${n} סימונים אדומים`,
  },
  en: {
    health: 'Health & nutrition', nutri: 'Nutri-Score', calc: 'calculated from the nutrition values', off: 'from Open Food Facts',
    high: (what: string) => `High in ${what}`, noRed: 'No red labels', per100: (liquid: boolean) => (liquid ? 'per 100 ml' : 'per 100 g'),
    kcal: 'Energy (kcal)', sugars: 'Sugars (g)', sat_fat: 'Saturated fat (g)', sodium: 'Sodium (mg)', protein: 'Protein (g)', fiber: 'Fibre (g)',
    noData: 'Open Food Facts has no nutrition values for this product.', notFound: 'This product is not in Open Food Facts.',
    source: 'Source: Open Food Facts (ODbL). Red labels are calculated from the Ministry of Health thresholds, not the official label.',
    redTitle: (n: number) => `${n} red label${n === 1 ? '' : 's'}`,
  },
};

/** Small coloured letter, for the list row. */
export function NutriChip({ grade, size = 'sm' }: { grade: Grade; size?: 'sm' | 'lg' }) {
  const dark = grade === 'c'; // yellow needs dark text
  const cls = size === 'lg' ? 'w-9 h-9 text-lg rounded-xl' : 'w-4 h-4 text-[10px] rounded';
  return (
    <span
      aria-label={`Nutri-Score ${grade.toUpperCase()}`}
      title={`Nutri-Score ${grade.toUpperCase()}`}
      className={`${cls} inline-flex items-center justify-center font-black leading-none shrink-0`}
      style={{ background: GRADE_COLOR[grade], color: dark ? '#3d3200' : '#fff' }}
    >
      {grade.toUpperCase()}
    </span>
  );
}

/** Red-label count for the list row: a small red octagon with the number. */
export function RedCount({ flags, lang }: { flags: string[]; lang: Lang }) {
  if (flags.length === 0) return null;
  const label = `${TEXT[lang].redTitle(flags.length)}: ${flags.map((f) => RED_FLAG_TEXT[f as RedFlag]?.[lang] ?? f).join(', ')}`;
  return (
    <span aria-label={label} title={label} className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-black text-white bg-[#d71920] shrink-0"
      style={{ clipPath: 'polygon(30% 0,70% 0,100% 30%,100% 70%,70% 100%,30% 100%,0 70%,0 30%)' }}>
      {flags.length}
    </span>
  );
}

function fmt(v: number | undefined, digits = 1) {
  return v == null ? '—' : String(Math.round(v * 10 ** digits) / 10 ** digits);
}

/** The item sheet's section. Nothing for products not in our catalog. */
export function HealthPanel({ info, lang }: { info: ProductInfoRow | undefined; lang: Lang }) {
  const tx = TEXT[lang];
  if (!info) return null;
  const label = 'block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5';
  if (info.status === 'not_found') {
    return (
      <div>
        <p className={label}>{tx.health}</p>
        <p className="text-[11px] text-[var(--color-text-muted)]">{tx.notFound}</p>
      </div>
    );
  }
  const p: Per100 = info.per100 ?? {};
  const liquid = info.is_beverage;
  const sodium = p.sodium_mg ?? (p.salt != null ? (p.salt / 2.5) * 1000 : undefined);
  const rows: Array<[string, string, boolean]> = [
    [tx.kcal, fmt(p.kcal, 0), false],
    [tx.sugars, fmt(p.sugars), info.red_flags.includes('sugar')],
    [tx.sat_fat, fmt(p.sat_fat), info.red_flags.includes('sat_fat')],
    [tx.sodium, fmt(sodium, 0), info.red_flags.includes('sodium')],
    [tx.protein, fmt(p.protein), false],
    [tx.fiber, fmt(p.fiber), false],
  ];

  return (
    <div className="flex flex-col gap-2">
      <p className={label}>{tx.health}</p>
      {info.nutriscore && (
        <div className="flex items-center gap-3">
          <NutriChip grade={info.nutriscore as Grade} size="lg" />
          <div className="text-xs">
            <p className="font-semibold text-[var(--color-text-primary)]">{tx.nutri} {info.nutriscore.toUpperCase()}</p>
            <p className="text-[var(--color-text-muted)]">{info.nutriscore_source === 'calc' ? tx.calc : tx.off}</p>
          </div>
        </div>
      )}
      {info.per100 ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {info.red_flags.length === 0 ? (
              <span className="text-[11px] text-[var(--color-text-muted)]">{tx.noRed}</span>
            ) : info.red_flags.map((f) => (
              <span key={f} className="px-2 py-1 rounded-md bg-[#d71920] text-white text-[11px] font-bold">
                {tx.high(RED_FLAG_TEXT[f as RedFlag]?.[lang] ?? f)}
              </span>
            ))}
          </div>
          <table className="w-full text-xs">
            <caption className="text-start text-[11px] text-[var(--color-text-muted)] pb-1">{tx.per100(liquid)}</caption>
            <tbody>
              {rows.map(([k, v, red]) => (
                <tr key={k} className="border-t border-[var(--color-border)]/50">
                  <td className="py-1.5 text-[var(--color-text-secondary)]">{k}</td>
                  <td className={`py-1.5 text-end font-mono ${red ? 'text-[#d71920] font-bold' : 'text-[var(--color-text-primary)]'}`}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="text-[11px] text-[var(--color-text-muted)]">{tx.noData}</p>
      )}
      <p className="text-[10px] text-[var(--color-text-muted)]">{tx.source}</p>
    </div>
  );
}
