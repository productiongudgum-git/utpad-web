import { Injectable, inject } from '@angular/core';
import * as Papa from 'papaparse';
import { SupabaseService } from '../../../core/supabase.service';
import {
  AggregatedInvoice,
  AggregatedLineItem,
  Catalogs,
  ImportPreview,
  ImportProgress,
  ImportResult,
  ImportResultRow,
  ResolvedCustomer,
  ResolvedInvoice,
  ResolvedItem,
  ResolvedStatus,
  UnmappedProduct,
  ZohoCsvRow,
} from './csv-import-types';

const COMMIT_CHUNK_SIZE = 50;

/**
 * Engine for the Zoho CSV → gg_invoices import flow.
 *
 * Pure-ish methods so each step can be unit-tested in isolation:
 *   - parseCsv:           File → rows
 *   - aggregateInvoices:  rows → invoices grouped by Invoice Number
 *   - loadCatalogs:       Supabase → flavors / customers / existing invoices
 *   - resolveAndValidate: aggregated + catalogs → preview
 *   - commit:             preview → ImportResult (writes to Supabase)
 */
@Injectable({ providedIn: 'root' })
export class CsvImportService {
  private readonly supabase = inject(SupabaseService);

  // ──────────────────────────────────────────────────────────────────
  // 1. Parse
  // ──────────────────────────────────────────────────────────────────

  parseCsv(file: File): Promise<ZohoCsvRow[]> {
    return new Promise((resolve, reject) => {
      Papa.parse<ZohoCsvRow>(file, {
        header: true,
        skipEmptyLines: 'greedy',
        // Zoho IDs are 19-digit numbers; Number() loses precision so keep them
        // as strings everywhere in the pipeline.
        dynamicTyping: false,
        complete: (results) => {
          if (results.errors && results.errors.length > 0) {
            // Log non-fatal parse warnings but don't reject — PapaParse can
            // continue past most issues and we'd rather show a partial preview
            // than nothing.
            console.warn('[csv-import] parse warnings:', results.errors.slice(0, 5));
          }
          resolve(results.data ?? []);
        },
        error: (err) => reject(err),
      });
    });
  }

  // ──────────────────────────────────────────────────────────────────
  // 2. Aggregate
  // ──────────────────────────────────────────────────────────────────

  aggregateInvoices(rows: ZohoCsvRow[]): AggregatedInvoice[] {
    const map = new Map<string, AggregatedInvoice>();

    for (const row of rows) {
      const invoiceNumber = (row['Invoice Number'] || '').trim();
      if (!invoiceNumber) continue; // continuation rows / empty rows

      if (!map.has(invoiceNumber)) {
        map.set(invoiceNumber, {
          invoice_number: invoiceNumber,
          zoho_invoice_id: (row['Invoice ID'] || '').trim(),
          zoho_customer_id: (row['Customer ID'] || '').trim(),
          customer_name: (row['Customer Name'] || '').trim(),
          invoice_date: (row['Invoice Date'] || '').trim(),
          line_items: [],
        });
      }

      const productId = (row['Product ID'] || '').trim();
      const itemName = (row['Item Name'] || '').trim();
      const qtyRaw = (row['Quantity'] || '').trim();
      const qty = Number(qtyRaw);

      // A row without a usable item is either a non-product line (round off,
      // shipping, etc.) or malformed — skip it but keep the invoice.
      if (!productId || !itemName) continue;
      if (!Number.isFinite(qty) || qty <= 0) continue;

      const li: AggregatedLineItem = {
        zoho_product_id: productId,
        item_name: itemName,
        quantity_boxes: qty,
      };
      map.get(invoiceNumber)!.line_items.push(li);
    }

    return Array.from(map.values());
  }

  // ──────────────────────────────────────────────────────────────────
  // 3. Load catalogs
  // ──────────────────────────────────────────────────────────────────

