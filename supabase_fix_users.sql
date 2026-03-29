-- ==============================================================================
-- FIX gg_users TABLE: Add missing columns required by the web dashboard login
-- Run this in Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- Add missing columns (IF NOT EXISTS prevents errors if they already exist)
ALTER TABLE public.gg_users ADD COLUMN IF NOT EXISTS username text UNIQUE;
ALTER TABLE public.gg_users ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.gg_users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE public.gg_users ADD COLUMN IF NOT EXISTS modules text[] DEFAULT '{}';
ALTER TABLE public.gg_users ADD COLUMN IF NOT EXISTS mobile_number text;
ALTER TABLE public.gg_users ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;

-- ==============================================================================
-- INSERT DEFAULT ADMIN USER
-- Login with: username = admin, password = admin123
-- ==============================================================================
INSERT INTO public.gg_users (username, name, email, password_hash, role, modules, mobile_number, active)
VALUES (
  'admin',
  'Admin',
  'admin@gudgum.com',
  'admin123',
  'Platform_Admin',
  ARRAY['inwarding', 'production', 'packing', 'dispatch'],
  '9999999999',
  true
)
ON CONFLICT (username) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  modules = EXCLUDED.modules,
  active = EXCLUDED.active;

-- ==============================================================================
-- VERIFY: Check the admin user exists
-- ==============================================================================
SELECT id, username, name, role, modules, active FROM public.gg_users WHERE username = 'admin';
