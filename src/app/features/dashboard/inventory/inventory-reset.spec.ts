import {
  planInventoryReset,
  batchCodeToTimestamp,
  ResetBatchInput,
  ResetRowInput,
} from './inventory-reset';

// ── Helpers ─────────────────────────────────────────────────────────────

let rowSeq = 0;

function row(overrides: Partial<ResetRowInput> = {}): ResetRowInput {
  rowSeq += 1;
  return {
    id: `row-${rowSeq}`,
    sessionDate: '2026-07-01',
    productionBatchId: `pb-${rowSeq}`,
    boxesPacked: 0,
    ...overrides,
  };
}

/** A batch whose single packing row carries all its boxes. */
function batch(
  batchCode: string,
  sessionDate: string,
  available: number,
  overrides: Partial<ResetBatchInput> = {},
): ResetBatchInput {
  return {
    batchCode,
    sessionDate,
    available,
    reserved: 0,
    rows: [row({ sessionDate, boxesPacked: Math.max(available, 0) })],
    ...overrides,
  };
}

describe('batchCodeToTimestamp', () => {
  it('decodes the letter-encoded day', () => {
    // A=0 … J=9, so "AI" = day 08, "0626" = June 2026.
    expect(batchCodeToTimestamp('AI0626')).toBe(new Date(2026, 5, 8).getTime());
    expect(batchCodeToTimestamp('CE0726')).toBe(new Date(2026, 6, 24).getTime());
  });

  it('sinks special codes to the bottom of a newest-first sort', () => {
    expect(batchCodeToTimestamp('OPENING-STOCK')).toBe(0);
    expect(batchCodeToTimestamp('RESET-STOCK')).toBe(0);
    expect(batchCodeToTimestamp('')).toBe(0);
  });
});

describe('planInventoryReset — the worked example', () => {
  // batch1 200 (oldest), batch2 600, batch3 200 (newest) → target 600.
  const batches = [
    batch('AA0726', '2026-07-01', 200),
    batch('AB0726', '2026-07-02', 600),
    batch('AC0726', '2026-07-03', 200),
  ];

  it('keeps the newest 600 boxes and resets the rest', () => {
    const plan = planInventoryReset(batches, 600);

    expect(plan.ok).toBe(true);
    expect(plan.currentAvailable).toBe(1000);
    expect(plan.totalReset).toBe(400);

    // Newest first: AC kept whole, AB trimmed, AA fully reset.
    expect(plan.batches.map(b => [b.batchCode, b.keep, b.reset])).toEqual([
      ['AC0726', 200, 0],
      ['AB0726', 400, 200],
      ['AA0726', 0, 200],
    ]);
  });

  it('emits adjustments that sum to exactly the reset amount', () => {
    const plan = planInventoryReset(batches, 600);
    const total = plan.adjustments.reduce((s, a) => s + a.boxes, 0);
    expect(total).toBe(400);
  });

  it('never dates an adjustment to today', () => {
    const plan = planInventoryReset(batches, 600);
    const today = new Date().toISOString().slice(0, 10);
    // dashboard-home sums packing_sessions where session_date = today to get
    // "packed today" — a negative row dated today would corrupt that figure.
    for (const adj of plan.adjustments) {
      expect(adj.sessionDate).not.toBe(today);
    }
  });

  it('mirrors the batch_code of the rows it offsets', () => {
    const plan = planInventoryReset(batches, 600);
    const codes = new Set(plan.adjustments.map(a => a.batchCode));
    expect(codes.has('AC0726')).toBe(false);  // kept whole, nothing to offset
    expect(codes.has('AB0726')).toBe(true);
    expect(codes.has('AA0726')).toBe(true);
  });
});

