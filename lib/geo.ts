/**
 * Shared branch-proximity helpers for the location-scoped API routes
 * (app/api/products/nearby, app/api/prices/compare — Phase 18 branch-level
 * pricing). Haversine distance is computed here in JS rather than in a raw
 * SQL query with a HAVING clause: this repo has no direct Postgres/SQL
 * execution path (see CLAUDE.md "Applying migrations" — PostgREST only, no
 * supabase CLI), so a route can't run arbitrary trigonometric SQL. This
 * mirrors app/page.tsx's own existing client-side haversineKm(), used for
 * the Location view's distance filter, rather than introducing a second,
 * divergent formula for the same calculation.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

const PAGE_SIZE = 1000; // PostgREST's server-side max-rows cap on this project (see CLAUDE.md Phase 15/16)

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface NearbyBranch {
  id: string;
  chain_id: string;
  name_he: string;
  lat: number;
  lng: number;
  distance_km: number;
}

export async function fetchAllPages<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function fetchNearbyBranches(
  supabase: SupabaseClient,
  lat: number,
  lng: number,
  radiusKm: number,
  chainIdFilter: string[] | null
): Promise<NearbyBranch[]> {
  const allBranches = await fetchAllPages<{ id: string; chain_id: string; name_he: string; lat: number; lng: number }>((from, to) =>
    supabase
      .from('branches')
      .select('id, chain_id, name_he, lat, lng')
      .eq('is_active', true)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .range(from, to)
  );

  return allBranches
    .map((b) => ({ ...b, distance_km: haversineKm(lat, lng, b.lat, b.lng) }))
    .filter((b) => b.distance_km <= radiusKm && (!chainIdFilter || chainIdFilter.includes(b.chain_id)))
    .sort((a, b) => a.distance_km - b.distance_km);
}

// Migration 011 (latest_prices_by_branch) hasn't been applied yet in every
// environment — routes probe for it and degrade to the chain-level-only
// fallback instead of 500ing when it's missing.
export function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  const message = String((err as { message?: string })?.message ?? err ?? '');
  return code === 'PGRST205' || code === '42P01' || message.includes('PGRST205') || message.includes('does not exist');
}

export function isMissingColumn(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  return code === '42703' || isMissingRelation(err);
}
