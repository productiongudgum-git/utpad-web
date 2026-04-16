-- ============================================================
-- Table: gg_d2c_allocations
-- Tracks per-channel D2C inventory reservations.
-- When an allocation is saved the app inserts corresponding
-- dispatch_events (invoice_number = 'D2C-<id>') so that
-- the main inventory view reflects the deduction automatically.
-- ============================================================

CREATE TABLE IF NOT EXISTS gg_d2c_allocations (
  id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_name       text         NOT NULL,
  flavor_id          uuid         REFERENCES gg_flavors(id),
  flavor_name        text,
  boxes_allocated    integer      NOT NULL DEFAULT 0,
  reallocation_point integer      DEFAULT 0,
  created_at         timestamptz  DEFAULT now(),
  updated_at         timestamptz  DEFAULT now()
);

-- Row-level security (consistent with other tables – anon full access)
ALTER TABLE gg_d2c_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon full access on gg_d2c_allocations"
  ON gg_d2c_allocations
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_d2c_alloc_channel ON gg_d2c_allocations (channel_name);
CREATE INDEX IF NOT EXISTS idx_d2c_alloc_flavor  ON gg_d2c_allocations (flavor_id);

-- Allow the app to delete D2C-tagged dispatch_events (needed for reallocation)
-- Run this if dispatch_events currently has no DELETE policy:
-- CREATE POLICY "allow delete of d2c dispatch events"
--   ON dispatch_events
--   FOR DELETE
--   TO anon
--   USING (invoice_number LIKE 'D2C-%');
