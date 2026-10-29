'use client';

/**
 * Pick the one chain you shop at (saved on your profile). Search then shows
 * only that chain's products, and the list and trip estimates use its prices.
 * Opens by itself the first time (no chain yet), and from the store chip on Home.
 */
import React from 'react';
import { X, Check } from 'lucide-react';
import type { ChainMeta } from '@/lib/list';

type Lang = 'he' | 'en';

const TEXT = {
  he: {
    title: 'באיזו רשת אתם קונים?',
    subtitle: 'תראו את המוצרים והמחירים של הרשת הזו. אפשר להחליף בכל רגע.',
    soon: 'בקרוב',
  },
  en: {
    title: 'Where do you shop?',
    subtitle: "You'll see this chain's products and prices. You can change it any time.",
    soon: 'Coming soon',
  },
};

export function ChainPickerSheet({ chains, current, lang, onPick, onClose }: {
  chains: ChainMeta[];
  current: string | null;
  lang: Lang;
  onPick: (chainId: string) => void;
  /** Absent = can't be dismissed (first-time choice). */
  onClose?: () => void;
}) {
  const tx = TEXT[lang];
  const sorted = [...chains].sort((a, b) => Number(a.status === 'in_development') - Number(b.status === 'in_development'));
  return (
    <div className="fixed inset-0 z-[66] flex flex-col justify-end bg-black/50" onClick={onClose}>
      <div
        role="dialog"
        aria-label={tx.title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg mx-auto max-h-[92vh] overflow-y-auto rounded-t-3xl bg-[var(--color-bg-panel)] border border-[var(--color-border)] p-5 flex flex-col gap-3"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">{tx.title}</h2>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -me-2 flex items-center justify-center text-[var(--color-text-muted)]">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">{tx.subtitle}</p>
        {sorted.map((c) => {
          const soon = c.status === 'in_development';
          const isCurrent = c.id === current;
          return (
            <button
              key={c.id}
              type="button"
              disabled={soon}
              onClick={() => onPick(c.id)}
              aria-pressed={isCurrent}
              className={`w-full flex items-center gap-3 px-4 min-h-[56px] rounded-2xl border text-start transition-colors ${
                isCurrent ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10' : 'border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]'
              } ${soon ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span className="w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: c.color_hex }} />
              <span className="flex-1 text-sm font-semibold text-[var(--color-text-primary)]">{lang === 'he' ? c.name_he : c.name_en}</span>
              {soon && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-dashed border-[var(--color-border)] text-[var(--color-text-secondary)]">{tx.soon}</span>}
              {isCurrent && <Check className="w-4 h-4 text-[var(--color-accent)]" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
