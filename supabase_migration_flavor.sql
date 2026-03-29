-- =============================================
-- Migration: Add flavor_id to production_batches and packing_sessions
-- Purpose: Allow multiple production entries per day (same batch_code, different flavors)
-- =============================================

-- 1. Add a UUID primary key to production_batches (replacing batch_code as PK)
-- First add the new id column
ALTER TABLE public.production_batches
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

-- Add flavor_id column
ALTER TABLE public.production_batches
  ADD COLUMN IF NOT EXISTS flavor_id text;

-- Drop the old primary key (batch_code)
ALTER TABLE public.production_batches
  DROP CONSTRAINT IF EXISTS production_batches_pkey;

-- Set id as the new PK
ALTER TABLE public.production_batches
  ADD CONSTRAINT production_batches_pkey PRIMARY KEY (id);

-- Add unique constraint on (batch_code, flavor_id) to prevent duplicates
ALTER TABLE public.production_batches
  ADD CONSTRAINT production_batches_batch_flavor_unique UNIQUE (batch_code, flavor_id);

-- Add FK to flavor_definitions
ALTER TABLE public.production_batches
  ADD CONSTRAINT production_batches_flavor_id_fkey
  FOREIGN KEY (flavor_id) REFERENCES public.flavor_definitions(id);

-- 2. Add flavor_id to packing_sessions
ALTER TABLE public.packing_sessions
  ADD COLUMN IF NOT EXISTS flavor_id text;

-- Add FK for packing_sessions.flavor_id
ALTER TABLE public.packing_sessions
  ADD CONSTRAINT packing_sessions_flavor_id_fkey
  FOREIGN KEY (flavor_id) REFERENCES public.flavor_definitions(id);

-- 3. Enable realtime for these tables (if not already)
-- ALTER PUBLICATION supabase_realtime ADD TABLE production_batches;
-- ALTER PUBLICATION supabase_realtime ADD TABLE packing_sessions;
-- ALTER PUBLICATION supabase_realtime ADD TABLE dispatch_events;
