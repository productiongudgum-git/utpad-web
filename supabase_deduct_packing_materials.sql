-- ============================================================
-- Packing-materials consumption — EXPLICIT MAPPING
--
-- Packing materials (monocartons, ziplocks, …) are ordinary rows in
-- gg_ingredients, tagged so the trigger knows what to deduct — no more
-- guessing from ingredient names.
--
--   packing_role       'monocarton' | 'ziplock' | 'other'
--                      (NULL  = this ingredient is NOT a packing material)
--   packing_flavor_id  the flavour it belongs to
--                      (NULL  = generic, consumed for EVERY flavour)
--   qty_per_box        how many units are used per box packed (default 1)
--
-- When a packing session is inserted, the trigger deducts every matching
-- packing material by  qty_per_box × boxes_packed  from inventory_raw_materials.
-- Matching is by the explicit flavour link, so renames / typos / look-alike
-- flavour names can never mis-deduct. Stock is floored at 0.
-- ============================================================

-- 1. Columns on gg_ingredients (idempotent)
ALTER TABLE gg_ingredients
  ADD COLUMN IF NOT EXISTS packing_role      text,
  ADD COLUMN IF NOT EXISTS packing_flavor_id uuid REFERENCES gg_flavors(id),
  ADD COLUMN IF NOT EXISTS qty_per_box       numeric NOT NULL DEFAULT 1;

-- 2. Trigger function — one set-based UPDATE handles all matching materials
CREATE OR REPLACE FUNCTION deduct_packing_materials()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE inventory_raw_materials AS inv
  SET current_qty = GREATEST(0, inv.current_qty - (gi.qty_per_box * NEW.boxes_packed)),
      updated_at  = now()
  FROM gg_ingredients AS gi
  WHERE gi.id = inv.ingredient_id
    AND gi.packing_role IS NOT NULL
    AND (
         gi.packing_flavor_id = NEW.flavor_id   -- flavour-specific (monocarton)
      OR gi.packing_flavor_id IS NULL           -- generic (ziplock / other)
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Trigger (idempotent)
DROP TRIGGER IF EXISTS trg_deduct_packing_materials ON packing_sessions;

CREATE TRIGGER trg_deduct_packing_materials
  AFTER INSERT ON packing_sessions
  FOR EACH ROW
  EXECUTE FUNCTION deduct_packing_materials();

-- 4. Refresh PostgREST schema cache so the new columns are visible to the app
NOTIFY pgrst, 'reload schema';
