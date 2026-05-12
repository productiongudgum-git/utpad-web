import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase.service';
import {
  AllocationResult,
  BatchAvailability,
  BatchLine,
  FlavorAllocation,
  InvoiceLineItem,
} from './pack-types';

/**
 * FIFO reservation engine for invoice packing.
 *
 * Reservation model (Phase 7 — aligned with mobile):
 *   - A reservation is a row in `dispatch_events` with `is_dispatched = false`.
 *     Mobile already creates these when a worker packs an invoice; the web
 *     pack modal now writes the same shape so both flows interoperate.
 *   - A committed shipment is `dispatch_events.is_dispatched = true`. Once a
 *     row flips, the auto-dispatch trigger checks if all the invoice's lines
 *     are covered and flips `gg_invoices.is_dispatched`.
 *
 * Available stock for FIFO:
 *   available_in_batch = production_batches.expected_boxes
 *                        − sum(dispatch_events.boxes_dispatched
 *                              for that batch + flavor, regardless of
 *                              is_dispatched flag)
 *
 * Both staged and committed events consume boxes from the batch — the
 * difference is whether the truck has rolled or not.
 */
@Injectable({ providedIn: 'root' })
export class PackAllocationService {
  private readonly supabase = inject(SupabaseService);

  // ──────────────────────────────────────────────────────────────────
  // Load availability per flavor
  // ──────────────────────────────────────────────────────────────────

  async loadAvailability(flavorIds: string[]): Promise<Map<string, BatchAvailability[]>> {
    if (flavorIds.length === 0) return new Map();

    const [batchesRes, eventsRes] = await Promise.all([
      this.supabase.client
        .from('production_batches')
        .select('flavor_id, batch_code, production_date, expected_boxes')
        .in('flavor_id', flavorIds)
        .gt('expected_boxes', 0)
        .order('production_date', { ascending: true }),
      this.supabase.client
        .from('dispatch_events')
        .select('flavor_id, batch_code, boxes_dispatched')
        .in('flavor_id', flavorIds),
    ]);

    if (batchesRes.error) throw new Error(`load batches: ${batchesRes.error.message}`);
    if (eventsRes.error)  throw new Error(`load dispatch events: ${eventsRes.error.message}`);

    // Sum consumed boxes per (flavor_id, batch_code) — staged + committed.
    const consumedMap = new Map<string, number>();
    for (const ev of eventsRes.data ?? []) {
      const fid: string = (ev as any).flavor_id ?? '';
      const bc:  string = (ev as any).batch_code ?? '';
      const qty: number = Number((ev as any).boxes_dispatched) || 0;
      if (!fid || !bc || qty <= 0) continue;
      const key = `${fid}|${bc}`;
      consumedMap.set(key, (consumedMap.get(key) ?? 0) + qty);
    }

    const result = new Map<string, BatchAvailability[]>();
    for (const batch of batchesRes.data ?? []) {
      const key = `${batch.flavor_id}|${batch.batch_code}`;
      const consumed = consumedMap.get(key) ?? 0;
      const available = (Number(batch.expected_boxes) || 0) - consumed;
      if (available <= 0) continue;

      const list = result.get(batch.flavor_id) ?? [];
      list.push({
        batch_code: batch.batch_code,
        production_date: batch.production_date,
        available_boxes: available,
      });
      result.set(batch.flavor_id, list);
    }

    return result;
  }

  // ──────────────────────────────────────────────────────────────────
  // Pure FIFO computation (unchanged from Phase 3)
  // ──────────────────────────────────────────────────────────────────

