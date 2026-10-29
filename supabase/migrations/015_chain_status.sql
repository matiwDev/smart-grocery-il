-- 015 — APPLIED 2026-10-28. Chains whose feed integration isn't finished are
-- marked 'in_development': the app shows them greyed out with a badge and
-- never prices them. The ingest keeps collecting their prices regardless.
-- Read paths use active_chain_prices; the ingest writes chain_prices.
ALTER TABLE public.chains ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'in_development'));
UPDATE public.chains SET status = 'in_development' WHERE id IN ('yohananof', 'osher_ad', 'keshet_teamim');

CREATE OR REPLACE VIEW public.active_chain_prices WITH (security_invoker = true) AS
  SELECT cp.* FROM public.chain_prices cp
  JOIN public.chains c ON c.id = cp.chain_id
  WHERE c.status = 'active';
GRANT SELECT ON public.active_chain_prices TO anon, authenticated;

-- To promote a chain once its feed is fixed:
--   UPDATE public.chains SET status = 'active' WHERE id = 'yohananof';
