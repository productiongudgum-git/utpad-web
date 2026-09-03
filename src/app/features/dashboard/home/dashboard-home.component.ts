import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../../core/supabase.service';
import { IngredientStockService } from '../../../core/services/ingredient-stock.service';
import { KanbanComponent } from '../kanban/kanban.component';

interface KpiData {
  activeBatches: number;
  yesterdayBatches: number;
  totalYieldKgToday: number;
  yesterdayYieldKg: number;
  packedBoxesToday: number;
  lowStockCount: number;
}

interface PackingWarning {
  batchCode: string;
  flavorName: string;
  expectedBoxes: number;
  packedBoxes: number;
  boxesShort: number;
  kgsPending: number;
}

interface BatchDetail {
  /** production_batches.id — the only unique key here. batch_code is per calendar
   *  day and is shared by every batch made that day, so it can't track rows. */
  id: string;
  batch_code: string;
  batch_number: number | null;
  flavor_name: string;
  production_date: string;
  total_packed: number;
  packing_status: 'complete' | 'partial' | 'none';
}

@Component({
  selector: 'app-dashboard-home',
  standalone: true,
  imports: [CommonModule, DecimalPipe, FormsModule, KanbanComponent],
  template: `
    <div style="padding:28px 24px;max-width:1200px;">

      <!-- Header -->
      <div style="margin-bottom:28px;">
        <h1 class="font-display" style="font-size:26px;font-weight:700;color:var(--foreground);margin:0 0 4px;">Command Center</h1>
        <p class="text-muted" style="font-size:14px;margin:0;">Overview of your production and supply chain operations.</p>
      </div>

      <!-- KPI Cards -->
      @if (loading()) {
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:28px;">
          @for (i of [1,2,3,4]; track i) {
            <div class="skeleton" style="height:120px;border-radius:12px;"></div>
          }
        </div>
      } @else {
        <div class="kpi-grid" style="display:grid;gap:16px;margin-bottom:28px;">

          <!-- Active Batches (today's production) -->
          <div class="beautiful-card kpi-clickable" style="padding:20px;position:relative;overflow:hidden;cursor:pointer;"
               (click)="toggleActiveBatchesPanel()">
            <div style="position:absolute;top:16px;right:16px;width:44px;height:44px;background:#dbeafe;border-radius:12px;display:flex;align-items:center;justify-content:center;">
              <span class="material-icons-round" style="color:#2563eb;font-size:22px;">precision_manufacturing</span>
            </div>
            <p style="font-size:12px;color:var(--muted-fg);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Active Batches</p>
            <p class="font-display" style="font-size:36px;font-weight:700;color:var(--foreground);margin:0 0 4px;">{{ kpi().activeBatches }}</p>
            <p style="font-size:12px;margin:0 0 4px;display:flex;align-items:center;gap:4px;"
               [style.color]="batchDelta() >= 0 ? '#2563eb' : '#dc2626'">
              <span class="material-icons-round" style="font-size:14px;">{{ batchDelta() >= 0 ? 'trending_up' : 'trending_down' }}</span>
              <span style="font-weight:600;">{{ batchDelta() >= 0 ? '+' : '' }}{{ batchDelta() }} vs yesterday</span>
            </p>
            <p style="font-size:11px;color:var(--muted-fg);margin:0;display:flex;align-items:center;gap:4px;">
              <span class="material-icons-round" style="font-size:12px;">{{ expandActiveBatches() ? 'expand_less' : 'expand_more' }}</span>
              {{ expandActiveBatches() ? 'Collapse' : 'Click to view details' }}
            </p>
          </div>

          <!-- Total Production (kg today) -->
          <div class="beautiful-card" style="padding:20px;position:relative;overflow:hidden;">
            <div style="position:absolute;top:16px;right:16px;width:44px;height:44px;background:#dcfce7;border-radius:12px;display:flex;align-items:center;justify-content:center;">
              <span class="material-icons-round" style="color:var(--primary);font-size:22px;">inventory_2</span>
            </div>
            <p style="font-size:12px;color:var(--muted-fg);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Total Production</p>
            <p class="font-display" style="font-size:36px;font-weight:700;color:var(--foreground);margin:0 0 4px;">{{ kpi().totalYieldKgToday | number:'1.0-0' }}<span style="font-size:16px;font-weight:500;color:var(--muted-fg);"> kg</span></p>
            <p style="font-size:12px;margin:0 0 4px;display:flex;align-items:center;gap:4px;"
               [style.color]="yieldDelta() >= 0 ? 'var(--primary)' : '#dc2626'">
              <span class="material-icons-round" style="font-size:14px;">{{ yieldDelta() >= 0 ? 'trending_up' : 'trending_down' }}</span>
              <span style="font-weight:600;">{{ yieldDelta() >= 0 ? '+' : '' }}{{ yieldDelta() | number:'1.0-0' }} kg vs yesterday</span>
            </p>
            <p style="font-size:11px;color:var(--muted-fg);margin:0;display:flex;align-items:center;gap:4px;">
              <span class="material-icons-round" style="font-size:12px;">today</span>
              Today only
            </p>
          </div>

          <!-- Packed Today -->
          <div class="beautiful-card" style="padding:20px;position:relative;overflow:hidden;">
            <div style="position:absolute;top:16px;right:16px;width:44px;height:44px;background:#fef3c7;border-radius:12px;display:flex;align-items:center;justify-content:center;">
              <span class="material-icons-round" style="color:#d97706;font-size:22px;">check_box</span>
            </div>
            <p style="font-size:12px;color:var(--muted-fg);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Packed Today</p>
            <p class="font-display" style="font-size:36px;font-weight:700;color:var(--foreground);margin:0 0 6px;">{{ kpi().packedBoxesToday | number:'1.0-0' }}<span style="font-size:16px;font-weight:500;color:var(--muted-fg);"> boxes</span></p>
            <p style="font-size:12px;color:#d97706;margin:0;display:flex;align-items:center;gap:4px;">
              <span class="material-icons-round" style="font-size:14px;">today</span>
              Packing sessions today
            </p>
          </div>

          <!-- Low Stock Alerts -->
          <div class="beautiful-card kpi-clickable" style="padding:20px;position:relative;overflow:hidden;cursor:pointer;"
               (click)="goToLowStock()">
            <div style="position:absolute;top:16px;right:16px;width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;"
                 [style.background]="stockSvc.lowStockCount() > 0 ? '#fee2e2' : '#dcfce7'">
              <span class="material-icons-round" style="font-size:22px;"
                    [style.color]="stockSvc.lowStockCount() > 0 ? 'var(--destructive)' : 'var(--primary)'">
                {{ stockSvc.lowStockCount() > 0 ? 'warning' : 'check_circle' }}
              </span>
            </div>
            <p style="font-size:12px;color:var(--muted-fg);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Low Stock Alerts</p>
            <p class="font-display" style="font-size:36px;font-weight:700;color:var(--foreground);margin:0 0 6px;">{{ stockSvc.lowStockCount() }}</p>
            <p style="font-size:12px;margin:0;display:flex;align-items:center;gap:4px;"
               [style.color]="stockSvc.lowStockCount() > 0 ? 'var(--destructive)' : 'var(--primary)'">
              <span class="material-icons-round" style="font-size:14px;">
                {{ stockSvc.lowStockCount() > 0 ? 'open_in_new' : 'check' }}
              </span>
              {{ stockSvc.lowStockCount() > 0 ? 'Click to view' : 'All stocked' }}
            </p>
          </div>
        </div>
      }

      <!-- ── Active Batches Expanded Panel ── -->
      @if (!loading() && expandActiveBatches()) {
        <div style="background:#fff;border-radius:14px;border:1px solid #E5E7EB;margin-bottom:20px;overflow:hidden;">

          <!-- Panel header + date filters -->
          <div style="padding:16px 20px;border-bottom:1px solid #E5E7EB;background:#f8f9fa;display:flex;align-items:center;flex-wrap:wrap;gap:12px;">
            <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:200px;">
              <span class="material-icons-round" style="color:#2563eb;font-size:20px;">precision_manufacturing</span>
              <h3 style="font-size:15px;font-weight:700;color:#121212;margin:0;">Production Batches</h3>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <div style="display:flex;align-items:center;gap:6px;">
                <label style="font-size:12px;font-weight:600;color:#374151;white-space:nowrap;">From</label>
                <input type="date" [(ngModel)]="batchFilterFrom" (ngModelChange)="loadBatchDetails()"
                       style="padding:5px 10px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px;color:#374151;background:#fff;">
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                <label style="font-size:12px;font-weight:600;color:#374151;white-space:nowrap;">To</label>
                <input type="date" [(ngModel)]="batchFilterTo" (ngModelChange)="loadBatchDetails()"
                       style="padding:5px 10px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px;color:#374151;background:#fff;">
              </div>
              <span style="font-size:12px;color:#6B7280;background:#e5e7eb;padding:3px 10px;border-radius:10px;white-space:nowrap;">
                {{ filteredBatches().length }} batch{{ filteredBatches().length !== 1 ? 'es' : '' }}
              </span>
              <button (click)="downloadBatchReport()"
                      [disabled]="downloadingReport() || filteredBatches().length === 0"
                      [title]="filteredBatches().length === 0 ? 'No batches to download' : 'Download this date range as an Excel report'"
                      style="display:flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px;font-weight:600;background:#fff;color:#374151;white-space:nowrap;"
                      [style.cursor]="downloadingReport() || filteredBatches().length === 0 ? 'not-allowed' : 'pointer'"
                      [style.opacity]="downloadingReport() || filteredBatches().length === 0 ? '0.55' : '1'">
                <span class="material-icons-round" style="font-size:16px;"
                      [style.animation]="downloadingReport() ? 'spin 1s linear infinite' : 'none'">
                  {{ downloadingReport() ? 'refresh' : 'download' }}
                </span>
                {{ downloadingReport() ? 'Preparing…' : 'Download' }}
              </button>
            </div>
          </div>

          @if (batchDetailsLoading()) {
            <div style="padding:32px;text-align:center;color:#9CA3AF;">
              <span class="material-icons-round" style="font-size:32px;display:block;margin-bottom:8px;animation:spin 1s linear infinite;">refresh</span>
              Loading…
            </div>
          } @else if (filteredBatches().length === 0) {
            <div style="padding:40px;text-align:center;color:#9CA3AF;">
              <span class="material-icons-round" style="font-size:40px;display:block;margin-bottom:10px;">hourglass_empty</span>
              <p style="font-size:14px;margin:0;">No batches in this date range.</p>
            </div>
          } @else {
            <div style="overflow-x:auto;">
              <table style="width:100%;border-collapse:collapse;">
                <thead>
                  <tr style="border-bottom:1px solid #E5E7EB;">
                    <th style="text-align:left;padding:10px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Batch Code</th>
                    <th style="text-align:left;padding:10px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Batch #</th>
                    <th style="text-align:left;padding:10px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Flavour</th>
                    <th style="text-align:left;padding:10px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Packed Boxes</th>
                    <th style="text-align:left;padding:10px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Production Date</th>
                  </tr>
                </thead>
                <tbody>
                  @for (b of filteredBatches(); track b.id) {
                    <tr [style.background]="isRowRed(b) ? '#fee2e2' : ''" style="border-bottom:1px solid #f3f4f6;">
                      <td style="padding:12px 16px;font-family:monospace;font-size:13px;font-weight:700;color:#121212;">{{ b.batch_code }}</td>
                      <td style="padding:12px 16px;font-size:13px;color:#374151;">{{ b.batch_number ?? '—' }}</td>
                      <td style="padding:12px 16px;font-size:13px;color:#374151;">{{ b.flavor_name }}</td>
                      <td style="padding:12px 16px;font-size:13px;">
                        <div style="display:flex;align-items:center;gap:8px;">
                          <span style="font-weight:600;color:#121212;">{{ b.total_packed }}</span>
                          @if (b.packing_status === 'complete') {
                            <span style="font-size:11px;font-weight:600;background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:10px;white-space:nowrap;">Packing Complete</span>
                          } @else if (b.packing_status === 'partial') {
                            <span style="font-size:11px;font-weight:600;background:#ffedd5;color:#c2410c;padding:2px 8px;border-radius:10px;white-space:nowrap;">Partially Packed</span>
                          } @else {
                            <span style="font-size:11px;font-weight:600;background:#f3f4f6;color:#6B7280;padding:2px 8px;border-radius:10px;white-space:nowrap;">Not Packed</span>
                          }
                        </div>
                      </td>
                      <td style="padding:12px 16px;font-size:13px;color:#6B7280;">{{ b.production_date }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      }

      <!-- Pending Packing Warning Banner -->
      @if (!loading() && packingWarnings().length > 0) {
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px 20px;margin-bottom:20px;cursor:pointer;"
             (click)="showPackingModal.set(true)">
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="material-icons-round" style="color:#d97706;font-size:20px;">warning</span>
            <h3 style="font-size:14px;font-weight:700;color:#92400e;margin:0;flex:1;">
              Pending Packing — {{ packingWarnings().length }} batch{{ packingWarnings().length > 1 ? 'es' : '' }} not fully packed today
            </h3>
            <span class="material-icons-round" style="color:#d97706;font-size:18px;">chevron_right</span>
          </div>
        </div>
      }

      <!-- Packing Modal -->
      @if (showPackingModal()) {
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;"
             (click)="showPackingModal.set(false)">
          <div style="background:#fff;border-radius:16px;width:100%;max-width:560px;box-shadow:0 20px 60px rgba(0,0,0,0.2);overflow:hidden;"
               (click)="$event.stopPropagation()">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid #E5E7EB;">
              <div style="display:flex;align-items:center;gap:10px;">
                <span class="material-icons-round" style="color:#d97706;font-size:22px;">warning</span>
                <h2 style="font-size:16px;font-weight:700;color:#121212;margin:0;">Pending Packing</h2>
              </div>
              <button (click)="showPackingModal.set(false)"
                      style="border:none;background:none;cursor:pointer;color:#9CA3AF;display:flex;align-items:center;padding:4px;">
                <span class="material-icons-round" style="font-size:20px;">close</span>
              </button>
            </div>
            <div style="overflow-x:auto;">
              <table style="width:100%;border-collapse:collapse;">
                <thead>
                  <tr style="background:#f8f9fa;border-bottom:1px solid #E5E7EB;">
                    <th style="text-align:left;padding:10px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Batch Code</th>
                    <th style="text-align:left;padding:10px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Flavor</th>
                    <th style="text-align:right;padding:10px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Kgs Pending</th>
                  </tr>
                </thead>
                <tbody>
                  @for (w of packingWarnings(); track w.batchCode) {
                    <tr style="border-bottom:1px solid #f3f4f6;">
                      <td style="padding:12px 16px;font-family:monospace;font-size:13px;font-weight:700;color:#121212;">{{ w.batchCode }}</td>
                      <td style="padding:12px 16px;font-size:13px;color:#374151;">{{ w.flavorName }}</td>
                      <td style="padding:12px 16px;text-align:right;">
                        <span style="font-size:13px;font-weight:700;color:#d97706;">{{ w.kgsPending | number:'1.0-0' }} kg</span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      }

    </div>

    <!-- Live Kanban — embedded below the Command Center -->
    <div style="border-top:1px solid var(--border);margin-top:8px;">
      <app-kanban />
    </div>

    <style>
      .kpi-grid {
        grid-template-columns: repeat(4, 1fr);
      }
      @media (max-width: 1024px) {
        .kpi-grid { grid-template-columns: repeat(2, 1fr); }
      }
      @media (max-width: 600px) {
        .kpi-grid { grid-template-columns: 1fr; }
      }
      .kpi-clickable:hover {
        box-shadow: 0 4px 16px rgba(0,0,0,0.10) !important;
        transform: translateY(-1px);
        transition: all 0.15s ease;
      }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    </style>
  `,
})
export class DashboardHomeComponent implements OnInit, OnDestroy {
  private readonly supabase = inject(SupabaseService);
  // Low-stock count comes from the shared service so packing materials
  // (GG/GG+ Ziplock, monocartons) and recipe ingredients all count via the
  // same batches-left rule the Ingredients page uses.
  readonly stockSvc = inject(IngredientStockService);
  private readonly router   = inject(Router);

