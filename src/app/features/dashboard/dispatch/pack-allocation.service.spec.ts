import { TestBed } from '@angular/core/testing';
import { PackAllocationService } from './pack-allocation.service';
import { SupabaseService } from '../../../core/supabase.service';
import { BatchAvailability, InvoiceLineItem } from './pack-types';

describe('PackAllocationService.computeFifo', () => {
  let service: PackAllocationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        // Stub Supabase — computeFifo never touches it.
        { provide: SupabaseService, useValue: { client: {} } },
      ],
    });
    service = TestBed.inject(PackAllocationService);
  });

  it('returns empty allocation for an empty invoice', () => {
    const result = service.computeFifo([], new Map());

    expect(result.flavors).toEqual([]);
    expect(result.fullyAllocated).toBe(true);
    expect(result.partialFlavors).toEqual([]);
  });

  it('allocates from oldest batch first (FIFO order)', () => {
    const items: InvoiceLineItem[] = [
      { flavor_id: 'F1', flavor_name: 'Strawberry', quantity_boxes: 30 },
    ];
    const availability = new Map<string, BatchAvailability[]>([
      ['F1', [
        { batch_code: 'BA0101', production_date: '2026-01-01', available_boxes: 20 },
        { batch_code: 'BB0102', production_date: '2026-01-02', available_boxes: 50 },
      ]],
    ]);

    const result = service.computeFifo(items, availability);

    expect(result.fullyAllocated).toBe(true);
    expect(result.partialFlavors).toEqual([]);
    const fa = result.flavors[0];
    // Older batch BA0101 takes 20 first, then BB0102 covers the remaining 10.
    expect(fa.batches[0].batch_code).toBe('BA0101');
    expect(fa.batches[0].boxes_to_take).toBe(20);
    expect(fa.batches[1].batch_code).toBe('BB0102');
    expect(fa.batches[1].boxes_to_take).toBe(10);
  });

  it('does not over-allocate when first batch alone covers the need', () => {
    const items: InvoiceLineItem[] = [
      { flavor_id: 'F1', flavor_name: 'X', quantity_boxes: 5 },
    ];
    const availability = new Map<string, BatchAvailability[]>([
      ['F1', [
        { batch_code: 'B1', production_date: '2026-01-01', available_boxes: 100 },
        { batch_code: 'B2', production_date: '2026-01-02', available_boxes: 100 },
      ]],
    ]);

    const result = service.computeFifo(items, availability);
    const fa = result.flavors[0];

    expect(fa.batches[0].boxes_to_take).toBe(5);
    expect(fa.batches[1].boxes_to_take).toBe(0); // second batch untouched
    expect(result.fullyAllocated).toBe(true);
  });

  it('marks a flavor as partial when supply runs out', () => {
    const items: InvoiceLineItem[] = [
      { flavor_id: 'F1', flavor_name: 'Strawberry', quantity_boxes: 100 },
    ];
    const availability = new Map<string, BatchAvailability[]>([
      ['F1', [
        { batch_code: 'BA0101', production_date: '2026-01-01', available_boxes: 50 },
      ]],
    ]);

    const result = service.computeFifo(items, availability);

    expect(result.fullyAllocated).toBe(false);
    expect(result.partialFlavors).toEqual(['Strawberry']);
    expect(result.flavors[0].batches[0].boxes_to_take).toBe(50);
  });

  it('handles a flavor with no batches at all', () => {
    const items: InvoiceLineItem[] = [
      { flavor_id: 'F1', flavor_name: 'Strawberry', quantity_boxes: 30 },
    ];
    const availability = new Map<string, BatchAvailability[]>();

    const result = service.computeFifo(items, availability);

    expect(result.fullyAllocated).toBe(false);
    expect(result.partialFlavors).toEqual(['Strawberry']);
    expect(result.flavors[0].batches).toEqual([]);
  });

  it('handles multiple flavors with mixed full/partial status', () => {
    const items: InvoiceLineItem[] = [
      { flavor_id: 'F1', flavor_name: 'Strawberry', quantity_boxes: 20 },
      { flavor_id: 'F2', flavor_name: 'Lemon',      quantity_boxes: 50 },
    ];
    const availability = new Map<string, BatchAvailability[]>([
      ['F1', [{ batch_code: 'B1', production_date: '2026-01-01', available_boxes: 25 }]],
      ['F2', [{ batch_code: 'B2', production_date: '2026-01-02', available_boxes: 30 }]],
    ]);

    const result = service.computeFifo(items, availability);

    expect(result.fullyAllocated).toBe(false);
    expect(result.partialFlavors).toEqual(['Lemon']);
    // Strawberry: full (20 of 25 available)
    expect(result.flavors[0].batches[0].boxes_to_take).toBe(20);
    // Lemon: partial (only 30 of 50 available)
    expect(result.flavors[1].batches[0].boxes_to_take).toBe(30);
  });

  it('produces FIFO output that respects availability order in the input map', () => {
    // The service trusts the caller to pre-sort batches in FIFO order
    // (loadAvailability does that with `.order('production_date', ASC)`).
    // This test confirms the iteration order is preserved.
    const items: InvoiceLineItem[] = [
      { flavor_id: 'F1', flavor_name: 'X', quantity_boxes: 100 },
    ];
    const availability = new Map<string, BatchAvailability[]>([
      ['F1', [
        { batch_code: 'OLDEST', production_date: '2026-01-01', available_boxes: 30 },
        { batch_code: 'MIDDLE', production_date: '2026-02-01', available_boxes: 40 },
        { batch_code: 'NEWEST', production_date: '2026-03-01', available_boxes: 50 },
      ]],
    ]);

    const result = service.computeFifo(items, availability);
    const fa = result.flavors[0];

    expect(fa.batches.map((b) => b.boxes_to_take)).toEqual([30, 40, 30]);
    expect(result.fullyAllocated).toBe(true);
  });

  it('preserves the needed quantity on the result (used for "needed vs taken" UI)', () => {
    const items: InvoiceLineItem[] = [
      { flavor_id: 'F1', flavor_name: 'X', quantity_boxes: 42 },
    ];
    const availability = new Map<string, BatchAvailability[]>([
      ['F1', [{ batch_code: 'B', production_date: '2026-01-01', available_boxes: 10 }]],
    ]);

    const result = service.computeFifo(items, availability);

    expect(result.flavors[0].needed).toBe(42);
  });
});
