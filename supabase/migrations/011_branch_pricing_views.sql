-- Phase 18 — branch-level pricing. Every price_history row now gets a real
-- branch_id (scripts/ingest-prices.ts, see CLAUDE.md "Data architecture").
-- This migration replaces the single chain-level latest_prices materialized
-- view with two views: latest_prices (chain-level fallback, unchanged shape
-- plus a branch_id column) and latest_prices_by_branch (new — the primary
-- source for location-scoped pricing, one row per product+branch).
--
-- Not yet applied as of writing (same manual-paste-into-Supabase-Dashboard
-- limitation as every migration in this repo — see CLAUDE.md "Applying
-- migrations"). Check live before assuming: `latest_prices_by_branch?
-- select=product_id&limit=1` returns PGRST205 until this runs.

-- Drop existing view (and anything that depends on it, e.g. a lingering
-- unique index) so it can be recreated with the new branch_id column.
DROP MATERIALIZED VIEW IF EXISTS latest_prices CASCADE;

-- Chain-level view (fallback — most recent price across ALL branches for a
-- product+chain combination, used when no branch-level price exists near the
-- user, or when the client has no location at all).
CREATE MATERIALIZED VIEW latest_prices AS
SELECT DISTINCT ON (product_id, chain_id)
  product_id,
  chain_id,
  branch_id,
  price,
  unit_qty,
  unit_type,
  is_sale,
  captured_at
FROM price_history
ORDER BY product_id, chain_id, captured_at DESC;

CREATE UNIQUE INDEX latest_prices_pk
  ON latest_prices(product_id, chain_id);

-- Branch-level view (primary — exact price at a specific branch). Only rows
-- with a real branch_id qualify, so this view is empty for any price_history
-- row ingested before this session's branch_id fix landed.
CREATE MATERIALIZED VIEW latest_prices_by_branch AS
SELECT DISTINCT ON (product_id, branch_id)
  product_id,
  chain_id,
  branch_id,
  price,
  unit_qty,
  unit_type,
  is_sale,
  captured_at
FROM price_history
WHERE branch_id IS NOT NULL
ORDER BY product_id, branch_id, captured_at DESC;

CREATE UNIQUE INDEX latest_prices_by_branch_pk
  ON latest_prices_by_branch(product_id, branch_id);

-- Helper index for location-based queries (app/api/products/nearby,
-- app/api/prices/compare): look up every product available at a known set of
-- nearby branch_ids within one chain.
CREATE INDEX latest_prices_by_branch_chain
  ON latest_prices_by_branch(chain_id, product_id);

-- Both materialized views need CONCURRENTLY-refresh-eligible unique indexes
-- (created above) and public SELECT so the anon/authenticated PostgREST
-- roles can read them, matching every other public-catalog table/view in
-- this schema (see CLAUDE.md "RLS rules": products/chains/branches/
-- price_history/latest_prices are all public SELECT). DROP...CASCADE above
-- does not preserve grants on the recreated relation, so both are re-granted
-- explicitly here rather than assumed.
GRANT SELECT ON latest_prices TO anon, authenticated;
GRANT SELECT ON latest_prices_by_branch TO anon, authenticated;

-- Update the refresh function to refresh both views.
CREATE OR REPLACE FUNCTION refresh_latest_prices()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY latest_prices;
  REFRESH MATERIALIZED VIEW CONCURRENTLY latest_prices_by_branch;
END;
$$;