  loading             = signal(true);
  batchDetailsLoading = signal(false);
  kpi = signal<KpiData>({
    activeBatches: 0, yesterdayBatches: 0,
    totalYieldKgToday: 0, yesterdayYieldKg: 0,
    packedBoxesToday: 0, lowStockCount: 0,
  });
  packingWarnings  = signal<PackingWarning[]>([]);
  showPackingModal = signal(false);

  // Active Batches expanded panel
  expandActiveBatches = signal(false);
  batchDetails        = signal<BatchDetail[]>([]);
  downloadingReport   = signal(false);
  batchFilterFrom     = '';
  batchFilterTo       = '';

  filteredBatches = computed(() => this.batchDetails());

  batchDelta = computed(() => this.kpi().activeBatches - this.kpi().yesterdayBatches);
  yieldDelta = computed(() => this.kpi().totalYieldKgToday - this.kpi().yesterdayYieldKg);

  async ngOnInit(): Promise<void> {
    const today = new Date().toISOString().substring(0, 10);
    this.batchFilterFrom = today;
    this.batchFilterTo   = today;
    await this.loadData();
  }

  ngOnDestroy(): void {}

  goToLowStock(): void {
    this.router.navigate(['/dashboard/ingredients'], { queryParams: { filter: 'low-stock' } });
  }

