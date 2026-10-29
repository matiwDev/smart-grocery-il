-- 017 — APPLIED 2026-10-29. Plan v2, phase 1: the app no longer prices by
-- store, so store branches and per-branch price overrides go (~172 MB).
-- promotions.branch_id referenced branches; the promotions table (never
-- used, 0 rows) loses that column.
ALTER TABLE public.promotions DROP COLUMN IF EXISTS branch_id;
DROP TABLE IF EXISTS public.branch_price_overrides;
DROP TABLE IF EXISTS public.branches;
ALTER TABLE public.ingest_log DROP COLUMN IF EXISTS overrides_written;

-- Debug panel status no longer reports branches or overrides.
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
