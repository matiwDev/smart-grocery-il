-- 026: per-person food preferences (Plan v2, phase 6 "What can I cook?").
-- One row per user. Phase 7 adds age / sex / activity to the same row.
-- Suggestions combine the rows of whoever eats: hard rules (diet, kosher,
-- avoid, dislikes) apply if ANY eater has them; goals only change the ranking.
-- RLS: you write your own row; members of your household can read it.

CREATE TABLE IF NOT EXISTS public.person_profiles (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  diet       text NOT NULL DEFAULT 'any' CHECK (diet IN ('any', 'pescatarian', 'vegetarian', 'vegan')),
  kosher     boolean NOT NULL DEFAULT false,
  avoid      text[] NOT NULL DEFAULT '{}',   -- gluten | lactose | nuts | peanuts | eggs | fish | shellfish | sesame | soy
  dislikes   text[] NOT NULL DEFAULT '{}',   -- free text, matched by words
  goals      text[] NOT NULL DEFAULT '{}',   -- lighter | protein | less_sugar | more_veg
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (avoid <@ ARRAY['gluten','lactose','nuts','peanuts','eggs','fish','shellfish','sesame','soy']::text[]),
  CHECK (goals <@ ARRAY['lighter','protein','less_sugar','more_veg']::text[]),
  CHECK (cardinality(dislikes) <= 30)
);

-- Do two users share a household? (SECURITY DEFINER: household_members is RLS'd.)
CREATE OR REPLACE FUNCTION public.shares_household(p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members a
    JOIN public.household_members b ON b.household_id = a.household_id
    WHERE a.user_id = auth.uid() AND b.user_id = p_user
  );
$$;
REVOKE EXECUTE ON FUNCTION public.shares_household(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shares_household(uuid) TO authenticated;

ALTER TABLE public.person_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own person profile" ON public.person_profiles;
CREATE POLICY "own person profile" ON public.person_profiles FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "household reads person profiles" ON public.person_profiles;
CREATE POLICY "household reads person profiles" ON public.person_profiles FOR SELECT TO authenticated
  USING (public.shares_household(user_id));
REVOKE ALL ON public.person_profiles FROM anon;

INSERT INTO public.schema_migrations (version) VALUES ('026_person_profiles') ON CONFLICT DO NOTHING;
