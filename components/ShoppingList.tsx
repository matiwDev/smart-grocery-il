'use client';

/**
 * The shopping list (Plan v2, phase 2): items grouped by aisle, tap the circle
 * to put an item in the cart, tap the item to edit it. Checked items move to an
 * "In the cart" section; "Done shopping" turns them into a saved trip.
 * Every price shown is an estimate (see lib/list.ts).
 */
import React, { useState } from 'react';
import { Check, ChevronDown, ShoppingCart, Pencil } from 'lucide-react';
import { CATEGORIES } from '@/lib/categories';
import { BasketItem, OverrideMap, effective, estimate, unitPrice } from '@/lib/list';

type Lang = 'he' | 'en';

const TEXT = {
  he: {
    items: 'פריטים', inCart: 'בעגלה', estTotal: 'סה״כ משוער', priced: 'מתוך', pricedSuffix: 'עם מחיר',
    done: 'סיימתי קנייה', save: 'שמור רשימה', clear: 'נקה רשימה', empty: 'הרשימה ריקה. חפשו מוצר או הוסיפו פריט משלכם.',
    yourPrice: 'המחיר שלך', noPrice: 'אין מחיר', edited: 'נערך', check: 'סמן כנאסף', uncheck: 'החזר לרשימה',
  },
  en: {
    items: 'items', inCart: 'In the cart', estTotal: 'Estimated total', priced: 'of', pricedSuffix: 'priced',
    done: 'Done shopping', save: 'Save list', clear: 'Clear list', empty: 'Your list is empty. Search for a product or add your own item.',
    yourPrice: 'your price', noPrice: 'no price', edited: 'edited', check: 'Mark as picked', uncheck: 'Back to the list',
  },
};

export interface ShoppingListProps {
  items: BasketItem[];
  overrides: OverrideMap;
  lang: Lang;
  onToggle: (id: string) => void;
  onQuantity: (id: string, delta: number) => void;
  onEdit: (id: string) => void;
  onDone: () => void;
  onSave: () => void;
  onClear: () => void;
}

