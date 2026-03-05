import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MockDataService } from '../../../core/services/mock-data.service';
import { OperationsLiveService } from '../../../core/services/operations-live.service';
import { RecipeMasterDataService } from '../../../core/services/recipe-master-data.service';

@Component({
  selector: 'app-inwarding',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="max-w-md mx-auto min-h-full flex flex-col relative bg-background-light dark:bg-background-dark">
      <!-- Header -->
      <header class="bg-surface-light dark:bg-surface-dark px-4 py-4 shadow-sm sticky top-0 z-10 border-b border-border-light dark:border-border-dark flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <h1 class="text-lg font-bold text-text-main-light dark:text-text-main-dark tracking-tight">Inwarding Material</h1>
        </div>
        <button class="p-2 rounded-full text-text-sub-light dark:text-text-sub-dark hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
          <span class="material-icons-outlined">history</span>
        </button>
      </header>

      <!-- Main Content -->
      <main class="flex-1 overflow-y-auto p-4 space-y-6 pb-28">
        <!-- Details Section -->
        <div class="space-y-4">
          <h2 class="text-sm font-semibold uppercase tracking-wider text-text-sub-light dark:text-text-sub-dark mb-2">Details</h2>

          <!-- Ingredient Select -->
          <div class="bg-surface-light dark:bg-surface-dark p-4 rounded-xl shadow-sm border border-border-light dark:border-border-dark">
            <label class="block text-sm font-medium text-text-sub-light dark:text-text-sub-dark mb-1">Select Ingredient</label>
            <div class="flex space-x-2">
              <div class="relative flex-1">
                <select [formControl]="form.controls.ingredientId"
                        (change)="onIngredientSelected()"
                        class="block w-full rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-700 text-text-main-light dark:text-text-main-dark focus:ring-primary focus:border-primary text-sm py-2.5 pl-3 pr-10 appearance-none">
                  <option value="">Select Ingredient...</option>
                  @for (ing of ingredients(); track ing.id) {
                    <option [value]="ing.id">{{ ing.name }}</option>
                  }
                </select>
                <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-text-sub-light dark:text-text-sub-dark">
                  <span class="material-icons-round text-sm">expand_more</span>
                </div>
              </div>
              <button class="flex items-center justify-center px-3 bg-primary bg-opacity-10 dark:bg-opacity-20 rounded-lg text-primary font-medium hover:bg-opacity-20 transition-colors">
                <span class="material-icons-round">add</span>
              </button>
            </div>
          </div>

          <!-- Batch Barcode -->
          <div class="bg-surface-light dark:bg-surface-dark p-4 rounded-xl shadow-sm border border-border-light dark:border-border-dark">
            <label class="block text-sm font-medium text-text-sub-light dark:text-text-sub-dark mb-1">Batch Barcode</label>
            <div class="flex space-x-2">
              <input [formControl]="form.controls.batchBarcode" type="text" placeholder="Scan or enter barcode"
                     class="block w-full rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-700 text-text-main-light dark:text-text-main-dark placeholder-text-sub-light dark:placeholder-text-sub-dark focus:ring-primary focus:border-primary text-sm py-2.5">
              <button class="flex items-center justify-center px-4 bg-gray-800 text-white dark:bg-gray-600 rounded-lg shadow-sm hover:bg-gray-700 dark:hover:bg-gray-500 transition-colors">
                <span class="material-icons-outlined">qr_code_scanner</span>
              </button>
            </div>
          </div>

          <!-- Quantity + Unit grid -->
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-surface-light dark:bg-surface-dark p-4 rounded-xl shadow-sm border border-border-light dark:border-border-dark">
              <label class="block text-sm font-medium text-text-sub-light dark:text-text-sub-dark mb-1">Quantity</label>
              <input [formControl]="form.controls.quantity" type="number" placeholder="0.00"
                     class="block w-full rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-700 text-text-main-light dark:text-text-main-dark focus:ring-primary focus:border-primary text-lg font-semibold py-2">
            </div>
            <div class="bg-surface-light dark:bg-surface-dark p-4 rounded-xl shadow-sm border border-border-light dark:border-border-dark">
              <label class="block text-sm font-medium text-text-sub-light dark:text-text-sub-dark mb-1">Unit</label>
              <div class="relative">
                <select [formControl]="form.controls.unit"
                        class="block w-full rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-700 text-text-main-light dark:text-text-main-dark focus:ring-primary focus:border-primary text-sm py-2.5 appearance-none">
                  <option value="kg">kg</option>
                  <option value="L">L</option>
                  <option value="pcs">pcs</option>
                  <option value="boxes">boxes</option>
                </select>
                <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-text-sub-light dark:text-text-sub-dark">
                  <span class="material-icons-round text-sm">expand_more</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Expiry + Vendor -->
          <div class="bg-surface-light dark:bg-surface-dark p-4 rounded-xl shadow-sm border border-border-light dark:border-border-dark space-y-4">
            <div>
              <label class="block text-sm font-medium text-text-sub-light dark:text-text-sub-dark mb-1">Expiry Date</label>
              <input [formControl]="form.controls.expiryDate" type="date"
                     class="block w-full rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-700 text-text-main-light dark:text-text-main-dark focus:ring-primary focus:border-primary text-sm py-2.5">
            </div>
            <div>
              <label class="block text-sm font-medium text-text-sub-light dark:text-text-sub-dark mb-1">Vendor</label>
              <div class="relative">
                <select [formControl]="form.controls.vendorId"
                        class="block w-full rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-700 text-text-main-light dark:text-text-main-dark focus:ring-primary focus:border-primary text-sm py-2.5 appearance-none">
                  <option value="">Select Vendor...</option>
                  @for (v of vendors; track v.id) {
                    <option [value]="v.id">{{ v.name }}</option>
                  }
                </select>
                <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-text-sub-light dark:text-text-sub-dark">
                  <span class="material-icons-round text-sm">expand_more</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Billing Section -->
        <div class="space-y-4">
          <h2 class="text-sm font-semibold uppercase tracking-wider text-text-sub-light dark:text-text-sub-dark mb-2">Billing</h2>
          <div class="bg-surface-light dark:bg-surface-dark p-4 rounded-xl shadow-sm border border-border-light dark:border-border-dark space-y-4">
            <div>
              <label class="block text-sm font-medium text-text-sub-light dark:text-text-sub-dark mb-1">Bill Number</label>
              <input [formControl]="form.controls.billNumber" type="text" placeholder="Enter bill number"
                     class="block w-full rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-700 text-text-main-light dark:text-text-main-dark placeholder-text-sub-light dark:placeholder-text-sub-dark focus:ring-primary focus:border-primary text-sm py-2.5">
            </div>
            <div class="border-t border-dashed border-border-light dark:border-border-dark pt-4">
              <label class="block text-sm font-medium text-text-sub-light dark:text-text-sub-dark mb-2">Upload Bill Image</label>
              <div class="flex items-center justify-center w-full">
                <label class="flex flex-col items-center justify-center w-full h-32 border-2 border-primary border-dashed rounded-xl cursor-pointer bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
                  <div class="flex flex-col items-center justify-center pt-5 pb-6">
                    <span class="material-icons-round text-3xl text-primary mb-2">photo_camera</span>
                    <p class="mb-1 text-sm text-text-sub-light dark:text-text-sub-dark"><span class="font-semibold text-primary">Tap to capture</span> or upload</p>
                  </div>
                  <input type="file" class="hidden" (change)="onFileSelected($event)" accept="image/*">
                </label>
              </div>
              @if (selectedFileName()) {
                <div class="mt-3 flex items-center space-x-3 bg-gray-50 dark:bg-gray-700 p-2 rounded-lg">
                  <span class="material-icons-round text-gray-400">description</span>
                  <div class="flex-1 overflow-hidden">
                    <p class="text-xs font-medium text-text-main-light dark:text-text-main-dark truncate">{{ selectedFileName() }}</p>
                  </div>
                  <button (click)="removeFile()" class="text-red-500 hover:text-red-600">
                    <span class="material-icons-round text-sm">close</span>
                  </button>
                </div>
              }
            </div>
          </div>
        </div>

        @if (submitMessage()) {
          <div class="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300">
            {{ submitMessage() }}
          </div>
        }
      </main>

      <!-- Bottom Action Bar -->
      <div class="sticky bottom-0 left-0 w-full bg-surface-light dark:bg-surface-dark border-t border-border-light dark:border-border-dark p-4 z-20 shadow-lg">
        <div class="flex space-x-4">
          <button (click)="onReset()"
                  class="flex-1 py-3.5 px-4 border border-border-light dark:border-border-dark rounded-xl text-text-main-light dark:text-text-main-dark font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            Reset
          </button>
          <button (click)="onConfirm()"
                  class="flex-1 py-3.5 px-4 bg-primary text-white rounded-xl font-bold shadow-md hover:bg-primary-hover transition-colors flex items-center justify-center space-x-2">
            <span class="material-icons-round text-sm">save</span>
            <span>Confirm Inward</span>
          </button>
        </div>
      </div>
    </div>
  `,
})
export class InwardingComponent {
  private readonly fb = inject(FormBuilder);
  private readonly masterData = inject(RecipeMasterDataService);
  private readonly mockData = inject(MockDataService);
  private readonly operations = inject(OperationsLiveService);

  ingredients = this.masterData.activeIngredients;
  vendors = this.mockData.getVendors();
  selectedFileName = signal('');
  submitMessage = signal('');

  form = this.fb.nonNullable.group({
    ingredientId: ['', Validators.required],
    batchBarcode: [''],
    quantity: [0, [Validators.required, Validators.min(0.01)]],
    unit: ['kg'],
    expiryDate: [''],
    vendorId: ['', Validators.required],
    billNumber: [''],
  });

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.selectedFileName.set(file.name);
    }
  }

  removeFile(): void {
    this.selectedFileName.set('');
  }

  onIngredientSelected(): void {
    const ingredient = this.ingredients().find((item) => item.id === this.form.controls.ingredientId.value);
    if (ingredient) {
      this.form.controls.unit.setValue(ingredient.unit);
    }
  }

  onReset(): void {
    this.form.reset({ unit: 'kg', quantity: 0 });
    this.selectedFileName.set('');
    this.submitMessage.set('');
  }

  async onConfirm(): Promise<void> {
    if (this.form.valid) {
      const ingredient = this.ingredients().find((item) => item.id === this.form.controls.ingredientId.value);
      const vendor = this.vendors.find((item) => item.id === this.form.controls.vendorId.value);
      const quantity = Number(this.form.controls.quantity.value) || 0;

      try {
        const event = await this.operations.submitInwarding({
          ingredientName: ingredient?.name ?? 'Unknown Ingredient',
          quantity,
          unit: this.form.controls.unit.value || 'kg',
          batchBarcode: this.form.controls.batchBarcode.value || '',
          vendorName: vendor?.name ?? 'Unknown Vendor',
          billNumber: this.form.controls.billNumber.value || '',
        });

        this.submitMessage.set(
          `Inwarding logged by ${event.workerName} at ${new Date(event.createdAt).toLocaleTimeString()}.`,
        );
        this.form.reset({ unit: 'kg', quantity: 0 });
        this.selectedFileName.set('');
      } catch {
        this.submitMessage.set('Unable to submit inwarding right now.');
      }
    }
  }
}
