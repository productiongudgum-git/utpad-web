-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES FOR UTPAD / GUD GUM
-- Run this script in the Supabase Dashboard -> SQL Editor
--
-- IMPORTANT: This app currently uses a custom auth system (not Supabase Auth).
-- All queries go through the `anon` role via the anon key.
-- These policies enforce table-level access rules and protect audit trails.
--
-- When migrating to Supabase Auth in the future, replace `anon` policies
-- with `authenticated` policies and use auth.uid() / auth.jwt() for
-- user-level row filtering.
-- ==============================================================================

-- ============================================================
-- 0. CREATE ALERTS TABLE IF NOT EXISTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  severity text DEFAULT 'info',
  message text NOT NULL,
  related_entity_id uuid,
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 1. ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ============================================================

ALTER TABLE public.gg_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_worker_module_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gg_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gg_flavors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gg_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gg_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gg_vendor_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gg_inwarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packing_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_raw_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_finished_goods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gg_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. USER & WORKER MANAGEMENT POLICIES
-- ============================================================

-- gg_users: SELECT (for login), INSERT/UPDATE (admin management)
-- No DELETE — use soft-delete via `active` column
CREATE POLICY "gg_users_select" ON public.gg_users
  FOR SELECT TO anon USING (true);

CREATE POLICY "gg_users_insert" ON public.gg_users
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "gg_users_update" ON public.gg_users
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ops_workers: Full CRUD for admin operations
CREATE POLICY "ops_workers_select" ON public.ops_workers
  FOR SELECT TO anon USING (true);

CREATE POLICY "ops_workers_insert" ON public.ops_workers
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "ops_workers_update" ON public.ops_workers
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "ops_workers_delete" ON public.ops_workers
  FOR DELETE TO anon USING (true);

-- ops_worker_module_access: Full CRUD
CREATE POLICY "ops_worker_modules_select" ON public.ops_worker_module_access
  FOR SELECT TO anon USING (true);

CREATE POLICY "ops_worker_modules_insert" ON public.ops_worker_module_access
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "ops_worker_modules_update" ON public.ops_worker_module_access
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "ops_worker_modules_delete" ON public.ops_worker_module_access
  FOR DELETE TO anon USING (true);

-- ============================================================
-- 3. MASTER DATA POLICIES (Flavors, Ingredients, Recipes)
-- ============================================================

-- gg_ingredients: Full CRUD
CREATE POLICY "ingredients_select" ON public.gg_ingredients
  FOR SELECT TO anon USING (true);

CREATE POLICY "ingredients_insert" ON public.gg_ingredients
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "ingredients_update" ON public.gg_ingredients
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "ingredients_delete" ON public.gg_ingredients
  FOR DELETE TO anon USING (true);

-- gg_flavors: Full CRUD
CREATE POLICY "flavors_select" ON public.gg_flavors
  FOR SELECT TO anon USING (true);

CREATE POLICY "flavors_insert" ON public.gg_flavors
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "flavors_update" ON public.gg_flavors
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "flavors_delete" ON public.gg_flavors
  FOR DELETE TO anon USING (true);

-- gg_recipes: Full CRUD
CREATE POLICY "recipes_select" ON public.gg_recipes
  FOR SELECT TO anon USING (true);

CREATE POLICY "recipes_insert" ON public.gg_recipes
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "recipes_update" ON public.gg_recipes
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "recipes_delete" ON public.gg_recipes
  FOR DELETE TO anon USING (true);

-- recipe_lines: Full CRUD
CREATE POLICY "recipe_lines_select" ON public.recipe_lines
  FOR SELECT TO anon USING (true);

CREATE POLICY "recipe_lines_insert" ON public.recipe_lines
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "recipe_lines_update" ON public.recipe_lines
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "recipe_lines_delete" ON public.recipe_lines
  FOR DELETE TO anon USING (true);

-- ============================================================
-- 4. VENDOR MANAGEMENT POLICIES
-- ============================================================

-- gg_vendors: Full CRUD
CREATE POLICY "vendors_select" ON public.gg_vendors
  FOR SELECT TO anon USING (true);

CREATE POLICY "vendors_insert" ON public.gg_vendors
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "vendors_update" ON public.gg_vendors
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "vendors_delete" ON public.gg_vendors
  FOR DELETE TO anon USING (true);

-- gg_vendor_ingredients: Full CRUD
CREATE POLICY "vendor_ingredients_select" ON public.gg_vendor_ingredients
  FOR SELECT TO anon USING (true);

CREATE POLICY "vendor_ingredients_insert" ON public.gg_vendor_ingredients
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "vendor_ingredients_update" ON public.gg_vendor_ingredients
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "vendor_ingredients_delete" ON public.gg_vendor_ingredients
  FOR DELETE TO anon USING (true);

-- ============================================================
-- 5. OPERATIONS / MANUFACTURING POLICIES
--    No DELETE allowed — maintains audit trail for traceability
-- ============================================================

-- gg_inwarding: SELECT, INSERT, UPDATE only (audit trail)
CREATE POLICY "inwarding_select" ON public.gg_inwarding
  FOR SELECT TO anon USING (true);

