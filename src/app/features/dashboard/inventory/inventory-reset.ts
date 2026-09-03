/**
 * INVENTORY RESET — stock correction planner (pure, no I/O)
 * ─────────────────────────────────────────────────────────
 * An admin corrects a flavour's sellable stock to a target box count. The
 * target can be below OR above the current figure, and the current figure may
 * itself be negative.
 *
 * The plan is built in three passes:
 *
 *   1. REPAIR — any batch sitting below zero is brought back to exactly 0 with
 *      a positive row against that batch. A negative balance means boxes were
 *      dispatched that were never recorded as packed, so the correction belongs
 *      on the batch where the mis-recording happened.
 *
 *   2. Everything is now ≥ 0. Compare that total to the target.
 *
 *   3a. TRIM (target below current) — stock is consumed oldest-first, so the
 *       boxes that should survive are the NEWEST. Walk batches newest → oldest,
 *       keep until the target is met, reset the rest.
 *
 *         Charcoal: batch1 200 (oldest), batch2 600, batch3 200 (newest) → 600
 *           batch3  200  keep 200  (running 200)
 *           batch2  600  keep 400  (running 600)  ← trimmed
 *           batch1  200  keep   0                 ← fully reset
 *
 *   3b. TOP UP (target above current) — one positive row on the synthetic
 *       RESET_BATCH_CODE with no production batch behind it. We genuinely do
 *       not know which batch these boxes came from, so attributing them to a
 *       real one would invent traceability that does not exist.
 *
 * The target is measured in AVAILABLE boxes (onHand − reserved), the same
 * number the Inventory screen shows. Because reserved boxes are excluded from
 * available, a reset can never eat into stock already committed to an open
 * invoice — reservations stay fully backed at `target + reserved` on hand.
 *
 * Adjustments are emitted as `boxes_packed` rows — negative to remove, positive
 * to add — carrying the batch_code and production_batch_id of the rows they
 * offset, so every consumer that sums packing_sessions (8 web screens, the
 * ops-api FIFO, and the Android app) nets out correctly with no change to any
 * of them.
 *
 * Each adjustment inherits the session_date of the row it offsets — never
 * today's date. dashboard-home computes "packed today" with a
 * `session_date = today` filter, and an adjustment dated today would corrupt
 * that day's production figure.
 *
 * The caller writes these rows with `status = 'reset-adjustment'`, which
 * ops-api migration 0009 makes the packing-materials trigger ignore. A box
 * recount must not move monocarton or ziplock stock.
 */

/**
 * Batch code for boxes added by a correction. Deliberately not a real code:
 * batchCodeToTimestamp sinks it to the epoch, so it sorts and dispatches as
 * the OLDEST stock — corrected boxes of unknown age leave first rather than
 * ageing on a shelf. Mirrors how OPENING-STOCK behaves.
 */
export const RESET_BATCH_CODE = 'RESET-STOCK';

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

/**
 * A packing_sessions row to insert.
 *
 * `boxes` is SIGNED: negative removes stock, positive adds it. The caller
 * writes it straight into boxes_packed, so the sign is the instruction.
 */
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
  /** Boxes taken off this batch. Never negative — additions are `added`. */
  reset: number;
  /** Boxes put back on this batch: repairing a negative, or the top-up row. */
  added: number;
}

export interface ResetPlan {
  ok: boolean;
  /** Why the reset is refused. Set only when ok === false. */
  error: string;
  currentAvailable: number;
  target: number;
  /** Boxes removed. */
  totalReset: number;
  /** Boxes added — repairing negative batches, plus any top-up. */
  totalAdded: number;
  /** Boxes on the RESET-STOCK row, when the target is above what exists. */
  topUp: number;
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
 *
 * Takes a positive magnitude and emits NEGATIVE `boxes` — these rows remove
 * stock.
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
      boxes: -take,
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
        boxes: -remaining,
      });
    }
  }

  return out;
}

