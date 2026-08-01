/**
 * INVENTORY RESET — FIFO retention planner (pure, no I/O)
 * ───────────────────────────────────────────────────────
 * An admin corrects a flavour's sellable stock down to a target box count.
 * Because stock is consumed oldest-first (FIFO), the boxes that should survive
 * a correction are the NEWEST ones — so we walk batches newest → oldest,
 * keeping until the target is met, and reset everything older.
 *
 *   Charcoal: batch1 200 (oldest), batch2 600, batch3 200 (newest) → target 600
 *     batch3  200  keep 200  (running 200)
 *     batch2  600  keep 400  (running 600)  ← trimmed
 *     batch1  200  keep   0                 ← fully reset
 *   Total reset = 400.
 *
 * The target is measured in AVAILABLE boxes (onHand − reserved), the same
 * number the Inventory screen shows. Because reserved boxes are excluded from
 * available, a reset can never eat into stock already committed to an open
 * invoice — reservations stay fully backed at `target + reserved` on hand.
 *
 * The plan is emitted as negative `boxes_packed` adjustment rows carrying the
 * SAME batch_code and production_batch_id as the rows they offset, so every
 * consumer that sums packing_sessions (8 web screens, the ops-api FIFO, and
 * the Android app) nets out correctly with no change to any of them.
 *
 * Each adjustment inherits the session_date of the row it offsets — never
 * today's date. dashboard-home computes "packed today" with a
 * `session_date = today` filter, and a negative row dated today would corrupt
 * that day's production figure.
 */

/** One underlying packing_sessions row inside a batch. */
export interface ResetRowInput {
  id: string;
  sessionDate: string;              // ISO YYYY-MM-DD
  productionBatchId: string | null; // null for OPENING-STOCK
  boxesPacked: number;
}

/** A batch (grouped by batch_code, as the Inventory screen groups it). */
export interface ResetBatchInput {
  batchCode: string;
  /** Earliest session_date across the batch's rows — matches the ops-api FIFO grouping. */
  sessionDate: string;
  /** onHand − reserved, exactly as the Inventory screen computes it. */
  available: number;
  reserved: number;
  rows: ResetRowInput[];
}

/** A negative packing_sessions row to insert. `boxes` is a positive magnitude. */
export interface ResetAdjustment {
  batchCode: string;
  productionBatchId: string | null;
  sessionDate: string;
  boxes: number;
}

export interface ResetBatchPlan {
  batchCode: string;
  sessionDate: string;
  availableBefore: number;
  keep: number;
  reset: number;
}

export interface ResetPlan {
  ok: boolean;
  /** Why the reset is refused. Set only when ok === false. */
  error: string;
  currentAvailable: number;
  target: number;
  totalReset: number;
  totalReserved: number;
  /** Newest → oldest, the order retention was applied in. */
  batches: ResetBatchPlan[];
  adjustments: ResetAdjustment[];
  warnings: string[];
}

/**
 * Decode a batch code (e.g. "AI0626" = day 08, month 06, year 26 → 8 Jun 2026)
 * back to a timestamp. Special codes (OPENING-STOCK, RESET-STOCK, anything not
 * matching the format) return 0 so they land oldest in a newest-first sort.
 */