  computeFifo(
    items: InvoiceLineItem[],
    availability: Map<string, BatchAvailability[]>
  ): AllocationResult {
    const flavors: FlavorAllocation[] = [];
    const partialFlavors: string[] = [];

    for (const item of items) {
      const sourceBatches = availability.get(item.flavor_id) ?? [];

      const batches: BatchLine[] = sourceBatches.map((b) => ({
        batch_code: b.batch_code,
        production_date: b.production_date,
        available_boxes: b.available_boxes,
        boxes_to_take: 0,
      }));

      let needed = item.quantity_boxes;
      for (const batch of batches) {
        if (needed <= 0) break;
        const take = Math.min(batch.available_boxes, needed);
        batch.boxes_to_take = take;
        needed -= take;
      }

      flavors.push({
        flavor_id: item.flavor_id,
        flavor_name: item.flavor_name,
        needed: item.quantity_boxes,
        batches,
      });

      if (needed > 0) {
        partialFlavors.push(item.flavor_name);
      }
    }

    return {
      flavors,
      fullyAllocated: partialFlavors.length === 0,
      partialFlavors,
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // Commit allocation as staged dispatch_events
  // ──────────────────────────────────────────────────────────────────

  /**
   * Persist the user's allocation by:
   *   1. Looking up the invoice (need invoice_number, customer_name, items).
   *   2. Deleting any existing STAGED events for this invoice (idempotent —
   *      safe to re-pack; replaces previous reservation entirely).
   *   3. Inserting one staged event per allocated batch.
   *   4. Recomputing items[].packed_boxes from the resulting event set so
   *      mobile's RED/YELLOW/BLUE classifier sees the right state and
   *      doesn't re-pack the same invoice.
   *   5. Setting is_packed = true only when EVERY flavor is fully packed
   *      (matches mobile's "isPacked only when ALL flavors covered" rule).
   *
   * Committed events (is_dispatched=true) are never touched — those represent
   * real shipments that already left the warehouse.
   */
  async commitAllocation(invoiceId: string, allocations: FlavorAllocation[]): Promise<void> {
    // 1. Get invoice metadata + items
    const { data: invoice, error: invErr } = await this.supabase.client
      .from('gg_invoices')
      .select('invoice_number, customer_name, items')
      .eq('id', invoiceId)
      .maybeSingle();

    if (invErr) throw new Error(`load invoice: ${invErr.message}`);
    if (!invoice) throw new Error('Invoice not found');

    const invoiceNumber = (invoice as any).invoice_number as string;
    const customerName  = (invoice as any).customer_name as string | null;
    const itemsRaw      = (invoice as any).items;
    const items: any[]  = Array.isArray(itemsRaw) ? itemsRaw : [];
    const today = new Date().toISOString().slice(0, 10);

    // 2. Wipe existing staged events for this invoice
    const { error: delErr } = await this.supabase.client
      .from('dispatch_events')
      .delete()
      .eq('invoice_number', invoiceNumber)
      .eq('is_dispatched', false);

    if (delErr) throw new Error(`clear staged events: ${delErr.message}`);

    // 3. Build and insert new staged events
    const records = allocations.flatMap((fa) =>
      fa.batches
        .filter((b) => (Number(b.boxes_to_take) || 0) > 0)
        .map((b) => ({
          invoice_number:   invoiceNumber,
          flavor_id:        fa.flavor_id,
          sku_id:           fa.flavor_id,
          batch_code:       b.batch_code,
          boxes_dispatched: Number(b.boxes_to_take),
          is_dispatched:    false,
          customer_name:    customerName,
          dispatch_date:    today,
          worker_id:        null,
        }))
    );

    if (records.length > 0) {
      const { error: insErr } = await this.supabase.client
        .from('dispatch_events')
        .insert(records);
      if (insErr) throw new Error(`insert staged events: ${insErr.message}`);
    }

    // 4. Recompute packed_boxes per flavor from ALL events (staged + committed)
    const { newItems, allFullyPacked } = await this.recomputeInvoiceItems(invoiceNumber, items);

    // 5. Update invoice with refreshed items + is_packed flag
    const { error: updErr } = await this.supabase.client
      .from('gg_invoices')
      .update({ items: newItems, is_packed: allFullyPacked })
      .eq('id', invoiceId);

    if (updErr) throw new Error(`update invoice: ${updErr.message}`);
  }

  /**
   * Helper: query all dispatch_events for an invoice and recompute
   * `items[].packed_boxes` for each line item. Also returns whether
   * every line item is fully packed (drives the is_packed flag).
   */
  private async recomputeInvoiceItems(
    invoiceNumber: string,
    items: any[]
  ): Promise<{ newItems: any[]; allFullyPacked: boolean }> {
    const { data: allEvents, error } = await this.supabase.client
      .from('dispatch_events')
      .select('flavor_id, boxes_dispatched')
      .eq('invoice_number', invoiceNumber);

    if (error) throw new Error(`recount events: ${error.message}`);

    const packedPerFlavor = new Map<string, number>();
    for (const ev of (allEvents ?? []) as any[]) {
      const fid = String(ev.flavor_id ?? '');
      const qty = Number(ev.boxes_dispatched) || 0;
      if (!fid || qty <= 0) continue;
      packedPerFlavor.set(fid, (packedPerFlavor.get(fid) ?? 0) + qty);
    }

    const newItems = items.map((it: any) => ({
      ...it,
      packed_boxes: packedPerFlavor.get(String(it.flavor_id)) ?? 0,
    }));

    const allFullyPacked = newItems.length > 0 && newItems.every((it) => {
      const needed = Number(it.quantity_boxes) || 0;
      const packed = Number(it.packed_boxes) || 0;
      return needed === 0 || packed >= needed;
    });

    return { newItems, allFullyPacked };
  }

  // ──────────────────────────────────────────────────────────────────
  // Release reservation
  // ──────────────────────────────────────────────────────────────────

  /**
   * Releases the FIFO reservation: deletes only the STAGED dispatch_events
   * for this invoice (committed shipments are kept). Also recomputes
   * items[].packed_boxes against the remaining events so mobile sees the
   * post-release state correctly.
   */
  async releaseAllocation(invoiceId: string): Promise<void> {
    const { data: invoice, error: invErr } = await this.supabase.client
      .from('gg_invoices')
      .select('invoice_number, items')
      .eq('id', invoiceId)
      .maybeSingle();

    if (invErr) throw new Error(`load invoice: ${invErr.message}`);
    if (!invoice) throw new Error('Invoice not found');

    const invoiceNumber = (invoice as any).invoice_number as string;
    const itemsRaw      = (invoice as any).items;
    const items: any[]  = Array.isArray(itemsRaw) ? itemsRaw : [];

    const { error: delErr } = await this.supabase.client
      .from('dispatch_events')
      .delete()
      .eq('invoice_number', invoiceNumber)
      .eq('is_dispatched', false);

    if (delErr) throw new Error(`clear staged events: ${delErr.message}`);

    const { newItems, allFullyPacked } = await this.recomputeInvoiceItems(invoiceNumber, items);

    const { error: updErr } = await this.supabase.client
      .from('gg_invoices')
      .update({ items: newItems, is_packed: allFullyPacked })
      .eq('id', invoiceId);

    if (updErr) throw new Error(`update invoice: ${updErr.message}`);
  }
}
