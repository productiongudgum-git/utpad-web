import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../../core/supabase.service';

// Factory conversion constants (must match the mobile app).
//   - Each box of finished gum weighs ~0.021 kg and holds 15 pieces.
//   - So 1 kg of product ~= 1/0.021 boxes ~= 47.6 boxes ~= 714.29 units.
//   - A 7500-pc batch = 500 boxes = 10.5 kg, which gives 7500 / 10.5 = 714.29.
const KG_PER_BOX    = 0.021;
const UNITS_PER_BOX = 15;
const UNITS_PER_KG  = UNITS_PER_BOX / KG_PER_BOX; // 714.2857...

interface WastageRow {
  batchCode: string;
  flavorName: string;
  date: string;
  rawMaterialKg: number;   // raw material that went in (production_batches.planned_yield)
  actualYieldKg: number;   // finished product that came out (production_batches.actual_yield)
  kgWasted: number;        // rawMaterialKg - actualYieldKg
  expectedUnits: number;   // units the raw input should have produced
  unitsPacked: number;     // units the actual yield translates to
  unitsLess: number;       // expectedUnits - unitsPacked
  boxesLess: number;       // unitsLess / 15
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
          <table style="width:100%;border-collapse:collapse;min-width:980px;">
            <thead>
              <tr style="background:#f8f9fa;border-bottom:1px solid #E5E7EB;">
                <th style="text-align:left;padding:11px 14px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Date</th>
                <th style="text-align:left;padding:11px 14px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Batch Code</th>
                <th style="text-align:left;padding:11px 14px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Flavor</th>
                <th style="text-align:right;padding:11px 14px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Raw Input</th>
                <th style="text-align:right;padding:11px 14px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Actual Yield</th>
                <th style="text-align:right;padding:11px 14px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Kg Wasted</th>
                <th style="text-align:right;padding:11px 14px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Expected Units</th>
                <th style="text-align:right;padding:11px 14px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Units Packed</th>
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
                    <span style="font-size:13px;font-weight:600;color:#374151;">{{ r.expectedUnits | number:'1.0-0' }}</span>
                  </td>
                  <td style="padding:10px 14px;text-align:right;">
                    <span style="font-size:13px;font-weight:600;color:#15803d;">{{ r.unitsPacked | number:'1.0-0' }}</span>
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
    const headers = ['Date', 'Batch Code', 'Flavor', 'Raw Material (kg)', 'Actual Yield (kg)', 'Kg Wasted', 'Expected Units', 'Units Packed', 'Units Short', 'Boxes Short'];
    const csv = [headers.join(','), ...this.filtered().map(r => [
      r.date, r.batchCode, `"${r.flavorName}"`, r.rawMaterialKg,
      r.actualYieldKg.toFixed(2), r.kgWasted.toFixed(2),
      Math.round(r.expectedUnits), Math.round(r.unitsPacked),
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
      .from('production_batches')
      .select('production_date, actual_yield, planned_yield, batch_code, flavor:gg_flavors!production_batches_flavor_id_fkey(name)')
      .order('production_date', { ascending: false })
      .limit(500);

    if (error) {
      console.error('Wastage load error:', error);
      this.loading.set(false);
      return;
    }

    const list: WastageRow[] = (data ?? []).map((p: any) => {
      // planned_yield = raw material weight in (kg); actual_yield = finished weight out (kg).
      const rawMaterialKg = p.planned_yield ?? 0;
      const actualYieldKg = p.actual_yield ?? 0;

      // 1. Wastage = what went in - what came out (kg).
      const kgWasted = Math.max(0, rawMaterialKg - actualYieldKg);

      // 3. Units short = expected units (from raw input) - units packed (from actual yield).
      const expectedUnits = Math.round(rawMaterialKg * UNITS_PER_KG);
      const unitsPacked   = Math.round(actualYieldKg * UNITS_PER_KG);
      const unitsLess     = Math.max(0, expectedUnits - unitsPacked);

      // 2. Boxes short = units short / 15.
      const boxesLess = unitsLess / UNITS_PER_BOX;

      return {
        batchCode:      p.batch_code ?? '-',
        flavorName:     (p.flavor as any)?.name ?? 'Unknown',
        date:           (p.production_date ?? '').substring(0, 10),
        rawMaterialKg,
        actualYieldKg,
        kgWasted,
        expectedUnits,
        unitsPacked,
        unitsLess,
        boxesLess,
      };
    });

    this.rows.set(list);
    this.filtered.set(list);
    this.loading.set(false);
  }
}
