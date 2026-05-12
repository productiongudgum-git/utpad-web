/**
 * Display helpers for ingredient quantities.
 *
 * Storage rule (Phase 10): every stock number is in canonical units —
 *   weight → grams
 *   volume → ml
 *   count  → pcs
 *
 * These helpers turn a canonical number + unit into a humane display.
 * 40000 g  →  "40 kg"
 * 750 ml   →  "750 ml"
 * 2000 ml  →  "2 L"
 * 3 pcs    →  "3 pcs"
 *
 * Rule of thumb: if the value is ≥ 1000 in a metric unit, scale up.
 * Otherwise keep the canonical label.
 */

export interface FormattedStock {
  /** Numeric portion to render. */
  qty: number;
  /** Unit label to render alongside the number. */
  unit: string;
}

/**
 * Convert a canonical (qty, unit) to a display-friendly form.
 * The caller decides whether to render `qty` with decimals, separators, etc.
 */
export function formatStock(canonicalQty: number, canonicalUnit: string | null | undefined): FormattedStock {
  const qty = Number(canonicalQty) || 0;
  const unit = (canonicalUnit ?? '').toLowerCase();

  if (unit === 'g' && Math.abs(qty) >= 1000) {
    return { qty: qty / 1000, unit: 'kg' };
  }
  if (unit === 'ml' && Math.abs(qty) >= 1000) {
    return { qty: qty / 1000, unit: 'L' };
  }
  return { qty, unit: unit || canonicalUnit || '' };
}

/**
 * Single-string convenience wrapper for templates that want "40 kg" / "750 ml".
 * `decimals` controls precision before trailing zeros are trimmed.
 */
export function formatStockString(
  canonicalQty: number,
  canonicalUnit: string | null | undefined,
  decimals = 2
): string {
  const f = formatStock(canonicalQty, canonicalUnit);
  const fixed = f.qty.toFixed(decimals);
  const trimmed = fixed.replace(/\.?0+$/, ''); // 40.00 → 40, 39.50 → 39.5
  return `${trimmed} ${f.unit}`.trim();
}

/**
 * Inverse — convert user input in any unit to its canonical equivalent.
 * Used at write time so all inserted rows store grams/ml/pcs only.
 *
 *   toCanonical(40, 'kg') → { qty: 40000, unit: 'g' }
 *   toCanonical(1.5, 'L') → { qty: 1500, unit: 'ml' }
 *   toCanonical(7, 'pcs') → { qty: 7, unit: 'pcs' }
 */
export function toCanonical(qty: number, unit: string | null | undefined): { qty: number; unit: string } {
  const n = Number(qty) || 0;
  const u = (unit ?? '').toLowerCase();

  if (u === 'kg') return { qty: n * 1000, unit: 'g' };
  if (u === 'l')  return { qty: n * 1000, unit: 'ml' };
  if (u === 'g' || u === 'ml' || u === 'pcs') return { qty: n, unit: u };
  // Unknown unit — pass through (caller should validate).
  return { qty: n, unit: u };
}
