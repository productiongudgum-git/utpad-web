-- ==============================================================================
-- ENABLE SUPABASE REALTIME ON ALL ACTUAL TABLES
-- Run this in Supabase Dashboard -> SQL Editor
--
-- IMPORTANT: Only actual tables can be added to the realtime publication.
-- Views (flavor_definitions, recipe_definitions, recipe_ingredients,
-- inward_events, users) CANNOT be added — they inherit changes from
-- their underlying base tables automatically.
-- ==============================================================================

-- Step 1: Remove all existing tables from the publication to start clean
-- (This prevents "already exists" errors)
ALTER PUBLICATION supabase_realtime SET TABLE ONLY pg_catalog.pg_class;

-- Step 2: Add ALL actual tables to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.gg_users,
  public.ops_workers,
  public.ops_worker_module_access,
  public.gg_ingredients,
  public.gg_flavors,
  public.gg_recipes,
  public.recipe_lines,
  public.gg_vendors,
  public.gg_vendor_ingredients,
  public.gg_inwarding,
  public.production_batches,
  public.packing_sessions,
  public.dispatch_events,
  public.returns_events,
  public.inventory_raw_materials,
  public.inventory_finished_goods,
  public.gg_customers,
  public.alerts;

-- ==============================================================================
-- VERIFICATION: Check which tables are in the publication
-- ==============================================================================
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