  async loadCatalogs(): Promise<Catalogs> {
    const [flavorsRes, customersRes, invoicesRes] = await Promise.all([
      this.supabase.client
        .from('gg_flavors')
        .select('id, name, zoho_product_id'),
      this.supabase.client
        .from('gg_customers')
        .select('id, name, zoho_customer_id'),
      this.supabase.client
        .from('gg_invoices')
        .select('id, invoice_number, is_dispatched'),
    ]);

    return {
      flavors: (flavorsRes.data ?? []) as Catalogs['flavors'],
      customers: (customersRes.data ?? []) as Catalogs['customers'],
      existingInvoices: (invoicesRes.data ?? []) as Catalogs['existingInvoices'],
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // 4. Resolve + validate → preview
  // ──────────────────────────────────────────────────────────────────

  resolveAndValidate(aggregated: AggregatedInvoice[], catalogs: Catalogs): ImportPreview {
    // Build lookup tables once
    const flavorByZohoId = new Map<string, Catalogs['flavors'][number]>();
    for (const f of catalogs.flavors) {
      if (f.zoho_product_id) flavorByZohoId.set(f.zoho_product_id, f);
    }

    const customerByZohoId = new Map<string, Catalogs['customers'][number]>();
    const customerByNameKey = new Map<string, Catalogs['customers'][number]>();
    for (const c of catalogs.customers) {
      if (c.zoho_customer_id) customerByZohoId.set(c.zoho_customer_id, c);
      customerByNameKey.set(normalizeName(c.name), c);
    }

    const existingInvoiceByNumber = new Map<string, Catalogs['existingInvoices'][number]>();
    for (const inv of catalogs.existingInvoices) {
      existingInvoiceByNumber.set(inv.invoice_number, inv);
    }

    const unmappedMap = new Map<string, UnmappedProduct>();
    const resolved: ResolvedInvoice[] = [];
    let totalLineItems = 0;

    for (const inv of aggregated) {
      totalLineItems += inv.line_items.length;

      // ── Resolve customer ─────────────────────────────────────────
      const customer = this.resolveCustomer(inv, customerByZohoId, customerByNameKey);

      // ── Resolve line items ────────────────────────────────────────
      const items: ResolvedItem[] = [];
      let skippedLines = 0;
      for (const li of inv.line_items) {
        const flavor = flavorByZohoId.get(li.zoho_product_id);
        if (!flavor) {
          skippedLines++;
          const ex = unmappedMap.get(li.zoho_product_id);
          if (ex) {
            ex.occurrences++;
          } else {
            unmappedMap.set(li.zoho_product_id, {
              zoho_product_id: li.zoho_product_id,
              item_name: li.item_name,
              occurrences: 1,
            });
          }
          continue;
        }

        // If Zoho split the same flavor across multiple lines, sum them.
        const existingItem = items.find((it) => it.flavor_id === flavor.id);
        if (existingItem) {
          existingItem.quantity_boxes += li.quantity_boxes;
        } else {
          items.push({
            flavor_id: flavor.id,
            flavor_name: flavor.name,
            quantity_boxes: li.quantity_boxes,
          });
        }
      }

      // ── Determine status ──────────────────────────────────────────
      let status: ResolvedStatus;
      let existingInvoiceId: string | undefined;

      if (items.length === 0) {
        status = 'skipped_no_items';
      } else {
        const existing = existingInvoiceByNumber.get(inv.invoice_number);
        if (existing) {
          existingInvoiceId = existing.id;
          status = existing.is_dispatched ? 'dispatched_warning' : 'update';
        } else {
          status = 'new';
        }
      }

      resolved.push({
        invoice_number: inv.invoice_number,
        zoho_invoice_id: inv.zoho_invoice_id,
        customer,
        items,
        status,
        existingInvoiceId,
        skippedLines,
        override: false,
      });
    }

    const newCount = resolved.filter((r) => r.status === 'new').length;
    const updateCount = resolved.filter((r) => r.status === 'update').length;
    const dispatchedWarningCount = resolved.filter((r) => r.status === 'dispatched_warning').length;
    const skippedInvoiceCount = resolved.filter((r) => r.status === 'skipped_no_items').length;
    const skippedLineCount = resolved.reduce((s, r) => s + r.skippedLines, 0);

    // New customers = unique willCreate customers among invoices we'd write
    const newCustomerKeys = new Set<string>();
    for (const r of resolved) {
      if (r.status === 'skipped_no_items') continue;
      if (r.customer.willCreate) {
        newCustomerKeys.add(r.customer.zoho_customer_id || normalizeName(r.customer.name));
      }
    }

    return {
      totalLineItems,
      totalInvoicesInCsv: aggregated.length,
      invoices: resolved,
      unmappedProducts: Array.from(unmappedMap.values()).sort(
        (a, b) => b.occurrences - a.occurrences
      ),
      newCount,
      updateCount,
      dispatchedWarningCount,
      skippedInvoiceCount,
      skippedLineCount,
      newCustomerCount: newCustomerKeys.size,
    };
  }

  private resolveCustomer(
    inv: AggregatedInvoice,
    byZoho: Map<string, Catalogs['customers'][number]>,
    byName: Map<string, Catalogs['customers'][number]>
  ): ResolvedCustomer {
    if (inv.zoho_customer_id) {
      const matched = byZoho.get(inv.zoho_customer_id);
      if (matched) {
        return {
          existing_id: matched.id,
          name: matched.name,
          zoho_customer_id: inv.zoho_customer_id,
          willCreate: false,
        };
      }
    }

    const matchedByName = byName.get(normalizeName(inv.customer_name));
    if (matchedByName) {
      return {
        existing_id: matchedByName.id,
        name: matchedByName.name,
        zoho_customer_id: inv.zoho_customer_id,
        willCreate: false,
      };
    }

    return {
      name: inv.customer_name,
      zoho_customer_id: inv.zoho_customer_id,
      willCreate: true,
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // 4b. Apply user-staged flavor mappings
  // ──────────────────────────────────────────────────────────────────

  /**
   * Persist the inline mapping choices the user made in the preview.
   * Each mapping sets `gg_flavors.zoho_product_id` for one flavor.
   *
   * Runs UPDATEs sequentially so a unique-constraint failure on one row
   * doesn't kill the rest. Returns counts + per-row errors so the UI
   * can surface them.
   */
  async applyFlavorMappings(
    mappings: Array<{ flavorId: string; zohoProductId: string }>
  ): Promise<{ saved: number; errors: string[] }> {
    let saved = 0;
    const errors: string[] = [];

    for (const m of mappings) {
      const { error } = await this.supabase.client
        .from('gg_flavors')
        .update({ zoho_product_id: m.zohoProductId })
        .eq('id', m.flavorId);
      if (error) {
        errors.push(`flavor ${m.flavorId}: ${error.message}`);
      } else {
        saved++;
      }
    }

    return { saved, errors };
  }

  // ──────────────────────────────────────────────────────────────────
  // 5. Commit
  // ──────────────────────────────────────────────────────────────────

  async commit(
    preview: ImportPreview,
    onProgress?: (p: ImportProgress) => void
  ): Promise<ImportResult> {
    const result: ImportResult = {
      rows: [],
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      errorCount: 0,
    };

    // Decide which invoices we'll actually write.
    const writable: ResolvedInvoice[] = [];
    for (const inv of preview.invoices) {
      if (inv.status === 'skipped_no_items') {
        result.rows.push({
          invoice_number: inv.invoice_number,
          status: 'skipped',
          reason: 'No matching products',
        });
        result.skippedCount++;
        continue;
      }
      if (inv.status === 'dispatched_warning' && !inv.override) {
        result.rows.push({
          invoice_number: inv.invoice_number,
          status: 'skipped',
          reason: 'Already dispatched (not overridden)',
        });
        result.skippedCount++;
        continue;
      }
      writable.push(inv);
    }

    // ── Step 1: Create new customers ──────────────────────────────
    await this.createNewCustomers(writable, onProgress);

    // ── Step 2: Write invoices in chunks ──────────────────────────
    for (let i = 0; i < writable.length; i += COMMIT_CHUNK_SIZE) {
      const chunk = writable.slice(i, i + COMMIT_CHUNK_SIZE);

      const newOnes = chunk.filter((r) => r.status === 'new');
      const updates = chunk.filter(
        (r) => r.status === 'update' || (r.status === 'dispatched_warning' && r.override)
      );

      // Bulk insert new
      if (newOnes.length > 0) {
        const records = newOnes.map((r) => ({
          invoice_number: r.invoice_number,
          customer_id: r.customer.existing_id ?? null,
          customer_name: r.customer.name,
          items: r.items.map((it) => ({
            flavor_id: it.flavor_id,
            flavor_name: it.flavor_name,
            quantity_boxes: it.quantity_boxes,
          })),
          expected_dispatch_date: null,
          is_packed: false,
          is_dispatched: false,
          zoho_invoice_id: r.zoho_invoice_id || null,
        }));

        const { error } = await this.supabase.client.from('gg_invoices').insert(records);
        if (error) {
          for (const r of newOnes) {
            result.rows.push({
              invoice_number: r.invoice_number,
              status: 'error',
              reason: error.message,
            });
            result.errorCount++;
          }
        } else {
          for (const r of newOnes) {
            result.rows.push({ invoice_number: r.invoice_number, status: 'created' });
            result.createdCount++;
          }
        }
      }

      // Updates one at a time (different IDs)
      for (const r of updates) {
        const update = {
          customer_id: r.customer.existing_id ?? null,
          customer_name: r.customer.name,
          items: r.items.map((it) => ({
            flavor_id: it.flavor_id,
            flavor_name: it.flavor_name,
            quantity_boxes: it.quantity_boxes,
          })),
        };
        const { error } = await this.supabase.client
          .from('gg_invoices')
          .update(update)
          .eq('id', r.existingInvoiceId!);

        if (error) {
          result.rows.push({
            invoice_number: r.invoice_number,
            status: 'error',
            reason: error.message,
          });
          result.errorCount++;
        } else {
          result.rows.push({ invoice_number: r.invoice_number, status: 'updated' });
          result.updatedCount++;
        }
      }

      onProgress?.({ done: Math.min(i + COMMIT_CHUNK_SIZE, writable.length), total: writable.length, phase: 'invoices' });
    }

    return result;
  }

  /**
   * Create any customers that don't yet exist, mutating the resolved
   * invoices so they pick up the new gg_customers.id values.
   */
  private async createNewCustomers(
    invoices: ResolvedInvoice[],
    onProgress?: (p: ImportProgress) => void
  ): Promise<void> {
    // Dedupe by zoho_customer_id (or normalized name fallback)
    const toCreate = new Map<string, { name: string; zoho_customer_id: string | null }>();
    for (const r of invoices) {
      if (!r.customer.willCreate) continue;
      const key = r.customer.zoho_customer_id || normalizeName(r.customer.name);
      if (toCreate.has(key)) continue;
      toCreate.set(key, {
        name: r.customer.name,
        zoho_customer_id: r.customer.zoho_customer_id || null,
      });
    }

    if (toCreate.size === 0) return;

    const records = Array.from(toCreate.values());
    onProgress?.({ done: 0, total: records.length, phase: 'customers' });

    // upsert by zoho_customer_id (partial unique index handles NULLs).
    // Customers without a zoho_customer_id will fall through and could create
    // duplicates if run twice — acceptable for now since they're rare.
    const { data, error } = await this.supabase.client
      .from('gg_customers')
      .upsert(records, { onConflict: 'zoho_customer_id', ignoreDuplicates: false })
      .select('id, name, zoho_customer_id');

    if (error) {
      // Don't throw — surface as per-invoice errors at write time.
      console.error('[csv-import] customer upsert failed', error);
      onProgress?.({ done: records.length, total: records.length, phase: 'customers' });
      return;
    }

    // Backfill IDs onto the resolved invoices
    const idByZohoId = new Map<string, string>();
    const idByNameKey = new Map<string, string>();
    for (const c of data ?? []) {
      if (c.zoho_customer_id) idByZohoId.set(c.zoho_customer_id, c.id);
      idByNameKey.set(normalizeName(c.name), c.id);
    }

    for (const r of invoices) {
      if (!r.customer.willCreate) continue;
      if (r.customer.existing_id) continue;
      const id = r.customer.zoho_customer_id
        ? idByZohoId.get(r.customer.zoho_customer_id)
        : idByNameKey.get(normalizeName(r.customer.name));
      if (id) r.customer.existing_id = id;
    }

    onProgress?.({ done: records.length, total: records.length, phase: 'customers' });
  }
}

// ──────────────────────────────────────────────────────────────────────
// Helpers (exported for tests)
// ──────────────────────────────────────────────────────────────────────

export function normalizeName(s: string): string {
  return (s || '').trim().replace(/\s+/g, ' ').toLowerCase();
}
