import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { fetchAllPages, fetchNearbyBranches, isMissingRelation } from '@/lib/geo';

// GET /api/products/nearby?lat=..&lng=..&radius_km=15&chain_ids=a,b&q=..&limit=20
//
// Location-scoped product search (Phase 18 — branch-level pricing). Replaces
// /api/products/search for the main search flow whenever the client has a
// GPS fix; /api/products/search stays as the no-location fallback.
//
// Haversine distance is computed here in JS rather than in a SQL query with
// a HAVING clause — this repo has no direct Postgres connection or SQL
// execution path (see CLAUDE.md "Applying migrations": PostgREST only, no
// supabase CLI), so a raw-SQL Haversine query isn't something this route can
// run. This mirrors the client's own existing haversineKm() (app/page.tsx,
// used for the Location view's distance filter) rather than introducing a
// second, divergent formula.
//
// Hybrid fallback: for a given product+chain, if no nearby branch carries a
// branch-level price (latest_prices_by_branch, migration 011), the chain's
// latest_prices (chain-level, most-recent-anywhere) value is used instead,
// flagged via match_type so the UI can show it as an approximation (see
// CLAUDE.md "Confidence indicators"). If migration 011 hasn't been applied
// yet, latest_prices_by_branch doesn't exist at all — every product then
// resolves via the chain-level fallback alone, and the response's
// `branch_pricing_available` flag is false so the UI/CLAUDE.md-reader can
// tell the difference from "no chain nearby carries this at all".

const DEFAULT_RADIUS_KM = 15;
const MAX_RADIUS_KM = 50;
const DEFAULT_LIMIT = 20;

interface BranchPriceRow {
  product_id: string;
  chain_id: string;
  branch_id: string;
  price: number;
  unit_qty: number;
  unit_type: string;
  is_sale: boolean;
  captured_at: string;
}

