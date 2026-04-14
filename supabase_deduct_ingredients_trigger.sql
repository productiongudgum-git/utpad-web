-- ============================================================
-- Trigger: Deduct ingredients from inventory when a production
-- batch is inserted into production_batches.
--
-- Logic:
--   1. Find all recipe_lines for the batch's recipe_id
--   2. Compute qty_used = recipe_line.qty * (actual_yield / planned_yield)
--      (falls back to planned_yield ratio = 1.0 if actual_yield is NULL)
--   3. Deduct qty_used from inventory_raw_materials.current_qty
--   4. Floor at 0 — never goes negative
--
-- Run this once in the Supabase SQL Editor.
-- ============================================================

-- ── Step 1: Create the trigger function ─────────────────────
CREATE OR REPLACE FUNCTION public.deduct_ingredients_on_production()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_planned_yield NUMERIC;
  v_actual_yield  NUMERIC;
  v_ratio         NUMERIC;
  rec             RECORD;
BEGIN
  -- Nothing to deduct if no recipe is linked
  IF NEW.recipe_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_planned_yield := COALESCE(NEW.planned_yield, 0);
  -- Use actual_yield if provided, otherwise assume 1:1 with planned
  v_actual_yield  := COALESCE(NEW.actual_yield, NEW.planned_yield, 0);

  -- Guard against division by zero
  IF v_planned_yield = 0 THEN
    RETURN NEW;
  END IF;

  v_ratio := v_actual_yield / v_planned_yield;

  -- Loop over every ingredient line in the recipe
  FOR rec IN
    SELECT ingredient_id, qty
    FROM   public.recipe_lines
    WHERE  recipe_id = NEW.recipe_id
  LOOP
    -- Upsert: create the inventory row at 0 if it doesn't exist yet,
    -- then deduct the scaled quantity, flooring at 0.
    INSERT INTO public.inventory_raw_materials
      (ingredient_id, current_qty, unit, low_stock_threshold, updated_at)
    VALUES
      (rec.ingredient_id, 0, 'kg', 0, now())
    ON CONFLICT (ingredient_id) DO UPDATE
      SET current_qty = GREATEST(
            0,
            public.inventory_raw_materials.current_qty - (rec.qty * v_ratio)
          ),
          updated_at = now();
  END LOOP;

  RETURN NEW;
END;
$$;

-- ── Step 2: Attach the trigger to production_batches ────────
DROP TRIGGER IF EXISTS trg_deduct_ingredients_on_production
  ON public.production_batches;

CREATE TRIGGER trg_deduct_ingredients_on_production
  AFTER INSERT
  ON public.production_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.deduct_ingredients_on_production();
