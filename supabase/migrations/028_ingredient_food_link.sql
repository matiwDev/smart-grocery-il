-- 028: link recipe ingredients to the Health Ministry food table (Plan v2, phase 7).
-- The table itself is NOT in the database: it ships with the app as
-- lib/data/tzameret.json (built by `npm run tzameret:build` from data/tzameret/).
-- food_code / grams are filled by POST /api/nutrition/recipes the first time a
-- recipe's nutrition is asked for (food_set_by = 'auto'); a user's choice
-- ('user') is never overwritten. food_checked_at marks "tried" so unmatched
-- ingredients aren't searched again on every call (cleared when edited).

ALTER TABLE public.recipe_ingredients
  ADD COLUMN IF NOT EXISTS food_code int,
  ADD COLUMN IF NOT EXISTS grams numeric(8,1) CHECK (grams IS NULL OR grams >= 0),
  ADD COLUMN IF NOT EXISTS food_set_by text CHECK (food_set_by IN ('auto', 'user')),
  ADD COLUMN IF NOT EXISTS food_checked_at timestamptz;
COMMENT ON COLUMN public.recipe_ingredients.food_code IS 'Health Ministry (Tzameret) food code, lib/data/tzameret.json';
COMMENT ON COLUMN public.recipe_ingredients.grams IS 'Grams in the whole recipe (estimated from measure unless set by a user)';
INSERT INTO public.schema_migrations (version) VALUES ('028_ingredient_food_link') ON CONFLICT DO NOTHING;
