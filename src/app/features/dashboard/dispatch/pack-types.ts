/**
 * Types for the FIFO pack-and-reserve flow.
 *
 * Pipeline:
 *   loadAvailability(flavorIds) → Map<flavor_id, BatchAvailability[]>
 *   computeFifo(items, availability) → AllocationResult
 *   commitAllocation(invoiceId, result) → writes to gg_invoices.allocated_batches
 */

/** A line item on an invoice (flavor + box count). */
export interface InvoiceLineItem {
  flavor_id: string;
  flavor_name: string;
  quantity_boxes: number;
}

/** A specific production batch with its currently available boxes (after reservations). */
export interface BatchAvailability {
  batch_code: string;
  production_date: string;
  available_boxes: number;
}

/** A single batch row inside a flavor's allocation, mutable so the user can edit `boxes_to_take`. */
export interface BatchLine {
  batch_code: string;
  production_date: string;
  available_boxes: number;
  boxes_to_take: number;
}

/** Allocation summary for one flavor on the invoice. */
export interface FlavorAllocation {
  flavor_id: string;
  flavor_name: string;
  needed: number;
  /** Batches that have stock for this flavor, in FIFO order. Includes ones with boxes_to_take=0. */
  batches: BatchLine[];
}

export interface AllocationResult {
  flavors: FlavorAllocation[];
  fullyAllocated: boolean;
  partialFlavors: string[];
}

/** Persistent shape stored in gg_invoices.allocated_batches (JSONB column). */
export interface AllocatedBatchRow {
  flavor_id: string;
  batch_code: string;
  boxes_reserved: number;
}

/** Compact invoice descriptor passed to the pack modal. */
export interface InvoiceForPacking {
  id: string;
  invoice_number: string;
  customer_name: string;
  items: InvoiceLineItem[];
}
