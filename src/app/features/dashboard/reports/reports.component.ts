import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../../core/supabase.service';

interface ReportButton {
  key: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  bgColor: string;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Toast -->
    @if (toast()) {
      <div style="position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 18px;border-radius:10px;background:#1a1a1a;color:#fff;font-size:14px;font-weight:500;display:flex;align-items:center;gap:8px;box-shadow:0 4px 20px rgba(0,0,0,0.25);animation:slideUp 0.2s ease;">
        <span class="material-icons-round" style="font-size:16px;">check_circle</span>
        {{ toast() }}
      </div>
    }

    <div style="padding:28px 24px;max-width:900px;">

      <div style="margin-bottom:28px;">
        <h1 class="font-display" style="font-size:26px;font-weight:700;color:var(--foreground);margin:0 0 4px;">Reports</h1>
        <p style="font-size:14px;color:var(--muted-fg);margin:0;">Download operational reports as CSV files directly to your browser.</p>
      </div>

      <div class="reports-grid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:20px;">
        @for (r of reports; track r.key) {
          <div class="beautiful-card" style="padding:24px;display:flex;flex-direction:column;gap:16px;">
            <div style="display:flex;align-items:flex-start;gap:14px;">
              <div style="width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"
                   [style.background]="r.bgColor">
                <span class="material-icons-round" style="font-size:24px;" [style.color]="r.color">{{ r.icon }}</span>
              </div>
              <div style="flex:1;min-width:0;">
                <h3 style="font-size:15px;font-weight:700;color:var(--foreground);margin:0 0 4px;">{{ r.label }}</h3>
                <p style="font-size:13px;color:var(--muted-fg);margin:0;line-height:1.4;">{{ r.description }}</p>
              </div>
            </div>
            <button (click)="download(r.key)" [disabled]="downloading() === r.key"
                    style="display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 20px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:opacity 0.15s;color:#fff;"
                    [style.background]="r.color"
                    [style.opacity]="downloading() === r.key ? '0.7' : '1'">
              <span class="material-icons-round" style="font-size:18px;">
                {{ downloading() === r.key ? 'hourglass_empty' : 'download' }}
              </span>
              {{ downloading() === r.key ? 'Preparing…' : r.label }}
            </button>
          </div>
        }
      </div>
    </div>

