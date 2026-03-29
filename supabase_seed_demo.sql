-- ==============================================================================
-- DEMO / SEED DATA FOR UTPAD WEB DASHBOARD
-- Safe to run multiple times. Records can be deleted from the dashboard UI.
-- ==============================================================================

-- Ingredients + raw material inventory
WITH seeded_ingredients AS (
  INSERT INTO public.gg_ingredients (name, default_unit, active)
  VALUES
    ('Gum Base', 'kg', true),
    ('Menthol Crystals', 'kg', true),
    ('Spearmint Flavor', 'kg', true),
    ('Sugar', 'kg', true),
    ('Carton Boxes', 'pcs', true)
  ON CONFLICT DO NOTHING
  RETURNING id, name, default_unit
)
INSERT INTO public.inventory_raw_materials (ingredient_id, current_qty, unit, low_stock_threshold)
SELECT id,
  CASE name
    WHEN 'Gum Base' THEN 120
    WHEN 'Menthol Crystals' THEN 18
    WHEN 'Spearmint Flavor' THEN 9
    WHEN 'Sugar' THEN 240
    ELSE 75
  END,
  default_unit,
  CASE name
    WHEN 'Gum Base' THEN 40
    WHEN 'Menthol Crystals' THEN 12
    WHEN 'Spearmint Flavor' THEN 10
    WHEN 'Sugar' THEN 60
    ELSE 30
  END
FROM (
  SELECT id, name, default_unit FROM seeded_ingredients
  UNION
  SELECT id, name, default_unit FROM public.gg_ingredients WHERE name IN (
    'Gum Base', 'Menthol Crystals', 'Spearmint Flavor', 'Sugar', 'Carton Boxes'
  )
) s
ON CONFLICT (ingredient_id) DO UPDATE
SET current_qty = EXCLUDED.current_qty,
    unit = EXCLUDED.unit,
    low_stock_threshold = EXCLUDED.low_stock_threshold;

-- Flavors
INSERT INTO public.gg_flavors (name, code, description, active)
VALUES
  ('Spearmint', 'SPM-01', 'Core mint chewing gum flavor', true),
  ('Peppermint', 'PPM-01', 'Cooling mint chewing gum flavor', true),
  ('Lemon Mint', 'LMN-01', 'Citrus mint chewing gum flavor', true)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    active = EXCLUDED.active;

-- Customers
INSERT INTO public.gg_customers (name, contact_person, phone, email, address)
VALUES
  ('Metro Wholesale', 'Ravi Shah', '9876500011', 'ravi@metrowholesale.in', 'Mumbai'),
  ('Fresh Mart Retail', 'Anita Rao', '9876500012', 'anita@freshmart.in', 'Bengaluru')
ON CONFLICT DO NOTHING;

-- Vendors
INSERT INTO public.gg_vendors (name, contact_person, phone, email, address)
VALUES
  ('MintChem Supplies', 'Sanjay Mehta', '9876500021', 'sales@mintchem.in', 'Ahmedabad'),
  ('PackRight Industries', 'Priya Jain', '9876500022', 'hello@packright.in', 'Pune')
ON CONFLICT DO NOTHING;
