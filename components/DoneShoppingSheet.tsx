'use client';

/**
 * "Done shopping" (Plan v2, phase 2): pick where you shopped; the items in the
 * cart become a saved trip with an ESTIMATED total and are removed from the
 * list. Items still on the list stay for next time.
 */
import React, { useState } from 'react';
import { X, Loader2, Store } from 'lucide-react';
import { BasketItem, ChainMeta, OverrideMap, estimate } from '@/lib/list';

type Lang = 'he' | 'en';

const TEXT = {
  he: {
    title: 'איפה קניתם?', subtitle: (n: number) => `${n} פריטים בעגלה יישמרו כקנייה ויוסרו מהרשימה. השאר יישארו.`,
    other: 'חנות אחרת', otherNote: 'לפי המחיר הזול ביותר שידוע', priced: (p: number, n: number) => `${p} מתוך ${n} עם מחיר`,
    confirm: (s: string) => `שמור קנייה ב${s}`, estimate: 'הערכה', cheapest: 'הכי זול',
  },
  en: {
    title: 'Where did you shop?', subtitle: (n: number) => `The ${n} items in the cart are saved as a trip and removed from the list. Everything else stays.`,
    other: 'Another store', otherNote: 'using the cheapest known price', priced: (p: number, n: number) => `${p} of ${n} priced`,
    confirm: (s: string) => `Save trip at ${s}`, estimate: 'estimate', cheapest: 'Cheapest',
  },
};

export interface DoneShoppingSheetProps {
  items: BasketItem[];
  overrides: OverrideMap;
  chains: ChainMeta[];
  lang: Lang;
  /** Pre-selected: the user's chain. */
  homeChainId: string | null;
  onConfirm: (chainId: string | null, label: string) => Promise<void>;
  onClose: () => void;
}

export function DoneShoppingSheet({ items, overrides, chains, lang, homeChainId, onConfirm, onClose }: DoneShoppingSheetProps) {
  const tx = TEXT[lang];
  const options = chains
    .filter((c) => c.status !== 'in_development')
    .map((c) => ({ id: c.id as string | null, label: lang === 'he' ? c.name_he : c.name_en, color: c.color_hex, est: estimate(items, overrides, c.id) }))
    .sort((a, b) => b.est.priced - a.est.priced || a.est.total - b.est.total);
  const other = { id: null as string | null, label: tx.other, color: null as string | null, est: estimate(items, overrides, null) };
  const best = options.filter((o) => o.est.priced === items.length).sort((a, b) => a.est.total - b.est.total)[0];
  const [selected, setSelected] = useState<string | null | undefined>(homeChainId ?? undefined);
  const [busy, setBusy] = useState(false);
  const choice = selected === undefined ? null : [...options, other].find((o) => o.id === selected) ?? null;

  const confirm = async () => {
    if (!choice) return;
    setBusy(true);
    try {
      await onConfirm(choice.id, choice.label);
      onClose();
    } catch {
      setBusy(false);
    }
  };

  const option = (o: typeof other, note?: string) => {
    const isSel = selected !== undefined && selected === o.id;
    return (
      <button
        key={o.id ?? 'other'}
        type="button"
        onClick={() => setSelected(o.id)}
        aria-pressed={isSel}
        className={`w-full flex items-center gap-3 px-4 min-h-[60px] rounded-2xl border text-start transition-colors ${
          isSel ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10' : 'border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]'
        }`}
      >
        {o.color ? <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: o.color }} /> : <Store className="w-4 h-4 shrink-0 text-[var(--color-text-muted)]" />}
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-[var(--color-text-primary)] truncate">
            {o.label}
            {best && best.id === o.id && <span className="ms-2 text-[10px] font-bold text-[var(--color-success)]">{tx.cheapest}</span>}
          </span>
          <span className="block text-[11px] text-[var(--color-text-muted)]">{note ?? tx.priced(o.est.priced, o.est.count)}</span>
        </span>
        <span className="text-end shrink-0">
          <span className="block font-mono font-bold text-[var(--color-text-primary)]">₪{o.est.total.toFixed(2)}</span>
          <span className="block text-[10px] text-[var(--color-text-muted)]">{tx.estimate}</span>
        </span>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-[65] flex flex-col justify-end bg-black/50" onClick={onClose}>
      <div
        role="dialog"
        aria-label={tx.title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg mx-auto max-h-[92vh] overflow-y-auto rounded-t-3xl bg-[var(--color-bg-panel)] border border-[var(--color-border)] p-5 flex flex-col gap-3"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">{tx.title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -me-2 flex items-center justify-center text-[var(--color-text-muted)]">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">{tx.subtitle(items.length)}</p>
        {options.map((o) => option(o))}
        {option(other, `${tx.priced(other.est.priced, other.est.count)} · ${tx.otherNote}`)}
        <button
          type="button"
          disabled={!choice || busy}
          onClick={confirm}
          className="mt-2 w-full min-h-[48px] bg-[var(--color-success)] text-white rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {choice ? tx.confirm(choice.label) : tx.title}
        </button>
      </div>
    </div>
  );
}