  toggleActiveBatchesPanel(): void {
    const next = !this.expandActiveBatches();
    this.expandActiveBatches.set(next);
    if (next && this.batchDetails().length === 0) {
      this.loadBatchDetails();
    }
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);
    try {
      const today     = new Date().toISOString().substring(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().substring(0, 10);

      const [todayProdRes, yesterdayProdRes, todayPackRes] = await Promise.all([
        // Today's production batches
        this.supabase.client.from('production_batches')
          .select('batch_code, planned_yield, actual_yield, flavor:gg_flavors!production_batches_flavor_id_fkey(name, units_per_box), recipe:gg_recipes(units_per_batch)')
          .eq('production_date', today),
        // Yesterday's production batches (for comparison)
        this.supabase.client.from('production_batches')
          .select('id, actual_yield')
          .eq('production_date', yesterday),
        // Today's packing sessions
        this.supabase.client.from('packing_sessions')
          .select('batch_code, boxes_packed')
          .eq('session_date', today),
      ]);

      const todayBatches     = todayProdRes.data     ?? [];
      const yesterdayBatches = yesterdayProdRes.data ?? [];

      const totalYieldKgToday = todayBatches.reduce((sum: number, b: any) => sum + (b.actual_yield ?? 0), 0);
      const yesterdayYieldKg  = yesterdayBatches.reduce((sum: number, b: any) => sum + (b.actual_yield ?? 0), 0);
      const packedBoxesToday  = (todayPackRes.data ?? []).reduce((s: number, r: any) => s + (r.boxes_packed ?? 0), 0);

      this.kpi.set({
        activeBatches:     todayBatches.length,
        yesterdayBatches:  yesterdayBatches.length,
        totalYieldKgToday,
        yesterdayYieldKg,
        packedBoxesToday,
        // Service computes from batches-left across raw + packing materials.
        lowStockCount:     this.stockSvc.lowStockCount(),
      });

      // Packing warnings
      const packTodayMap = new Map<string, number>();
      (todayPackRes.data ?? []).forEach((p: any) => {
        const key = p.batch_code ?? '';
        packTodayMap.set(key, (packTodayMap.get(key) ?? 0) + (p.boxes_packed ?? 0));
      });

      const warnings: PackingWarning[] = [];
      for (const prod of todayBatches) {
        const plannedYield: number = (prod as any).planned_yield ?? 0;
        // Recipe-driven expected boxes (units_per_batch / units_per_box).
        // Falls back to 7500 units and 15 per box if no recipe is linked.
        //
        // Production always runs against a base flavour, so this uses that
        // flavour's box count. If the batch is later split across packing
        // variants the figure becomes an estimate — the boxes actually packed
        // depend on which formats the packer chose.
        const unitsPerBatch: number = (prod as any).recipe?.units_per_batch ?? 7500;
        const unitsPerBox: number   = (prod as any).flavor?.units_per_box ?? 15;
        const expectedBoxes = Math.round(unitsPerBatch / Math.max(1, unitsPerBox));
        const batchCode: string = (prod as any).batch_code ?? '';
        const packedBoxes = packTodayMap.get(batchCode) ?? 0;
        const boxesShort = Math.max(0, expectedBoxes - packedBoxes);
        if (boxesShort > 0) {
          const kgsPending = expectedBoxes > 0
            ? Math.round(boxesShort * plannedYield / expectedBoxes)
            : 0;
          warnings.push({
            batchCode,
            flavorName:   (prod as any).flavor?.name ?? 'Unknown',
            expectedBoxes,
            packedBoxes,
            boxesShort,
            kgsPending,
          });
        }
      }
      this.packingWarnings.set(warnings);
    } finally {
      this.loading.set(false);
    }
  }

