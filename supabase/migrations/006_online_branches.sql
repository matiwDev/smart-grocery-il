-- Phase 11 step 4: online/delivery branches.
-- Adds an is_online flag to branches and seeds one online "branch" per chain
-- that offers delivery (Shufersal, Rami Levy). Online branches have no
-- lat/lng (there's no physical location to map) and are surfaced in the
-- Location view as a fixed-position list item, not a map pin — see
-- BranchMapContainer.tsx / app/page.tsx's "כולל משלוח"/"Include delivery"
-- toggle.
--
-- NOT YET APPLIED as of this writing (2026-07-27) — this repo has no
-- supabase CLI / direct Postgres connection configured (see CLAUDE.md
-- "Applying migrations"). Paste this file into the Supabase Dashboard SQL
-- Editor by hand to actually take effect.

ALTER TABLE public.branches
ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false;

INSERT INTO public.branches (chain_id, name_he, name_en, city_he, city_en, lat, lng, is_active, is_online)
SELECT 'shufersal', 'שופרסל אונליין', 'Shufersal Online', NULL, NULL, NULL, NULL, true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.branches WHERE chain_id = 'shufersal' AND is_online = true
);

INSERT INTO public.branches (chain_id, name_he, name_en, city_he, city_en, lat, lng, is_active, is_online)
SELECT 'rami_levy', 'רמי לוי אונליין', 'Rami Levy Online', NULL, NULL, NULL, NULL, true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.branches WHERE chain_id = 'rami_levy' AND is_online = true
);
