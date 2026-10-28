import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { fetchAllPages, fetchNearbyBranches, fetchBranchOverrides, nearestBranchPerChain, isMissingRelation, isMissingColumn, NearbyBranch } from '@/lib/geo';

// POST /api/prices/compare
// Body: { items: [{ product_id, quantity }], chain_ids?: string[], lat?, lng?, radius_km? }
//
// Phase 18 (branch-level pricing): when lat/lng are given, each chain is
// priced at its single NEAREST branch within radius_km (not a chain-wide
// average) — matching how a shopper would actually experience "the Rami Levy
// near me". Per spec, this is one representative branch per chain, not a
// different nearest branch per item; an item the nearest branch doesn't
// carry falls back to that chain's chain_prices value instead of
// silently vanishing (the hybrid-fallback architectural decision — see
// CLAUDE.md "Data architecture"), and is flagged per-item via `source` so
// the UI can show it as an approximation rather than a real branch price.
// Without lat/lng, behavior is unchanged from before this phase: chain-level
// chain_prices only, location_based: false.

interface BasketRequestItem {
  product_id: string;
  quantity: number;
}

interface ChainLevelRow {
  product_id: string;
  chain_id: string;
  price: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      items,
      chain_ids: chainIdFilterRaw,
      lat,
      lng,
      radius_km: radiusKmRaw,
    } = body as {
      items: BasketRequestItem[];
      chain_ids?: string[];
      lat?: number;
      lng?: number;
      radius_km?: number;
    };

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items array is required' }, { status: 400 });
    }

    const productIds = items.map((i) => i.product_id);
    const supabase = createServerClient();
    const chainIdFilter = Array.isArray(chainIdFilterRaw) && chainIdFilterRaw.length > 0 ? chainIdFilterRaw : null;
    const hasLocation = typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng);

    const { data: chains } = await supabase.from('chains').select('id, name_he, name_en, color_hex');
    const chainById = new Map((chains ?? []).map((c) => [c.id, c]));

    // Chain-level prices are always fetched — they're both the no-location
    // baseline AND the per-item fallback when a request has location but the
    // nearest branch doesn't carry a given item.
    let chainLevelRows: ChainLevelRow[] = [];
    try {
      chainLevelRows = await fetchAllPages<ChainLevelRow>((from, to) =>
        supabase.from('chain_prices').select('product_id, chain_id, price').in('product_id', productIds).range(from, to)
      );
    } catch (err) {
      if (!isMissingColumn(err)) throw err;
    }
    const chainLevelByProductChain = new Map<string, number>();
    for (const row of chainLevelRows) chainLevelByProductChain.set(`${row.product_id}:${row.chain_id}`, row.price);

    // Nearest branch per chain (Phase 18) — only computed when the request
    // has location.
    const nearestBranchByChain = new Map<string, NearbyBranch>();
    const branchPriceByProductChain = new Map<string, number>();
    let branchPricingAvailable = false;
    let radiusKm: number | null = null;

    if (hasLocation) {
      radiusKm = Math.min(radiusKmRaw || 15, 50);
      const nearbyBranches = await fetchNearbyBranches(supabase, lat!, lng!, radiusKm, chainIdFilter);

      for (const [chainId, branch] of nearestBranchPerChain(nearbyBranches)) nearestBranchByChain.set(chainId, branch);

      const nearestBranchIds = [...nearestBranchByChain.values()].map((b) => b.id);
      if (nearestBranchIds.length > 0) {
        try {
          // Migration 012: a branch's price is its override if it has one,
          // otherwise its chain's chain_prices price.
          const overrides = await fetchBranchOverrides(supabase, nearestBranchIds, productIds);
          branchPricingAvailable = true;
          for (const [chainId, branch] of nearestBranchByChain) {
            for (const productId of productIds) {
              const override = overrides.get(`${productId}:${branch.id}`);
              const price = override ? Number(override.price) : chainLevelByProductChain.get(`${productId}:${chainId}`);
              if (price !== undefined) branchPriceByProductChain.set(`${productId}:${chainId}`, price);
            }
          }
        } catch (err) {
          if (!isMissingRelation(err)) throw err;
          branchPricingAvailable = false;
        }
      }
    }

    // Chain scope: every chain either fallback (chain-level) or branch-level
    // has a price for, narrowed to chain_ids if given.
    const scopedChainIds = new Set<string>();
    for (const row of chainLevelRows) scopedChainIds.add(row.chain_id);
    for (const chainId of nearestBranchByChain.keys()) scopedChainIds.add(chainId);
    let chainIds = [...scopedChainIds];
    if (chainIdFilter) chainIds = chainIds.filter((id) => chainIdFilter.includes(id));

    const comparison: Array<{
      chain_id: string;
      name_he: string;
      name_en: string;
      color_hex: string;
      total: number;
      available_items: number;
      missing_items: string[];
      breakdown: Array<{ product_id: string; price: number | null; quantity: number; line_total: number | null; source: 'branch' | 'chain_fallback' | null }>;
      branch_id: string | null;
      branch_name: string | null;
      distance_km: number | null;
      location_based: boolean;
    }> = [];

    for (const chainId of chainIds) {
      const chain = chainById.get(chainId);
      const nearestBranch = nearestBranchByChain.get(chainId) ?? null;
      let total = 0;
      let availableCount = 0;
      const missingItems: string[] = [];
      const breakdown: Array<{ product_id: string; price: number | null; quantity: number; line_total: number | null; source: 'branch' | 'chain_fallback' | null }> = [];
      let usedBranchPriceForAnyItem = false;

      for (const item of items) {
        let price: number | null = null;
        let source: 'branch' | 'chain_fallback' | null = null;

        if (nearestBranch) {
          const branchPrice = branchPriceByProductChain.get(`${item.product_id}:${chainId}`);
          if (branchPrice !== undefined) {
            price = branchPrice;
            source = 'branch';
            usedBranchPriceForAnyItem = true;
          }
        }
        if (price === null) {
          const chainPrice = chainLevelByProductChain.get(`${item.product_id}:${chainId}`);
          if (chainPrice !== undefined) {
            price = chainPrice;
            source = 'chain_fallback';
          }
        }

        const lineTotal = price !== null ? price * item.quantity : null;
        if (price !== null) {
          total += lineTotal!;
          availableCount++;
        } else {
          missingItems.push(item.product_id);
        }
        breakdown.push({ product_id: item.product_id, price, quantity: item.quantity, line_total: lineTotal, source });
      }

      comparison.push({
        chain_id: chainId,
        name_he: chain?.name_he ?? chainId,
        name_en: chain?.name_en ?? chainId,
        color_hex: chain?.color_hex ?? '#6366f1',
        total: Math.round(total * 100) / 100,
        available_items: availableCount,
        missing_items: missingItems,
        breakdown,
        branch_id: nearestBranch?.id ?? null,
        branch_name: nearestBranch?.name_he ?? null,
        distance_km: nearestBranch ? Math.round(nearestBranch.distance_km * 10) / 10 : null,
        location_based: usedBranchPriceForAnyItem,
      });
    }

    const sorted = comparison.sort((a, b) => a.total - b.total);
    const cheapest = sorted[0] ?? null;
    const savings = sorted.length > 1 ? sorted[sorted.length - 1].total - sorted[0].total : 0;

    return NextResponse.json({
      comparison: sorted,
      cheapest_chain: cheapest?.chain_id ?? null,
      max_savings: Math.round(savings * 100) / 100,
      item_count: items.length,
      chains: chains ?? [],
      location_based: hasLocation,
      branch_pricing_available: hasLocation ? branchPricingAvailable : null,
      radius_km: radiusKm,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Compare failed';
    console.error('[prices/compare]', message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
