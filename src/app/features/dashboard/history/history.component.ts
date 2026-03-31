import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../../core/supabase.service';
import { BatchCodeService } from '../../../core/services/batch-code.service';

declare const Chart: any;

interface BatchHistory {
  id: string; batch_code: string; flavor_name: string;
  status: string; created_at: string;
  production?: { manufacturing_date: string; actual_output_kg: number; batch_size?: number };
  packing?: { quantity_kg: number; boxes_count: number; packing_date: string };
  dispatch?: { quantity_dispatched: number; dispatch_date: string; customer_name: string };
}

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule],
  template: `
    <div style="padding:24px;max-width:1100px;">
      <div style="margin-bottom:24px;">
        <h1 style="font-family:'Cabin',sans-serif;font-size:22px;font-weight:700;color:#121212;margin:0 0 4px;">History</h1>
        <p style="color:#6B7280;font-size:14px;margin:0;">Production analytics, batch lifecycle history and export.</p>
      </div>

      <!-- Charts row -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:28px;" class="hist-charts">
        <div style="background:#fff;border-radius:12px;border:1px solid #E5E7EB;padding:24px;">
          <h3 style="font-family:'Cabin',sans-serif;font-size:15px;font-weight:600;color:#121212;margin:0 0 16px;">Monthly Production (kg)</h3>
          @if (chartsLoading()) {
            <div class="gg-skeleton" style="height:200px;border-radius:8px;"></div>
          } @else {
            <canvas id="monthlyChart" style="max-height:220px;"></canvas>
          }
        </div>
        <div style="background:#fff;border-radius:12px;border:1px solid #E5E7EB;padding:24px;">
          <h3 style="font-family:'Cabin',sans-serif;font-size:15px;font-weight:600;color:#121212;margin:0 0 16px;">Production by Flavor</h3>
          @if (chartsLoading()) {
            <div class="gg-skeleton" style="height:200px;border-radius:8px;"></div>
          } @else {
            <canvas id="flavorChart" style="max-height:220px;"></canvas>
          }
        </div>
      </div>

      <!-- Batch Code Banner -->
      <div style="display:flex;align-items:center;gap:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:12px 16px;margin-bottom:16px;flex-wrap:wrap;">
        <span style="font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">Today's Batch Code</span>
        @if (batchCodeSvc.loading()) {
          <span style="font-size:14px;color:#9CA3AF;font-style:italic;">Loading…</span>
        } @else if (batchCodeSvc.batchCode()) {
          <span style="font-family:monospace;font-size:16px;font-weight:700;color:#15803d;letter-spacing:1.5px;">{{ batchCodeSvc.batchCode() }}</span>
          @if (batchCodeSvc.batchDate()) {
            <span style="font-size:12px;color:#6B7280;">{{ batchCodeSvc.batchDate() }}</span>
          }
          <button (click)="filterByTodaysBatch()" style="margin-left:auto;padding:6px 14px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">
            <span class="material-icons-round" style="font-size:15px;">filter_list</span>
            Show today's batches
          </button>
        } @else {
          <span style="font-size:13px;color:#9CA3AF;">Batch code unavailable</span>
        }
      </div>

      <!-- Filters -->
      <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;align-items:center;">
        <input [(ngModel)]="searchTerm" placeholder="Search batch code or flavor..." class="gg-input" style="max-width:260px;" (ngModelChange)="filterTable()">
        <select [(ngModel)]="statusFilter" class="gg-input dropdown-with-arrow" style="max-width:180px;" (ngModelChange)="filterTable()">
          <option value="">All Statuses</option>
          <option value="production">Production</option>
          <option value="packing">Packing</option>
          <option value="dispatch">Dispatch</option>
          <option value="completed">Completed</option>
        </select>
        <input [(ngModel)]="dateFrom" type="date" class="gg-input" style="max-width:160px;" (ngModelChange)="filterTable()">
        <input [(ngModel)]="dateTo" type="date" class="gg-input" style="max-width:160px;" (ngModelChange)="filterTable()">
        @if (searchTerm || statusFilter || dateFrom || dateTo) {
          <button (click)="clearFilters()" style="padding:8px 12px;background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:5px;color:#dc2626;">
            <span class="material-icons-round" style="font-size:15px;">close</span> Clear
          </button>
        }
        <button (click)="exportCSV()" style="padding:8px 16px;background:#f3f4f6;border:1px solid #E5E7EB;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:6px;color:#374151;">
          <span class="material-icons-round" style="font-size:16px;">download</span> Export CSV
        </button>
      </div>

      <!-- Table -->
      @if (loading()) {
        <div style="display:flex;flex-direction:column;gap:10px;">
          @for (i of [1,2,3,4,5]; track i) { <div class="gg-skeleton" style="height:56px;border-radius:10px;"></div> }
        </div>
      } @else if (filtered().length === 0) {
        <div style="text-align:center;padding:60px 0;color:#9CA3AF;">
          <span class="material-icons-round" style="font-size:48px;display:block;margin-bottom:12px;">history</span>
          <p style="font-size:15px;margin:0;">No batches match your filters.</p>
        </div>
      } @else {
        <div style="background:#fff;border-radius:12px;border:1px solid #E5E7EB;overflow:hidden;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#f8f9fa;border-bottom:1px solid #E5E7EB;">
                <th style="text-align:left;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;">Batch Code</th>
                <th style="text-align:left;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;">Flavor</th>
                <th style="text-align:center;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;">Status</th>
                <th style="text-align:left;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;">Date</th>
                <th style="text-align:center;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;"></th>
              </tr>
            </thead>
            <tbody>
              @for (b of filtered(); track b.id) {
                <tr style="border-bottom:1px solid #f3f4f6;cursor:pointer;" (click)="toggleExpand(b.id)"
                    [style.background]="isTodaysBatch(b) ? '#f0fdf4' : 'transparent'">
                  <td style="padding:12px 16px;">
                    <div style="display:flex;align-items:center;gap:6px;">
                      <span style="font-size:13px;font-weight:700;color:#121212;font-family:'Cabin',sans-serif;">{{ b.batch_code }}</span>
                      @if (isTodaysBatch(b)) {
                        <span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;background:#dcfce7;color:#15803d;text-transform:uppercase;letter-spacing:0.5px;">Today</span>
                      }
                    </div>
                  </td>
                  <td style="padding:12px 16px;font-size:13px;color:#374151;">{{ b.flavor_name }}</td>
                  <td style="padding:12px 16px;text-align:center;">
                    <span [style.background]="statusBg(b.status)" [style.color]="statusColor(b.status)" style="padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;text-transform:capitalize;">{{ b.status }}</span>
                  </td>
                  <td style="padding:12px 16px;font-size:12px;color:#6B7280;">{{ b.created_at | date:'dd MMM yyyy' }}</td>
                  <td style="padding:12px 16px;text-align:center;">
                    <span class="material-icons-round" style="font-size:18px;color:#9CA3AF;transition:transform 0.15s;" [style.transform]="expanded().has(b.id) ? 'rotate(180deg)' : 'none'">expand_more</span>
                  </td>
                </tr>
                @if (expanded().has(b.id)) {
                  <tr>
                    <td colspan="5" style="padding:0;background:#f8f9fa;">
                      <div style="padding:16px 20px;display:grid;grid-template-columns:repeat(3,1fr);gap:16px;" class="detail-grid">
                        <!-- Production -->
                        <div style="background:#fff;border-radius:8px;border:1px solid #E5E7EB;padding:12px;">
                          <p style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;margin:0 0 8px;">Production</p>
                          @if (b.production) {
                            <p style="font-size:13px;color:#121212;margin:0 0 4px;">Output: <strong>{{ b.production.actual_output_kg }} kg</strong></p>
                            @if (b.production.batch_size) {
                              <p style="font-size:13px;color:#121212;margin:0 0 4px;">Batch Size: <strong>{{ b.production.batch_size | number:'1.0-0' }} units</strong></p>
                            }
                            <p style="font-size:12px;color:#6B7280;margin:0;">{{ b.production.manufacturing_date | date:'dd MMM yyyy' }}</p>
                          } @else {
                            <p style="font-size:13px;color:#9CA3AF;margin:0;">Not recorded</p>
                          }
                        </div>
                        <!-- Packing -->
                        <div style="background:#fff;border-radius:8px;border:1px solid #E5E7EB;padding:12px;">
                          <p style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;margin:0 0 8px;">Packing</p>
                          @if (b.packing) {
                            <p style="font-size:13px;font-weight:600;color:#121212;margin:0 0 3px;">{{ b.flavor_name }}</p>
                            <p style="font-size:13px;color:#374151;margin:0 0 3px;">
                              <strong>{{ b.packing.boxes_count }}</strong> boxes packed
                            </p>
                            <p style="font-size:12px;color:#6B7280;margin:0;">{{ b.packing.quantity_kg }} kg · {{ b.packing.packing_date | date:'dd MMM yyyy' }}</p>
                          } @else {
                            <p style="font-size:13px;color:#9CA3AF;margin:0;">Not recorded</p>
                          }
                        </div>
                        <!-- Dispatch -->
                        <div style="background:#fff;border-radius:8px;border:1px solid #E5E7EB;padding:12px;">
                          <p style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;margin:0 0 8px;">Dispatch</p>
                          @if (b.dispatch) {
                            <p style="font-size:13px;color:#121212;margin:0 0 4px;">{{ b.dispatch.quantity_dispatched | number:'1.0-0' }} units → {{ b.dispatch.customer_name }}</p>
                            <p style="font-size:12px;color:#6B7280;margin:0;">{{ b.dispatch.dispatch_date | date:'dd MMM yyyy' }}</p>
                          } @else {
                            <p style="font-size:13px;color:#9CA3AF;margin:0;">Not dispatched</p>
                          }
                        </div>
                      </div>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      }
    </div>
    <style>
      @media (max-width:800px) { .hist-charts { grid-template-columns: 1fr !important; } }
      @media (max-width:600px) { .detail-grid { grid-template-columns: 1fr !important; } }
    </style>
  `,
})
export class HistoryComponent implements OnInit, OnDestroy {
  private readonly supabase = inject(SupabaseService);
  readonly batchCodeSvc = inject(BatchCodeService);

