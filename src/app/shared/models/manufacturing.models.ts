// Manufacturing operations domain models
// Mirrors the Supabase schema (process-manufacturing-inventory)

export interface FlavorDefinition {
  id: string;
  name: string;
  code: string;
  active: boolean;
  recipe_id: string | null;
  yield_threshold: number | null;
  shelf_life_days: number | null;
}

export interface RecipeIngredient {
  id: string;
  name: string;
  unit: string;
  active: boolean;
}

export interface RecipeDefinition {
  id: string;
  name: string;
  code: string;
  description: string;
  active: boolean;
  yield_factor: number | null;
  tolerance_pct: number;
  primary_ingredient_id: string | null;
}

export interface RecipeLine {
  recipe_id: string;
  ingredient_id: string;
  qty: number;
  // Joined
  ingredient?: RecipeIngredient;
}

export interface ProductionBatch {
  id?: string;
  batch_code: string;
  sku_id: string;
  recipe_id: string;
  production_date: string;
  worker_id: string;
  flavor_id: string | null;
  status: 'open' | 'packed';
  planned_yield: number | null;
  actual_yield: number | null;
  created_at: string;
  // Joined
  sku?: FlavorDefinition;
  flavor?: FlavorDefinition;
}

export interface ProductionBatchIngredient {
  id: string;
  batch_code: string;
  ingredient_id: string;
  planned_qty: number;
  actual_qty: number;
  created_at: string;
  // Joined
  ingredient?: RecipeIngredient;
}

export interface PackingSession {
  id: string;
  batch_code: string;
  flavor_id: string | null;
  session_date: string;
  worker_id: string;
  boxes_packed: number;
  created_at: string;
  // Joined
  flavor?: FlavorDefinition;
}

export interface DispatchEvent {
  id: string;
  batch_code: string;
  sku_id: string;
  boxes_dispatched: number;
  customer_name: string | null;
  invoice_number: string;
  dispatch_date: string;
  worker_id: string;
  created_at: string;
  // Joined
  sku?: FlavorDefinition;
}

export interface ReturnsEvent {
  id: string;
  batch_code: string;
  sku_id: string;
  qty_returned: number;
  reason: string | null;
  return_date: string;
  worker_id: string;
  created_at: string;
}

export interface InwardEvent {
  id: string;
  ingredient_id: string;
  vendor_id: string | null;
  qty: number;
  unit: string;
  inward_date: string;
  expiry_date: string | null;
  lot_ref: string | null;
  worker_id: string;
  created_at: string;
  // Joined
  ingredient?: RecipeIngredient;
  vendor?: { name: string };
}

export interface InventoryRawMaterial {
  ingredient_id: string;
  current_qty: number;
  unit: string;
  low_stock_threshold: number | null;
  updated_at: string;
  // Joined
  ingredient?: RecipeIngredient;
  // Computed
  status?: 'ok' | 'low';
}

export interface InventoryFinishedGoods {
  id: string;
  sku_id: string;
  batch_code: string;
  boxes_available: number;
  boxes_returned: number;
  updated_at: string;
  // Joined
  sku?: FlavorDefinition;
  batch?: ProductionBatch;
}

export interface InventorySkuSummary {
  sku_id: string;
  sku_name: string;
  sku_code: string;
  total_produced: number;
  total_packed: number;
  total_dispatched: number;
  total_returned: number;
  net_available: number;
  batches: InventoryFinishedGoods[];
}

export interface Alert {
  id: string;
  type: 'low_raw_material' | 'low_finished_goods' | 'low_yield' | 'packing_overdue' | 'expiry_approaching';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  related_entity_id: string | null;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

export interface InventoryLedgerEntry {
  id: string;
  event_type: 'inward' | 'production_deduct' | 'pack' | 'dispatch' | 'return';
  entity_id: string;
  entity_type: 'batch' | 'ingredient';
  quantity_delta: number;
  unit: string;
  actor_id: string;
  batch_code: string | null;
  created_at: string;
}

export interface FifoAllocationLine {
  batch_code: string;
  production_date: string;
  boxes_available: number;
  boxes_to_take: number;
}

export interface OpsWorker {
  worker_id: string;
  name: string;
  phone: string | null;
  pin: string | null;
  worker_role: string;
  active: boolean;
  created_at: string;
  // Joined modules
  modules?: string[];
}

// Report column definitions
export interface ProductionReportRow {
  batch_code: string;
  sku: string;
  recipe: string;
  production_date: string;
  worker: string;
  planned_yield: number | null;
  actual_yield: number | null;
}

export interface PackingReportRow {
  batch_code: string;
  sku: string;
  session_date: string;
  worker: string;
  boxes_packed: number;
  cumulative_packed: number;
  remaining: number | null;
}

export interface DispatchReportRow {
  invoice_number: string;
  customer_name: string | null;
  sku: string;
  batch_code: string;
  boxes_dispatched: number;
  dispatch_date: string;
  worker: string;
}

export interface InventoryReportRow {
  name: string;
  type: 'raw' | 'finished';
  current_qty: number;
  unit: string;
  low_threshold: number | null;
  status: 'OK' | 'LOW';
}

export interface ReturnsReportRow {
  batch_code: string;
  sku: string;
  qty_returned: number;
  reason: string | null;
  return_date: string;
  worker: string;
}

export type ReportType = 'production' | 'packing' | 'dispatch' | 'inventory' | 'returns';