    <style>
      @keyframes slideUp { from { transform:translateY(16px); opacity:0; } to { transform:translateY(0); opacity:1; } }
      @media (max-width: 700px) { .reports-grid { grid-template-columns: 1fr !important; } }
    </style>
  `,
})
export class ReportsComponent {
  private readonly supabase = inject(SupabaseService);

  downloading = signal('');
  toast       = signal('');

  readonly reports: ReportButton[] = [
    {
      key:         'sales',
      label:       'Download Sales Report',
      description: 'Dispatch events with customer name, flavor, boxes dispatched, and dispatch date.',
      icon:        'receipt_long',
      color:       '#2563eb',
      bgColor:     '#dbeafe',
    },
    {
      key:         'wastage',
      label:       'Download Wastage Report',
      description: 'Production batches showing flavor, planned yield vs actual yield (kg).',
      icon:        'delete_sweep',
      color:       '#dc2626',
      bgColor:     '#fee2e2',
    },
    {
      key:         'dispatches',
      label:       'Download Dispatches Report',
      description: 'Full log of all dispatch events including invoice numbers and dates.',
      icon:        'local_shipping',
      color:       '#7c3aed',
      bgColor:     '#f3e8ff',
    },
    {
      key:         'warnings',
      label:       'Download Warnings Report',
      description: 'Ingredients currently below their reorder threshold.',
      icon:        'warning',
      color:       '#d97706',
      bgColor:     '#fef3c7',
    },
  ];

  async download(key: string): Promise<void> {
    this.downloading.set(key);
    try {
      switch (key) {
        case 'sales':      await this.downloadSales();      break;
        case 'wastage':    await this.downloadWastage();    break;
        case 'dispatches': await this.downloadDispatches(); break;
        case 'warnings':   await this.downloadWarnings();   break;
      }
      this.showToast('Report downloaded successfully');
    } catch {
      this.showToast('Failed to generate report');
    } finally {
      this.downloading.set('');
    }
  }

  private async downloadSales(): Promise<void> {
    const { data } = await this.supabase.client
      .from('dispatch_events')
      .select('customer_name, batch_code, boxes_dispatched, dispatch_date, invoice_number, sku:gg_flavors(name)')
      .order('dispatch_date', { ascending: false });

    const rows = (data ?? []).map((r: any) => {
      const flavor = Array.isArray(r.sku) ? r.sku[0] : r.sku;
      return [
        this.esc(r.customer_name ?? ''),
        this.esc(flavor?.name ?? ''),
        r.boxes_dispatched ?? 0,
        this.esc(r.dispatch_date ?? ''),
        this.esc(r.invoice_number ?? ''),
        this.esc(r.batch_code ?? ''),
      ];
    });

    this.triggerCsv(
      ['Customer', 'Flavor', 'Boxes Dispatched', 'Dispatch Date', 'Invoice Number', 'Batch Code'],
      rows,
      'sales-report.csv',
    );
  }

  private async downloadWastage(): Promise<void> {
    const { data } = await this.supabase.client
      .from('production_batches')
      .select('batch_code, production_date, planned_yield, actual_yield, flavor:gg_flavors!production_batches_flavor_id_fkey(name)')
      .order('production_date', { ascending: false });

    const rows = (data ?? []).map((r: any) => {
      const flavor = Array.isArray(r.flavor) ? r.flavor[0] : r.flavor;
      const planned = r.planned_yield ?? 0;
      const actual  = r.actual_yield ?? 0;
      const wastage = Math.max(0, planned - actual);
      return [
        this.esc(r.batch_code ?? ''),
        this.esc(flavor?.name ?? ''),
        this.esc(r.production_date ?? ''),
        planned,
        actual,
        wastage,
      ];
    });

    this.triggerCsv(
      ['Batch Code', 'Flavor', 'Production Date', 'Planned Yield (kg)', 'Actual Yield (kg)', 'Wastage (kg)'],
      rows,
      'wastage-report.csv',
    );
  }

  private async downloadDispatches(): Promise<void> {
    const { data } = await this.supabase.client
      .from('dispatch_events')
      .select('id, batch_code, customer_name, invoice_number, boxes_dispatched, dispatch_date, created_at')
      .order('dispatch_date', { ascending: false });

    const rows = (data ?? []).map((r: any) => [
      this.esc(r.id ?? ''),
      this.esc(r.batch_code ?? ''),
      this.esc(r.customer_name ?? ''),
      this.esc(r.invoice_number ?? ''),
      r.boxes_dispatched ?? 0,
      this.esc(r.dispatch_date ?? ''),
      this.esc(r.created_at ?? ''),
    ]);

    this.triggerCsv(
      ['ID', 'Batch Code', 'Customer', 'Invoice Number', 'Boxes Dispatched', 'Dispatch Date', 'Created At'],
      rows,
      'dispatches-report.csv',
    );
  }

  private async downloadWarnings(): Promise<void> {
    const { data: inv } = await this.supabase.client
      .from('inventory_raw_materials')
      .select('ingredient_id, current_qty, unit, low_stock_threshold, ingredient:gg_ingredients(name)');

    const low = (inv ?? []).filter((r: any) =>
      (r.low_stock_threshold ?? 0) > 0 && (r.current_qty ?? 0) <= (r.low_stock_threshold ?? 0)
    );

    const rows = low.map((r: any) => {
      const ingredient = Array.isArray(r.ingredient) ? r.ingredient[0] : r.ingredient;
      return [
        this.esc(ingredient?.name ?? r.ingredient_id),
        r.current_qty ?? 0,
        this.esc(r.unit ?? ''),
        r.low_stock_threshold ?? 0,
        Math.max(0, (r.low_stock_threshold ?? 0) - (r.current_qty ?? 0)),
      ];
    });

    this.triggerCsv(
      ['Ingredient', 'Current Quantity', 'Unit', 'Reorder Point', 'Deficit'],
      rows,
      'warnings-report.csv',
    );
  }

  private triggerCsv(headers: string[], rows: (string | number)[][], filename: string): void {
    const lines = [
      headers.join(','),
      ...rows.map(r => r.join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private esc(val: string): string {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  }

  private showToast(msg: string): void {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(''), 3000);
  }
}