  loading = signal(true);
  chartsLoading = signal(true);
  batches = signal<BatchHistory[]>([]);
  filtered = signal<BatchHistory[]>([]);
  expanded = signal<Set<string>>(new Set());

  searchTerm = '';
  statusFilter = '';
  dateFrom = '';
  dateTo = '';

  private monthChart: any = null;
  private flavorChart: any = null;

  async ngOnInit(): Promise<void> {
    await this.loadData();
    setTimeout(() => this.renderCharts(), 100);
  }

  ngOnDestroy(): void {
    this.monthChart?.destroy();
    this.flavorChart?.destroy();
  }

  toggleExpand(id: string): void {
    this.expanded.update(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  isTodaysBatch(b: BatchHistory): boolean {
    const todayCode = this.batchCodeSvc.batchCode();
    return !!todayCode && b.batch_code === todayCode;
  }

  filterByTodaysBatch(): void {
    const code = this.batchCodeSvc.batchCode();
    if (code) {
      this.searchTerm = code;
      this.filterTable();
    }
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.statusFilter = '';
    this.dateFrom = '';
    this.dateTo = '';
    this.filterTable();
  }

  filterTable(): void {
    let list = this.batches();
    if (this.searchTerm) {
      const q = this.searchTerm.toLowerCase();
      list = list.filter(b => b.batch_code.toLowerCase().includes(q) || b.flavor_name.toLowerCase().includes(q));
    }
    if (this.statusFilter) list = list.filter(b => b.status === this.statusFilter);
    if (this.dateFrom) list = list.filter(b => b.created_at >= this.dateFrom);
    if (this.dateTo) list = list.filter(b => b.created_at <= this.dateTo + 'T23:59:59');
    this.filtered.set(list);
  }

  exportCSV(): void {
    const rows = this.filtered();
    const headers = ['Batch Code', 'Flavor', 'Status', 'Date', 'Output kg', 'Batch Size (units)', 'Packed kg', 'Boxes', 'Dispatched (units)', 'Customer'];
    const csv = [headers.join(','), ...rows.map(b => [
      b.batch_code, b.flavor_name, b.status, b.created_at.substring(0, 10),
      b.production?.actual_output_kg ?? '', b.production?.batch_size ?? '',
      b.packing?.quantity_kg ?? '', b.packing?.boxes_count ?? '',
      b.dispatch?.quantity_dispatched ?? '', b.dispatch?.customer_name ?? '',
    ].join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gg-history-${new Date().toISOString().substring(0, 10)}.csv`;
    a.click();
  }

  statusColor(s: string): string {
    const m: Record<string,string> = { production:'#2563eb', packing:'#d97706', dispatch:'#01AC51', completed:'#6B7280' };
    return m[s] ?? '#6B7280';
  }
  statusBg(s: string): string {
    const m: Record<string,string> = { production:'#dbeafe', packing:'#fef3c7', dispatch:'#dcfce7', completed:'#f3f4f6' };
    return m[s] ?? '#f3f4f6';
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);
    const [batchRes, prodRes, packRes, dispRes] = await Promise.all([
      this.supabase.client.from('gg_batches').select('id, batch_code, status, created_at, gg_flavors(name)').order('created_at', { ascending: false }).limit(500),
      this.supabase.client.from('gg_production').select('batch_id, manufacturing_date, actual_output_kg, batch_size'),
      this.supabase.client.from('gg_packing').select('batch_id, quantity_kg, boxes_count, packing_date'),
      this.supabase.client.from('gg_dispatch').select('batch_id, quantity_dispatched, dispatch_date, gg_customers(name)'),
    ]);

    const prodMap = new Map((prodRes.data ?? []).map((p: any) => [p.batch_id, p]));
    const packMap = new Map((packRes.data ?? []).map((p: any) => [p.batch_id, p]));
    const dispMap = new Map((dispRes.data ?? []).map((d: any) => [d.batch_id, d]));

    const list: BatchHistory[] = (batchRes.data ?? []).map((b: any) => {
      const prod = prodMap.get(b.id);
      const pack = packMap.get(b.id);
      const disp = dispMap.get(b.id);
      return {
        id: b.id, batch_code: b.batch_code, status: b.status, created_at: b.created_at,
        flavor_name: b.gg_flavors?.name ?? 'Unknown',
        production: prod ? { manufacturing_date: prod.manufacturing_date, actual_output_kg: prod.actual_output_kg, batch_size: prod.batch_size ?? undefined } : undefined,
        packing: pack ? { quantity_kg: pack.quantity_kg, boxes_count: pack.boxes_count, packing_date: pack.packing_date } : undefined,
        dispatch: disp ? { quantity_dispatched: disp.quantity_dispatched, dispatch_date: disp.dispatch_date, customer_name: disp.gg_customers?.name ?? 'Unknown' } : undefined,
      };
    });
    this.batches.set(list);
    this.filtered.set(list);
    this.loading.set(false);
  }

  private renderCharts(): void {
    if (typeof Chart === 'undefined') return;
    this.chartsLoading.set(false);
    setTimeout(() => {
      this.renderMonthlyChart();
      this.renderFlavorChart();
    }, 50);
  }

  private renderMonthlyChart(): void {
    const canvas = document.getElementById('monthlyChart') as HTMLCanvasElement | null;
    if (!canvas) return;
    this.monthChart?.destroy();

    // Build last 6 months
    const months: string[] = [];
    const kgMap: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i); d.setDate(1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push(key); kgMap[key] = 0;
    }
    this.batches().forEach(b => {
      if (b.production) {
        const key = b.production.manufacturing_date.substring(0, 7);
        if (key in kgMap) kgMap[key] += b.production.actual_output_kg;
      }
    });

    this.monthChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: months.map(m => { const [y, mo] = m.split('-'); return new Date(+y, +mo - 1).toLocaleDateString('en', { month: 'short', year: '2-digit' }); }),
        datasets: [{ label: 'kg', data: months.map(m => kgMap[m]), backgroundColor: 'rgba(1,172,81,0.7)', borderColor: '#01AC51', borderWidth: 1, borderRadius: 4 }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { grid: { color: '#f0f0f0' } } } },
    });
  }

  private renderFlavorChart(): void {
    const canvas = document.getElementById('flavorChart') as HTMLCanvasElement | null;
    if (!canvas) return;
    this.flavorChart?.destroy();

    const flavorKg: Record<string, number> = {};
    this.batches().forEach(b => {
      if (b.production) {
        flavorKg[b.flavor_name] = (flavorKg[b.flavor_name] ?? 0) + b.production.actual_output_kg;
      }
    });
    const labels = Object.keys(flavorKg);
    const data = labels.map(l => flavorKg[l]);
    const colors = ['#01AC51','#2563eb','#d97706','#7c3aed','#dc2626','#0891b2','#059669','#db2777'];

    this.flavorChart = new Chart(canvas, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors.slice(0, labels.length), borderWidth: 2, borderColor: '#fff' }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { size: 12 }, padding: 12 } } } },
    });
  }
}
