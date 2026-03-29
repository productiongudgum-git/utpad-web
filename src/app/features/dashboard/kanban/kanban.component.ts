import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RealtimeChannel } from '@supabase/supabase-js';
import { BatchCodeService } from '../../../core/services/batch-code.service';
import { WorkerDirectoryService } from '../../../core/services/worker-directory.service';
import { SupabaseService } from '../../../core/supabase.service';
import { SearchableSelectComponent, SearchableSelectOption } from '../../../shared/components/searchable-select.component';

type WorkerModule = 'inwarding' | 'production' | 'packing' | 'dispatch';

interface KanbanColumn {
  module: WorkerModule;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
}

interface KanbanItem {
  id: string;
  module: WorkerModule;
  batchCode: string;
  referenceLabel: string;
  workerId: string | null;
  createdAt: string;
  eventDate: string;
  title: string;
  subtitle: string;
  quantityDisplay: string;
}

const MODULE_META: Record<WorkerModule, { color: string; bgColor: string; borderColor: string; icon: string }> = {
  inwarding: { color: '#2563eb', bgColor: '#eff6ff', borderColor: '#bfdbfe', icon: 'input' },
  production: { color: '#16a34a', bgColor: '#f0fdf4', borderColor: '#bbf7d0', icon: 'precision_manufacturing' },
  packing: { color: '#d97706', bgColor: '#fffbeb', borderColor: '#fde68a', icon: 'inventory_2' },
  dispatch: { color: '#7c3aed', bgColor: '#faf5ff', borderColor: '#e9d5ff', icon: 'local_shipping' },
};

const ALL_BATCHES_OPTION = '__all_batches__';