describe('planInventoryReset — boundaries', () => {
  const batches = [
    batch('AA0726', '2026-07-01', 200),
    batch('AB0726', '2026-07-02', 600),
    batch('AC0726', '2026-07-03', 200),
  ];

  it('is a no-op when the target equals current available', () => {
    const plan = planInventoryReset(batches, 1000);
    expect(plan.ok).toBe(true);
    expect(plan.totalReset).toBe(0);
    expect(plan.adjustments).toEqual([]);
  });

  it('resets everything when the target is zero', () => {
    const plan = planInventoryReset(batches, 0);
    expect(plan.ok).toBe(true);
    expect(plan.totalReset).toBe(1000);
    expect(plan.batches.every(b => b.keep === 0)).toBe(true);
  });

  it('lands exactly on a batch boundary without trimming', () => {
    // 200 (newest) + 600 = 800 → AB consumed whole, AA fully reset.
    const plan = planInventoryReset(batches, 800);
    expect(plan.batches.map(b => [b.batchCode, b.keep, b.reset])).toEqual([
      ['AC0726', 200, 0],
      ['AB0726', 600, 0],
      ['AA0726', 0, 200],
    ]);
  });

  it('handles a single-batch flavour', () => {
    const plan = planInventoryReset([batch('AA0726', '2026-07-01', 500)], 120);
    expect(plan.ok).toBe(true);
    expect(plan.totalReset).toBe(380);
    expect(plan.adjustments.length).toBe(1);
    expect(plan.adjustments[0].boxes).toBe(380);
  });

  it('handles a flavour with no stock at all', () => {
    const plan = planInventoryReset([], 0);
    expect(plan.ok).toBe(true);
    expect(plan.totalReset).toBe(0);
  });
});

describe('planInventoryReset — refusals', () => {
  const batches = [batch('AA0726', '2026-07-01', 500)];

  it('refuses to increase stock', () => {
    const plan = planInventoryReset(batches, 900);
    expect(plan.ok).toBe(false);
    expect(plan.error).toContain('can only reduce');
  });

  it('refuses a negative target', () => {
    expect(planInventoryReset(batches, -1).ok).toBe(false);
  });

  it('refuses a fractional target', () => {
    const plan = planInventoryReset(batches, 12.5);
    expect(plan.ok).toBe(false);
    expect(plan.error).toContain('whole number');
  });

  it('refuses when the flavour is already oversold', () => {
    const plan = planInventoryReset([batch('AA0726', '2026-07-01', -40)], 0);
    expect(plan.ok).toBe(false);
    expect(plan.error).toContain('oversold');
  });

  it('writes nothing when it refuses', () => {
    const plan = planInventoryReset(batches, 900);
    expect(plan.adjustments).toEqual([]);
    expect(plan.totalReset).toBe(0);
  });
});

describe('planInventoryReset — reservations', () => {
  it('leaves reserved boxes fully backed', () => {
    // available excludes reserved, so on-hand after reset = target + reserved.
    const batches = [
      batch('AA0726', '2026-07-01', 300, { reserved: 100 }),
      batch('AB0726', '2026-07-02', 200, { reserved: 50 }),
    ];
    const plan = planInventoryReset(batches, 400);

    expect(plan.ok).toBe(true);
    expect(plan.currentAvailable).toBe(500);
    expect(plan.totalReserved).toBe(150);
    expect(plan.totalReset).toBe(100);
    // Reserved boxes are never part of the amount reset.
    expect(plan.totalReset).toBeLessThanOrEqual(plan.currentAvailable);
  });
});

describe('planInventoryReset — ordering', () => {
  it('breaks a shared session_date by batch code, newest first', () => {
    // Charcoal's real case: BG0726 and BH0726 both packed 2026-07-18, but the
    // codes decode to the 16th and 17th. Without a tiebreak this is arbitrary.
    const batches = [
      batch('BG0726', '2026-07-18', 100),
      batch('BH0726', '2026-07-18', 100),
    ];
    const plan = planInventoryReset(batches, 100);
    // BH decodes later, so it is the one kept.
    expect(plan.batches[0].batchCode).toBe('BH0726');
    expect(plan.batches[0].keep).toBe(100);
    expect(plan.batches[1].keep).toBe(0);
  });

  it('sorts by session_date ahead of batch code', () => {
    // AC decodes newer than AA, but AA was packed later — packing date wins,
    // matching the FIFO the ops-api allocates by.
    const batches = [
      batch('AC0726', '2026-07-01', 100),
      batch('AA0726', '2026-07-09', 100),
    ];
    const plan = planInventoryReset(batches, 100);
    expect(plan.batches[0].batchCode).toBe('AA0726');
  });

  it('resets OPENING-STOCK before dated batches', () => {
    const batches = [
      batch('OPENING-STOCK', '2026-06-01', 500),
      batch('AA0726', '2026-07-01', 300),
    ];
    const plan = planInventoryReset(batches, 300);
    const opening = plan.batches.find(b => b.batchCode === 'OPENING-STOCK')!;
    expect(opening.keep).toBe(0);
    expect(opening.reset).toBe(500);
  });
});

