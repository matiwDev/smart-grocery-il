-- 012 — Storage-light price model (replaces price_history + latest_prices +
-- latest_prices_by_branch, all dropped to stay under the 500 MB free tier).
--
-- A full per-branch table (one row per product x branch) would be ~5-10M rows
-- (~1 GB), so prices are stored as:
--
--   chain_prices            one row per (product, chain): the price MOST
--                           branches of that chain charge today ("mode"),
--                           plus min/max across branches and branch_count.
--   branch_price_overrides  one row per (product, branch) ONLY where that
--                           branch's price differs from its chain's mode.
--   chain_price_changes     tiny change log, written by a trigger whenever a
--                           chain_prices.price changes. Powers price_drops /
--                           price_trend analytics. Pruned to 120 days.
--
-- Effective price at branch B for product P:
--   COALESCE(override(P,B).price, chain_prices(P, B.chain_id).price)
--
-- Idempotent: safe to run more than once. Paste into the Supabase SQL Editor.

-- ─── Clean up leftovers from the dropped model ──────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS public.latest_prices_by_branch CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.latest_prices CASCADE;
DROP FUNCTION IF EXISTS public.refresh_latest_prices();

-- ─── chain_prices ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chain_prices (
  product_id   UUID        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  chain_id     TEXT        NOT NULL REFERENCES public.chains(id)   ON DELETE CASCADE,
  price        NUMERIC(10,2) NOT NULL,
  min_price    NUMERIC(10,2),
  max_price    NUMERIC(10,2),
  branch_count INT         NOT NULL DEFAULT 1,
  unit_qty     NUMERIC,
  unit_type    TEXT,
  is_sale      BOOLEAN     NOT NULL DEFAULT false,
  captured_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, chain_id)
);
CREATE INDEX IF NOT EXISTS chain_prices_chain_idx ON public.chain_prices(chain_id, branch_count DESC);

-- ─── branch_price_overrides ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.branch_price_overrides (
  product_id  UUID        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  branch_id   UUID        NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  chain_id    TEXT        NOT NULL REFERENCES public.chains(id)   ON DELETE CASCADE,
  price       NUMERIC(10,2) NOT NULL,
  is_sale     BOOLEAN     NOT NULL DEFAULT false,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, branch_id)
);
CREATE INDEX IF NOT EXISTS branch_price_overrides_branch_idx ON public.branch_price_overrides(branch_id);
-- Used by the ingest's "delete stale overrides for this chain" step.
CREATE INDEX IF NOT EXISTS branch_price_overrides_chain_captured_idx ON public.branch_price_overrides(chain_id, captured_at);

-- ─── chain_price_changes (trigger-fed) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chain_price_changes (
  id         BIGSERIAL PRIMARY KEY,
  product_id UUID        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  chain_id   TEXT        NOT NULL REFERENCES public.chains(id)   ON DELETE CASCADE,
  old_price  NUMERIC(10,2) NOT NULL,
  new_price  NUMERIC(10,2) NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chain_price_changes_product_idx ON public.chain_price_changes(product_id, changed_at);
CREATE INDEX IF NOT EXISTS chain_price_changes_changed_idx ON public.chain_price_changes(changed_at DESC);

CREATE OR REPLACE FUNCTION public.log_chain_price_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.price IS DISTINCT FROM OLD.price THEN
    INSERT INTO public.chain_price_changes (product_id, chain_id, old_price, new_price, changed_at)
    VALUES (NEW.product_id, NEW.chain_id, OLD.price, NEW.price, NEW.captured_at);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chain_prices_log_change ON public.chain_prices;
CREATE TRIGGER chain_prices_log_change
  AFTER UPDATE OF price ON public.chain_prices
  FOR EACH ROW EXECUTE FUNCTION public.log_chain_price_change();

-- Called at the end of every ingest run (scripts/ingest-prices.ts).
CREATE OR REPLACE FUNCTION public.prune_price_changes(keep_days INT DEFAULT 120)
RETURNS INT LANGUAGE sql AS $$
  WITH d AS (
    DELETE FROM public.chain_price_changes
    WHERE changed_at < now() - make_interval(days => keep_days)
    RETURNING 1
  )
  SELECT count(*)::int FROM d;
$$;

-- ─── ingest_log: track overrides written ────────────────────────────────────
ALTER TABLE public.ingest_log ADD COLUMN IF NOT EXISTS overrides_written INT NOT NULL DEFAULT 0;

-- ─── RLS: public read, service role writes (matches products/chains/branches)
ALTER TABLE public.chain_prices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_price_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chain_price_changes    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read" ON public.chain_prices;
CREATE POLICY "public read" ON public.chain_prices FOR SELECT USING (true);
DROP POLICY IF EXISTS "public read" ON public.branch_price_overrides;
CREATE POLICY "public read" ON public.branch_price_overrides FOR SELECT USING (true);
DROP POLICY IF EXISTS "public read" ON public.chain_price_changes;
CREATE POLICY "public read" ON public.chain_price_changes FOR SELECT USING (true);

GRANT SELECT ON public.chain_prices, public.branch_price_overrides, public.chain_price_changes TO anon, authenticated;

-- Tell PostgREST about the new tables immediately.
NOTIFY pgrst, 'reload schema';