@Component({
  selector: 'app-kanban',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, SearchableSelectComponent],
  template: `
    <div style="padding:24px;">
      <div style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <h1 class="font-display" style="font-size:22px;font-weight:700;color:var(--foreground);margin:0;">Live Kanban</h1>
          <span style="display:flex;align-items:center;gap:5px;padding:4px 10px;background:#dcfce7;border-radius:999px;font-size:12px;font-weight:600;color:#15803d;">
            <span class="live-dot" style="width:6px;height:6px;background:#16a34a;border-radius:50%;display:inline-block;"></span>
            Supabase Realtime
          </span>
          <span style="font-size:13px;color:#6B7280;">{{ totalEvents() }} records · {{ uniqueBatches() }} batches</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:13px;color:#9CA3AF;">Android and web submissions stay in sync here</span>
        </div>
      </div>

      <div style="margin-bottom:20px;display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 16px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">Today's Batch</span>
          @if (batchCodeSvc.loading()) {
            <span style="font-size:13px;color:#9CA3AF;font-style:italic;">Loading…</span>
          } @else if (batchCodeSvc.batchCode()) {
            <span style="font-family:monospace;font-size:15px;font-weight:700;color:#16a34a;background:#dcfce7;padding:3px 10px;border-radius:6px;letter-spacing:1px;">
              {{ batchCodeSvc.batchCode() }}
            </span>
          } @else {
            <span style="font-size:13px;color:#9CA3AF;">—</span>
          }
        </div>

        <div style="height:18px;width:1px;background:var(--border);"></div>

        <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:500;color:#374151;cursor:pointer;">
          <input
            type="checkbox"
            [ngModel]="filterByToday()"
            (ngModelChange)="filterByToday.set($event)"
            style="width:15px;height:15px;accent-color:#16a34a;cursor:pointer;">
          Today only
        </label>

        <div style="min-width:220px;flex:1 1 260px;">
          <div style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Search</div>
          <div style="display:flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:10px;padding:8px 10px;background:var(--background);">
            <span class="material-icons-round" style="font-size:15px;color:#9CA3AF;">search</span>
            <input
              [ngModel]="searchTerm()"
              (ngModelChange)="searchTerm.set($event)"
              placeholder="Search batch, flavor, ingredient, invoice, worker..."
              style="border:none;outline:none;font-size:13px;color:var(--foreground);background:transparent;width:100%;">
            @if (searchTerm()) {
              <button (click)="searchTerm.set('')" style="border:none;background:none;cursor:pointer;padding:0;color:#9CA3AF;display:flex;">
                <span class="material-icons-round" style="font-size:15px;">close</span>
              </button>
            }
          </div>
        </div>

        <div style="min-width:220px;flex:1 1 240px;">
          <div style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Batch Filter</div>
          <app-searchable-select
            [options]="batchOptions()"
            [value]="selectedBatchFilter()"
            placeholder="All batches"
            searchPlaceholder="Search batch codes..."
            emptyText="No batch codes found."
            [allowCreate]="false"
            (valueChange)="selectedBatchFilter.set($event)">
          </app-searchable-select>
        </div>

        <div style="margin-left:auto;font-size:12px;color:#6B7280;padding-top:23px;">
          showing {{ visibleCount() }} record{{ visibleCount() === 1 ? '' : 's' }}
        </div>
      </div>

      @if (loading()) {
        <div style="display:grid;gap:8px;">
          @for (i of [1,2,3,4]; track i) {
            <div class="skeleton" style="height:72px;border-radius:12px;"></div>
          }
        </div>
      } @else {
        <div class="kanban-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;">
          @for (col of columns; track col.module) {
            <div>
              <div [style.border-top]="'3px solid ' + col.color"
                   style="background:var(--card);border-radius:10px 10px 0 0;border:1px solid var(--border);border-top-width:3px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span class="material-icons-round" [style.color]="col.color" style="font-size:18px;">{{ col.icon }}</span>
                  <span style="font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.5px;">{{ col.label }}</span>
                </div>
                <span [style.background]="col.color + '22'" [style.color]="col.color"
                      style="padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700;min-width:24px;text-align:center;">
                  {{ getEvents(col.module).length }}
                </span>
              </div>

              <div [style.background]="col.bgColor"
                   style="border:1px solid var(--border);border-top:none;border-radius:0 0 10px 10px;padding:10px;min-height:260px;max-height:560px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;">

                @if (getEvents(col.module).length === 0) {
                  <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:48px 0;text-align:center;">
                    <div>
                      <span class="material-icons-round" style="font-size:36px;color:#d1d5db;display:block;margin-bottom:10px;">inbox</span>
                      <p style="font-size:13px;color:#9CA3AF;margin:0 0 4px;font-weight:600;">No records match the filter</p>
                      <p style="font-size:12px;color:#d1d5db;margin:0;">This column updates directly from Supabase tables</p>
                    </div>
                  </div>
                }

                @for (ev of getEvents(col.module); track ev.id) {
                  <div class="kcard"
                       [style.border-left]="'3px solid ' + col.color"
                       style="background:var(--card);border-radius:10px;border:1px solid var(--border);border-left-width:3px;padding:12px 14px;box-shadow:0 1px 3px rgba(0,0,0,0.04);transition:box-shadow 0.15s ease;">

                    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px;">
                      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                        <span style="font-family:monospace;font-size:13px;font-weight:700;color:var(--foreground);background:var(--secondary);padding:3px 8px;border-radius:6px;letter-spacing:0.3px;">
                          {{ ev.referenceLabel }}
                        </span>
                        @if (isTodaysBatch(ev)) {
                          <span style="font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;background:#dcfce7;color:#15803d;text-transform:uppercase;letter-spacing:0.3px;">
                            TODAY
                          </span>
                        }
                      </div>
                      <span [style.background]="col.color + '18'" [style.color]="col.color"
                            style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px;white-space:nowrap;text-transform:uppercase;letter-spacing:0.4px;flex-shrink:0;">
                        {{ col.label }}
                      </span>
                    </div>

                    <p style="font-size:13px;color:var(--foreground);font-weight:600;margin:0 0 6px;line-height:1.3;word-break:break-word;">
                      {{ ev.title }}
                    </p>

                    @if (ev.subtitle) {
                      <p style="font-size:12px;color:#6B7280;margin:0 0 8px;line-height:1.35;word-break:break-word;">
                        {{ ev.subtitle }}
                      </p>
                    }

                    <div style="margin-bottom:8px;">
                      <span [style.background]="col.color + '12'" [style.color]="col.color"
                            style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;padding:3px 9px;border-radius:6px;">
                        <span class="material-icons-round" style="font-size:13px;">scale</span>
                        {{ ev.quantityDisplay }}
                      </span>
                    </div>

                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:8px;border-top:1px solid #f3f4f6;">
                      <div style="display:flex;align-items:center;gap:5px;min-width:0;">
                        <span class="material-icons-round" style="font-size:13px;color:#9CA3AF;flex-shrink:0;">person</span>
                        <span style="font-size:12px;color:#374151;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                          {{ getWorkerLabel(ev.workerId) }}
                        </span>
                      </div>
                      <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
                        <span class="material-icons-round" style="font-size:12px;color:#9CA3AF;">schedule</span>
                        <span style="font-size:11px;color:#9CA3AF;white-space:nowrap;">
                          {{ ev.createdAt | date:'d MMM, h:mm a' }}
                        </span>
                      </div>
                    </div>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>

    <style>
      .live-dot { animation: blink 1.5s infinite; }
      @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
      .kcard:hover { box-shadow: 0 4px 14px rgba(0,0,0,0.09) !important; transform: translateY(-1px); }
      @media (max-width:1100px) { .kanban-grid { grid-template-columns: repeat(2,1fr) !important; } }
      @media (max-width:600px)  { .kanban-grid { grid-template-columns: 1fr !important; } }
    </style>
  `,
})
export class KanbanComponent implements OnInit, OnDestroy {
  private readonly supabase = inject(SupabaseService);
  private readonly workerDirectory = inject(WorkerDirectoryService);
  readonly batchCodeSvc = inject(BatchCodeService);
  readonly workerMap = this.workerDirectory.workers;

