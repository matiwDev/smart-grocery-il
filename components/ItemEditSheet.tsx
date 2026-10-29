'use client';

/**
 * Edit any list item (Plan v2, phase 2): name, aisle category, your own price
 * and a photo. For catalog products the edit is saved for the whole household
 * (product_overrides) and shows wherever the product appears; for free-text
 * items it is saved on the list item itself.
 */
import React, { useRef, useState } from 'react';
import { X, Camera, Trash2, RotateCcw, Loader2, Barcode } from 'lucide-react';
import { CATEGORIES, normalizeCategory } from '@/lib/categories';
import { BasketItem, ChainMeta, OverrideMap, effective } from '@/lib/list';

type Lang = 'he' | 'en';

const TEXT = {
  he: {
    title: 'עריכת פריט', name: 'שם', category: 'מחלקה', myPrice: 'המחיר שלי (₪)', photo: 'תמונה',
    addPhoto: 'הוסף תמונה', changePhoto: 'החלף תמונה', removePhoto: 'הסר תמונה',
    priceHint: (p: string) => `השאירו ריק כדי להשתמש בהערכה (${p})`, noEstimate: 'אין הערכת מחיר לפריט הזה',
    estimates: 'מחיר משוער ברשתות', householdNote: 'השינויים נשמרים למוצר הזה בכל משק הבית.',
    save: 'שמור', remove: 'הסר מהרשימה', reset: 'חזור לפרטי הקטלוג', uploading: 'מעלה…', photoError: 'העלאת התמונה נכשלה',
  },
  en: {
    title: 'Edit item', name: 'Name', category: 'Aisle', myPrice: 'My price (₪)', photo: 'Photo',
    addPhoto: 'Add photo', changePhoto: 'Change photo', removePhoto: 'Remove photo',
    priceHint: (p: string) => `Leave empty to use the estimate (${p})`, noEstimate: 'No price estimate for this item',
    estimates: 'Estimated price by chain', householdNote: 'Changes are saved for this product across your household.',
    save: 'Save', remove: 'Remove from list', reset: 'Back to catalog details', uploading: 'Uploading…', photoError: 'Photo upload failed',
  },
};

export interface ItemEditValues {
  name: string;
  category: string;
  price: number | null;
  image: string | null;
}

export interface ItemEditSheetProps {
  item: BasketItem;
  overrides: OverrideMap;
  chains: ChainMeta[];
  lang: Lang;
  onUploadPhoto: (file: File) => Promise<string>;
  onSave: (values: ItemEditValues) => Promise<void>;
  onReset: () => Promise<void>;
  onRemove: () => Promise<void>;
  onClose: () => void;
}

