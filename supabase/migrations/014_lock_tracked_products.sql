-- 014 — APPLIED 2026-10-28. tracked_products reveals which products are in
-- users' baskets, so it must not be readable through the public API. Only the
-- service role (ingest's rollup_monthly_prices) needs it.
ALTER VIEW public.tracked_products SET (security_invoker = true);
REVOKE ALL ON public.tracked_products FROM anon, authenticated, public;
ALTER FUNCTION public.rollup_monthly_prices() SET search_path = public, pg_temp;