  private channel: RealtimeChannel | null = null;

  readonly loading = signal(false);
  readonly items = signal<KanbanItem[]>([]);
  readonly searchTerm = signal('');
  readonly filterByToday = signal(false);
  readonly selectedBatchFilter = signal(ALL_BATCHES_OPTION);

  readonly columns: KanbanColumn[] = [
    { module: 'inwarding', label: 'Inwarding', ...MODULE_META.inwarding },
    { module: 'production', label: 'Production', ...MODULE_META.production },
    { module: 'packing', label: 'Packing', ...MODULE_META.packing },
    { module: 'dispatch', label: 'Dispatch', ...MODULE_META.dispatch },
  ];

  readonly totalEvents = computed(() => this.items().length);
  readonly uniqueBatches = computed(() => new Set(this.items().map((item) => item.batchCode).filter(Boolean)).size);

  readonly batchOptions = computed<SearchableSelectOption[]>(() => {
    const counts = new Map<string, number>();
    this.items().forEach((item) => {
      if (!item.batchCode) return;
      counts.set(item.batchCode, (counts.get(item.batchCode) ?? 0) + 1);
    });

    const dynamicOptions = Array.from(counts.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([batchCode, count]) => ({
        id: batchCode,
        label: batchCode,
        sublabel: `${count} record${count === 1 ? '' : 's'}`,
      }));

    return [
      { id: ALL_BATCHES_OPTION, label: 'All batches', sublabel: `${this.uniqueBatches()} unique batch${this.uniqueBatches() === 1 ? '' : 'es'}` },
      ...dynamicOptions,
    ];
  });

