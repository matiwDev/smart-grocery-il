-- 016 — APPLIED 2026-10-29. Read-only status snapshot for the debug panel
-- (GET /api/debug/status). Service role only.
CREATE OR REPLACE FUNCTION public.debug_db_stats()
RETURNS JSON LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT json_build_object(
    'db_size_bytes', pg_database_size(current_database()),
    'db_limit_bytes', 500 * 1024 * 1024,
    'tables', (SELECT json_object_agg(relname, json_build_object('rows', reltuples::bigint, 'bytes', pg_total_relation_size(oid)))
               FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'),
    'chains', (SELECT json_agg(json_build_object(
                 'id', c.id, 'status', c.status,
                 'prices', (SELECT count(*) FROM chain_prices cp WHERE cp.chain_id = c.id),
                 'overrides', (SELECT count(*) FROM branch_price_overrides o WHERE o.chain_id = c.id),
                 'branches', (SELECT count(*) FROM branches b WHERE b.chain_id = c.id),
                 'branches_with_coords', (SELECT count(*) FROM branches b WHERE b.chain_id = c.id AND b.lat IS NOT NULL),
                 'last_price_at', (SELECT max(captured_at) FROM chain_prices cp WHERE cp.chain_id = c.id),
                 'last_ingest', (SELECT json_build_object('started_at', l.started_at, 'finished_at', l.finished_at,
                                   'fetched', l.products_fetched, 'matched', l.products_matched, 'error', l.error_text)
                                 FROM ingest_log l WHERE l.chain_id = c.id ORDER BY l.started_at DESC LIMIT 1)
               ) ORDER BY c.status, c.id) FROM chains c),
    'tracked_products', (SELECT count(*) FROM tracked_products),
    'monthly_rows', (SELECT count(*) FROM product_price_monthly),
    'months', (SELECT json_agg(m ORDER BY m) FROM (SELECT DISTINCT month m FROM product_price_monthly) x)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.debug_db_stats() FROM anon, authenticated, public;
