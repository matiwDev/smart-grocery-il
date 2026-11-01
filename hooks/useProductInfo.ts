'use client';

/**
 * Photo, nutrition and health grade for the catalog products on screen
 * (Plan v2, phase 5). Asks /api/products/info for ids it hasn't seen this
 * session; the server answers from its cache and looks up a few new products
 * per call, so while `pending` > 0 we ask again after a short pause (a few
 * rounds at most — anything left is picked up next time the list changes).
 */
import { useEffect, useState } from 'react';
import { authFetch } from '@/utils/authFetch';
import type { ProductInfoRow } from '@/lib/off';

export type ProductInfoMap = Record<string, ProductInfoRow>;

const known: ProductInfoMap = {};
const asked = new Set<string>();
const ROUND_DELAY_MS = 2500;
const MAX_ROUNDS = 6;

export function useProductInfo(productIds: string[], enabled: boolean): ProductInfoMap {
  const [info, setInfo] = useState<ProductInfoMap>(() => ({ ...known }));
  const key = [...new Set(productIds)].sort().join(',');

  useEffect(() => {
    if (!enabled || !key) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ids = key.split(',').filter((id) => !asked.has(id));
    if (ids.length === 0) { setInfo({ ...known }); return; }

    const round = async (n: number) => {
      try {
        const res = await authFetch('/api/products/info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids }),
        });
        if (!res.ok) return;
        const j = (await res.json()) as { info: ProductInfoMap; pending: number };
        Object.assign(known, j.info);
        for (const id of Object.keys(j.info)) if (j.info[id].status) asked.add(id);
        if (cancelled) return;
        setInfo({ ...known });
        if (j.pending > 0 && n + 1 < MAX_ROUNDS) timer = setTimeout(() => round(n + 1), ROUND_DELAY_MS);
        else for (const id of ids) asked.add(id); // don't keep retrying this session
      } catch {
        /* offline: try again next time */
      }
    };
    round(0);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [key, enabled]);

  return info;
}
