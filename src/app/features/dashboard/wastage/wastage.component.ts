import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../../core/supabase.service';

// Units per kg of yield (both batch options share the same ratio)
// 7500 units / 10.5 kg yield = 714.285...  (and 10000 / 14 = 714.285)
const UNITS_PER_KG = 7500 / 10.5;

interface BatchOption { units: number; boxes: number; rawMaterialKg: number; expectedYieldKg: number; }
const BATCH_OPTIONS: BatchOption[] = [
  { units: 7500,  boxes: 500, rawMaterialKg: 15, expectedYieldKg: 10.5 },
  { units: 10000, boxes: 667, rawMaterialKg: 20, expectedYieldKg: 14 },
];

interface WastageRow {
  batchCode: string;
  flavorName: string;
  date: string;
  batchSizeUnits: number;
  rawMaterialKg: number;
  actualYieldKg: number;
  kgWasted: number;
  expectedYieldKg: number;
  actualUnits: number;
  unitsLess: number;
  boxesLess: number;
}

@Component({
  selector: 'app-wastage',
  standalone: true,
  imports: [CommonModule, DatePipe, DecimalPipe, FormsModule],
  template: `
    <div style="padding:24px;max-width:1200px;">

      <!-- Header -->
      <div style="margin-bottom:24px;">
        <h1 style="font-family:'Cabin',sans-serif;font-size:22px;font-weight:700;color:#121212;margin:0 0 4px;">Wastage</h1>
        <p style="color:#6B7280;font-size:14px;margin:0;">Production loss analysis — raw material input vs. actual yield.</p>
      </div>

      <!-- Summary cards -->
      @if (!loading() && rows().length > 0) {
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:24px;">
          <div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:16px;">
            <p style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Total Batches</p>
            <p style="font-size:28px;font-weight:700;color:#121212;margin:0;font-family:'Cabin',sans-serif;">{{ rows().length }}</p>
          </div>
          <div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:16px;">
            <p style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Total Raw Input</p>
            <p style="font-size:28px;font-weight:700;color:#1d4ed8;margin:0;font-family:'Cabin',sans-serif;">{{ totalRawKg() | number:'1.0-1' }} <span style="font-size:14px;font-weight:500;color:#6B7280;">kg</span></p>
          </div>
          <div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:16px;">
            <p style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Total Actual Yield</p>
            <p style="font-size:28px;font-weight:700;color:#15803d;margin:0;font-family:'Cabin',sans-serif;">{{ totalActualKg() | number:'1.0-1' }} <span style="font-size:14px;font-weight:500;color:#6B7280;">kg</span></p>
          </div>
          <div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:16px;">
            <p style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Total Wasted</p>
            <p style="font-size:28px;font-weight:700;color:#dc2626;margin:0;font-family:'Cabin',sans-serif;">{{ totalWastedKg() | number:'1.0-2' }} <span style="font-size:14px;font-weight:500;color:#6B7280;">kg</span></p>
          </div>
          <div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:16px;">
            <p style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Total Units Short</p>
            <p style="font-size:28px;font-weight:700;color:#d97706;margin:0;font-family:'Cabin',sans-serif;">{{ totalUnitsLess() | number:'1.0-0' }}</p>
          </div>
        </div>
      }

      <!-- Filters -->
      <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;align-items:center;">
        <input [(ngModel)]="searchTerm" placeholder="Search batch code or flavor..."
               class="gg-input" style="max-width:260px;" (ngModelChange)="applyFilter()">
        <input [(ngModel)]="dateFrom" type="date" class="gg-input" style="max-width:160px;" (ngModelChange)="applyFilter()">
        <input [(ngModel)]="dateTo"   type="date" class="gg-input" style="max-width:160px;" (ngModelChange)="applyFilter()">
        @if (searchTerm || dateFrom || dateTo) {
          <button (click)="clearFilters()" style="padding:8px 12px;background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:5px;color:#dc2626;">
            <span class="material-icons-round" style="font-size:15px;">close</span> Clear
          </button>
        }
        <button (click)="exportCSV()" style="margin-left:auto;padding:8px 16px;background:#f3f4f6;border:1px solid #E5E7EB;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:6px;color:#374151;">
          <span class="material-icons-round" style="font-size:16px;">download</span> Export CSV
        </button>
      </div>

      <!-- Table -->
      @if (loading()) {
        <div style="display:flex;flex-direction:column;gap:10px;">
          @for (i of [1,2,3,4,5]; track i) {
            <div class="gg-skeleton" style="height:52px;border-radius:10px;"></div>
          }
        </div>
      } @else if (filtered().length === 0) {
        <div style="text-align:center;padding:60px 0;color:#9CA3AF;">
          <span class="material-icons-round" style="font-size:48px;display:block;margin-bottom:12px;">delete_sweep</span>
          <p style="font-size:15px;margin:0;">No production records found.</p>
        </div>
      } @else {
        <div style="background:#fff;border-radius:12px;border:1px solid #E5E7EB;overflow:auto;">
          <table style="width:100%;border-collapse:collapse;min-width:900px;">
            <thead>
              <tr style="background:#f8f9fa;border-bottom:1px solid #E5E7EB;">
                <th style="text-align:left;padding:11px 14px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Date</th>
                <th style="text-align:left;padding:11px 14px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Batch Code</th>
                <th style="text-align:left;padding:11px 14px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Flavor</th>
                <th style="text-align:right;padding:11px 14px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Batch Size</th>
                <th style="text-align:right;padding:11px 14px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Raw Input</th>
                <th style="text-align:right;padding:11px 14px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Actual Yield</th>
                <th style="text-align:right;padding:11px 14px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Kg Wasted</th>
                <th style="text-align:right;padding:11px 14px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Units Short</th>
                <th style="text-align:right;padding:11px 14px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Boxes Short</th>
              </tr>
            </thead>
            <tbody>
              @for (r of filtered(); track r.batchCode + r.date) {
                <tr style="border-bottom:1px solid #f3f4f6;"
                    [style.background]="r.kgWasted > 2 ? '#fff5f5' : 'transparent'">
                  <td style="padding:10px 14px;font-size:13px;color:#6B7280;white-space:nowrap;">{{ r.date | date:'dd MMM yyyy' }}</td>
                  <td style="padding:10px 14px;">
                    <span style="font-family:monospace;font-size:13px;font-weight:700;color:#121212;">{{ r.batchCode }}</span>
                  </td>
                  <td style="padding:10px 14px;font-size:13px;color:#374151;">{{ r.flavorName }}</td>
                  <td style="padding:10px 14px;text-align:right;">
                    <span style="font-size:13px;font-weight:600;color:#374151;">{{ r.batchSizeUnits | number:'1.0-0' }}</span>
                    <span style="font-size:11px;color:#9CA3AF;margin-left:2px;">units</span>
                  </td>
                  <td style="padding:10px 14px;text-align:right;">
                    <span style="font-size:13px;font-weight:600;color:#1d4ed8;">{{ r.rawMaterialKg | number:'1.0-1' }}</span>
                    <span style="font-size:11px;color:#9CA3AF;margin-left:2px;">kg</span>
                  </td>
                  <td style="padding:10px 14px;text-align:right;">
                    <span style="font-size:13px;font-weight:600;color:#15803d;">{{ r.actualYieldKg | number:'1.0-2' }}</span>
                    <span style="font-size:11px;color:#9CA3AF;margin-left:2px;">kg</span>
                  </td>
                  <td style="padding:10px 14px;text-align:right;">
                    <span style="font-size:13px;font-weight:700;"
                          [style.color]="r.kgWasted > 0 ? '#dc2626' : '#15803d'">
                      {{ r.kgWasted | number:'1.0-2' }}
                    </span>
                    <span style="font-size:11px;color:#9CA3AF;margin-left:2px;">kg</span>
                  </td>
                  <td style="padding:10px 14px;text-align:right;">
                    <span style="font-size:13px;font-weight:700;"
                          [style.color]="r.unitsLess > 0 ? '#d97706' : '#15803d'">
                      {{ r.unitsLess | number:'1.0-0' }}
                    </span>
                  </td>
                  <td style="padding:10px 14px;text-align:right;">
                    <span style="font-size:13px;font-weight:700;"
                          [style.color]="r.boxesLess > 0 ? '#d97706' : '#15803d'">
                      {{ r.boxesLess | number:'1.1-1' }}
                    </span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class WastageComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);

  loading = signal(true);
  rows    = signal<WastageRow[]>([]);
  filtered = signal<WastageRow[]>([]);

  searchTerm = '';
  dateFrom   = '';
  dateTo     = '';

  readonly totalRawKg    = computed(() => this.rows().reduce((s, r) => s + r.rawMaterialKg, 0));
  readonly totalActualKg = computed(() => this.rows().reduce((s, r) => s + r.actualYieldKg, 0));
  readonly totalWastedKg = computed(() => this.rows().reduce((s, r) => s + r.kgWasted, 0));
  readonly totalUnitsLess = computed(() => this.rows().reduce((s, r) => s + r.unitsLess, 0));

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  applyFilter(): void {
    let list = this.rows();
    if (this.searchTerm) {
      const q = this.searchTerm.toLowerCase();
      list = list.filter(r => r.batchCode.toLowerCase().includes(q) || r.flavorName.toLowerCase().includes(q));
    }
    if (this.dateFrom) list = list.filter(r => r.date >= this.dateFrom);
    if (this.dateTo)   list = list.filter(r => r.date <= this.dateTo);
    this.filtered.set(list);
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.dateFrom   = '';
    this.dateTo     = '';
    this.applyFilter();
  }

  exportCSV(): void {
    const headers = ['Date', 'Batch Code', 'Flavor', 'Batch Size (units)', 'Raw Material (kg)', 'Actual Yield (kg)', 'Kg Wasted', 'Units Short', 'Boxes Short'];
    const csv = [headers.join(','), ...this.filtered().map(r => [
      r.date, r.batchCode, `"${r.flavorName}"`, r.batchSizeUnits, r.rawMaterialKg,
      r.actualYieldKg.toFixed(2), r.kgWasted.toFixed(2),
      Math.round(r.unitsLess), r.boxesLess.toFixed(1),
    ].join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `gg-wastage-${new Date().toISOString().substring(0, 10)}.csv`;
    a.click();
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);

    const { data, error } = await this.supabase.client
      .from('gg_production')
      .select('manufacturing_date, actual_output_kg, batch_size, batch_id, gg_batches(batch_code, gg_flavors(name))')
      .order('manufacturing_date', { ascending: false })
      .limit(500);

    if (error) {
      console.error('Wastage load error:', error);
      this.loading.set(false);
      return;
    }

    const list: WastageRow[] = (data ?? []).map((p: any) => {
      const batchSizeUnits: number = p.batch_size ?? 7500;
      const batchOpt = BATCH_OPTIONS.find(o => o.units === batchSizeUnits) ?? BATCH_OPTIONS[0];

      const rawMaterialKg   = batchOpt.rawMaterialKg;
      const expectedYieldKg = batchOpt.expectedYieldKg;
      const actualYieldKg   = p.actual_output_kg ?? 0;
      const kgWasted        = Math.max(0, rawMaterialKg - actualYieldKg);
      const actualUnits     = Math.round(actualYieldKg * UNITS_PER_KG);
      const unitsLess       = Math.max(0, batchSizeUnits - actualUnits);
      const boxesLess       = unitsLess / 15;

      return {
        batchCode:      p.gg_batches?.batch_code ?? '—',
        flavorName:     p.gg_batches?.gg_flavors?.name ?? 'Unknown',
        date:           (p.manufacturing_date ?? '').substring(0, 10),
        batchSizeUnits,
        rawMaterialKg,
        actualYieldKg,
        kgWasted,
        expectedYieldKg,
        actualUnits,
        unitsLess,
        boxesLess,
      };
    });

    this.rows.set(list);
    this.filtered.set(list);
    this.loading.set(false);
  }
}
