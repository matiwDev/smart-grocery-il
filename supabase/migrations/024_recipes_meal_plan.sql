-- 024 — APPLIED 2026-10-29. Plan v2, phase 4: recipes and the meal plan that fills the list.
--
--   * recipes: the household's recipes. Own recipes (usually Hebrew) and ones
--     imported from TheMealDB (English, as published; source = 'mealdb',
--     source_id = idMeal, one copy per household).
--   * recipe_ingredients: one row per ingredient, as written (name, measure)
--     plus what goes on the shopping list: amount + unit ('unit' = count,
--     'kg' = weight, 'none' = "need some", never summed), an optional link to
--     a catalog product or a household product, the name to put on the list
--     (list_name, e.g. Hebrew for an English recipe), and skip_list for things
--     every kitchen has (salt, water).
--   * meal_plan_entries: date × slot (breakfast / lunch / dinner) × recipe,
--     with servings and who eats it (eaters = member user ids; NULL = everyone).
--     added_to_list_at marks meals already sent to the list, so "Add week to
--     list" never adds the same meal twice.
--   * basket_items.from_meals: titles of the planned recipes an item was added
--     for (the list shows a small "meal plan" badge). NULL = added by hand.
--   * RLS: household members only. Realtime: recipes, meal_plan_entries.

CREATE TABLE IF NOT EXISTS public.recipes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  created_by    UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  title         TEXT NOT NULL CHECK (length(trim(title)) > 0),
  lang          TEXT NOT NULL DEFAULT 'he' CHECK (lang IN ('he', 'en')),
  servings      INT  NOT NULL DEFAULT 4 CHECK (servings BETWEEN 1 AND 50),
  instructions  TEXT,
  image_url     TEXT,
  category      TEXT,
  source        TEXT NOT NULL DEFAULT 'own' CHECK (source IN ('own', 'mealdb')),
  source_id     TEXT,
  source_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS recipes_source_uniq ON public.recipes(household_id, source, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS recipes_household_idx ON public.recipes(household_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id          UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  position           INT  NOT NULL DEFAULT 0,
  name               TEXT NOT NULL CHECK (length(trim(name)) > 0),
  measure            TEXT,
  amount             NUMERIC CHECK (amount IS NULL OR amount > 0),
  unit               TEXT NOT NULL DEFAULT 'none' CHECK (unit IN ('unit', 'kg', 'none')),
  list_name          TEXT,
  product_id         UUID REFERENCES public.products(id) ON DELETE SET NULL,
  custom_product_id  UUID REFERENCES public.custom_products(id) ON DELETE SET NULL,
  skip_list          BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS recipe_ingredients_recipe_idx ON public.recipe_ingredients(recipe_id, position);
CREATE INDEX IF NOT EXISTS recipe_ingredients_product_idx ON public.recipe_ingredients(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS recipe_ingredients_custom_idx ON public.recipe_ingredients(custom_product_id) WHERE custom_product_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.meal_plan_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id      UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  plan_date         DATE NOT NULL,
  slot              TEXT NOT NULL CHECK (slot IN ('breakfast', 'lunch', 'dinner')),
  recipe_id         UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  servings          NUMERIC NOT NULL DEFAULT 2 CHECK (servings > 0 AND servings <= 50),
  eaters            UUID[],
  added_to_list_at  TIMESTAMPTZ,
  created_by        UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meal_plan_household_date_idx ON public.meal_plan_entries(household_id, plan_date);
CREATE INDEX IF NOT EXISTS meal_plan_recipe_idx ON public.meal_plan_entries(recipe_id);

ALTER TABLE public.basket_items ADD COLUMN IF NOT EXISTS from_meals TEXT[];

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plan_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "household recipes" ON public.recipes;
CREATE POLICY "household recipes" ON public.recipes FOR ALL TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

DROP POLICY IF EXISTS "ingredients of household recipes" ON public.recipe_ingredients;
CREATE POLICY "ingredients of household recipes" ON public.recipe_ingredients FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND public.is_household_member(r.household_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND public.is_household_member(r.household_id)));

DROP POLICY IF EXISTS "household meal plan" ON public.meal_plan_entries;
CREATE POLICY "household meal plan" ON public.meal_plan_entries FOR ALL TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id)
              AND EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.household_id = meal_plan_entries.household_id));

-- ─── Realtime ───────────────────────────────────────────────────────────────
ALTER TABLE public.meal_plan_entries REPLICA IDENTITY FULL;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['recipes', 'meal_plan_entries'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

INSERT INTO public.schema_migrations (version) VALUES ('024_recipes_meal_plan') ON CONFLICT DO NOTHING;
