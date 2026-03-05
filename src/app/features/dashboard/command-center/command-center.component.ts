import { Component, computed, inject } from '@angular/core';
import { CommonModule, DecimalPipe, TitleCasePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { OperationsLiveService } from '../../../core/services/operations-live.service';

@Component({
  selector: 'app-command-center',
  standalone: true,
  imports: [CommonModule, DecimalPipe, RouterLink, TitleCasePipe],
  template: `
    <section class="p-4 md:p-6 space-y-6">
      <header class="bg-surface-light dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark p-5 md:p-6">
        <div class="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p class="text-xs uppercase tracking-widest text-text-sub-light dark:text-text-sub-dark font-semibold">Admin View</p>
            <h1 class="text-2xl md:text-3xl font-bold text-text-main-light dark:text-text-main-dark">Command Center Dashboard</h1>
            <p class="mt-1 text-sm text-text-sub-light dark:text-text-sub-dark">
              Live visibility into production-in-hand, wastage, reorder risk, credentials, and access control.
            </p>
          </div>
          <div class="text-sm text-text-sub-light dark:text-text-sub-dark">
            Last event:
            <span class="font-semibold text-text-main-light dark:text-text-main-dark">{{ lastEventTimestamp() }}</span>
          </div>
        </div>
      </header>

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
        <article class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-4">
          <p class="text-xs uppercase tracking-wider text-text-sub-light dark:text-text-sub-dark">Reorder Risk</p>
          <p class="mt-2 text-3xl font-bold text-amber-600 dark:text-amber-400">{{ analytics().lowStockCount }}</p>
          <p class="text-xs text-text-sub-light dark:text-text-sub-dark mt-1">
            {{ analytics().reorderRiskUnits | number:'1.0-0' }} units below threshold
          </p>
        </article>
      </div>

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
                  <div
                    class="h-2 rounded-full bg-primary transition-all duration-300"
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
            <a routerLink="../users" class="px-4 py-2.5 rounded-lg border border-border-light dark:border-border-dark text-sm font-medium text-text-main-light dark:text-text-main-dark text-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Grant Feature Access
            </a>
            <a routerLink="../sessions" class="px-4 py-2.5 rounded-lg border border-border-light dark:border-border-dark text-sm font-medium text-text-main-light dark:text-text-main-dark text-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Monitor Worker Sessions
            </a>
          </div>
        </article>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <article class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden">
          <div class="px-4 py-3 border-b border-border-light dark:border-border-dark">
            <h2 class="text-lg font-semibold text-text-main-light dark:text-text-main-dark">SKU Reorder Monitor</h2>
            <p class="text-sm text-text-sub-light dark:text-text-sub-dark">Low-stock SKUs that should be prioritized for production.</p>
          </div>
          <div class="divide-y divide-border-light dark:divide-border-dark">
            @if (lowStock().length === 0) {
              <div class="px-4 py-8 text-center text-sm text-text-sub-light dark:text-text-sub-dark">All SKUs are above reorder threshold.</div>
            }
            @for (sku of lowStock(); track sku.skuCode) {
              <div class="px-4 py-3 flex items-center justify-between">
                <div>
                  <p class="font-medium text-text-main-light dark:text-text-main-dark">{{ sku.skuName }}</p>
                  <p class="text-xs text-text-sub-light dark:text-text-sub-dark">{{ sku.skuCode }}</p>
                </div>
                <div class="text-right">
                  <p class="font-semibold text-red-600 dark:text-red-400">{{ sku.availableUnits }} / {{ sku.reorderPoint }}</p>
                  <p class="text-xs text-text-sub-light dark:text-text-sub-dark">available / reorder point</p>
                </div>
              </div>
            }
          </div>
        </article>

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

  readonly analytics = this.operations.analytics;
  readonly lowStock = this.operations.lowStockSkus;
  readonly recentEvents = this.operations.recentEvents;

  readonly maxModuleCount = computed(() => {
    const max = Math.max(...this.analytics().moduleThroughput.map((item) => item.count), 1);
    return max <= 0 ? 1 : max;
  });

  readonly lastEventTimestamp = computed(() => {
    const latest = this.recentEvents()[0];
    if (!latest) {
      return 'Waiting for worker activity';
    }
    return new Date(latest.createdAt).toLocaleString();
  });

  moduleBarWidth(value: number): number {
    const max = this.maxModuleCount();
    return Math.max(8, (value / max) * 100);
  }
}
