-- 022 — APPLIED 2026-10-29. Fixes the household_members / households read
-- policies, which referenced household_members inside its own policy
-- ("infinite recursion detected"), so any direct read of either table failed.
-- Both now use is_household_member() (SECURITY DEFINER, no recursion).
-- Adds get_household_members(): the members of your household with their
-- nickname (profiles stay private to their owner).

DROP POLICY IF EXISTS "Members view household members" ON public.household_members;
CREATE POLICY "Members view household members" ON public.household_members FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

DROP POLICY IF EXISTS "Members view their household" ON public.households;
CREATE POLICY "Members view their household" ON public.households FOR SELECT TO authenticated
  USING (public.is_household_member(id));

CREATE OR REPLACE FUNCTION public.get_household_members()
RETURNS TABLE(user_id uuid, nickname text, role text, joined_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT hm.user_id,
         coalesce(nullif(trim(p.nickname), ''), split_part(p.email, '@', 1)),
         hm.role,
         hm.created_at
  FROM household_members hm
  LEFT JOIN profiles p ON p.id = hm.user_id
  WHERE public.is_household_member(hm.household_id)
  ORDER BY hm.created_at;
$$;
REVOKE EXECUTE ON FUNCTION public.get_household_members() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_household_members() TO authenticated;
