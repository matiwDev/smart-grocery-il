-- 029: database-advisor leftovers (2 Nov 2026).
-- Fixed search_path on the remaining functions, and no direct RPC calls to
-- trigger functions (handle_new_user, update_updated_at_column) or by anon.
-- Still flagged ON PURPOSE: get_household_members, get_or_create_own_household,
-- is_household_member, join_household_by_code(text), shares_household — signed-in
-- users must call them, and each acts only on auth.uid(). pg_trgm stays in public
-- (moving it would break the product-search indexes). Leaked-password protection
-- is an Auth setting in the Supabase dashboard, not SQL.

ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_invite_code() SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_household_invite(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.join_household_by_code(uuid, text) SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_invite_code() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_household_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_household_members() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_or_create_own_household() FROM PUBLIC, anon;
INSERT INTO public.schema_migrations (version) VALUES ('029_security_leftovers') ON CONFLICT DO NOTHING;
