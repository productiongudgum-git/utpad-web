import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InventoryService } from './inventory.service';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-gray-900">Inventory</h2>
        <button (click)="inventoryService.load()" class="text-sm text-blue-600 hover:underline">Refresh</button>
      </div>

      <!-- Tab navigation -->
      <div class="flex border-b border-gray-200 mb-6">
        <button
          (click)="activeTab.set('raw')"
          [class]="activeTab() === 'raw'
            ? 'px-4 py-2 text-sm font-semibold text-blue-600 border-b-2 border-blue-600 -mb-px'
            : 'px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700'">
          Raw Materials
          @if (lowStockCount() > 0) {
            <span class="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
              {{ lowStockCount() }} LOW
            </span>
          }
        </button>
        <button
          (click)="activeTab.set('finished')"
          [class]="activeTab() === 'finished'
            ? 'px-4 py-2 text-sm font-semibold text-blue-600 border-b-2 border-blue-600 -mb-px'
            : 'px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700'">
          Finished Goods
        </button>
      </div>

      @if (inventoryService.loading()) {
        <div class="text-center py-8 text-gray-500">Loading...</div>
      } @else {

        <!-- RAW MATERIALS TAB -->
        @if (activeTab() === 'raw') {
          @if (inventoryService.rawMaterialsWithStatus().length === 0) {
            <div class="text-center py-8 text-gray-400">No raw material inventory data yet.</div>
          } @else {
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 text-sm">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-4 py-3 text-left font-medium text-gray-500">Ingredient</th>
                    <th class="px-4 py-3 text-right font-medium text-gray-500">Current Qty</th>
                    <th class="px-4 py-3 text-left font-medium text-gray-500">Unit</th>
                    <th class="px-4 py-3 text-right font-medium text-gray-500">Low Stock Threshold</th>
                    <th class="px-4 py-3 text-center font-medium text-gray-500">Status</th>
                    <th class="px-4 py-3 text-center font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 bg-white">
                  @for (rm of inventoryService.rawMaterialsWithStatus(); track rm.ingredient_id) {
                    <tr [class.bg-amber-50]="rm.status === 'low'" class="hover:bg-gray-50">
                      <td class="px-4 py-3 font-medium text-gray-900">
                        {{ rm.ingredient?.name ?? rm.ingredient_id }}
                      </td>
                      <td class="px-4 py-3 text-right font-semibold"
                          [class.text-amber-700]="rm.status === 'low'"
                          [class.text-gray-900]="rm.status !== 'low'">
                        {{ rm.current_qty }}
                      </td>
                      <td class="px-4 py-3 text-gray-500">{{ rm.unit }}</td>
                      <td class="px-4 py-3 text-right">
                        @if (editingThresholdId() === rm.ingredient_id) {
                          <div class="flex items-center justify-end gap-2">
                            <input
                              type="number"
                              [(ngModel)]="editingThresholdValue"
                              min="0"
                              class="w-24 rounded border border-blue-300 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-200" />
                            <button (click)="saveThreshold(rm.ingredient_id)"
                              class="text-xs text-green-600 hover:text-green-800 font-semibold">Save</button>
                            <button (click)="cancelThresholdEdit()"
                              class="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                          </div>
                        } @else {
                          <span class="text-gray-700">{{ rm.low_stock_threshold ?? '—' }}</span>
                        }
                      </td>
                      <td class="px-4 py-3 text-center">
                        <span [class]="rm.status === 'low'
                          ? 'inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700'
                          : 'inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700'">
                          {{ rm.status === 'low' ? 'LOW' : 'OK' }}
                        </span>
                      </td>
                      <td class="px-4 py-3 text-center">
                        <button
                          (click)="startThresholdEdit(rm.ingredient_id, rm.low_stock_threshold)"
                          class="text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-200 hover:border-blue-400 px-2 py-1 rounded transition-colors">
                          Edit Threshold
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }

        <!-- FINISHED GOODS TAB -->
        @if (activeTab() === 'finished') {
          @if (inventoryService.skuSummaries().length === 0) {
            <div class="text-center py-8 text-gray-400">No finished goods inventory data yet.</div>
          } @else {
            <div class="space-y-6">
              @for (summary of inventoryService.skuSummaries(); track summary.sku_id) {
                <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <!-- SKU header with subtotals -->
                  <div class="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <div>
                      <span class="font-semibold text-gray-900">{{ summary.sku_name }}</span>
                      <span class="ml-2 text-xs font-mono text-gray-400">{{ summary.sku_code }}</span>
                    </div>
                    <div class="flex items-center gap-4 text-sm">
                      <span class="text-gray-500">Total available:</span>
                      <span class="font-bold text-gray-900">{{ summary.net_available }} boxes</span>
                      @if (summary.total_returned > 0) {
                        <span class="text-xs text-amber-600">({{ summary.total_returned }} returned)</span>
                      }
                    </div>
                  </div>

                  <!-- Per-batch rows -->
                  <table class="min-w-full text-sm">
                    <thead>
                      <tr class="text-xs font-medium text-gray-400 uppercase tracking-wide">
                        <th class="px-5 py-2 text-left">Batch Code</th>
                        <th class="px-5 py-2 text-left">Production Date</th>
                        <th class="px-5 py-2 text-right">Available Boxes</th>
                        <th class="px-5 py-2 text-right">Returned Boxes</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-50">
                      @for (batch of summary.batches; track batch.batch_code) {
                        <tr class="hover:bg-gray-50">
                          <td class="px-5 py-2.5 font-mono text-xs text-gray-700">{{ batch.batch_code }}</td>
                          <td class="px-5 py-2.5 text-gray-600">{{ batch.batch?.production_date ?? '—' }}</td>
                          <td class="px-5 py-2.5 text-right font-semibold text-gray-900">{{ batch.boxes_available }}</td>
                          <td class="px-5 py-2.5 text-right text-gray-500">{{ batch.boxes_returned ?? 0 }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>
          }
        }

      }
    </div>
  `,
})
export class InventoryComponent implements OnInit {
  inventoryService = inject(InventoryService);

  readonly activeTab = signal<'raw' | 'finished'>('raw');
  readonly editingThresholdId = signal<string | null>(null);
  editingThresholdValue: number | null = null;

  readonly lowStockCount = computed(() =>
    this.inventoryService.rawMaterialsWithStatus().filter(r => r.status === 'low').length
  );

  ngOnInit(): void {
    this.inventoryService.load();
    this.inventoryService.subscribeRealtime();
  }

  startThresholdEdit(ingredientId: string, currentThreshold: number | null): void {
    this.editingThresholdId.set(ingredientId);
    this.editingThresholdValue = currentThreshold;
  }

  cancelThresholdEdit(): void {
    this.editingThresholdId.set(null);
    this.editingThresholdValue = null;
  }

  async saveThreshold(ingredientId: string): Promise<void> {
    await this.inventoryService.updateLowStockThreshold(ingredientId, this.editingThresholdValue);
    this.editingThresholdId.set(null);
    this.editingThresholdValue = null;
  }
}
