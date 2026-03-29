-- ==============================================================================
-- COMPLETELY INITIALIZE SUPABASE SCHEMA FOR UTPAD / GUD GUM
-- Run this script in the Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- 1. Core Users and Workers
CREATE TABLE IF NOT EXISTS public.gg_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  password text,
  role text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ops_workers (
  worker_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  pin text,
  worker_role text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ops_worker_module_access (
  worker_id uuid REFERENCES public.ops_workers(worker_id) ON DELETE CASCADE,
  module_name text,
  PRIMARY KEY (worker_id, module_name)
);

-- 2. Master Data (Flavors, Ingredients, Recipes)
-- The app uses both gg_* and *_definitions naming conventions in different components.
-- We create the base tables and then views to satisfy both.

CREATE TABLE IF NOT EXISTS public.gg_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  default_unit text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gg_flavors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  description text,
  active boolean DEFAULT true,
  recipe_id uuid,
  yield_threshold numeric,
  shelf_life_days integer,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gg_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  code text UNIQUE,
  flavor_id uuid REFERENCES public.gg_flavors(id),
  description text,
  is_active boolean DEFAULT true,
  yield_factor numeric,
  tolerance_pct numeric DEFAULT 0,
  primary_ingredient_id uuid REFERENCES public.gg_ingredients(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recipe_lines (
  recipe_id uuid REFERENCES public.gg_recipes(id) ON DELETE CASCADE,
  ingredient_id uuid REFERENCES public.gg_ingredients(id),
  qty numeric NOT NULL,
  PRIMARY KEY (recipe_id, ingredient_id)
);

-- ALIAS VIEWS for frontend components that use different names
CREATE OR REPLACE VIEW public.flavor_definitions AS SELECT * FROM public.gg_flavors;
CREATE OR REPLACE VIEW public.recipe_definitions AS SELECT id, title as name, code, description, is_active as active, yield_factor, tolerance_pct, primary_ingredient_id FROM public.gg_recipes;
CREATE OR REPLACE VIEW public.recipe_ingredients AS SELECT * FROM public.gg_ingredients;

-- 3. Vendors and Inwarding
CREATE TABLE IF NOT EXISTS public.gg_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gg_vendor_ingredients (
  vendor_id uuid REFERENCES public.gg_vendors(id) ON DELETE CASCADE,
  ingredient_id uuid REFERENCES public.gg_ingredients(id) ON DELETE CASCADE,
  PRIMARY KEY (vendor_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS public.gg_inwarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES public.gg_vendors(id),
  ingredient_id uuid REFERENCES public.gg_ingredients(id),
  qty numeric NOT NULL,
  unit text,
  inward_date date NOT NULL,
  expiry_date date,
  lot_ref text,
  worker_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE VIEW public.inward_events AS SELECT * FROM public.gg_inwarding;

-- 4. Manufacturing Operations (Production, Packing, Dispatch)
CREATE TABLE IF NOT EXISTS public.production_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code text NOT NULL,
  sku_id uuid REFERENCES public.gg_flavors(id),
  recipe_id uuid REFERENCES public.gg_recipes(id),
  production_date date NOT NULL,
  worker_id uuid,
  flavor_id uuid REFERENCES public.gg_flavors(id),
  status text DEFAULT 'open',
  planned_yield numeric,
  actual_yield numeric,
  created_at timestamptz DEFAULT now(),
  UNIQUE (batch_code, flavor_id)
);

CREATE TABLE IF NOT EXISTS public.packing_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code text NOT NULL,
  flavor_id uuid REFERENCES public.gg_flavors(id),
  session_date date NOT NULL,
  worker_id uuid,
  boxes_packed integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispatch_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code text NOT NULL,
  sku_id uuid REFERENCES public.gg_flavors(id),
  boxes_dispatched integer DEFAULT 0,
  customer_name text,
  invoice_number text,
  dispatch_date date NOT NULL,
  worker_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.returns_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code text NOT NULL,
  sku_id uuid REFERENCES public.gg_flavors(id),
  qty_returned integer DEFAULT 0,
  reason text,
  return_date date NOT NULL,
  worker_id uuid,
  created_at timestamptz DEFAULT now()
);

-- 5. Inventory
CREATE TABLE IF NOT EXISTS public.inventory_raw_materials (
  ingredient_id uuid PRIMARY KEY REFERENCES public.gg_ingredients(id),
  current_qty numeric DEFAULT 0,
  unit text,
  low_stock_threshold numeric,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_finished_goods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id uuid REFERENCES public.gg_flavors(id),
  batch_code text NOT NULL,
  boxes_available integer DEFAULT 0,
  boxes_returned integer DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(sku_id, batch_code)
);

-- 6. Customers
CREATE TABLE IF NOT EXISTS public.gg_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address text,
  created_at timestamptz DEFAULT now()
);

-- Create a dummy auth user view if someone queries it directly instead of using auth API
CREATE OR REPLACE VIEW public.users AS SELECT * FROM public.gg_users;
