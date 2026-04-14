-- ================================================================
-- Drop the old trigger and function that deducted expected_boxes
-- from production_batches when an invoice was marked as packed.
--
-- Inventory is now computed dynamically in the frontend:
--   Net stock = SUM(packing_sessions.boxes_packed)
--             - SUM(boxes in gg_invoices where is_packed = true)
--
-- Run this once in the Supabase SQL Editor.
-- ================================================================

DROP TRIGGER IF EXISTS trg_deduct_boxes_on_invoice_pack
  ON public.gg_invoices;

DROP FUNCTION IF EXISTS public.deduct_boxes_on_invoice_pack();
