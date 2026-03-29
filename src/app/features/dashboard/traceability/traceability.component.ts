import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OperationsLiveService, OperationEvent } from '../../../core/services/operations-live.service';

interface TraceNode {
    event: OperationEvent;
    stage: number;
    stageLabel: string;
    icon: string;
    color: string;
}

@Component({
    selector: 'app-traceability',
    standalone: true,
    imports: [CommonModule, DatePipe, TitleCasePipe, FormsModule],
    template: `
    <section class="p-4 md:p-6 space-y-6">
      <header class="bg-surface-light dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark p-5 md:p-6">
        <div class="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p class="text-xs uppercase tracking-widest text-text-sub-light dark:text-text-sub-dark font-semibold">Supply Chain</p>
            <h1 class="text-2xl md:text-3xl font-bold text-text-main-light dark:text-text-main-dark">Traceability Engine</h1>
            <p class="mt-1 text-sm text-text-sub-light dark:text-text-sub-dark">
              Trace any batch from raw material intake to final dispatch. Enter a Batch ID to see its full journey.
            </p>
          </div>
        </div>
      </header>

      <!-- Search Bar -->
      <div class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-4">
        <div class="flex gap-3">
          <div class="flex-1 relative">
            <span class="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xl">search</span>
            <input
              type="text"
              [(ngModel)]="searchQuery"
              (keyup.enter)="performSearch()"
              placeholder="Enter Batch Code (e.g. BTH-20260222-1234)"
              class="w-full pl-10 pr-4 py-3 rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark text-text-main-light dark:text-text-main-dark text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
          </div>
          <button
            (click)="performSearch()"
            class="px-6 py-3 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-hover transition-colors flex items-center gap-2">
            <span class="material-icons-round text-lg">manage_search</span>
            Trace
          </button>
        </div>

        <!-- Recent Batch Codes Quick Access -->
        @if (uniqueBatchCodes().length > 0 && !hasSearched()) {
          <div class="mt-3 flex flex-wrap gap-2">
            <span class="text-xs text-text-sub-light dark:text-text-sub-dark pt-1">Recent batches:</span>
            @for (code of uniqueBatchCodes().slice(0, 8); track code) {
              <button
                (click)="searchQuery = code; performSearch();"
                class="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-text-sub-light dark:text-text-sub-dark hover:bg-primary/10 hover:text-primary transition-colors">
                {{ code }}
              </button>
            }
          </div>
        }
      </div>

      <!-- Results -->
      @if (hasSearched()) {
        @if (traceResults().length === 0) {
          <div class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-8 text-center">
            <span class="material-icons-round text-5xl text-gray-300 dark:text-gray-600">search_off</span>
            <p class="mt-3 text-text-main-light dark:text-text-main-dark font-medium">No events found for batch "{{ activeSearch() }}"</p>
            <p class="text-sm text-text-sub-light dark:text-text-sub-dark mt-1">Double-check the batch code and try again.</p>
          </div>
        } @else {
          <!-- Trace Timeline -->
          <div class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden">
            <div class="px-4 py-3 border-b border-border-light dark:border-border-dark flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="material-icons-round text-primary text-lg">account_tree</span>
                <h3 class="font-semibold text-text-main-light dark:text-text-main-dark">
                  Batch Lineage: {{ activeSearch() }}
                </h3>
              </div>
              <span class="text-xs text-text-sub-light dark:text-text-sub-dark">{{ traceResults().length }} events traced</span>
            </div>

            <!-- Timeline -->
            <div class="p-4 space-y-0">
              @for (node of traceResults(); track node.event.id; let last = $last) {
                <div class="flex gap-4">
                  <!-- Timeline Indicator -->
                  <div class="flex flex-col items-center">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center border-2 flex-shrink-0"
                         [style.borderColor]="node.color"
                         [style.backgroundColor]="node.color + '15'">
                      <span class="material-icons-round text-lg" [style.color]="node.color">{{ node.icon }}</span>
                    </div>
                    @if (!last) {
                      <div class="w-0.5 flex-1 min-h-[32px] bg-gray-200 dark:bg-gray-700"></div>
                    }
                  </div>

                  <!-- Event Card -->
                  <div class="flex-1 pb-6" [class.pb-0]="last">
                    <div class="rounded-lg border border-border-light dark:border-border-dark p-4 bg-background-light dark:bg-background-dark">
                      <div class="flex items-start justify-between gap-2">
                        <div>
                          <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                                [style.backgroundColor]="node.color + '20'"
                                [style.color]="node.color">
                            {{ node.stageLabel }}
                          </span>
                          <p class="font-medium text-sm text-text-main-light dark:text-text-main-dark mt-1.5">{{ node.event.summary }}</p>
                        </div>
                        <span class="text-[10px] text-text-sub-light dark:text-text-sub-dark whitespace-nowrap mt-1">{{ node.event.createdAt | date:'medium' }}</span>
                      </div>
                      <div class="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div>
                          <span class="text-text-sub-light dark:text-text-sub-dark">Worker</span>
                          <p class="font-medium text-text-main-light dark:text-text-main-dark">{{ node.event.workerName }}</p>
                        </div>
                        <div>
                          <span class="text-text-sub-light dark:text-text-sub-dark">Quantity</span>
                          <p class="font-medium text-text-main-light dark:text-text-main-dark">{{ node.event.quantity }} {{ node.event.unit }}</p>
                        </div>
                        @for (entry of payloadEntries(node.event); track entry.key) {
                          <div>
                            <span class="text-text-sub-light dark:text-text-sub-dark">{{ formatKey(entry.key) }}</span>
                            <p class="font-medium text-text-main-light dark:text-text-main-dark">{{ entry.value }}</p>
                          </div>
                        }
                      </div>
                    </div>
                  </div>
                </div>
              }
            </div>
          </div>
        }
      }
    </section>
  `,
})
export class TraceabilityComponent {
    private readonly operations = inject(OperationsLiveService);

