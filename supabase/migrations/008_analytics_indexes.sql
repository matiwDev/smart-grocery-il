-- Phase 15 step 7: indexes backing app/api/analytics/route.ts.
--
-- ph_captured_chain speeds up the price_drops query's two range scans over
-- price_history (captured_at >= / < cutoff), which without an index means a
-- full table scan on a table that's already 200k+ rows (see CLAUDE.md
-- "Phase 14"). bi_product speeds up the savings/top_products queries' `IN
-- (basket ids)` + product_id lookups over basket_items.
--
-- NOT YET APPLIED as of this writing (2026-07-28) — this repo has no
-- supabase CLI / direct Postgres connection configured (see CLAUDE.md
-- "Applying migrations"). Paste this file into the Supabase Dashboard SQL
-- Editor by hand to actually take effect. The analytics route works without
-- it (Postgres just falls back to sequential scans), so this is a
-- performance migration, not a correctness one — safe to defer.

CREATE INDEX IF NOT EXISTS ph_captured_chain
  ON price_history(chain_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS bi_product
  ON basket_items(product_id);
