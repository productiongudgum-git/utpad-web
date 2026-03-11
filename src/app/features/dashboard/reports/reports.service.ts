import { Injectable, inject } from '@angular/core';
import {
  ReportType,
  ProductionReportRow,
  PackingReportRow,
  DispatchReportRow,
  InventoryReportRow,
  ReturnsReportRow,
} from '../../../shared/models/manufacturing.models';
import { SupabaseService } from '../../../core/supabase.service';

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private supabase = inject(SupabaseService);

  async fetchProduction(from: string, to: string): Promise<ProductionReportRow[]> {
    const { data } = await this.supabase.client
      .from('production_batches')
      .select('batch_code, production_date, planned_yield, actual_yield, sku:flavor_definitions(name), recipe:recipe_definitions(name), worker:ops_workers(name)')
      .gte('production_date', from)
      .lte('production_date', to)
      .order('production_date', { ascending: false });
    return ((data as any[]) ?? []).map((r: any) => ({
      batch_code: r.batch_code,
      sku: r.sku?.name ?? r.sku_id,
      recipe: r.recipe?.name ?? r.recipe_id,
      production_date: r.production_date,
      worker: r.worker?.name ?? r.worker_id,
      planned_yield: r.planned_yield,
      actual_yield: r.actual_yield,
    }));
  }

  async fetchPacking(from: string, to: string): Promise<PackingReportRow[]> {
    const { data } = await this.supabase.client
      .from('packing_sessions')
      .select('batch_code, session_date, boxes_packed, worker:ops_workers(name), batch:production_batches(planned_yield,sku_id,flavor:flavor_definitions(name))')
      .gte('session_date', from)
      .lte('session_date', to)
      .order('session_date', { ascending: false });
    return ((data as any[]) ?? []).map((r: any) => ({
      batch_code: r.batch_code,
      sku: r.batch?.flavor?.name ?? r.batch?.sku_id ?? '',
      session_date: r.session_date,
      worker: r.worker?.name ?? r.worker_id,
      boxes_packed: r.boxes_packed,
      cumulative_packed: 0, // Would need aggregate query — simplified
      remaining: r.batch?.planned_yield ? r.batch.planned_yield - r.boxes_packed : null,
    }));
  }

  async fetchDispatch(from: string, to: string): Promise<DispatchReportRow[]> {
    const { data } = await this.supabase.client
      .from('dispatch_events')
      .select('invoice_number, customer_name, batch_code, boxes_dispatched, dispatch_date, sku:flavor_definitions(name), worker:ops_workers(name)')
      .gte('dispatch_date', from)
      .lte('dispatch_date', to)
      .order('dispatch_date', { ascending: false });
    return ((data as any[]) ?? []).map((r: any) => ({
      invoice_number: r.invoice_number,
      customer_name: r.customer_name,
      sku: r.sku?.name ?? r.sku_id,
      batch_code: r.batch_code,
      boxes_dispatched: r.boxes_dispatched,
      dispatch_date: r.dispatch_date,
      worker: r.worker?.name ?? r.worker_id,
    }));
  }

  async fetchInventorySnapshot(): Promise<InventoryReportRow[]> {
    const { data: rm } = await this.supabase.client
      .from('inventory_raw_materials')
      .select('current_qty, unit, low_stock_threshold, ingredient:recipe_ingredients(name)');
    const { data: fg } = await this.supabase.client
      .from('inventory_finished_goods')
      .select('boxes_available, sku:flavor_definitions(name)');

    const rmRows: InventoryReportRow[] = ((rm as any[]) ?? []).map((r: any) => ({
      name: r.ingredient?.name ?? r.ingredient_id,
      type: 'raw' as const,
      current_qty: r.current_qty,
      unit: r.unit,
      low_threshold: r.low_stock_threshold,
      status: (r.low_stock_threshold && r.current_qty < r.low_stock_threshold) ? 'LOW' : 'OK',
    }));
    const fgRows: InventoryReportRow[] = ((fg as any[]) ?? []).map((r: any) => ({
      name: r.sku?.name ?? r.sku_id,
      type: 'finished' as const,
      current_qty: r.boxes_available,
      unit: 'boxes',
      low_threshold: null,
      status: 'OK',
    }));
    return [...rmRows, ...fgRows];
  }

  async fetchReturns(from: string, to: string): Promise<ReturnsReportRow[]> {
    const { data } = await this.supabase.client
      .from('returns_events')
      .select('batch_code, qty_returned, reason, return_date, sku:flavor_definitions(name), worker:ops_workers(name)')
      .gte('return_date', from)
      .lte('return_date', to)
      .order('return_date', { ascending: false });
    return ((data as any[]) ?? []).map((r: any) => ({
      batch_code: r.batch_code,
      sku: r.sku?.name ?? r.sku_id,
      qty_returned: r.qty_returned,
      reason: r.reason,
      return_date: r.return_date,
      worker: r.worker?.name ?? r.worker_id,
    }));
  }

  toCsv(rows: Record<string, unknown>[]): string {
    if (rows.length === 0) return '';
    const headers = Object.keys(rows[0]);
    const lines = [
      headers.join(','),
      ...rows.map(row =>
        headers.map(h => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          const str = String(val);
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        }).join(',')
      ),
    ];
    return lines.join('\n');
  }

  downloadCsv(filename: string, content: string): void {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async downloadReport(type: ReportType, from: string, to: string): Promise<void> {
    let rows: Record<string, unknown>[] = [];
    switch (type) {
      case 'production': rows = (await this.fetchProduction(from, to)) as unknown as Record<string, unknown>[]; break;
      case 'packing':    rows = (await this.fetchPacking(from, to)) as unknown as Record<string, unknown>[]; break;
      case 'dispatch':   rows = (await this.fetchDispatch(from, to)) as unknown as Record<string, unknown>[]; break;
      case 'inventory':  rows = (await this.fetchInventorySnapshot()) as unknown as Record<string, unknown>[]; break;
      case 'returns':    rows = (await this.fetchReturns(from, to)) as unknown as Record<string, unknown>[]; break;
    }
    const csv = this.toCsv(rows);
    const dateStr = `${from}_to_${to}`;
    this.downloadCsv(`gudgum-${type}-report-${dateStr}.csv`, csv);
  }
}