  async loadBatchDetails(): Promise<void> {
    if (!this.batchFilterFrom || !this.batchFilterTo) return;
    this.batchDetailsLoading.set(true);
    try {
      const { data: batchData, error: batchError } = await this.supabase.client
        .from('production_batches')
        .select('id, batch_code, batch_number, production_date, flavor:gg_flavors!production_batches_flavor_id_fkey(name)')
        .gte('production_date', this.batchFilterFrom)
        .lte('production_date', this.batchFilterTo)
        .order('production_date', { ascending: false })
        .order('batch_code', { ascending: false });

      if (batchError || !batchData) return;

      const batchIds = batchData.map((b: any) => b.id);
      const { data: packData } = batchIds.length > 0
        ? await this.supabase.client
            .from('packing_sessions')
            .select('production_batch_id, boxes_packed, status')
            .in('production_batch_id', batchIds)
        : { data: [] };

      // Aggregate packing data per batch id
      const packMap = new Map<string, { total: number; statuses: string[] }>();
      for (const p of (packData ?? [])) {
        const id = p.production_batch_id;
        const entry = packMap.get(id) ?? { total: 0, statuses: [] };
        entry.total += p.boxes_packed ?? 0;
        entry.statuses.push(p.status ?? '');
        packMap.set(id, entry);
      }

      this.batchDetails.set(batchData.map((b: any) => {
        const pack = packMap.get(b.id);
        let packing_status: 'complete' | 'partial' | 'none' = 'none';
        if (pack) {
          packing_status = pack.statuses.some(s => s === 'complete') ? 'complete' : 'partial';
        }
        return {
          id:              b.id,
          batch_code:      b.batch_code,
          batch_number:    b.batch_number ?? null,
          flavor_name:     b.flavor?.name ?? '—',
          production_date: b.production_date,
          total_packed:    pack?.total ?? 0,
          packing_status,
        };
      }));
    } finally {
      this.batchDetailsLoading.set(false);
    }
  }

