-- 020 — APPLIED 2026-10-29. Plan v2 adjustments after phase 2.
--   * profiles.preferred_chain_id: the one chain a user shops at. Search shows
--     only that chain's products, priced at that chain (with a hint when
--     another chain is cheaper); the list and trip estimate use it.
--   * custom_products: a household's own products ("My products"), created
--     when someone adds a free-text item. Searchable whatever chain is chosen;
--     edits apply everywhere the product appears. Names unique per household
--     (case-insensitive).
--   * basket_items / trip_items.custom_product_id link to it.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_chain_id TEXT REFERENCES public.chains(id);

CREATE TABLE IF NOT EXISTS public.custom_products (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  category     TEXT,
  price        NUMERIC(10,2),
  image_url    TEXT,
  created_by   UUID DEFAULT auth.uid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS custom_products_household_name ON public.custom_products(household_id, lower(name));
ALTER TABLE public.custom_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "household members manage custom products" ON public.custom_products;
CREATE POLICY "household members manage custom products" ON public.custom_products
  FOR ALL TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

ALTER TABLE public.basket_items ADD COLUMN IF NOT EXISTS custom_product_id UUID REFERENCES public.custom_products(id) ON DELETE SET NULL;
ALTER TABLE public.trip_items ADD COLUMN IF NOT EXISTS custom_product_id UUID REFERENCES public.custom_products(id) ON DELETE SET NULL;