export function ItemEditSheet({ item, overrides, chains, lang, onUploadPhoto, onSave, onReset, onRemove, onClose }: ItemEditSheetProps) {
  const tx = TEXT[lang];
  const eff = effective(item, overrides);
  const [name, setName] = useState(eff.name);
  const [category, setCategory] = useState<string>(eff.category);
  const [price, setPrice] = useState(eff.myPrice != null ? String(eff.myPrice) : '');
  const [image, setImage] = useState<string | null>(eff.image);
  const [busy, setBusy] = useState<'save' | 'photo' | 'other' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const estimates = Object.values(item.prices)
    .map((cp) => ({ cp, chain: chains.find((c) => c.id === cp.chain_id) }))
    .filter((e) => e.chain)
    .sort((a, b) => a.cp.price - b.cp.price);
  const cheapest = item.min_price != null ? `₪${item.min_price.toFixed(2)}` : null;

  const run = async (kind: 'save' | 'other', fn: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy('photo');
    setError(null);
    try {
      setImage(await onUploadPhoto(file));
    } catch {
      setError(tx.photoError);
    }
    setBusy(null);
  };

  const parsedPrice = price.trim() === '' ? null : Number(price.replace(',', '.'));
  const priceInvalid = parsedPrice != null && (!Number.isFinite(parsedPrice) || parsedPrice < 0);

  const label = 'block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5';
  const input = 'w-full min-h-[44px] bg-[var(--color-bg-subtle)]/60 border border-[var(--color-border)] rounded-xl px-3 text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]';

  return (
    <div className="fixed inset-0 z-[65] flex flex-col justify-end bg-black/50" onClick={onClose}>
      <div
        role="dialog"
        aria-label={tx.title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg mx-auto max-h-[92vh] overflow-y-auto rounded-t-3xl bg-[var(--color-bg-panel)] border border-[var(--color-border)] p-5 flex flex-col gap-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">{tx.title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -me-2 flex items-center justify-center text-[var(--color-text-muted)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-4 items-start">
          <div className="shrink-0 flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label={image ? tx.changePhoto : tx.addPhoto}
              className="w-20 h-20 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-subtle)] flex items-center justify-center overflow-hidden text-[var(--color-text-muted)]"
            >
              {busy === 'photo' ? <Loader2 className="w-5 h-5 animate-spin" /> : image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="" className="w-full h-full object-cover" />
              ) : <Camera className="w-6 h-6" />}
            </button>
            {image && (
              <button type="button" onClick={() => setImage(null)} className="text-[11px] text-[var(--color-text-muted)] underline">{tx.removePhoto}</button>
            )}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} />
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-3">
            <div>
              <label className={label} htmlFor="item-name">{tx.name}</label>
              <input id="item-name" className={input} value={name} onChange={(e) => setName(e.target.value)} dir="auto" />
            </div>
            <div>
              <label className={label} htmlFor="item-category">{tx.category}</label>
              <select id="item-category" className={input} value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.icon} {c[lang]}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div>
          <label className={label} htmlFor="item-price">{tx.myPrice}</label>
          <input
            id="item-price"
            className={`${input} font-mono ${priceInvalid ? 'ring-2 ring-[var(--color-danger)]' : ''}`}
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={cheapest ?? ''}
            dir="ltr"
          />
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">{cheapest ? tx.priceHint(cheapest) : tx.noEstimate}</p>
        </div>

        {estimates.length > 0 && (
          <div>
            <p className={label}>{tx.estimates}</p>
            <ul className="flex flex-col gap-1">
              {estimates.map(({ cp, chain }) => (
                <li key={cp.chain_id} className="flex justify-between text-xs px-3 py-2 rounded-lg bg-[var(--color-bg-subtle)]/60">
                  <span className="text-[var(--color-text-secondary)]">{lang === 'he' ? chain!.name_he : chain!.name_en}</span>
                  <span className="font-mono text-[var(--color-text-primary)]">₪{cp.price.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {item.barcode && (
          <p className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)] font-mono"><Barcode className="w-3.5 h-3.5" /> {item.barcode}</p>
        )}
        {item.productId && <p className="text-[11px] text-[var(--color-text-muted)]">{tx.householdNote}</p>}
        {error && <p className="text-xs font-semibold text-[var(--color-danger)]">{error}</p>}

        <button
          type="button"
          disabled={!name.trim() || priceInvalid || busy !== null}
          onClick={() => run('save', () => onSave({ name: name.trim(), category: normalizeCategory(category), price: parsedPrice, image }))}
          className="w-full min-h-[48px] bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-accent-text)] rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />} {tx.save}
        </button>
        <div className="flex gap-3">
          {item.productId && eff.edited && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run('other', onReset)}
              className="flex-1 min-h-[44px] rounded-xl border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text-secondary)] flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" /> {tx.reset}
            </button>
          )}
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run('other', onRemove)}
            className="flex-1 min-h-[44px] rounded-xl border border-[var(--color-danger)]/30 text-sm font-semibold text-[var(--color-danger)] flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" /> {tx.remove}
          </button>
        </div>
      </div>
    </div>
  );
}
