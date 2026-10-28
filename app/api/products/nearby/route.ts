import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { fetchAllPages, fetchNearbyBranches, fetchBranchOverrides, nearestBranchPerChain } from '@/lib/geo';

// GET /api/products/nearby?lat=..&lng=..&radius_km=15&chain_ids=a,b&q=..&limit=20
//
// Location-scoped product search. /api/products/search stays as the
// no-location fallback.
//
// Price model (migration 012): chain_prices holds the price most branches of
// a chain charge; branch_price_overrides holds only the branches that differ.
// Each chain is priced at its NEAREST branch within radius: override if that
// branch has one, else the chain price (which is, by construction, what that
// branch charges). `source: 'branch'` means "price at the named nearby
// branch"; 'chain_fallback' is only used when the chain has no branch with
// coordinates nearby but chain_ids explicitly asked for it.
//
// Caveat of the storage-light model: we no longer store per-branch
// availability, so a nearby branch is assumed to carry every product its
// chain publishes.

const DEFAULT_RADIUS_KM = 15;
const MAX_RADIUS_KM = 50;
const DEFAULT_LIMIT = 20;

interface ChainPriceRow {
  product_id: string;
  chain_id: string;
  price: number;
  unit_qty: number;
  unit_type: string;
  is_sale: boolean;
  captured_at: string;
}

type PriceEntry = {
  chain_id: string;
  price: number;
  unit_qty: number;
  unit_type: string;
  is_sale: boolean;
  captured_at: string;
  branch_id: string | null;
  branch_name: string | null;
  distance_km: number | null;
  chain_color: string | null;
  source: 'branch' | 'chain_fallback';
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = Number(searchParams.get('lat'));
    const lng = Number(searchParams.get('lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: 'lat and lng query params are required' }, { status: 400 });
    }

    const radiusKm = Math.min(Number(searchParams.get('radius_km')) || DEFAULT_RADIUS_KM, MAX_RADIUS_KM);
    const chainIdFilter = searchParams.get('chain_ids')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
    const q = searchParams.get('q')?.trim() ?? '';
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1), 50);

    const supabase = createServerClient();

    // 1. Nearby branches (Haversine in JS — see lib/geo.ts) → nearest per chain.
    const nearbyBranches = await fetchNearbyBranches(supabase, lat, lng, radiusKm, chainIdFilter);
    const nearestByChain = nearestBranchPerChain(nearbyBranches);

    // 2. Chain metadata.
    const { data: chains, error: chainsError } = await supabase.from('chains').select('id, name_he, name_en, color_hex');
    if (chainsError) throw chainsError;
    const chainById = new Map((chains ?? []).map((c) => [c.id, c]));
    const chainScope = chainIdFilter ?? [...nearestByChain.keys()];

    if (chainScope.length === 0) {
      return NextResponse.json({ products: [], nearby_branch_count: 0, radius_km: radiusKm, branch_pricing_available: true, chains: chains ?? [] });
    }

    // 3. Candidate products: name/barcode search, or (browsing with no
    // query) the products carried by the most branches of nearby chains.
    let productRows: Array<{ id: string; barcode: string | null; name_he: string; name_en: string | null; category: string | null }> = [];
    if (q.length > 0) {
      const { data, error } = await supabase
        .from('products')
        .select('id, barcode, name_he, name_en, category')
        .or(`name_he.ilike.%${q}%,name_en.ilike.%${q}%,barcode.eq.${q}`)
        .limit(limit);
      if (error) throw error;
      productRows = data ?? [];
    } else {
      const { data: popular, error } = await supabase
        .from('chain_prices')
        .select('product_id')
        .in('chain_id', chainScope)
        .order('branch_count', { ascending: false })
        .limit(limit * 3);
      if (error) throw error;
      const ids = [...new Set((popular ?? []).map((r) => r.product_id as string))].slice(0, limit);
      if (ids.length > 0) {
        const { data, error: pErr } = await supabase.from('products').select('id, barcode, name_he, name_en, category').in('id', ids);
        if (pErr) throw pErr;
        productRows = data ?? [];
      }
    }

    if (productRows.length === 0) {
      return NextResponse.json({ products: [], nearby_branch_count: nearbyBranches.length, radius_km: radiusKm, branch_pricing_available: true, chains: chains ?? [] });
    }

    // 4. Chain prices + overrides at the nearest branch of each chain.
    const productIds = productRows.map((p) => p.id);
    const chainRows = await fetchAllPages<ChainPriceRow>((from, to) =>
      supabase
        .from('chain_prices')
        .select('product_id, chain_id, price, unit_qty, unit_type, is_sale, captured_at')
        .in('product_id', productIds)
        .in('chain_id', chainScope)
        .range(from, to)
    );
    const chainPriceByKey = new Map(chainRows.map((r) => [`${r.product_id}:${r.chain_id}`, r]));
    const nearestIds = [...nearestByChain.values()].map((b) => b.id);
    const overrides = await fetchBranchOverrides(supabase, nearestIds, productIds);

    const products = productRows.slice(0, limit).map((product) => {
      const prices: Record<string, PriceEntry> = {};
      let hasBranchPrice = false;
      let hasChainFallback = false;

      for (const chainId of chainScope) {
        const chainRow = chainPriceByKey.get(`${product.id}:${chainId}`);
        if (!chainRow) continue;
        const branch = nearestByChain.get(chainId) ?? null;
        const override = branch ? overrides.get(`${product.id}:${branch.id}`) : undefined;
        if (branch) hasBranchPrice = true;
        else hasChainFallback = true;

        prices[chainId] = {
          chain_id: chainId,
          price: Number(override ? override.price : chainRow.price),
          unit_qty: chainRow.unit_qty,
          unit_type: chainRow.unit_type,
          is_sale: override ? override.is_sale : chainRow.is_sale,
          captured_at: override ? override.captured_at : chainRow.captured_at,
          branch_id: branch?.id ?? null,
          branch_name: branch?.name_he ?? null,
          distance_km: branch ? Math.round(branch.distance_km * 10) / 10 : null,
          chain_color: chainById.get(chainId)?.color_hex ?? null,
          source: branch ? 'branch' : 'chain_fallback',
        };
      }

      const priceValues = Object.values(prices).map((p) => p.price);
      const minPrice = priceValues.length > 0 ? Math.min(...priceValues) : null;
      const maxPrice = priceValues.length > 0 ? Math.max(...priceValues) : null;
      const bestEntry = Object.entries(prices).find(([, p]) => p.price === minPrice);

      const matchType: 'exact_barcode' | 'chain_fallback' | 'not_local' = hasBranchPrice
        ? 'exact_barcode'
        : hasChainFallback
          ? 'chain_fallback'
          : 'not_local';

      return {
        id: product.id,
        barcode: product.barcode,
        name_he: product.name_he,
        name_en: product.name_en,
        category: product.category,
        prices,
        min_price: minPrice,
        max_price: maxPrice,
        best_chain: bestEntry?.[0] ?? null,
        best_branch_id: bestEntry?.[1].branch_id ?? null,
        match_type: matchType,
      };
    });

    return NextResponse.json({
      products,
      nearby_branch_count: nearbyBranches.length,
      radius_km: radiusKm,
      branch_pricing_available: true,
      chains: chains ?? [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Nearby product search failed';
    console.error('[products/nearby]', message, err);
    return NextResponse.json({ error: message, products: [] }, { status: 500 });
  }
}
