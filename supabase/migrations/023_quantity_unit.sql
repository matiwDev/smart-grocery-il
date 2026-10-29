-- 023 — APPLIED 2026-10-29. Amount per list item: a count of units (default)
-- or a weight in kilograms ("6 apples", "1.5 kg potatoes"). quantity_value is
-- already numeric, so decimals work; trips keep the unit too.
ALTER TABLE public.basket_items
  ADD COLUMN IF NOT EXISTS quantity_unit TEXT NOT NULL DEFAULT 'unit'
  CHECK (quantity_unit IN ('unit', 'kg'));
ALTER TABLE public.trip_items
  ADD COLUMN IF NOT EXISTS quantity_unit TEXT NOT NULL DEFAULT 'unit'
  CHECK (quantity_unit IN ('unit', 'kg'));
