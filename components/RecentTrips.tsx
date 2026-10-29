'use client';

/**
 * Recent shopping trips (Plan v2, phase 2) — what each "Done shopping" saved:
 * store, date, estimated total, and how many items had a price. Tap a trip to
 * see its items. Full spending insights come in phase 8.
 */
import React, { useEffect, useState } from 'react';
import { ChevronDown, Receipt, Loader2 } from 'lucide-react';
import { supabase } from '@/utils/supabase';
import { categoryInfo } from '@/lib/categories';
import type { ChainMeta } from '@/lib/list';

type Lang = 'he' | 'en';

interface Trip {
  id: string;
  chain_id: string | null;
  store_label: string | null;
  done_at: string;
  est_total: number;
  item_count: number;
  priced_count: number;
}

interface TripItem {
  id: string;
  name: string;
  category: string | null;
  quantity: number;
  unit_price: number | null;
  price_source: string;
}

const TEXT = {
  he: { title: 'קניות אחרונות', empty: 'עוד אין קניות. סמנו פריטים ברשימה ולחצו "סיימתי קנייה".', priced: (p: number, n: number) => `${n} פריטים · ${p} עם מחיר`, est: 'משוער', yours: 'המחיר שלך', none: 'אין מחיר' },
  en: { title: 'Recent trips', empty: 'No trips yet. Check items on your list and tap “Done shopping”.', priced: (p: number, n: number) => `${n} items · ${p} priced`, est: 'estimated', yours: 'your price', none: 'no price' },
};

export function RecentTrips({ chains, lang, refreshKey }: { chains: ChainMeta[]; lang: Lang; refreshKey?: number }) {
  const tx = TEXT[lang];
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, TripItem[]>>({});

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('shopping_trips')
      .select('id, chain_id, store_label, done_at, est_total, item_count, priced_count')
      .order('done_at', { ascending: false })
      .limit(10)
      .then(({ data }) => setTrips((data ?? []).map((t) => ({ ...t, est_total: Number(t.est_total) }))));
  }, [refreshKey]);

  const toggle = async (id: string) => {
    setOpenId((cur) => (cur === id ? null : id));
    if (items[id] || !supabase) return;
    const { data } = await supabase.from('trip_items').select('id, name, category, quantity, unit_price, price_source').eq('trip_id', id);
    setItems((prev) => ({ ...prev, [id]: (data ?? []).map((i) => ({ ...i, unit_price: i.unit_price != null ? Number(i.unit_price) : null })) }));
  };

  const storeName = (t: Trip) => {
    const c = chains.find((x) => x.id === t.chain_id);
    return c ? (lang === 'he' ? c.name_he : c.name_en) : t.store_label ?? '—';
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-bold text-[var(--color-text-primary)] flex items-center gap-2">
        <Receipt className="w-5 h-5 text-[var(--color-accent)]" /> {tx.title}
      </h2>
      {trips === null ? (
        <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 text-[var(--color-accent)] animate-spin" /></div>
      ) : trips.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)] bg-[var(--color-bg-panel)]/60 rounded-2xl p-5 border border-[var(--color-border)]">{tx.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {trips.map((t) => (
            <li key={t.id} className="bg-[var(--color-bg-panel)]/60 border border-[var(--color-border)] rounded-2xl overflow-hidden">
              <button type="button" onClick={() => toggle(t.id)} className="w-full flex items-center gap-3 px-4 min-h-[60px] text-start">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-[var(--color-text-primary)] truncate">{storeName(t)}</span>
                  <span className="block text-[11px] text-[var(--color-text-muted)]">
                    {new Date(t.done_at).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short' })} · {tx.priced(t.priced_count, t.item_count)}
                  </span>
                </span>
                <span className="text-end">
                  <span className="block font-mono font-bold text-[var(--color-text-primary)]">₪{t.est_total.toFixed(2)}</span>
                  <span className="block text-[10px] text-[var(--color-text-muted)]">{tx.est}</span>
                </span>
                <ChevronDown className={`w-4 h-4 text-[var(--color-text-muted)] transition-transform ${openId === t.id ? 'rotate-180' : ''}`} />
              </button>
              {openId === t.id && (
                <ul className="px-4 pb-3 flex flex-col gap-1">
                  {(items[t.id] ?? []).map((i) => (
                    <li key={i.id} className="flex justify-between gap-2 text-xs py-1 border-t border-[var(--color-border)]/50">
                      <span className="min-w-0 truncate text-[var(--color-text-secondary)]">
                        <span aria-hidden>{categoryInfo(i.category).icon}</span> {i.name} × {i.quantity}
                      </span>
                      <span className="font-mono shrink-0 text-[var(--color-text-primary)]">
                        {i.unit_price != null ? `₪${(i.unit_price * i.quantity).toFixed(2)}` : tx.none}
                        {i.price_source === 'custom' && <span className="ms-1 text-[10px] text-[var(--color-text-muted)] font-sans">({tx.yours})</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
