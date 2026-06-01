import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../../core/supabase.service';

// Factory conversion constants (must match the mobile app).
//   - Each piece of gum weighs 1.4 g.
//   - A box holds 15 pieces = 21 g = 0.021 kg.
const GRAMS_PER_UNIT = 1.4;
const UNITS_PER_BOX  = 15;
// Flag a batch "off-recipe" if its actual raw input differs from the recipe's
// expected total by more than this (kg) — catches worker amount changes.
const DEVIATION_TOLERANCE_KG = 0.1;
const EXPANDED_STORAGE_KEY   = 'utpad-wastage-expanded-v1';

interface WastageRow {
  id: string;             // production_batches.id — unique per row, drives expand state
  batchCode: string;
  batchNumber: number | null;
  flavorName: string;
  date: string;
  rawMaterialKg: number;   // raw material that went in (production_batches.planned_yield)
  actualYieldKg: number;   // finished product that came out (production_batches.actual_yield)
  kgWasted: number;        // rawMaterialKg - actualYieldKg
  expectedUnits: number;   // actual yield weight / 1.4 g per piece
  unitsPacked: number;     // boxes packed (packing_sessions) x 15
  unitsLess: number;       // expectedUnits - unitsPacked
  boxesLess: number;       // unitsLess / 15
  // Recipe snapshot captured at production time (BEFORE INSERT trigger).
  recipeSnapshot: Array<{ name: string; qty: number }>;  // qty in grams
  expectedInputKg: number;   // sum of snapshot qty / 1000
  inputDeviationKg: number;  // rawMaterialKg - expectedInputKg
  offRecipe: boolean;        // |deviation| beyond tolerance and a snapshot exists
  // Per-ingredient planned vs actual (grams) — populated once the app sends it.
  actualIngredients: Array<{ name: string; planned: number; actual: number }>;
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
                <th style="text-align:center;padding:11px 14px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Batch #</th>
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
              @for (r of filtered(); track r.id) {
                <tr (click)="toggleExpand(r)" style="border-bottom:1px solid #f3f4f6;cursor:pointer;"
                    [style.background]="r.kgWasted > 2 ? '#fff5f5' : 'transparent'">
                  <td style="padding:10px 14px;font-size:13px;color:#6B7280;white-space:nowrap;">{{ r.date | date:'dd MMM yyyy' }}</td>
                  <td style="padding:10px 14px;">
                    <span style="display:inline-flex;align-items:center;gap:6px;">
                      <span class="material-icons-round" style="font-size:16px;color:#9CA3AF;transition:transform 0.15s;"
                            [style.transform]="expanded().has(rowKey(r)) ? 'rotate(180deg)' : 'none'">expand_more</span>
                      <span style="font-family:monospace;font-size:13px;font-weight:700;color:#121212;">{{ r.batchCode }}</span>
                    </span>
                  </td>
                  <td style="padding:10px 14px;font-size:13px;color:#374151;text-align:center;white-space:nowrap;">
                    {{ r.batchNumber ?? '—' }}
                  </td>
                  <td style="padding:10px 14px;font-size:13px;color:#374151;">
                    {{ r.flavorName }}
                    @if (r.offRecipe) {
                      <span style="margin-left:6px;display:inline-flex;align-items:center;gap:3px;background:#fef3c7;color:#b45309;border:1px solid #fde68a;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700;vertical-align:middle;"
                            [title]="'Actual input vs recipe expected'">
                        <span class="material-icons-round" style="font-size:11px;">tune</span>off-recipe {{ r.inputDeviationKg > 0 ? '+' : '' }}{{ r.inputDeviationKg | number:'1.0-2' }} kg
                      </span>
                    }
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
                @if (expanded().has(rowKey(r))) {
                  <tr style="background:#fafafa;border-bottom:1px solid #f3f4f6;">
                    <td colspan="11" style="padding:14px 20px;">
                      @if (r.recipeSnapshot.length > 0 || r.actualIngredients.length > 0) {
                        <div style="display:flex;flex-wrap:wrap;gap:32px;align-items:flex-start;">
                          @if (r.recipeSnapshot.length > 0) {
                          <div style="min-width:240px;">
                            <p style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;margin:0 0 8px;">Recipe used — snapshot at production</p>
                            <table style="border-collapse:collapse;">
                              @for (ing of r.recipeSnapshot; track ing.name) {
                                <tr>
                                  <td style="padding:3px 16px 3px 0;font-size:13px;color:#374151;">{{ ing.name }}</td>
                                  <td style="padding:3px 0;font-size:13px;font-weight:600;color:#121212;text-align:right;">{{ ing.qty | number:'1.0-0' }} g</td>
                                </tr>
                              }
                            </table>
                          </div>
                          }
                          @if (r.actualIngredients.length > 0) {
                            <div style="min-width:280px;">
                              <p style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;margin:0 0 8px;">Ingredients used — planned vs actual</p>
                              <table style="border-collapse:collapse;">
                                <tr>
                                  <td style="padding:2px 16px 2px 0;font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;">Ingredient</td>
                                  <td style="padding:2px 12px 2px 0;font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;text-align:right;">Planned</td>
                                  <td style="padding:2px 0;font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;text-align:right;">Actual</td>
                                </tr>
                                @for (ing of r.actualIngredients; track ing.name) {
                                  <tr [style.background]="ing.actual !== ing.planned ? '#fef3c7' : 'transparent'">
                                    <td style="padding:3px 16px 3px 0;font-size:13px;color:#374151;">{{ ing.name }}</td>
                                    <td style="padding:3px 12px 3px 0;font-size:13px;color:#6B7280;text-align:right;">{{ ing.planned | number:'1.0-0' }} g</td>
                                    <td style="padding:3px 0;font-size:13px;font-weight:600;text-align:right;"
                                        [style.color]="ing.actual !== ing.planned ? '#b45309' : '#121212'">{{ ing.actual | number:'1.0-0' }} g</td>
                                  </tr>
                                }
                              </table>
                            </div>
                          }
                          <div style="min-width:200px;">
                            <p style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;margin:0 0 8px;">Input vs recipe</p>
                            <p style="font-size:13px;color:#374151;margin:0 0 4px;">Recipe expects <strong>{{ r.expectedInputKg | number:'1.0-2' }} kg</strong></p>
                            <p style="font-size:13px;color:#374151;margin:0 0 4px;">Actual input <strong>{{ r.rawMaterialKg | number:'1.0-2' }} kg</strong></p>
                            <p style="font-size:13px;margin:0;font-weight:700;" [style.color]="r.offRecipe ? '#b45309' : '#15803d'">
                              Deviation {{ r.inputDeviationKg > 0 ? '+' : '' }}{{ r.inputDeviationKg | number:'1.0-2' }} kg
                            </p>
                          </div>
                        </div>
                      } @else {
                        <p style="font-size:13px;color:#9CA3AF;margin:0;">No recipe snapshot for this batch — it was produced before this was enabled, or no recipe was linked.</p>
                      }
                    </td>
                  </tr>
                }
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
  expanded = signal<Set<string>>(new Set());

  searchTerm = '';
  dateFrom   = '';
  dateTo     = '';

  readonly totalRawKg    = computed(() => this.rows().reduce((s, r) => s + r.rawMaterialKg, 0));
  readonly totalActualKg = computed(() => this.rows().reduce((s, r) => s + r.actualYieldKg, 0));
  readonly totalWastedKg = computed(() => this.rows().reduce((s, r) => s + r.kgWasted, 0));
  readonly totalUnitsLess = computed(() => this.rows().reduce((s, r) => s + r.unitsLess, 0));

  async ngOnInit(): Promise<void> {
    this.loadExpandedFromStorage();
    await this.loadData();
  }

  private loadExpandedFromStorage(): void {
    if (typeof sessionStorage === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(EXPANDED_STORAGE_KEY);
      if (raw) this.expanded.set(new Set(JSON.parse(raw) as string[]));
    } catch { /* ignore corrupt storage */ }
  }

  private saveExpandedToStorage(s: Set<string>): void {
    if (typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(Array.from(s)));
    } catch { /* ignore quota errors */ }
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

  rowKey(r: WastageRow): string { return r.id; }

  toggleExpand(r: WastageRow): void {
    const key = this.rowKey(r);
    this.expanded.update(s => {
      const next = new Set(s);
      next.has(key) ? next.delete(key) : next.add(key);
      this.saveExpandedToStorage(next);
      return next;
    });
  }

  exportCSV(): void {
    const headers = ['Date', 'Batch Code', 'Batch #', 'Flavor', 'Raw Material (kg)', 'Actual Yield (kg)', 'Kg Wasted', 'Expected Units', 'Units Packed', 'Units Short', 'Boxes Short'];
    const csv = [headers.join(','), ...this.filtered().map(r => [
      r.date, r.batchCode, r.batchNumber ?? '', `"${r.flavorName}"`, r.rawMaterialKg,
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

    const [batchesRes, packingRes, actualsRes] = await Promise.all([
      this.supabase.client
        .from('production_batches')
        .select('id, batch_code, batch_number, flavor_id, production_date, actual_yield, planned_yield, recipe_snapshot, flavor:gg_flavors!production_batches_flavor_id_fkey(name), recipe:gg_recipes(units_per_batch, batch_size_kg)')
        .order('production_date', { ascending: false })
        .limit(500),
      this.supabase.client
        .from('packing_sessions')
        .select('batch_code, flavor_id, boxes_packed'),
      this.supabase.client
        .from('production_batch_ingredients')
        .select('batch_code, flavor_id, batch_number, planned_qty, actual_qty, ingredient:gg_ingredients(name)'),
    ]);

    if (batchesRes.error) {
      console.error('Wastage load error:', batchesRes.error);
      this.loading.set(false);
      return;
    }

    // Total boxes packed per batch + flavor (a batch can have several packing sessions).
    const packedByKey = new Map<string, number>();
    for (const s of (packingRes.data ?? []) as any[]) {
      const key = `${s.batch_code}::${s.flavor_id}`;
      packedByKey.set(key, (packedByKey.get(key) ?? 0) + (s.boxes_packed ?? 0));
    }

    // Per-ingredient planned-vs-actual rows per batch + flavor (Tier 2; empty
    // until the app build that sends them lands and the table exists).
    // Key on (batch_code, flavor_id, batch_number) so each production run has
    // its own set of actuals — different runs of the same code+flavour don't share.
    const actualsByKey = new Map<string, Array<{ name: string; planned: number; actual: number }>>();
    for (const r of (actualsRes.data ?? []) as any[]) {
      const key = `${r.batch_code}::${r.flavor_id}::${r.batch_number ?? ''}`;
      const list = actualsByKey.get(key) ?? [];
      list.push({
        name: (r.ingredient as any)?.name ?? '—',
        planned: Number(r.planned_qty) || 0,
        actual: Number(r.actual_qty) || 0,
      });
      actualsByKey.set(key, list);
    }

    const list: WastageRow[] = (batchesRes.data ?? []).map((p: any) => {
      // planned_yield = raw material in (kg); actual_yield = finished product out (kg).
      const rawMaterialKg = p.planned_yield ?? 0;
      const actualYieldKg = p.actual_yield ?? 0;

      // 1. Wastage = what went in - what came out (kg).
      const kgWasted = Math.max(0, rawMaterialKg - actualYieldKg);

      // Expected units = actual yield scaled by the recipe's units/kg ratio
      // (units_per_batch / batch_size_kg). Falls back to the 1.4 g/piece
      // constant if the recipe isn't linked.
      const recipeUnits   = Number((p.recipe as any)?.units_per_batch) || 0;
      const recipeBatchKg = Number((p.recipe as any)?.batch_size_kg) || 0;
      const pcsPerKg = (recipeUnits > 0 && recipeBatchKg > 0)
        ? recipeUnits / recipeBatchKg
        : 1000 / GRAMS_PER_UNIT;
      const expectedUnits = Math.round(actualYieldKg * pcsPerKg);

      // Units packed = boxes actually packed for this batch x 15 pieces/box.
      const boxesPacked = packedByKey.get(`${p.batch_code}::${p.flavor_id}`) ?? 0;
      const unitsPacked = boxesPacked * UNITS_PER_BOX;

      // 3. Units short = expected units - units packed.
      const unitsLess = Math.max(0, expectedUnits - unitsPacked);

      // 2. Boxes short = units short / 15  (= expected boxes - boxes packed).
      const boxesLess = unitsLess / UNITS_PER_BOX;

      // Recipe snapshot captured when the batch was created. Compare its
      // expected total input against what actually went in (planned_yield)
      // to flag batches made with off-recipe amounts.
      const recipeSnapshot = Array.isArray(p.recipe_snapshot)
        ? p.recipe_snapshot.map((s: any) => ({ name: s.name ?? s.ingredient_id ?? '—', qty: Number(s.qty) || 0 }))
        : [];
      const expectedInputKg = recipeSnapshot.reduce((sum: number, s: any) => sum + s.qty, 0) / 1000;
      const inputDeviationKg = rawMaterialKg - expectedInputKg;
      const offRecipe = recipeSnapshot.length > 0 && Math.abs(inputDeviationKg) > DEVIATION_TOLERANCE_KG;

      return {
        id:             p.id,
        batchCode:      p.batch_code ?? '-',
        batchNumber:    p.batch_number ?? null,
        flavorName:     (p.flavor as any)?.name ?? 'Unknown',
        date:           (p.production_date ?? '').substring(0, 10),
        rawMaterialKg,
        actualYieldKg,
        kgWasted,
        expectedUnits,
        unitsPacked,
        unitsLess,
        boxesLess,
        recipeSnapshot,
        expectedInputKg,
        inputDeviationKg,
        offRecipe,
        actualIngredients: actualsByKey.get(`${p.batch_code}::${p.flavor_id}::${p.batch_number ?? ''}`) ?? [],
      };
    });

    this.rows.set(list);
    this.filtered.set(list);
    this.loading.set(false);
  }
}