function Row({ item, overrides, lang, onToggle, onQuantity, onEdit }: {
  item: BasketItem; overrides: OverrideMap; lang: Lang;
  onToggle: () => void; onQuantity: (d: number) => void; onEdit: () => void;
}) {
  const tx = TEXT[lang];
  const eff = effective(item, overrides);
  const { price, source } = unitPrice(item, overrides, null);
  const line = price != null ? price * item.quantity : null;

  return (
    <div className={`flex items-center gap-2 px-2 min-h-[56px] rounded-2xl border transition-colors ${
      item.checked
        ? 'bg-[var(--color-bg-subtle)]/30 border-transparent'
        : 'bg-[var(--color-bg-subtle)]/50 border-[var(--color-border)]/50'
    }`}>
      <button
        type="button"
        onClick={onToggle}
        aria-label={item.checked ? tx.uncheck : tx.check}
        aria-pressed={item.checked}
        className="w-10 h-11 shrink-0 flex items-center justify-center"
      >
        <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
          item.checked ? 'bg-[var(--color-success)] border-[var(--color-success)] text-white' : 'border-[var(--color-border-strong,var(--color-border))]'
        }`}>
          {item.checked && <Check className="w-4 h-4" strokeWidth={3} />}
        </span>
      </button>

      <button type="button" onClick={onEdit} className="flex-1 min-w-0 flex items-center gap-2 text-start py-2">
        {eff.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={eff.image} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0 bg-[var(--color-bg-subtle)]" />
        )}
        <span className="min-w-0">
          <span className={`block text-sm font-semibold leading-snug line-clamp-2 break-words ${item.checked ? 'line-through text-[var(--color-text-muted)]' : 'text-[var(--color-text-primary)]'}`}>
            {eff.name}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)]">
            {source === 'custom' && <span>{tx.yourPrice}</span>}
            {source !== 'custom' && price != null && <span className="font-mono">₪{price.toFixed(2)}</span>}
            {price == null && <span>{tx.noPrice}</span>}
            {eff.edited && <><span>·</span><Pencil className="w-3 h-3" /><span>{tx.edited}</span></>}
          </span>
        </span>
      </button>

      <div className="flex items-center bg-[var(--color-bg-panel)] rounded-lg border border-[var(--color-border)] shrink-0">
        <button type="button" onClick={() => onQuantity(-1)} aria-label="−" className="w-7 h-9 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] rounded-lg">−</button>
        <span className="w-5 text-center font-mono text-sm font-medium text-[var(--color-text-primary)]">{item.quantity}</span>
        <button type="button" onClick={() => onQuantity(1)} aria-label="+" className="w-7 h-9 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] rounded-lg">+</button>
      </div>

      <span className={`w-[58px] text-end font-mono text-[13px] font-semibold shrink-0 ${line != null ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`}>
        {line != null ? `₪${line.toFixed(2)}` : '—'}
      </span>
    </div>
  );
}

export function ShoppingList({ items, overrides, lang, onToggle, onQuantity, onEdit, onDone, onSave, onClear }: ShoppingListProps) {
  const tx = TEXT[lang];
  const [cartOpen, setCartOpen] = useState(true);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center text-[var(--color-text-muted)] min-h-[220px] gap-3 px-6">
        <ShoppingCart className="w-12 h-12 opacity-40" />
        <p className="text-sm">{tx.empty}</p>
      </div>
    );
  }

  const open = items.filter((i) => !i.checked);
  const inCart = items.filter((i) => i.checked);
  const groups = CATEGORIES
    .map((c) => ({ cat: c, items: open.filter((i) => effective(i, overrides).category === c.key) }))
    .filter((g) => g.items.length > 0);
  const all = estimate(items, overrides, null);

  const row = (item: BasketItem) => (
    <Row
      key={item.id}
      item={item}
      overrides={overrides}
      lang={lang}
      onToggle={() => onToggle(item.id)}
      onQuantity={(d) => onQuantity(item.id, d)}
      onEdit={() => onEdit(item.id)}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-[var(--color-text-muted)]">
        {items.length} {tx.items} · {inCart.length} {lang === 'he' ? 'בעגלה' : 'in the cart'}
      </p>

      {groups.map(({ cat, items: groupItems }) => (
        <section key={cat.key} className="flex flex-col gap-2">
          <h3 className="text-xs font-bold text-[var(--color-text-secondary)] flex items-center gap-1.5">
            <span aria-hidden>{cat.icon}</span> {cat[lang]} <span className="font-normal text-[var(--color-text-muted)]">({groupItems.length})</span>
          </h3>
          {groupItems.map(row)}
        </section>
      ))}

      {inCart.length > 0 && (
        <section className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setCartOpen((o) => !o)}
            className="text-xs font-bold text-[var(--color-success)] flex items-center gap-1.5 text-start"
          >
            <ShoppingCart className="w-3.5 h-3.5" /> {tx.inCart} ({inCart.length})
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${cartOpen ? 'rotate-180' : ''}`} />
          </button>
          {cartOpen && inCart.map(row)}
        </section>
      )}

      <div className="pt-4 border-t border-[var(--color-border)] flex justify-between items-end gap-3">
        <div>
          <p className="text-[var(--color-text-muted)] text-sm">{tx.estTotal}</p>
          <p className="text-[11px] text-[var(--color-text-muted)]">
            {all.priced} {tx.priced} {all.count} {tx.pricedSuffix}
          </p>
        </div>
        <span className="text-3xl font-bold font-mono text-[var(--color-text-primary)]">₪{all.total.toFixed(2)}</span>
      </div>

      {inCart.length > 0 && (
        <button
          type="button"
          onClick={onDone}
          className="w-full min-h-[48px] bg-[var(--color-success)] hover:opacity-90 text-white rounded-xl text-sm font-bold transition-opacity flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4" strokeWidth={3} /> {tx.done} ({inCart.length})
        </button>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onSave}
          className="flex-1 min-h-[44px] bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-accent-text)] rounded-xl text-sm font-semibold transition-colors"
        >
          {tx.save}
        </button>
        <button
          type="button"
          onClick={onClear}
          className="flex-1 min-h-[44px] bg-[var(--color-bg-subtle)] hover:bg-[var(--color-danger)]/10 text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] border border-[var(--color-border)] rounded-xl text-sm font-semibold transition-colors"
        >
          {tx.clear}
        </button>
      </div>
    </div>
  );
}
