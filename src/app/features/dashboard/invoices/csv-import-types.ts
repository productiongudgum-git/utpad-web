/**
 * Type definitions for the Zoho CSV invoice import flow.
 *
 * Pipeline:
 *
 *   File ──parse──▶ ZohoCsvRow[] ──aggregate──▶ AggregatedInvoice[]
 *     ──resolveAndValidate(catalogs)──▶ ImportPreview
 *     ──commit──▶ ImportResult
 */

// ──────────────────────────────────────────────────────────────────────
// Raw CSV
// ──────────────────────────────────────────────────────────────────────

/**
 * A single parsed row from Zoho's invoice CSV export.
 * Zoho emits ~150 columns; we only depend on these.
 * Extra columns are preserved by PapaParse but ignored by us.
 */
export interface ZohoCsvRow {
  'Invoice Date': string;
  'Invoice ID': string;
  'Invoice Number': string;
  'Invoice Status': string;
  'Customer ID': string;
  'Customer Name': string;
  'Due Date': string;
  'Item Name': string;
  'Quantity': string;     // numeric string, e.g. "16.00" — boxes
  'Product ID': string;   // Zoho's per-item ID, used for strict flavor matching
  [key: string]: string;
}

// ──────────────────────────────────────────────────────────────────────
// Aggregated (one entry per invoice)
// ──────────────────────────────────────────────────────────────────────

export interface AggregatedLineItem {
  zoho_product_id: string;
  item_name: string;
  quantity_boxes: number;
}

export interface AggregatedInvoice {
  invoice_number: string;
  zoho_invoice_id: string;
  zoho_customer_id: string;
  customer_name: string;
  invoice_date: string;
  line_items: AggregatedLineItem[];
}

// ──────────────────────────────────────────────────────────────────────
// Catalog snapshots loaded from Supabase before validation
// ──────────────────────────────────────────────────────────────────────

export interface FlavorRow {
  id: string;
  name: string;
  zoho_product_id: string | null;
}

export interface CustomerRow {
  id: string;
  name: string;
  zoho_customer_id: string | null;
}

export interface ExistingInvoiceRow {
  id: string;
  invoice_number: string;
  is_dispatched: boolean;
}

export interface Catalogs {
  flavors: FlavorRow[];
  customers: CustomerRow[];
  existingInvoices: ExistingInvoiceRow[];
}

// ──────────────────────────────────────────────────────────────────────
// Validation / preview
// ──────────────────────────────────────────────────────────────────────

export interface ResolvedCustomer {
  /** existing gg_customers.id if this customer already exists */
  existing_id?: string;
  name: string;
  zoho_customer_id: string;
  willCreate: boolean;
}

export interface ResolvedItem {
  flavor_id: string;
  flavor_name: string;
  quantity_boxes: number;
}

/**
 * Status of an invoice after validation:
 *   - 'new'                  → no matching invoice_number, will INSERT
 *   - 'update'               → exists, not dispatched, will UPDATE
 *   - 'dispatched_warning'   → exists and already dispatched. Won't be
 *                              changed unless `override === true`.
 *   - 'skipped_no_items'     → no line items resolved to a flavor. Skip.
 */
export type ResolvedStatus =
  | 'new'
  | 'update'
  | 'dispatched_warning'
  | 'skipped_no_items';

export interface ResolvedInvoice {
  invoice_number: string;
  zoho_invoice_id: string;
  customer: ResolvedCustomer;
  items: ResolvedItem[];
  status: ResolvedStatus;

  /** existingInvoiceId set when status is 'update' or 'dispatched_warning'. */
  existingInvoiceId?: string;

  /** Number of line items in the CSV that didn't map to a flavor. */
  skippedLines: number;

  /** User toggle: only meaningful when status === 'dispatched_warning'. */
  override: boolean;
}

/**
 * A Zoho product ID seen in the CSV that doesn't map to any gg_flavor.
 * The user can stage a mapping inline in the preview by setting
 * `selectedFlavorId`. The modal calls `applyFlavorMappings` to persist
 * any staged selections, then re-validates.
 */
export interface UnmappedProduct {
  zoho_product_id: string;
  item_name: string;
  /** How many CSV line items referenced this product ID. */
  occurrences: number;
  /** User-staged target flavor (Phase 2 inline mapping UI). */
  selectedFlavorId?: string;
}

export interface ImportPreview {
  totalLineItems: number;
  totalInvoicesInCsv: number;
  invoices: ResolvedInvoice[];
  unmappedProducts: UnmappedProduct[];

  // Headline counts for the summary card
  newCount: number;
  updateCount: number;
  dispatchedWarningCount: number;
  skippedInvoiceCount: number;
  skippedLineCount: number;
  newCustomerCount: number;
}

// ──────────────────────────────────────────────────────────────────────
// Commit / results
// ──────────────────────────────────────────────────────────────────────

export type ImportRowStatus = 'created' | 'updated' | 'skipped' | 'error';

export interface ImportResultRow {
  invoice_number: string;
  status: ImportRowStatus;
  reason?: string;
}

export interface ImportResult {
  rows: ImportResultRow[];
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
}

// ──────────────────────────────────────────────────────────────────────
// Progress reporting (for the modal's progress bar)
// ──────────────────────────────────────────────────────────────────────

export interface ImportProgress {
  done: number;
  total: number;
  phase: 'customers' | 'invoices';
}
