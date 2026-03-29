import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OperationsLiveService, OperationEvent, WorkerModule } from '../../../core/services/operations-live.service';
import { BatchCodeService } from '../../../core/services/batch-code.service';

interface KanbanColumn {
  module: WorkerModule;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
}

const MODULE_META: Record<WorkerModule, { color: string; bgColor: string; borderColor: string; icon: string }> = {
  inwarding:  { color: '#2563eb', bgColor: '#eff6ff', borderColor: '#bfdbfe', icon: 'input'                    },
  production: { color: '#16a34a', bgColor: '#f0fdf4', borderColor: '#bbf7d0', icon: 'precision_manufacturing'  },
  packing:    { color: '#d97706', bgColor: '#fffbeb', borderColor: '#fde68a', icon: 'inventory_2'              },
  dispatch:   { color: '#7c3aed', bgColor: '#faf5ff', borderColor: '#e9d5ff', icon: 'local_shipping'           },
};

@Component({
  selector: 'app-kanban',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule],
  template: `
    <div style="padding:24px;">

      <!-- ── Header ─────────────────────────────────────────────────────── -->
      <div style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <h1 class="font-display" style="font-size:22px;font-weight:700;color:var(--foreground);margin:0;">Live Kanban</h1>
          <span style="display:flex;align-items:center;gap:5px;padding:4px 10px;background:#dcfce7;border-radius:999px;font-size:12px;font-weight:600;color:#15803d;">
            <span class="live-dot" style="width:6px;height:6px;background:#16a34a;border-radius:50%;display:inline-block;"></span>
            SSE Live
          </span>
          <span style="font-size:13px;color:#6B7280;">{{ totalEvents() }} events · {{ uniqueBatches() }} batches</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:13px;color:#9CA3AF;">Auto-updates via server push</span>
        </div>
      </div>

      <!-- ── Filter bar ──────────────────────────────────────────────────── -->
      <div style="margin-bottom:20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 16px;">
        <!-- Today's batch badge -->
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

        <!-- Show-only-today toggle -->
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:500;color:#374151;cursor:pointer;">
          <input type="checkbox" [(ngModel)]="filterByToday"
                 style="width:15px;height:15px;accent-color:#16a34a;cursor:pointer;">
          Today only
        </label>

        <div style="height:18px;width:1px;background:var(--border);"></div>

        <!-- Batch code search -->
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="material-icons-round" style="font-size:15px;color:#9CA3AF;">search</span>
          <input [(ngModel)]="batchFilter" placeholder="Filter batch code…"
                 style="border:none;outline:none;font-size:13px;color:var(--foreground);background:transparent;width:170px;">
          @if (batchFilter) {
            <button (click)="batchFilter=''" style="border:none;background:none;cursor:pointer;padding:0;color:#9CA3AF;display:flex;">
              <span class="material-icons-round" style="font-size:15px;">close</span>
            </button>
          }
        </div>

        <div style="margin-left:auto;font-size:12px;color:#6B7280;">
          showing {{ visibleCount() }} event{{ visibleCount() === 1 ? '' : 's' }}
        </div>
      </div>

      <!-- ── Kanban grid ─────────────────────────────────────────────────── -->
      <div class="kanban-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;">
        @for (col of columns; track col.module) {
          <div>
            <!-- Column header -->
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

            <!-- Cards area -->
            <div [style.background]="col.bgColor"
                 style="border:1px solid var(--border);border-top:none;border-radius:0 0 10px 10px;padding:10px;min-height:260px;max-height:560px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;">

              @if (getEvents(col.module).length === 0) {
                <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:48px 0;text-align:center;">
                  <div>
                    <span class="material-icons-round" style="font-size:36px;color:#d1d5db;display:block;margin-bottom:10px;">inbox</span>
                    <p style="font-size:13px;color:#9CA3AF;margin:0 0 4px;font-weight:600;">No batches yet</p>
                    <p style="font-size:12px;color:#d1d5db;margin:0;">Events will appear here in real time</p>
                  </div>
                </div>
              }

              @for (ev of getEvents(col.module); track ev.id) {
                <div class="kcard"
                     [style.border-left]="'3px solid ' + col.color"
                     style="background:var(--card);border-radius:10px;border:1px solid var(--border);border-left-width:3px;padding:12px 14px;box-shadow:0 1px 3px rgba(0,0,0,0.04);transition:box-shadow 0.15s ease;">

                  <!-- Row 1: batch code + module pill -->
                  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px;">
                    <div style="display:flex;align-items:center;gap:6px;">
                      <span style="font-family:monospace;font-size:13px;font-weight:700;color:var(--foreground);background:var(--secondary);padding:3px 8px;border-radius:6px;letter-spacing:0.3px;">
                        {{ ev.batchCode }}
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

                  <!-- Row 2: product / flavor name -->
                  <p style="font-size:13px;color:var(--foreground);font-weight:600;margin:0 0 6px;line-height:1.3;word-break:break-word;">
                    {{ getProductName(ev) }}
                  </p>

                  <!-- Row 3: quantity pill -->
                  <div style="margin-bottom:8px;">
                    <span [style.background]="col.color + '12'" [style.color]="col.color"
                          style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;padding:3px 9px;border-radius:6px;">
                      <span class="material-icons-round" style="font-size:13px;">scale</span>
                      {{ getQuantityDisplay(ev) }}
                    </span>
                  </div>

                  <!-- Row 4: worker + timestamp -->
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:8px;border-top:1px solid #f3f4f6;">
                    <div style="display:flex;align-items:center;gap:5px;min-width:0;">
                      <span class="material-icons-round" style="font-size:13px;color:#9CA3AF;flex-shrink:0;">person</span>
                      <span style="font-size:12px;color:#374151;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        {{ ev.workerName }}
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
export class KanbanComponent {
  private readonly ops = inject(OperationsLiveService);
  readonly batchCodeSvc = inject(BatchCodeService);

  filterByToday = false;
  batchFilter = '';

  readonly columns: KanbanColumn[] = [
    { module: 'inwarding',  label: 'Inwarding',  ...MODULE_META['inwarding']  },
    { module: 'production', label: 'Production', ...MODULE_META['production'] },
    { module: 'packing',    label: 'Packing',    ...MODULE_META['packing']    },
    { module: 'dispatch',   label: 'Dispatch',   ...MODULE_META['dispatch']   },
  ];

  readonly totalEvents = computed(() => this.ops.events().length);

  readonly uniqueBatches = computed(() =>
    new Set(this.ops.events().map(e => e.batchCode)).size
  );

  readonly visibleCount = computed(() =>
    this.columns.reduce((sum, col) => sum + this.getEvents(col.module).length, 0)
  );

  getEvents(module: WorkerModule): OperationEvent[] {
    let list = this.ops.events().filter(e => e.module === module);
    const q = this.batchFilter.trim().toLowerCase();
    if (q) {
      list = list.filter(e => e.batchCode.toLowerCase().includes(q));
    } else if (this.filterByToday) {
      const code = this.batchCodeSvc.batchCode();
      if (code) list = list.filter(e => e.batchCode === code);
    }
    return list;
  }

  isTodaysBatch(ev: OperationEvent): boolean {
    const code = this.batchCodeSvc.batchCode();
    return !!code && ev.batchCode === code;
  }

  getProductName(ev: OperationEvent): string {
    switch (ev.module) {
      case 'inwarding':
        return String(ev.payload?.['ingredientName'] ?? ev.summary);
      case 'production': {
        const s = ev.summary ?? '';
        return s.endsWith(' batch processed') ? s.slice(0, -' batch processed'.length) : s;
      }
      case 'packing':
        return String(ev.payload?.['skuName'] ?? ev.summary);
      case 'dispatch':
        return ev.summary || `Batch ${ev.batchCode}`;
    }
  }

  getQuantityDisplay(ev: OperationEvent): string {
    if (ev.module === 'packing') {
      const kg = ev.payload?.['qtyPackedKg'];
      if (kg !== undefined && kg !== null && kg !== '') {
        return `${kg} kg · ${ev.quantity} boxes`;
      }
    }
    if (ev.module === 'production') {
      const size = ev.payload?.['batchSize'];
      if (size !== undefined && size !== null) {
        return `${Number(size).toLocaleString()} units`;
      }
    }
    if (ev.module === 'dispatch') {
      return `${Number(ev.quantity).toLocaleString()} units`;
    }
    return `${ev.quantity} ${ev.unit}`;
  }
}
