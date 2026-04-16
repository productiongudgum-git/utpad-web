-- ============================================================
-- Trigger: deduct_packing_materials
-- Fires AFTER INSERT on packing_sessions
-- Deducts Monocarton (flavor-specific) and Ziplock (generic)
-- from inventory_raw_materials when boxes are packed.
-- Never lets current_qty go below 0.
-- ============================================================

CREATE OR REPLACE FUNCTION deduct_packing_materials()
RETURNS TRIGGER AS $$
DECLARE
  v_flavor_name        TEXT;
  v_monocarton_id      UUID;
  v_ziplock_id         UUID;
BEGIN
  -- 1. Resolve flavor name
  SELECT name INTO v_flavor_name
  FROM gg_flavors
  WHERE id = NEW.flavor_id;

  IF v_flavor_name IS NULL THEN
    RETURN NEW;  -- unknown flavor, skip silently
  END IF;

  -- 2. Deduct flavor-specific Monocarton
  SELECT id INTO v_monocarton_id
  FROM gg_ingredients
  WHERE name ILIKE '%monocarton%'
    AND name ILIKE '%' || v_flavor_name || '%'
  LIMIT 1;

  IF v_monocarton_id IS NOT NULL THEN
    UPDATE inventory_raw_materials
    SET current_qty = GREATEST(0, current_qty - NEW.boxes_packed),
        updated_at  = now()
    WHERE ingredient_id = v_monocarton_id;
  END IF;

  -- 3. Deduct generic Ziplock
  SELECT id INTO v_ziplock_id
  FROM gg_ingredients
  WHERE name ILIKE '%ziplock%'
  LIMIT 1;

  IF v_ziplock_id IS NOT NULL THEN
    UPDATE inventory_raw_materials
    SET current_qty = GREATEST(0, current_qty - NEW.boxes_packed),
        updated_at  = now()
    WHERE ingredient_id = v_ziplock_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-create trigger (idempotent)
DROP TRIGGER IF EXISTS trg_deduct_packing_materials ON packing_sessions;

CREATE TRIGGER trg_deduct_packing_materials
  AFTER INSERT ON packing_sessions
  FOR EACH ROW
  EXECUTE FUNCTION deduct_packing_materials();
