-- 019 — APPLIED 2026-10-29. Security fix: generate_household_invite(p_user_id)
-- and join_household_by_code(p_user_id, p_code) are SECURITY DEFINER and took
-- ANY user id, callable without signing in — anyone could add any user to any
-- household. The app never calls them (it uses the auth.uid()-based versions),
-- so nobody may execute them now. The two versions the app uses are limited
-- to signed-in users.
REVOKE EXECUTE ON FUNCTION public.generate_household_invite(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.join_household_by_code(uuid, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.get_or_create_own_household() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.join_household_by_code(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_or_create_own_household() TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_household_by_code(text) TO authenticated;