  readonly filteredItems = computed(() => {
    const query = this.searchTerm().trim().toLowerCase();
    const selectedBatch = this.selectedBatchFilter();
    const todayBatch = this.filterByToday() ? this.batchCodeSvc.batchCode() : '';

    return this.items().filter((item) => {
      if (selectedBatch !== ALL_BATCHES_OPTION && item.batchCode !== selectedBatch) {
        return false;
      }

      if (todayBatch && item.batchCode !== todayBatch) {
        return false;
      }

      if (!query) {
        return true;
      }

      const workerLabel = this.getWorkerLabel(item.workerId).toLowerCase();
      const haystack = [
        item.batchCode,
        item.referenceLabel,
        item.title,
        item.subtitle,
        item.quantityDisplay,
        item.eventDate,
        workerLabel,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  });

  readonly visibleCount = computed(() => this.filteredItems().length);

  ngOnInit(): void {
    void this.workerDirectory.refresh();
    void this.load();
    this.subscribeRealtime();
  }

  ngOnDestroy(): void {
    if (this.channel) {
      void this.supabase.client.removeChannel(this.channel);
      this.channel = null;
    }
  }

  getEvents(module: WorkerModule): KanbanItem[] {
    return this.filteredItems().filter((item) => item.module === module);
  }

  isTodaysBatch(item: KanbanItem): boolean {
    const code = this.batchCodeSvc.batchCode();
    return !!code && !!item.batchCode && item.batchCode === code;
  }

  getWorkerLabel(workerId: string | null | undefined): string {
    if (!workerId) return '—';
    return this.workerMap()[workerId]?.name ?? workerId;
  }

  private async load(): Promise<void> {
    this.loading.set(true);

    await this.workerDirectory.refresh();

    const [inwardingResult, productionResult, packingResult, dispatchResult] = await Promise.all([
      this.supabase.client
        .from('gg_inwarding')
        .select('id, ingredient_id, vendor_id, qty, unit, inward_date, expiry_date, lot_ref, worker_id, created_at, ingredient:gg_ingredients(id,name,default_unit), vendor:gg_vendors(name)')
        .order('inward_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(150),
      this.supabase.client
        .from('production_batches')
        .select('id, batch_code, sku_id, recipe_id, production_date, worker_id, flavor_id, status, planned_yield, actual_yield, created_at, flavor:gg_flavors!production_batches_flavor_id_fkey(id,name,code), recipe:gg_recipes(id,title,code)')
        .order('production_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(150),
      this.supabase.client
        .from('packing_sessions')
        .select('id, batch_code, flavor_id, session_date, worker_id, boxes_packed, created_at, flavor:gg_flavors!packing_sessions_flavor_id_fkey(id,name,code)')
        .order('session_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(150),
      this.supabase.client
        .from('dispatch_events')
        .select('id, batch_code, sku_id, boxes_dispatched, customer_name, invoice_number, dispatch_date, worker_id, created_at, sku:gg_flavors(id,name,code)')
        .order('dispatch_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(150),
    ]);

    const inwardingItems = (inwardingResult.data ?? []).map((row) => this.mapInwarding(row));
    const productionItems = (productionResult.data ?? []).map((row) => this.mapProduction(row));
    const packingItems = (packingResult.data ?? []).map((row) => this.mapPacking(row));
    const dispatchItems = (dispatchResult.data ?? []).map((row) => this.mapDispatch(row));

    this.items.set(
      [...inwardingItems, ...productionItems, ...packingItems, ...dispatchItems]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    );

    this.loading.set(false);
  }

  private subscribeRealtime(): void {
    this.channel = this.supabase.client
      .channel('kanban-direct-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gg_inwarding' }, () => void this.load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_batches' }, () => void this.load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'packing_sessions' }, () => void this.load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_events' }, () => void this.load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gg_users' }, () => void this.workerDirectory.refresh(true))
      .subscribe();
  }

  private mapInwarding(row: any): KanbanItem {
    const ingredient = this.firstRelation<any>(row.ingredient);
    const vendor = this.firstRelation<any>(row.vendor);
    const referenceLabel = row.lot_ref?.trim() || 'INWARD';
    const vendorName = vendor?.name ?? 'Unknown supplier';
    const subtitleParts = [
      vendorName,
      row.expiry_date ? `Expiry ${row.expiry_date}` : '',
      row.unit ? `Unit ${row.unit}` : '',
    ].filter(Boolean);

    return {
      id: `inwarding-${row.id}`,
      module: 'inwarding',
      batchCode: '',
      referenceLabel,
      workerId: row.worker_id ?? null,
      createdAt: row.created_at,
      eventDate: row.inward_date,
      title: ingredient?.name ?? row.ingredient_id,
      subtitle: subtitleParts.join(' · '),
      quantityDisplay: `${Number(row.qty ?? 0).toLocaleString()} ${row.unit}`,
    };
  }

  private mapProduction(row: any): KanbanItem {
    const flavor = this.firstRelation<any>(row.flavor);
    const sku = this.firstRelation<any>(row.sku);
    const recipe = this.firstRelation<any>(row.recipe);
    const recipeLabel = recipe?.title ?? recipe?.code ?? row.recipe_id ?? 'No recipe linked';
    const yieldParts = [
      row.planned_yield != null ? `Planned ${row.planned_yield} kg` : '',
      row.actual_yield != null ? `Actual ${row.actual_yield} kg` : '',
      row.status ? `Status ${row.status}` : '',
    ].filter(Boolean);

    return {
      id: `production-${row.id ?? row.batch_code}`,
      module: 'production',
      batchCode: row.batch_code,
      referenceLabel: row.batch_code,
      workerId: row.worker_id ?? null,
      createdAt: row.created_at,
      eventDate: row.production_date,
      title: flavor?.name ?? sku?.name ?? row.flavor_id ?? row.sku_id,
      subtitle: [recipeLabel, ...yieldParts].filter(Boolean).join(' · '),
      quantityDisplay: row.actual_yield != null
        ? `${Number(row.actual_yield).toLocaleString()} kg output`
        : `${Number(row.planned_yield ?? 0).toLocaleString()} kg planned`,
    };
  }

  private mapPacking(row: any): KanbanItem {
    const flavor = this.firstRelation<any>(row.flavor);
    return {
      id: `packing-${row.id}`,
      module: 'packing',
      batchCode: row.batch_code,
      referenceLabel: row.batch_code,
      workerId: row.worker_id ?? null,
      createdAt: row.created_at,
      eventDate: row.session_date,
      title: flavor?.name ?? row.flavor_id ?? row.batch_code,
      subtitle: `Packed on ${row.session_date}`,
      quantityDisplay: `${Number(row.boxes_packed ?? 0).toLocaleString()} boxes`,
    };
  }

  private mapDispatch(row: any): KanbanItem {
    const sku = this.firstRelation<any>(row.sku);
    const title = row.customer_name?.trim() || sku?.name || row.sku_id;
    const subtitleParts = [
      row.invoice_number ? `Invoice ${row.invoice_number}` : '',
      sku?.name ? `SKU ${sku.name}` : '',
      row.dispatch_date ? `Dispatch ${row.dispatch_date}` : '',
    ].filter(Boolean);

    return {
      id: `dispatch-${row.id}`,
      module: 'dispatch',
      batchCode: row.batch_code,
      referenceLabel: row.batch_code,
      workerId: row.worker_id ?? null,
      createdAt: row.created_at,
      eventDate: row.dispatch_date,
      title,
      subtitle: subtitleParts.join(' · '),
      quantityDisplay: `${Number(row.boxes_dispatched ?? 0).toLocaleString()} boxes`,
    };
  }

  private firstRelation<T>(value: T | T[] | null | undefined): T | undefined {
    if (Array.isArray(value)) {
      return value[0];
    }
    return value ?? undefined;
  }
}