    searchQuery = '';
    private readonly _activeSearch = signal('');
    private readonly _hasSearched = signal(false);

    readonly activeSearch = this._activeSearch.asReadonly();
    readonly hasSearched = this._hasSearched.asReadonly();

    readonly uniqueBatchCodes = computed(() => {
        const codes = new Set<string>();
        for (const event of this.operations.events()) {
            if (event.batchCode && event.batchCode !== 'N/A') {
                codes.add(event.batchCode);
            }
        }
        return Array.from(codes);
    });

    private readonly stageConfig: Record<string, { stage: number; label: string; icon: string; color: string }> = {
        inwarding: { stage: 1, label: 'Inwarded', icon: 'inventory', color: '#6366f1' },
        production: { stage: 2, label: 'Produced', icon: 'precision_manufacturing', color: '#f59e0b' },
        packing: { stage: 3, label: 'Packed', icon: 'inventory_2', color: '#10b981' },
        dispatch: { stage: 4, label: 'Dispatched', icon: 'local_shipping', color: '#3b82f6' },
    };

    readonly traceResults = computed<TraceNode[]>(() => {
        const query = this._activeSearch().trim();
        if (!query) return [];

        const matched = this.operations.events()
            .filter(e => e.batchCode.toLowerCase().includes(query.toLowerCase()))
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        return matched.map(event => {
            const config = this.stageConfig[event.module] ?? { stage: 0, label: event.module, icon: 'help', color: '#9ca3af' };
            return {
                event,
                stage: config.stage,
                stageLabel: config.label,
                icon: config.icon,
                color: config.color,
            };
        });
    });

    performSearch(): void {
        this._activeSearch.set(this.searchQuery.trim());
        this._hasSearched.set(true);
    }

    payloadEntries(event: OperationEvent): { key: string; value: string }[] {
        if (!event.payload) return [];
        return Object.entries(event.payload)
            .filter(([, value]) => value != null && String(value).trim() !== '')
            .slice(0, 4)
            .map(([key, value]) => ({ key, value: String(value) }));
    }

    formatKey(key: string): string {
        return key
            .replace(/([A-Z])/g, ' $1')
            .replace(/[_-]/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase())
            .trim();
    }
}
