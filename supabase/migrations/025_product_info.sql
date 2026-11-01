-- 025 — NOT YET APPLIED (waiting for approval, 1 Nov 2026). Plan v2, phase 5: product photo + health grade, cached from Open Food Facts.
--
-- Coverage measured 1 Nov 2026 (scripts/off-coverage.ts, 168 random retail
-- barcodes): OFF knows 17% of our products (25% of food), has a photo for 10%,
-- a Nutri-Score for 3%, nutrition per 100 g for 14% (22% of food). So there is
-- NO bulk job: a product is looked up the first time it is on someone's list
-- (POST /api/products/info) and the answer is cached here, "not found" too.
--
--   * status: 'found' | 'not_found'. Rechecked when older than 45 days
--     (not_found) or 180 days (found).
--   * per100: nutrition per 100 g / 100 ml from OFF, our own keys:
--     kcal, sugars, sat_fat, salt, sodium_mg, protein, fiber, fvl (% fruit /
--     vegetables / legumes), sweeteners (bool). Missing values are left out.
--   * nutriscore: the grade we show (a–e). nutriscore_source: 'off' (OFF's
--     own grade) or 'calc' (calculated by lib/health.ts from per100).
--   * red_flags: Israel's red front-of-pack labels the values trigger
--     ('sodium', 'sugar', 'sat_fat'), stage 2 thresholds (since 2021).
--   * One row per catalog product, shared by everyone. Signed-in users read;
--     only the service role (the API route) writes.

CREATE TABLE IF NOT EXISTS public.product_info (
  product_id         UUID PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  status             TEXT NOT NULL CHECK (status IN ('found', 'not_found')),
  fetched_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  off_name           TEXT,
  image_url          TEXT,
  is_beverage        BOOLEAN NOT NULL DEFAULT false,
  per100             JSONB,
  nutriscore         TEXT CHECK (nutriscore IS NULL OR nutriscore IN ('a', 'b', 'c', 'd', 'e')),
  nutriscore_source  TEXT CHECK (nutriscore_source IS NULL OR nutriscore_source IN ('off', 'calc')),
  red_flags          TEXT[] NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS product_info_fetched_idx ON public.product_info(status, fetched_at);

ALTER TABLE public.product_info ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "signed-in users read product info" ON public.product_info;
CREATE POLICY "signed-in users read product info" ON public.product_info FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.product_info FROM anon, authenticated;

INSERT INTO public.schema_migrations (version) VALUES ('025_product_info') ON CONFLICT DO NOTHING;