CREATE POLICY "inwarding_insert" ON public.gg_inwarding
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "inwarding_update" ON public.gg_inwarding
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- production_batches: SELECT, INSERT, UPDATE only (audit trail)
CREATE POLICY "production_select" ON public.production_batches
  FOR SELECT TO anon USING (true);

CREATE POLICY "production_insert" ON public.production_batches
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "production_update" ON public.production_batches
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- packing_sessions: SELECT, INSERT, UPDATE only (audit trail)
CREATE POLICY "packing_select" ON public.packing_sessions
  FOR SELECT TO anon USING (true);

CREATE POLICY "packing_insert" ON public.packing_sessions
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "packing_update" ON public.packing_sessions
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- dispatch_events: SELECT, INSERT, UPDATE only (audit trail)
CREATE POLICY "dispatch_select" ON public.dispatch_events
  FOR SELECT TO anon USING (true);

CREATE POLICY "dispatch_insert" ON public.dispatch_events
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "dispatch_update" ON public.dispatch_events
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- returns_events: SELECT, INSERT, UPDATE only (audit trail)
CREATE POLICY "returns_select" ON public.returns_events
  FOR SELECT TO anon USING (true);

CREATE POLICY "returns_insert" ON public.returns_events
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "returns_update" ON public.returns_events
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- 6. INVENTORY POLICIES
--    No DELETE — inventory rows are system-managed
-- ============================================================

-- inventory_raw_materials: SELECT, INSERT, UPDATE only
CREATE POLICY "inv_raw_select" ON public.inventory_raw_materials
  FOR SELECT TO anon USING (true);

CREATE POLICY "inv_raw_insert" ON public.inventory_raw_materials
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "inv_raw_update" ON public.inventory_raw_materials
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- inventory_finished_goods: SELECT, INSERT, UPDATE only
CREATE POLICY "inv_fg_select" ON public.inventory_finished_goods
  FOR SELECT TO anon USING (true);

CREATE POLICY "inv_fg_insert" ON public.inventory_finished_goods
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "inv_fg_update" ON public.inventory_finished_goods
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- 7. CUSTOMERS POLICIES
-- ============================================================

-- gg_customers: Full CRUD
CREATE POLICY "customers_select" ON public.gg_customers
  FOR SELECT TO anon USING (true);

CREATE POLICY "customers_insert" ON public.gg_customers
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "customers_update" ON public.gg_customers
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "customers_delete" ON public.gg_customers
  FOR DELETE TO anon USING (true);

-- ============================================================
-- 8. ALERTS POLICIES
-- ============================================================

-- alerts: SELECT, INSERT, UPDATE only (no DELETE — resolved instead)
CREATE POLICY "alerts_select" ON public.alerts
  FOR SELECT TO anon USING (true);

CREATE POLICY "alerts_insert" ON public.alerts
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "alerts_update" ON public.alerts
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- 9. GRANT USAGE ON VIEWS
--    Views inherit the base table's RLS policies automatically.
--    Just ensure the anon role has SELECT on them.
-- ============================================================

GRANT SELECT ON public.flavor_definitions TO anon;
GRANT SELECT ON public.recipe_definitions TO anon;
GRANT SELECT ON public.recipe_ingredients TO anon;
GRANT SELECT ON public.inward_events TO anon;
GRANT SELECT ON public.users TO anon;

-- ============================================================
-- SUMMARY OF RESTRICTIONS
-- ============================================================
--
-- TABLE                        SELECT  INSERT  UPDATE  DELETE
-- ──────────────────────────────────────────────────────────────
-- gg_users                       ✓       ✓       ✓       ✗  (soft-delete via active flag)
-- ops_workers                    ✓       ✓       ✓       ✓
-- ops_worker_module_access       ✓       ✓       ✓       ✓
-- gg_ingredients                 ✓       ✓       ✓       ✓
-- gg_flavors                     ✓       ✓       ✓       ✓
-- gg_recipes                     ✓       ✓       ✓       ✓
-- recipe_lines                   ✓       ✓       ✓       ✓
-- gg_vendors                     ✓       ✓       ✓       ✓
-- gg_vendor_ingredients          ✓       ✓       ✓       ✓
-- gg_inwarding                   ✓       ✓       ✓       ✗  (audit trail)
-- production_batches             ✓       ✓       ✓       ✗  (audit trail)
-- packing_sessions               ✓       ✓       ✓       ✗  (audit trail)
-- dispatch_events                ✓       ✓       ✓       ✗  (audit trail)
-- returns_events                 ✓       ✓       ✓       ✗  (audit trail)
-- inventory_raw_materials        ✓       ✓       ✓       ✗  (system-managed)
-- inventory_finished_goods       ✓       ✓       ✓       ✗  (system-managed)
-- gg_customers                   ✓       ✓       ✓       ✓
-- alerts                         ✓       ✓       ✓       ✗  (resolve, don't delete)
--
-- NOTE: For stronger security, migrate to Supabase Auth and replace
-- anon policies with authenticated + auth.uid() / auth.jwt() policies
-- for per-user row filtering.
-- ==============================================================================
