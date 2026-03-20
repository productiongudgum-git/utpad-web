import { Component, computed, inject } from '@angular/core';
import { CommonModule, DecimalPipe, TitleCasePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { OperationsLiveService } from '../../../core/services/operations-live.service';
import { BatchCodeService } from '../../../core/services/batch-code.service';
import { IngredientStockService } from '../../../core/services/ingredient-stock.service';

@Component({
  selector: 'app-command-center',
  standalone: true,
  imports: [CommonModule, DecimalPipe, RouterLink, TitleCasePipe],
  template: `
    <section class="p-4 md:p-6 space-y-6">

      <!-- ── Page header ─────────────────────────────────────────────────── -->
      <header class="bg-surface-light dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark p-5 md:p-6">
        <div class="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p class="text-xs uppercase tracking-widest text-text-sub-light dark:text-text-sub-dark font-semibold">Admin View</p>
            <h1 class="text-2xl md:text-3xl font-bold text-text-main-light dark:text-text-main-dark">Command Center Dashboard</h1>
            <p class="mt-1 text-sm text-text-sub-light dark:text-text-sub-dark">
              Live visibility into production-in-hand, wastage, reorder risk, credentials, and access control.
            </p>
          </div>
          <div class="flex flex-col items-end gap-2">
            <!-- Today's Batch Code -->
            <div class="flex items-center gap-3 bg-primary/8 border border-primary/20 rounded-xl px-4 py-3">
              <div class="flex flex-col items-center leading-none">
                <span class="text-xs uppercase tracking-widest text-text-sub-light dark:text-text-sub-dark font-semibold mb-1">Today's Batch Code</span>
                @if (batchCodeSvc.loading()) {
                  <span class="text-lg font-mono font-bold text-text-sub-light animate-pulse">Loading…</span>
                } @else if (batchCodeSvc.error()) {
                  <span class="text-sm font-medium text-red-500">Unavailable</span>
                } @else {
                  <span class="text-2xl font-mono font-bold text-primary tracking-widest">{{ batchCodeSvc.batchCode() }}</span>
                  @if (batchCodeSvc.batchDate()) {
                    <span class="text-xs text-text-sub-light dark:text-text-sub-dark mt-0.5">{{ batchCodeSvc.batchDate() }}</span>
                  }
                }
              </div>
              <button (click)="batchCodeSvc.fetchTodaysBatchCode()" class="text-text-sub-light hover:text-primary transition-colors" title="Refresh batch code">
                <span class="material-icons-round" style="font-size:16px;">refresh</span>
              </button>
            </div>
            <div class="text-sm text-text-sub-light dark:text-text-sub-dark">
              Last event:
              <span class="font-semibold text-text-main-light dark:text-text-main-dark">{{ lastEventTimestamp() }}</span>
            </div>
          </div>
        </div>
      </header>

      <!-- ── Low-stock alert banner (shown when there are alerts) ──────── -->
      @if (stockSvc.lowStockCount() > 0) {
        <div style="display:flex;align-items:center;gap:12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px 18px;">
          <span class="material-icons-round" style="font-size:22px;color:#ea580c;flex-shrink:0;">warning_amber</span>
          <div style="flex:1;">
            <p style="font-size:14px;font-weight:700;color:#9a3412;margin:0 0 2px;">
              {{ stockSvc.lowStockCount() }} ingredient{{ stockSvc.lowStockCount() === 1 ? '' : 's' }} below reorder threshold
            </p>
            <p style="font-size:13px;color:#c2410c;margin:0;">
              {{ alertSummaryLine() }}
            </p>
          </div>
          <a routerLink="../ingredients" [queryParams]="{filter:'low-stock'}"
             style="flex-shrink:0;padding:7px 14px;background:#ea580c;color:#fff;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;display:flex;align-items:center;gap:5px;">
            <span class="material-icons-round" style="font-size:15px;">open_in_new</span>
            View all
          </a>
        </div>
      }

      <!-- ── KPI cards ────────────────────────────────────────────────────── -->
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <article class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-4">
          <p class="text-xs uppercase tracking-wider text-text-sub-light dark:text-text-sub-dark">Production In Hand</p>
          <p class="mt-2 text-3xl font-bold text-text-main-light dark:text-text-main-dark">
            {{ analytics().productionInHandKg | number:'1.0-0' }} <span class="text-base font-medium text-text-sub-light">kg</span>
          </p>
        </article>

        <article class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-4">
          <p class="text-xs uppercase tracking-wider text-text-sub-light dark:text-text-sub-dark">Dispatch Ready</p>
          <p class="mt-2 text-3xl font-bold text-text-main-light dark:text-text-main-dark">
            {{ analytics().dispatchReadyUnits | number:'1.0-0' }} <span class="text-base font-medium text-text-sub-light">units</span>
          </p>
        </article>

        <article class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-4">
          <p class="text-xs uppercase tracking-wider text-text-sub-light dark:text-text-sub-dark">Wastage</p>
          <p class="mt-2 text-3xl font-bold text-red-600 dark:text-red-400">
            {{ analytics().wastageKg | number:'1.0-0' }} <span class="text-base font-medium text-text-sub-light">kg</span>
          </p>
        </article>

        <!-- Reorder Risk — links to Ingredients page filtered to low-stock -->
        <a routerLink="../ingredients" [queryParams]="{filter:'low-stock'}"
           class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-4 block no-underline transition-all hover:shadow-md"
           [class.border-orange-300]="stockSvc.lowStockCount() > 0"
           [class.bg-orange-50]="stockSvc.lowStockCount() > 0"
           style="text-decoration:none;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:4px;">
            <p class="text-xs uppercase tracking-wider text-text-sub-light dark:text-text-sub-dark">Reorder Risk</p>
            @if (stockSvc.lowStockCount() > 0) {
              <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:#ea580c;color:#fff;white-space:nowrap;">
                ACTION NEEDED
              </span>
            }
          </div>
          <p class="mt-2 text-3xl font-bold" [class.text-amber-600]="stockSvc.lowStockCount() === 0" [style.color]="stockSvc.lowStockCount() > 0 ? '#ea580c' : ''">
            {{ stockSvc.lowStockCount() }}
          </p>
          <p class="text-xs mt-1" [style.color]="stockSvc.lowStockCount() > 0 ? '#c2410c' : ''">
            @if (stockSvc.lowStockCount() > 0) {
              ingredient{{ stockSvc.lowStockCount() === 1 ? '' : 's' }} below threshold — <span style="text-decoration:underline;">view →</span>
            } @else {
              all ingredients above threshold
            }
          </p>
        </a>
      </div>

      <!-- ── Workflow Throughput + Quick Actions ─────────────────────────── -->
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <article class="xl:col-span-2 bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-4">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold text-text-main-light dark:text-text-main-dark">Workflow Throughput</h2>
            <span class="text-xs text-text-sub-light dark:text-text-sub-dark">{{ analytics().todaysEvents }} events today</span>
          </div>
          <div class="space-y-3">
            @for (item of analytics().moduleThroughput; track item.module) {
              <div>
                <div class="flex items-center justify-between text-sm mb-1">
                  <span class="font-medium text-text-main-light dark:text-text-main-dark">{{ item.module | titlecase }}</span>
                  <span class="text-text-sub-light dark:text-text-sub-dark">{{ item.count }}</span>
                </div>
                <div class="h-2 rounded-full bg-gray-200 dark:bg-gray-700">
                  <div class="h-2 rounded-full bg-primary transition-all duration-300"
                       [style.width.%]="moduleBarWidth(item.count)">
                  </div>
                </div>
              </div>
            }
          </div>
        </article>

        <article class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-4">
          <h2 class="text-lg font-semibold text-text-main-light dark:text-text-main-dark">Quick Actions</h2>
          <p class="text-sm text-text-sub-light dark:text-text-sub-dark mt-1">Manage worker credentials and access instantly.</p>
          <div class="mt-4 grid grid-cols-1 gap-2">
            <a routerLink="../users" class="px-4 py-2.5 rounded-lg bg-primary text-white font-semibold text-sm text-center hover:bg-primary-hover transition-colors">
              Create Worker Credentials
            </a>
            <a routerLink="../recipes" class="px-4 py-2.5 rounded-lg border border-border-light dark:border-border-dark text-sm font-medium text-text-main-light dark:text-text-main-dark text-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Configure Recipes & Flavors
            </a>
            <a routerLink="../ingredients" [queryParams]="{filter:'low-stock'}"
               class="px-4 py-2.5 rounded-lg border text-sm font-medium text-center transition-colors"
               [class.border-orange-300]="stockSvc.lowStockCount() > 0"
               [class.bg-orange-50]="stockSvc.lowStockCount() > 0"
               [class.text-orange-700]="stockSvc.lowStockCount() > 0"
               [class.border-border-light]="stockSvc.lowStockCount() === 0"
               [class.text-text-main-light]="stockSvc.lowStockCount() === 0">
              @if (stockSvc.lowStockCount() > 0) {
                <span style="display:inline-flex;align-items:center;gap:5px;">
                  <span class="material-icons-round" style="font-size:14px;">warning_amber</span>
                  Reorder Alerts ({{ stockSvc.lowStockCount() }})
                </span>
              } @else {
                Check Ingredient Stock
              }
            </a>
            <a routerLink="../sessions" class="px-4 py-2.5 rounded-lg border border-border-light dark:border-border-dark text-sm font-medium text-text-main-light dark:text-text-main-dark text-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Monitor Worker Sessions
            </a>
          </div>
        </article>
      </div>

      <!-- ── Ingredient Reorder Alerts + Live Worker Feed ──────────────── -->
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">

        <!-- Ingredient Reorder Alerts (real data from Supabase) -->
        <article class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden">
          <div class="px-4 py-3 border-b border-border-light dark:border-border-dark" style="display:flex;align-items:center;justify-content:space-between;">
            <div>
              <h2 class="text-lg font-semibold text-text-main-light dark:text-text-main-dark">Ingredient Reorder Alerts</h2>
              <p class="text-sm text-text-sub-light dark:text-text-sub-dark">Raw ingredients at or below their minimum stock threshold.</p>
            </div>
            @if (stockSvc.lowStockCount() > 0) {
              <a routerLink="../ingredients" [queryParams]="{filter:'low-stock'}"
                 style="font-size:12px;font-weight:600;color:#ea580c;text-decoration:none;white-space:nowrap;">
                View all →
              </a>
            }
          </div>

          @if (stockSvc.loading()) {
            <div style="padding:24px;display:flex;flex-direction:column;gap:10px;">
              @for (i of [1,2,3]; track i) {
                <div class="gg-skeleton" style="height:48px;border-radius:8px;"></div>
              }
            </div>
          } @else if (stockSvc.lowStockIngredients().length === 0) {
            <div class="px-4 py-8 text-center text-sm text-text-sub-light dark:text-text-sub-dark">
              <span class="material-icons-round" style="font-size:32px;display:block;margin-bottom:8px;color:#16a34a;">check_circle</span>
              All ingredients are above their reorder threshold.
            </div>
          } @else {
            <div style="divide-y:1px solid var(--border);max-height:360px;overflow-y:auto;">
              @for (ing of stockSvc.lowStockIngredients(); track ing.id) {
                <div style="padding:12px 16px;border-bottom:1px solid #f3f4f6;"
                     [style.background]="ing.current_stock === 0 ? '#fff5f5' : '#fff7ed'">
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                    <div style="flex:1;min-width:0;">
                      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                        <span class="material-icons-round" style="font-size:15px;"
                              [style.color]="ing.current_stock === 0 ? '#dc2626' : '#ea580c'">
                          {{ ing.current_stock === 0 ? 'dangerous' : 'warning_amber' }}
                        </span>
                        <span style="font-size:13px;font-weight:700;color:var(--foreground);">{{ ing.name }}</span>
                        @if (ing.current_stock === 0) {
                          <span style="font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;background:#dc2626;color:#fff;">OUT</span>
                        }
                      </div>
                      <!-- Stock bar -->
                      <div style="height:4px;border-radius:2px;background:#f3f4f6;overflow:hidden;margin-bottom:3px;">
                        <div style="height:100%;border-radius:2px;transition:width 0.3s;"
                             [style.width]="reorderBarWidth(ing) + '%'"
                             [style.background]="ing.current_stock === 0 ? '#dc2626' : ing.current_stock <= ing.reorder_point * 0.5 ? '#dc2626' : '#ea580c'">
                        </div>
                      </div>
                      <p style="font-size:11px;color:#6B7280;margin:0;">
                        {{ ing.current_stock | number:'1.0-2' }} {{ ing.default_unit }} in stock
                        · threshold: {{ ing.reorder_point | number:'1.0-2' }} {{ ing.default_unit }}
                      </p>
                    </div>
                    <div style="text-align:right;flex-shrink:0;">
                      <p style="font-size:13px;font-weight:700;margin:0 0 2px;"
                         [style.color]="ing.current_stock === 0 ? '#dc2626' : '#ea580c'">
                        −{{ (ing.reorder_point - ing.current_stock) | number:'1.0-2' }} {{ ing.default_unit }}
                      </p>
                      <p style="font-size:11px;color:#9CA3AF;margin:0;">deficit</p>
                    </div>
                  </div>
                </div>
              }
            </div>
          }
        </article>

        <!-- Live Worker Feed -->
        <article class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden">
          <div class="px-4 py-3 border-b border-border-light dark:border-border-dark">
            <h2 class="text-lg font-semibold text-text-main-light dark:text-text-main-dark">Live Worker Feed</h2>
            <p class="text-sm text-text-sub-light dark:text-text-sub-dark">Every inwarding, production, packing, and dispatch entry appears here instantly.</p>
          </div>
          <div class="divide-y divide-border-light dark:divide-border-dark max-h-[420px] overflow-y-auto">
            @if (recentEvents().length === 0) {
              <div class="px-4 py-8 text-center text-sm text-text-sub-light dark:text-text-sub-dark">No worker events yet. Submit any module entry to start the feed.</div>
            }
            @for (event of recentEvents(); track event.id) {
              <div class="px-4 py-3">
                <div class="flex items-center justify-between gap-2">
                  <p class="font-medium text-text-main-light dark:text-text-main-dark">{{ event.summary }}</p>
                  <span class="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">{{ event.module | titlecase }}</span>
                </div>
                <div class="text-xs text-text-sub-light dark:text-text-sub-dark mt-1">
                  {{ event.workerName }} · Batch {{ event.batchCode }} · {{ event.quantity }} {{ event.unit }} · {{ event.createdAt | date:'mediumTime' }}
                </div>
              </div>
            }
          </div>
        </article>
      </div>

    </section>
  `,
})
export class CommandCenterComponent {
  private readonly operations = inject(OperationsLiveService);
  readonly batchCodeSvc = inject(BatchCodeService);
  readonly stockSvc = inject(IngredientStockService);

  readonly analytics = this.operations.analytics;
  readonly recentEvents = this.operations.recentEvents;

  readonly maxModuleCount = computed(() => {
    const max = Math.max(...this.analytics().moduleThroughput.map(item => item.count), 1);
    return max <= 0 ? 1 : max;
  });

  readonly lastEventTimestamp = computed(() => {
    const latest = this.recentEvents()[0];
    return latest ? new Date(latest.createdAt).toLocaleString() : 'Waiting for worker activity';
  });

  readonly alertSummaryLine = computed(() => {
    const items = this.stockSvc.lowStockIngredients();
    if (items.length === 0) return '';
    const names = items.slice(0, 3).map(i => `${i.name} (${i.current_stock} ${i.default_unit})`);
    const rest = items.length > 3 ? ` and ${items.length - 3} more` : '';
    return names.join(', ') + rest;
  });

  moduleBarWidth(value: number): number {
    return Math.max(8, (value / this.maxModuleCount()) * 100);
  }

  reorderBarWidth(ing: { current_stock: number; reorder_point: number }): number {
    if (ing.reorder_point <= 0) return 0;
    return Math.min(100, (ing.current_stock / ing.reorder_point) * 100);
  }
}
