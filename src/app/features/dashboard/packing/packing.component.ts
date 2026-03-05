import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MockDataService } from '../../../core/services/mock-data.service';
import { OperationsLiveService } from '../../../core/services/operations-live.service';

@Component({
  selector: 'app-packing',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="max-w-md mx-auto min-h-full flex flex-col relative bg-background-light dark:bg-background-dark">
      <!-- Header -->
      <header class="px-6 pt-4 pb-4 flex items-center justify-between">
        <h1 class="text-2xl font-bold tracking-tight text-text-main-light dark:text-text-main-dark">Packing</h1>
        <button class="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors relative">
          <span class="material-icons-round text-text-sub-light dark:text-text-sub-dark">notifications</span>
          <span class="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-white dark:border-gray-900"></span>
        </button>
      </header>

      <!-- Main Content -->
      <main class="flex-1 px-6 pb-28 overflow-y-auto">
        <!-- Breadcrumb -->
        <div class="flex items-center space-x-2 mb-6 text-sm text-text-sub-light dark:text-text-sub-dark">
          <span class="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-primary rounded font-medium">Semi-finished</span>
          <span class="material-icons-round text-sm">arrow_forward</span>
          <span class="font-semibold text-primary">Packing</span>
        </div>

        <!-- Form Card -->
        <div class="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm p-6 space-y-6 border border-border-light dark:border-border-dark">
          <!-- Batch Code -->
          <div class="space-y-2">
            <label class="block text-sm font-medium text-text-sub-light dark:text-text-sub-dark">Semi-finished Batch Code</label>
            <div class="relative">
              <select [formControl]="form.controls.batchCode"
                      class="block w-full pl-10 pr-10 py-3.5 text-base border-border-light dark:border-border-dark focus:ring-2 focus:ring-primary focus:border-transparent rounded-lg bg-gray-50 dark:bg-gray-800 text-text-main-light dark:text-text-main-dark appearance-none shadow-sm">
                <option value="">Select Batch...</option>
                @for (b of batches; track b.id) {
                  <option [value]="b.code">{{ b.code }} ({{ b.flavorName }})</option>
                }
              </select>
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span class="material-icons-round text-text-sub-light">qr_code_scanner</span>
              </div>
              <div class="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <span class="material-icons-round text-text-sub-light">expand_more</span>
              </div>
            </div>
          </div>

          <div class="border-t border-border-light dark:border-border-dark"></div>

          <!-- Packing SKU -->
          <div class="space-y-2">
            <label class="block text-sm font-medium text-text-sub-light dark:text-text-sub-dark">Packing SKU</label>
            <div class="relative">
              <select [formControl]="form.controls.skuCode"
                      class="block w-full pl-10 pr-10 py-3.5 text-base border-border-light dark:border-border-dark focus:ring-2 focus:ring-primary focus:border-transparent rounded-lg bg-gray-50 dark:bg-gray-800 text-text-main-light dark:text-text-main-dark appearance-none shadow-sm">
                <option value="">Select Product SKU...</option>
                @for (s of skus; track s.id) {
                  <option [value]="s.code">{{ s.name }}</option>
                }
              </select>
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span class="material-icons-round text-text-sub-light">category</span>
              </div>
              <div class="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <span class="material-icons-round text-text-sub-light">expand_more</span>
              </div>
            </div>
          </div>

          <!-- Qty + Boxes grid -->
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <label class="block text-sm font-medium text-text-sub-light dark:text-text-sub-dark">Qty Packed</label>
              <div class="relative">
                <input [formControl]="form.controls.qtyPacked" type="number" placeholder="0"
                       class="block w-full pl-3 pr-8 py-3.5 text-base border-border-light dark:border-border-dark focus:ring-2 focus:ring-primary focus:border-transparent rounded-lg bg-gray-50 dark:bg-gray-800 text-text-main-light dark:text-text-main-dark shadow-sm">
                <div class="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <span class="text-xs text-text-sub-light font-medium">kg</span>
                </div>
              </div>
            </div>
            <div class="space-y-2">
              <label class="block text-sm font-medium text-text-sub-light dark:text-text-sub-dark">Boxes Made</label>
              <div class="relative">
                <input [formControl]="form.controls.boxesMade" type="number" placeholder="0"
                       class="block w-full pl-3 pr-8 py-3.5 text-base border-border-light dark:border-border-dark focus:ring-2 focus:ring-primary focus:border-transparent rounded-lg bg-gray-50 dark:bg-gray-800 text-text-main-light dark:text-text-main-dark shadow-sm">
                <div class="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <span class="text-xs text-text-sub-light font-medium">units</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Date -->
          <div class="space-y-2">
            <label class="block text-sm font-medium text-text-sub-light dark:text-text-sub-dark">Date of Packing</label>
            <div class="relative">
              <input [formControl]="form.controls.packingDate" type="date"
                     class="block w-full pl-10 pr-3 py-3.5 text-base border-border-light dark:border-border-dark focus:ring-2 focus:ring-primary focus:border-transparent rounded-lg bg-gray-50 dark:bg-gray-800 text-text-main-light dark:text-text-main-dark shadow-sm">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span class="material-icons-round text-text-sub-light">calendar_today</span>
              </div>
            </div>
          </div>

          <!-- Notes -->
          <div class="space-y-2">
            <label class="block text-sm font-medium text-text-sub-light dark:text-text-sub-dark">
              Notes <span class="text-text-sub-light font-normal">(Optional)</span>
            </label>
            <textarea [formControl]="form.controls.notes" rows="2" placeholder="Any issues during packing?"
                      class="block w-full p-3 text-base border-border-light dark:border-border-dark focus:ring-2 focus:ring-primary focus:border-transparent rounded-lg bg-gray-50 dark:bg-gray-800 text-text-main-light dark:text-text-main-dark shadow-sm resize-none"></textarea>
          </div>
        </div>

        <!-- Shift Summary -->
        <div class="mt-6 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 flex items-start space-x-3">
          <span class="material-icons-round text-primary mt-0.5">info</span>
          <div class="text-sm text-blue-800 dark:text-blue-200">
            <p class="font-medium">Shift Summary</p>
            <p class="opacity-80 mt-1">Total packed today: <span class="font-bold">142 boxes</span>. Keep up the good work!</p>
          </div>
        </div>

        @if (submitMessage()) {
          <div class="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300">
            {{ submitMessage() }}
          </div>
        }
      </main>

      <!-- Bottom Action Bar -->
      <div class="sticky bottom-0 left-0 right-0 bg-surface-light dark:bg-surface-dark border-t border-border-light dark:border-border-dark p-4 z-20 shadow-lg">
        <div class="flex space-x-4">
          <button (click)="onClear()"
                  class="flex-1 py-3.5 px-4 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-text-main-light dark:text-text-main-dark rounded-lg font-medium transition-colors">
            Clear
          </button>
          <button (click)="onSubmit()"
                  class="flex-[2] py-3.5 px-4 bg-primary hover:bg-primary-hover text-white rounded-lg font-semibold shadow-md shadow-blue-500/30 transition-all active:scale-[0.98] flex items-center justify-center space-x-2">
            <span class="material-icons-round text-sm">save</span>
            <span>Submit Packing</span>
          </button>
        </div>
      </div>
    </div>
  `,
})
export class PackingComponent {
  private readonly fb = inject(FormBuilder);
  private readonly mockData = inject(MockDataService);
  private readonly operations = inject(OperationsLiveService);

  batches = this.mockData.getBatches();
  skus = this.mockData.getSKUs();
  submitMessage = signal('');

  form = this.fb.nonNullable.group({
    batchCode: ['', Validators.required],
    skuCode: ['', Validators.required],
    qtyPacked: [0, [Validators.required, Validators.min(1)]],
    boxesMade: [0, [Validators.required, Validators.min(1)]],
    packingDate: [new Date().toISOString().split('T')[0]],
    notes: [''],
  });

  onClear(): void {
    this.form.reset({ packingDate: new Date().toISOString().split('T')[0], qtyPacked: 0, boxesMade: 0 });
    this.submitMessage.set('');
  }

  async onSubmit(): Promise<void> {
    if (this.form.valid) {
      const sku = this.skus.find((item) => item.code === this.form.controls.skuCode.value);
      try {
        const event = await this.operations.submitPacking({
          batchCode: this.form.controls.batchCode.value || '',
          skuCode: sku?.code ?? 'UNKNOWN-SKU',
          skuName: sku?.name ?? 'Unknown SKU',
          qtyPackedKg: Number(this.form.controls.qtyPacked.value) || 0,
          boxesMade: Number(this.form.controls.boxesMade.value) || 0,
          notes: this.form.controls.notes.value || '',
        });

        this.submitMessage.set(
          `Packing synced by ${event.workerName}. ${event.quantity} ${event.unit} moved to dispatch-ready stock.`,
        );
        this.form.reset({ packingDate: new Date().toISOString().split('T')[0], qtyPacked: 0, boxesMade: 0 });
      } catch {
        this.submitMessage.set('Unable to submit packing right now.');
      }
    }
  }
}