describe('planInventoryReset — multi-row batches', () => {
  it('spreads a reset across rows newest first, mirroring production_batch_id', () => {
    const batches: ResetBatchInput[] = [{
      batchCode: 'AA0726',
      sessionDate: '2026-07-01',
      available: 500,
      reserved: 0,
      rows: [
        row({ id: 'r-old', sessionDate: '2026-07-01', productionBatchId: 'pb-old', boxesPacked: 200 }),
        row({ id: 'r-new', sessionDate: '2026-07-03', productionBatchId: 'pb-new', boxesPacked: 300 }),
      ],
    }];

    const plan = planInventoryReset(batches, 100);
    expect(plan.totalReset).toBe(400);

    // Newest row absorbs first: 300 from pb-new, then 100 from pb-old.
    expect(plan.adjustments).toEqual([
      { batchCode: 'AA0726', productionBatchId: 'pb-new', sessionDate: '2026-07-03', boxes: 300 },
      { batchCode: 'AA0726', productionBatchId: 'pb-old', sessionDate: '2026-07-01', boxes: 100 },
    ]);
  });

  it('ignores existing negative adjustment rows when spreading', () => {
    const batches: ResetBatchInput[] = [{
      batchCode: 'AA0726',
      sessionDate: '2026-07-01',
      available: 100,          // 300 packed, 200 already reset
      reserved: 0,
      rows: [
        row({ id: 'r1', sessionDate: '2026-07-01', productionBatchId: 'pb-1', boxesPacked: 300 }),
        row({ id: 'r2', sessionDate: '2026-07-01', productionBatchId: 'pb-1', boxesPacked: -200 }),
      ],
    }];

    const plan = planInventoryReset(batches, 0);
    expect(plan.totalReset).toBe(100);
    expect(plan.adjustments.length).toBe(1);
    expect(plan.adjustments[0].boxes).toBe(100);
  });

  it('still balances when returns push available above packed', () => {
    // 50 packed but 80 available (30 returned) — the remainder must not vanish.
    const batches: ResetBatchInput[] = [{
      batchCode: 'AA0726',
      sessionDate: '2026-07-01',
      available: 80,
      reserved: 0,
      rows: [row({ sessionDate: '2026-07-01', productionBatchId: 'pb-1', boxesPacked: 50 })],
    }];

    const plan = planInventoryReset(batches, 0);
    expect(plan.ok).toBe(true);
    expect(plan.adjustments.reduce((s, a) => s + a.boxes, 0)).toBe(80);
  });
});

describe('planInventoryReset — negative-balance batches', () => {
  const batches = [
    batch('AC0726', '2026-07-03', 300),
    batch('AA0726', '2026-07-01', -50),
  ];

  it('warns about them and leaves them untouched', () => {
    const plan = planInventoryReset(batches, 100);
    expect(plan.ok).toBe(true);
    expect(plan.warnings.length).toBe(1);
    expect(plan.warnings[0]).toContain('AA0726');

    const negative = plan.batches.find(b => b.batchCode === 'AA0726')!;
    expect(negative.reset).toBe(0);
    expect(negative.keep).toBe(0);
  });

  it('excludes them from the retention arithmetic', () => {
    const plan = planInventoryReset(batches, 100);
    // Only the healthy 300 participates: 300 − 100 kept = 200 reset.
    expect(plan.totalReset).toBe(200);
  });
});
