import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { OperationsLiveService } from '../../../core/services/operations-live.service';

@Component({
  selector: 'app-dispatch',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="max-w-md mx-auto min-h-full flex flex-col relative bg-background-light dark:bg-background-dark">
      <!-- Header -->
      <header class="px-6 py-6 pb-4 bg-surface-light dark:bg-surface-dark">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              Online
            </span>
          </div>
          <button class="p-2 rounded-full text-text-sub-light dark:text-text-sub-dark hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <span class="material-icons-round">more_vert</span>
          </button>
        </div>
        <h1 class="text-3xl font-bold text-text-main-light dark:text-text-main-dark tracking-tight">Dispatch</h1>
        <p class="text-sm text-text-sub-light dark:text-text-sub-dark mt-1">Manage outbound stock & shipments</p>
      </header>

      <!-- Main Content -->
      <main class="flex-1 overflow-y-auto px-5 py-6 space-y-6 pb-8">
        <!-- Current Stock Card -->
        <div class="bg-surface-light dark:bg-surface-dark rounded-2xl p-5 shadow-sm border border-border-light dark:border-border-dark">
          <div class="flex items-center gap-3 mb-4">
            <div class="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg text-primary">
              <span class="material-icons-round">inventory_2</span>
            </div>
            <div>
              <h3 class="text-sm font-semibold text-text-sub-light dark:text-text-sub-dark">Current Stock</h3>
              <p class="text-xs text-text-sub-light dark:text-text-sub-dark">Available in Packing Floor</p>
            </div>
          </div>
          <div class="flex justify-between items-end">
            <div>
              <span class="text-3xl font-bold text-text-main-light dark:text-text-main-dark tracking-tight">{{ totalStock() | number }}</span>
              <span class="text-sm text-text-sub-light dark:text-text-sub-dark ml-1">units</span>
            </div>
            <div class="text-right">
              <span class="block text-xs text-text-sub-light dark:text-text-sub-dark">Last updated</span>
              <span class="text-xs font-medium text-text-main-light dark:text-text-main-dark">Today, 8:00 AM</span>
            </div>
          </div>
        </div>

        <!-- Batch Details -->
        <div class="bg-surface-light dark:bg-surface-dark rounded-2xl p-5 shadow-sm border border-border-light dark:border-border-dark space-y-4">
          <h3 class="font-semibold text-text-main-light dark:text-text-main-dark flex items-center gap-2">
            <span class="material-icons-round text-text-sub-light text-sm">qr_code</span>
            Batch Details
          </h3>
          <div>
            <label class="block text-sm font-medium text-text-sub-light dark:text-text-sub-dark mb-1.5">Batch Code</label>
            <div class="relative">
              <input [formControl]="form.controls.batchCode" type="text" placeholder="Scan or enter code"
                     class="block w-full rounded-xl border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-800 text-text-main-light dark:text-text-main-dark shadow-sm focus:border-primary focus:ring-primary text-sm py-3 pl-4 pr-10 transition-colors">
              <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                <span class="material-icons-round text-text-sub-light">qr_code_scanner</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Dispatch Entry -->
        <div class="bg-surface-light dark:bg-surface-dark rounded-2xl p-5 shadow-sm border border-border-light dark:border-border-dark space-y-6">
          <h3 class="font-semibold text-text-main-light dark:text-text-main-dark flex items-center gap-2">
            <span class="material-icons-round text-text-sub-light text-sm">edit_note</span>
            Dispatch Entry
          </h3>
          <div>
            <label class="block text-sm font-medium text-text-sub-light dark:text-text-sub-dark mb-1.5">
              Qty Taken from Packing
              <span class="text-xs font-normal text-text-sub-light ml-1">(Opening Stock)</span>
            </label>
            <div class="relative rounded-xl shadow-sm">
              <input [formControl]="form.controls.qtyTaken" type="number" placeholder="0"
                     class="block w-full rounded-xl border-border-light dark:border-border-dark bg-white dark:bg-gray-800 text-text-main-light dark:text-text-main-dark focus:border-primary focus:ring-primary text-lg py-3 pl-4 pr-12 font-medium">
              <div class="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                <span class="text-text-sub-light text-sm">kg</span>
              </div>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-text-sub-light dark:text-text-sub-dark mb-1.5">
              Qty Utilized / Dispatched
            </label>
            <div class="relative rounded-xl shadow-sm">
              <input [formControl]="form.controls.qtyDispatched" type="number" placeholder="0"
                     class="block w-full rounded-xl border-border-light dark:border-border-dark bg-white dark:bg-gray-800 text-text-main-light dark:text-text-main-dark focus:border-primary focus:ring-primary text-lg py-3 pl-4 pr-12 font-medium">
              <div class="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                <span class="text-text-sub-light text-sm">kg</span>
              </div>
            </div>
          </div>

          <div class="border-t border-border-light dark:border-border-dark"></div>

          <!-- Remaining Balance -->
          <div class="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 border border-border-light dark:border-border-dark">
            <div class="flex justify-between items-center mb-1">
              <label class="text-sm font-medium text-text-sub-light dark:text-text-sub-dark">Status Result</label>
              <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                Pending
              </span>
            </div>
            <div class="flex justify-between items-end mt-2">
              <span class="text-sm text-text-sub-light dark:text-text-sub-dark">Remaining Balance</span>
              <div class="text-2xl font-bold text-text-main-light dark:text-text-main-dark tracking-tight tabular-nums">
                {{ remainingBalance() }} <span class="text-sm font-normal text-text-sub-light ml-0.5">kg</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Confirm Button -->
        <div class="pt-4 pb-8">
          <button (click)="onConfirm()"
                  class="w-full flex justify-center items-center py-4 px-4 border border-transparent rounded-xl shadow-lg text-base font-semibold text-white bg-primary hover:bg-primary-hover transition-all active:scale-[0.98]">
            <span class="material-icons-round mr-2 text-xl">check_circle</span>
            Confirm Dispatch
          </button>
          <p class="text-center text-xs text-text-sub-light dark:text-text-sub-dark mt-4">
            This action will update the master inventory log.
          </p>

          @if (submitMessage()) {
            <div class="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300">
              {{ submitMessage() }}
            </div>
          }
        </div>
      </main>
    </div>
  `,
})
export class DispatchComponent {
  private readonly fb = inject(FormBuilder);
  private readonly operations = inject(OperationsLiveService);

  totalStock = computed(() =>
    this.operations.skuInventory().reduce((sum, sku) => sum + sku.availableUnits, 0),
  );
  submitMessage = signal('');

  form = this.fb.nonNullable.group({
    batchCode: ['', Validators.required],
    qtyTaken: [0, [Validators.required, Validators.min(0)]],
    qtyDispatched: [0, [Validators.required, Validators.min(0)]],
  });

  remainingBalance = computed(() => {
    const taken = this.form.controls.qtyTaken.value || 0;
    const dispatched = this.form.controls.qtyDispatched.value || 0;
    return Math.max(0, taken - dispatched);
  });

  async onConfirm(): Promise<void> {
    if (this.form.valid) {
      try {
        const event = await this.operations.submitDispatch({
          batchCode: this.form.controls.batchCode.value || '',
          qtyTakenKg: Number(this.form.controls.qtyTaken.value) || 0,
          qtyDispatchedKg: Number(this.form.controls.qtyDispatched.value) || 0,
        });
        this.submitMessage.set(
          `Dispatch synced by ${event.workerName}. ${event.quantity} ${event.unit} deducted from live stock.`,
        );
        this.form.controls.qtyDispatched.setValue(0);
      } catch {
        this.submitMessage.set('Unable to submit dispatch right now.');
      }
    }
  }
}
