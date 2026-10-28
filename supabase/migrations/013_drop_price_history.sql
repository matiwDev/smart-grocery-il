-- 013 — APPLIED 2026-10-28. Frees ~1.1 GB (database went from 1,129 MB to 26 MB).
-- July–August monthly summaries for tracked products were copied into
-- product_price_monthly first. CASCADE also dropped the latest_prices and
-- latest_prices_by_branch materialized views built on price_history.
DROP TABLE IF EXISTS public.price_history CASCADE;
DROP FUNCTION IF EXISTS public.refresh_latest_prices();