/**
 * The date a top-up row is stamped with.
 *
 * Never today: dashboard-home sums packing_sessions where session_date = today
 * for its "packed today" figure, and a correction is not production. The
 * earliest date the flavour already has keeps the row consistent with
 * RESET-STOCK sorting oldest, so the ops-api FIFO (which orders by
 * session_date) dispatches it first. Falls back to the epoch when the flavour
 * has no dated rows at all — a flavour that went negative purely through
 * reservations, with nothing ever packed.
 */
function topUpSessionDate(batches: ResetBatchInput[]): string {
  const dates = batches
    .flatMap(b => [b.sessionDate, ...b.rows.map(r => r.sessionDate)])
    .filter((d): d is string => !!d);
  return dates.length > 0 ? dates.reduce((a, b) => (a < b ? a : b)) : '1970-01-01';
}

/**
 * Plan a correction of one flavour to `target` available boxes, in either
 * direction and from any starting figure including a negative one.
 *
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
    totalAdded: 0,
    topUp: 0,
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

  const warnings: string[] = [];
  const ordered = [...batches].sort(newestFirst);
  const adjustments: ResetAdjustment[] = [];

  // ── Pass 1: repair batches sitting below zero ──────────────────────────
  // A negative batch means boxes left that were never recorded as packed, so
  // the correction goes on that batch — that is where the gap actually is.
  const repaired = new Map<string, number>();
  for (const batch of ordered) {
    if (batch.available >= 0) continue;
    const shortfall = -batch.available;
    repaired.set(batch.batchCode, shortfall);
    adjustments.push({
      batchCode: batch.batchCode,
      productionBatchId: batch.rows[0]?.productionBatchId ?? null,
      sessionDate: batch.rows[0]?.sessionDate || batch.sessionDate,
      boxes: shortfall,
    });
  }
  if (repaired.size > 0) {
    warnings.push(
      `${repaired.size} batch${repaired.size === 1 ? '' : 'es'} `
      + `(${[...repaired.keys()].join(', ')}) had a negative balance and `
      + `${repaired.size === 1 ? 'was' : 'were'} brought back to zero first.`,
    );
  }

  // ── Pass 2: everything is now ≥ 0 ──────────────────────────────────────
  const afterRepair = ordered.reduce((s, b) => s + Math.max(b.available, 0), 0);

  // ── Pass 3: trim down to, or top up to, the target ─────────────────────
  const plans: ResetBatchPlan[] = [];
  let running = 0;

  for (const batch of ordered) {
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
      added: repaired.get(batch.batchCode) ?? 0,
    });

    if (reset > 0) adjustments.push(...splitAcrossRows(batch, reset));
  }

  const totalReset = plans.reduce((s, p) => s + p.reset, 0);
  const topUp = Math.max(target - afterRepair, 0);

  if (topUp > 0) {
    const sessionDate = topUpSessionDate(batches);
    adjustments.push({
      batchCode: RESET_BATCH_CODE,
      productionBatchId: null,
      sessionDate,
      boxes: topUp,
    });
    plans.push({
      batchCode: RESET_BATCH_CODE,
      sessionDate,
      availableBefore: 0,
      keep: topUp,
      reset: 0,
      added: topUp,
    });
  }

  const totalAdded = plans.reduce((s, p) => s + p.added, 0);

  // The signed adjustments must land the flavour exactly on the target.
  // Anything else is a bug and must not be written.
  const netChange = adjustments.reduce((s, a) => s + a.boxes, 0);
  const expectedNet = target - currentAvailable;
  if (netChange !== expectedNet) {
    return {
      ...base,
      warnings,
      error: `Internal check failed: planned a net change of ${netChange} boxes `
           + `but ${expectedNet} was required. Nothing was written.`,
    };
  }

  return {
    ok: true,
    error: '',
    currentAvailable,
    target,
    totalReset,
    totalAdded,
    topUp,
    totalReserved,
    batches: plans,
    adjustments,
    warnings,
  };
}
