-- Phase 15 step 1: branches.external_id for cross-chain branch dedup.
--
-- scripts/seed-branches.ts previously deduped Shufersal-only rows client-side
-- against (name_he, address). Extending it to 5 more chains needs a stable
-- per-chain identifier instead: Shufersal's Stores feed has StoreID, the
-- laibcatalog platform (Victory/Mahsanei Hashuk) has a branch `number`, and
-- the Cerberus FTP platform (Yohananof/Osher Ad/Keshet Teamim) only exposes a
-- StoreID via its price-file names (no name/address feed at all — confirmed
-- live this session, see CLAUDE.md). external_id stores whichever of these
-- applies, as text.
--
-- Deliberately NOT a partial index (`WHERE external_id IS NOT NULL`, as an
-- earlier draft of this task spec'd it): PostgREST's on_conflict=... upsert
-- emits a plain `ON CONFLICT (chain_id, external_id)` with no predicate, and
-- Postgres will only infer a partial unique index when the ON CONFLICT
-- clause repeats its exact predicate — which PostgREST's upsert helper can't
-- express. A plain (non-partial) unique index works instead: Postgres unique
-- indexes already treat NULL as distinct from every other NULL, so the 432
-- existing rows (all external_id IS NULL) don't collide with each other or
-- with future rows that do have a real external_id.
--
-- NOT YET APPLIED as of this writing (2026-07-28) — this repo has no
-- supabase CLI / direct Postgres connection configured (see CLAUDE.md
-- "Applying migrations"). Paste this file into the Supabase Dashboard SQL
-- Editor by hand before running `npm run seed:branches`.

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS external_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS branches_chain_external_id
  ON public.branches(chain_id, external_id);