export function batchCodeToTimestamp(code: string): number {
  const match = /^([A-J])([A-J])(\d{2})(\d{2})$/.exec(code || '');
  if (!match) return 0;
  const day   = (match[1].charCodeAt(0) - 65) * 10 + (match[2].charCodeAt(0) - 65);
  const month = parseInt(match[3], 10) - 1;
  const year  = 2000 + parseInt(match[4], 10);
  const d     = new Date(year, month, day);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

/**
 * Newest first. session_date is the primary key of the ordering because that is
 * what the ops-api FIFO allocates by. Batch code and then the code string break
 * ties — six of sixteen flavours have batches sharing a session_date (Charcoal's
 * BG0726/BH0726 were both packed 2026-07-18), and without a tiebreak the result
 * would depend on Map iteration order.
 */
function newestFirst(a: ResetBatchInput, b: ResetBatchInput): number {
  const byDate = (b.sessionDate || '').localeCompare(a.sessionDate || '');
  if (byDate !== 0) return byDate;
  const byCode = batchCodeToTimestamp(b.batchCode) - batchCodeToTimestamp(a.batchCode);
  if (byCode !== 0) return byCode;
  return (b.batchCode || '').localeCompare(a.batchCode || '');
}

/**
 * Spread a batch's reset amount across its underlying rows, newest first, so the
 * adjustments mirror real (batch_code, production_batch_id) pairs. The ops-api
 * groups packed boxes by production_batch_id, so a single lump adjustment keyed
 * to the wrong sub-batch would misallocate there even though the batch-level
 * total looked right.
 */
function splitAcrossRows(batch: ResetBatchInput, resetBoxes: number): ResetAdjustment[] {
  const positives = batch.rows
    .filter(r => r.boxesPacked > 0)
    .sort((a, b) => (b.sessionDate || '').localeCompare(a.sessionDate || '') || a.id.localeCompare(b.id));

  const out: ResetAdjustment[] = [];
  let remaining = resetBoxes;

  for (const row of positives) {
    if (remaining <= 0) break;
    const take = Math.min(row.boxesPacked, remaining);
    if (take <= 0) continue;
    out.push({
      batchCode: batch.batchCode,
      productionBatchId: row.productionBatchId,
      sessionDate: row.sessionDate,
      boxes: take,
    });
    remaining -= take;
  }

  // Returns can push a batch's available above the sum of its positive rows
  // (returned boxes were never "packed"). Park any remainder on the newest row
  // so Σ adjustments always equals the batch's reset amount exactly.
  if (remaining > 0) {
    const anchor = positives[0] ?? batch.rows[0];
    if (anchor) {
      out.push({
        batchCode: batch.batchCode,
        productionBatchId: anchor.productionBatchId,
        sessionDate: anchor.sessionDate,
        boxes: remaining,
      });
    }
  }

  return out;
}

/**
 * Plan a reset of one flavour down to `target` available boxes.
 * Returns `ok: false` with a human-readable `error` rather than throwing, so the
 * dialog can render the refusal inline while the admin edits the number.
 */
export function planInventoryReset(batches: ResetBatchInput[], target: number): ResetPlan {
  const currentAvailable = batches.reduce((s, b) => s + b.available, 0);
  const totalReserved    = batches.reduce((s, b) => s + b.reserved, 0);

  const base: ResetPlan = {
    ok: false,
    error: '',
    currentAvailable,
    target,
    totalReset: 0,
    totalReserved,
    batches: [],
    adjustments: [],
    warnings: [],
  };

  if (!Number.isFinite(target) || !Number.isInteger(target)) {
    return { ...base, error: 'Enter a whole number of boxes.' };
  }
  if (target < 0) {
    return { ...base, error: 'Target cannot be negative.' };
  }
  if (currentAvailable < 0) {
    return {
      ...base,
      error: `This flavour is already oversold (${currentAvailable} available). `
           + `Resolve the negative balance before resetting — "keep the latest N" has no meaning while the balance is short.`,
    };
  }
  if (target > currentAvailable) {
    return {
      ...base,
      error: `A reset can only reduce stock. Available is ${currentAvailable}; `
           + `to add boxes, record a packing session instead.`,
    };
  }

  const warnings: string[] = [];
  const negativeBatches = batches.filter(b => b.available < 0);
  if (negativeBatches.length > 0) {
    warnings.push(
      `${negativeBatches.length} batch${negativeBatches.length === 1 ? '' : 'es'} `
      + `(${negativeBatches.map(b => b.batchCode).join(', ')}) show a negative balance. `
      + `They are left untouched rather than reset deeper into the negative.`,
    );
  }

  const ordered = [...batches].sort(newestFirst);
  const plans: ResetBatchPlan[] = [];
  const adjustments: ResetAdjustment[] = [];
  let running = 0;

  for (const batch of ordered) {
    // Negative-balance batches contribute nothing to retention and are not reset.
    const availableForRetention = Math.max(batch.available, 0);
    const keep  = Math.min(availableForRetention, Math.max(target - running, 0));
    const reset = availableForRetention - keep;
    running += keep;

    plans.push({
      batchCode: batch.batchCode,
      sessionDate: batch.sessionDate,
      availableBefore: batch.available,
      keep,
      reset,
    });

    if (reset > 0) adjustments.push(...splitAcrossRows(batch, reset));
  }

  const totalReset = plans.reduce((s, p) => s + p.reset, 0);

  // The reset must account for exactly the gap between current and target.
  // Negative-balance batches are excluded from retention, so they are the only
  // legitimate source of drift — anything else is a bug and must not be written.
  const expectedReset = batches.reduce((s, b) => s + Math.max(b.available, 0), 0) - target;
  if (totalReset !== expectedReset) {
    return {
      ...base,
      warnings,
      error: `Internal check failed: planned ${totalReset} boxes but expected ${expectedReset}. Nothing was written.`,
    };
  }

  const adjustmentTotal = adjustments.reduce((s, a) => s + a.boxes, 0);
  if (adjustmentTotal !== totalReset) {
    return {
      ...base,
      warnings,
      error: `Internal check failed: adjustments total ${adjustmentTotal} but ${totalReset} boxes were planned. Nothing was written.`,
    };
  }

  return {
    ok: true,
    error: '',
    currentAvailable,
    target,
    totalReset,
    totalReserved,
    batches: plans,
    adjustments,
    warnings,
  };
}