  /**
   * Downloads the Active Batches panel as a two-sheet Excel workbook.
   *
   *   Sheet 1 "Production Batches" — one row per batch, mirroring the on-screen table.
   *   Sheet 2 "Flavour Summary"    — batches produced per flavour + a grand total.
   *
   * Built from filteredBatches() rather than a fresh query, so the file always
   * matches exactly what the date pickers are showing.
   *
   * ExcelJS is imported dynamically: its browser bundle is ~950 kB, and a static
   * import would drag that into the dashboard chunk for everyone who never clicks
   * Download. This way it is fetched on first use only.
   */
  async downloadBatchReport(): Promise<void> {
    const rows = this.filteredBatches();
    if (rows.length === 0 || this.downloadingReport()) return;

    this.downloadingReport.set(true);
    try {
      const ExcelJS: any = await import('exceljs');
      const Workbook = ExcelJS.Workbook ?? ExcelJS.default?.Workbook;
      const workbook = new Workbook();

      const from = this.batchFilterFrom;
      const to   = this.batchFilterTo;

      // ── Sheet 1: the batch rows, same columns and order as the table ──
      const batchSheet = workbook.addWorksheet('Production Batches');
      batchSheet.columns = [
        { header: 'Batch Code',      key: 'batch_code',      width: 14 },
        { header: 'Batch #',         key: 'batch_number',    width: 10 },
        { header: 'Flavour',         key: 'flavor_name',     width: 26 },
        { header: 'Packed Boxes',    key: 'total_packed',    width: 14 },
        { header: 'Packing Status',  key: 'packing_status',  width: 18 },
        { header: 'Production Date', key: 'production_date', width: 16 },
      ];
      rows.forEach(b => batchSheet.addRow({
        batch_code:      b.batch_code,
        batch_number:    b.batch_number ?? '—',
        flavor_name:     b.flavor_name,
        total_packed:    b.total_packed,
        packing_status:  this.packingStatusLabel(b.packing_status),
        production_date: b.production_date,
      }));
      this.styleReportHeader(batchSheet);

      // ── Sheet 2: batches produced per flavour ──
      // Counts ROWS, not distinct batch codes: batch_code is generated per
      // calendar day and shared by every batch made that day, so counting codes
      // would report a day of 8 batches as 1.
      const countsByFlavour = new Map<string, number>();
      for (const b of rows) {
        const name = b.flavor_name || '—';
        countsByFlavour.set(name, (countsByFlavour.get(name) ?? 0) + 1);
      }

      const summarySheet = workbook.addWorksheet('Flavour Summary');
      summarySheet.columns = [
        { header: 'Name of the flavour', key: 'flavour', width: 30 },
        { header: 'Batches produced',    key: 'batches', width: 20 },
      ];
      [...countsByFlavour.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([flavour, batches]) => summarySheet.addRow({ flavour, batches }));

      const totalRow = summarySheet.addRow({
        flavour: 'Total batches produced',
        batches: rows.length,
      });
      totalRow.font = { bold: true };
      totalRow.eachCell((cell: any) => {
        cell.border = { top: { style: 'thin', color: { argb: 'FF143D36' } } };
      });
      this.styleReportHeader(summarySheet);

      const buffer = await workbook.xlsx.writeBuffer();
      this.saveWorkbook(buffer, `production-batches-${from}_to_${to}.xlsx`);
    } catch (err) {
      console.error('[dashboard-home] Batch report download failed', err);
      alert('Could not generate the report. Please try again.');
    } finally {
      this.downloadingReport.set(false);
    }
  }

  /** Bold white on brand green, frozen — same look as the courier-analysis workbooks. */
  private styleReportHeader(sheet: any): void {
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF143D36' } };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  }

  private saveWorkbook(buffer: ArrayBuffer, filename: string): void {
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private packingStatusLabel(status: BatchDetail['packing_status']): string {
    if (status === 'complete') return 'Packing Complete';
    if (status === 'partial')  return 'Partially Packed';
    return 'Not Packed';
  }

  isRowRed(b: BatchDetail): boolean {
    if (b.packing_status === 'complete') return false;
    const prodDate = new Date(b.production_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today.getTime() - prodDate.getTime()) / 86400000);
    return diffDays > 3;
  }
}
