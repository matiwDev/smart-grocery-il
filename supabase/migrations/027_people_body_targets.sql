-- 027: people without accounts, body data and daily targets (Plan v2, phase 7).
--
-- person_body       one row per signed-in user: birth year, sex, activity, height,
--                   weight. PRIVATE: only the user reads or writes it.
-- person_profiles   + targets jsonb: the daily ranges the app computed from the body
--                   data (kcal, protein, fat, carbs, fiber, sodium…). The household
--                   reads these, never the body numbers.
-- household_people  people without an account (e.g. children): body data, food
--                   preferences and targets in one row, managed by every member.
--                   Their ids can appear in meal_plan_entries.eaters next to user ids.

CREATE TABLE IF NOT EXISTS public.person_body (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  birth_year int  CHECK (birth_year BETWEEN 1900 AND 2100),
  sex        text CHECK (sex IN ('male', 'female')),
  activity   text NOT NULL DEFAULT 'light' CHECK (activity IN ('sedentary', 'light', 'active', 'very_active')),
  height_cm  numeric(5,1) CHECK (height_cm BETWEEN 40 AND 250),
  weight_kg  numeric(5,1) CHECK (weight_kg BETWEEN 2 AND 400),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.person_body ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own body data" ON public.person_body;
CREATE POLICY "own body data" ON public.person_body FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
REVOKE ALL ON public.person_body FROM anon;

ALTER TABLE public.person_profiles ADD COLUMN IF NOT EXISTS targets jsonb;

CREATE TABLE IF NOT EXISTS public.household_people (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
  birth_year   int  CHECK (birth_year BETWEEN 1900 AND 2100),
  sex          text CHECK (sex IN ('male', 'female')),
  activity     text NOT NULL DEFAULT 'light' CHECK (activity IN ('sedentary', 'light', 'active', 'very_active')),
  height_cm    numeric(5,1) CHECK (height_cm BETWEEN 40 AND 250),
  weight_kg    numeric(5,1) CHECK (weight_kg BETWEEN 2 AND 400),
  diet         text NOT NULL DEFAULT 'any' CHECK (diet IN ('any', 'pescatarian', 'vegetarian', 'vegan')),
  kosher       boolean NOT NULL DEFAULT false,
  avoid        text[] NOT NULL DEFAULT '{}' CHECK (avoid <@ ARRAY['gluten','lactose','nuts','peanuts','eggs','fish','shellfish','sesame','soy']::text[]),
  dislikes     text[] NOT NULL DEFAULT '{}' CHECK (cardinality(dislikes) <= 30),
  goals        text[] NOT NULL DEFAULT '{}' CHECK (goals <@ ARRAY['lighter','protein','less_sugar','more_veg']::text[]),
  targets      jsonb,
  created_by   uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS household_people_household_idx ON public.household_people(household_id);
ALTER TABLE public.household_people ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members manage household people" ON public.household_people;
CREATE POLICY "members manage household people" ON public.household_people FOR ALL TO authenticated
  USING (public.is_household_member(household_id)) WITH CHECK (public.is_household_member(household_id));
REVOKE ALL ON public.household_people FROM anon;

INSERT INTO public.schema_migrations (version) VALUES ('027_people_body_targets') ON CONFLICT DO NOTHING;