interface ChainLevelPriceRow {
  product_id: string;
  chain_id: string;
  branch_id: string | null;
  price: number;
  unit_qty: number;
  unit_type: string;
  is_sale: boolean;
  captured_at: string;
}

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

    // 1. Nearby branches (Haversine in JS — see lib/geo.ts header).
    const nearbyBranches = await fetchNearbyBranches(supabase, lat, lng, radiusKm, chainIdFilter);
    const branchById = new Map(nearbyBranches.map((b) => [b.id, b]));
    const nearbyBranchIds = [...branchById.keys()];

    // 2. Chain metadata.
    const { data: chains, error: chainsError } = await supabase.from('chains').select('id, name_he, name_en, color_hex');
    if (chainsError) throw chainsError;
    const chainById = new Map((chains ?? []).map((c) => [c.id, c]));
    const nearbyChainScope = chainIdFilter ?? [...new Set(nearbyBranches.map((b) => b.chain_id))];

    // 3. Candidate products: either a name/barcode search (q given — the
    // main autocomplete flow) or, browsing with no query, whatever the
    // nearby branches actually carry (discovered from latest_prices_by_branch
    // directly, no separate products query needed for that path).
    let candidateProductIds: string[] | null = null;
    let productRows: Array<{ id: string; barcode: string | null; name_he: string; name_en: string | null; category: string | null }> = [];

    if (q.length > 0) {
      const { data, error } = await supabase
        .from('products')
        .select('id, barcode, name_he, name_en, category')
        .or(`name_he.ilike.%${q}%,name_en.ilike.%${q}%,barcode.eq.${q}`)
        .limit(limit);
      if (error) throw error;
      productRows = data ?? [];
      candidateProductIds = productRows.map((p) => p.id);
    }

    // 4. Branch-level prices at nearby branches (primary source). Degrades
    // to "none" if migration 011 hasn't been applied yet — everything then
    // resolves through the chain-level fallback in step 5 instead.
    let branchPricingAvailable = true;
    let nearbyBranchPrices: BranchPriceRow[] = [];
    if (nearbyBranchIds.length > 0) {
      try {
        const CHUNK = 200;
        for (let i = 0; i < nearbyBranchIds.length; i += CHUNK) {
          const idsChunk = nearbyBranchIds.slice(i, i + CHUNK);
          const chunkRows = await fetchAllPages<BranchPriceRow>((from, to) => {
            let query = supabase
              .from('latest_prices_by_branch')
              .select('product_id, chain_id, branch_id, price, unit_qty, unit_type, is_sale, captured_at')
              .in('branch_id', idsChunk);
            if (candidateProductIds) query = query.in('product_id', candidateProductIds);
            return query.range(from, to);
          });
          nearbyBranchPrices.push(...chunkRows);
        }
      } catch (err) {
        if (isMissingRelation(err)) {
          branchPricingAvailable = false;
          nearbyBranchPrices = [];
        } else {
          throw err;
        }
      }
    }

    // If browsing with no query, the candidate product set IS whatever the
    // branch-level rows just found (per spec item 2 — "get all products
    // available at those branches").
    if (!candidateProductIds) {
      candidateProductIds = [...new Set(nearbyBranchPrices.map((r) => r.product_id))].slice(0, limit);
      if (candidateProductIds.length > 0) {
        const { data, error } = await supabase
          .from('products')
          .select('id, barcode, name_he, name_en, category')
          .in('id', candidateProductIds);
        if (error) throw error;
        productRows = data ?? [];
      }
    }

    if (productRows.length === 0) {
      return NextResponse.json({
        products: [],
        nearby_branch_count: nearbyBranches.length,
        radius_km: radiusKm,
        branch_pricing_available: branchPricingAvailable,
      });
    }

    // 5. Chain-level fallback prices (used per-product-per-chain only when no
    // nearby branch has that product for that chain). latest_prices only
    // gained a branch_id column in migration 011 — select without it and
    // default to null on the pre-migration schema instead of 500ing.
    const productIds = productRows.map((p) => p.id);
    let chainLevelRows: ChainLevelPriceRow[];
    try {
      chainLevelRows = await fetchAllPages<ChainLevelPriceRow>((from, to) =>
        supabase
          .from('latest_prices')
          .select('product_id, chain_id, branch_id, price, unit_qty, unit_type, is_sale, captured_at')
          .in('product_id', productIds)
          .range(from, to)
      );
    } catch (err) {
      if (!isMissingRelation(err) && (err as { code?: string })?.code !== '42703') throw err;
      const rowsWithoutBranch = await fetchAllPages<Omit<ChainLevelPriceRow, 'branch_id'>>((from, to) =>
        supabase
          .from('latest_prices')
          .select('product_id, chain_id, price, unit_qty, unit_type, is_sale, captured_at')
          .in('product_id', productIds)
          .range(from, to)
      );
      chainLevelRows = rowsWithoutBranch.map((row) => ({ ...row, branch_id: null }));
    }

    // Nearest branch-level price per (product_id, chain_id) — one pass,
    // keeping the first hit since nearbyBranchPrices came from branches
    // already sorted by distance.
    const branchPriceByProductChain = new Map<string, BranchPriceRow>();
    for (const row of nearbyBranchPrices) {
      const branch = branchById.get(row.branch_id);
      if (!branch) continue;
      const key = `${row.product_id}:${row.chain_id}`;
      const existing = branchPriceByProductChain.get(key);
      if (!existing || branch.distance_km < (branchById.get(existing.branch_id)?.distance_km ?? Infinity)) {
        branchPriceByProductChain.set(key, row);
      }
    }

    const chainLevelByProductChain = new Map<string, ChainLevelPriceRow>();
    for (const row of chainLevelRows) {
      if (!nearbyChainScope.includes(row.chain_id)) continue;
      chainLevelByProductChain.set(`${row.product_id}:${row.chain_id}`, row);
    }

    const products = productRows.slice(0, limit).map((product) => {
      const prices: Record<
        string,
        {
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
        }
      > = {};

      let hasBranchPrice = false;
      let hasChainFallback = false;

      for (const chainId of nearbyChainScope) {
        const branchRow = branchPriceByProductChain.get(`${product.id}:${chainId}`);
        if (branchRow) {
          hasBranchPrice = true;
          const branch = branchById.get(branchRow.branch_id);
          prices[chainId] = {
            chain_id: chainId,
            price: branchRow.price,
            unit_qty: branchRow.unit_qty,
            unit_type: branchRow.unit_type,
            is_sale: branchRow.is_sale,
            captured_at: branchRow.captured_at,
            branch_id: branchRow.branch_id,
            branch_name: branch?.name_he ?? null,
            distance_km: branch ? Math.round(branch.distance_km * 10) / 10 : null,
            chain_color: chainById.get(chainId)?.color_hex ?? null,
            source: 'branch',
          };
          continue;
        }

        const chainRow = chainLevelByProductChain.get(`${product.id}:${chainId}`);
        if (chainRow) {
          hasChainFallback = true;
          prices[chainId] = {
            chain_id: chainId,
            price: chainRow.price,
            unit_qty: chainRow.unit_qty,
            unit_type: chainRow.unit_type,
            is_sale: chainRow.is_sale,
            captured_at: chainRow.captured_at,
            branch_id: null,
            branch_name: null,
            distance_km: null,
            chain_color: chainById.get(chainId)?.color_hex ?? null,
            source: 'chain_fallback',
          };
        }
      }

      const priceValues = Object.values(prices).map((p) => p.price);
      const minPrice = priceValues.length > 0 ? Math.min(...priceValues) : null;
      const maxPrice = priceValues.length > 0 ? Math.max(...priceValues) : null;
      const bestEntry = Object.entries(prices).find(([, p]) => p.price === minPrice);

      // Confidence/match_type (Step 7). Every product in this catalog was
      // matched into products.barcode by the ingestion pipeline via a real
      // feed barcode (scripts/ingest-prices.ts has no name-matching path at
      // all), so "exact_barcode" covers every branch-level hit here —
      // "exact_name" isn't produced by this architecture and isn't faked.
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
      branch_pricing_available: branchPricingAvailable,
      chains: chains ?? [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Nearby product search failed';
    console.error('[products/nearby]', message, err);
    return NextResponse.json({ error: message, products: [] }, { status: 500 });
  }
}
