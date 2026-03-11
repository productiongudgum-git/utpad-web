import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReportsService } from './reports.service';
import { ReportType } from '../../../shared/models/manufacturing.models';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6">
      <div class="mb-6">
        <h2 class="text-2xl font-bold text-gray-900">Reports</h2>
        <p class="text-sm text-gray-500 mt-1">Export operational data as CSV for analysis.</p>
      </div>

      <!-- Controls -->
      <div class="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">

          <!-- Report type -->
          <div class="sm:col-span-1">
            <label class="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5">Report Type</label>
            <select
              [(ngModel)]="selectedType"
              class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition">
              @for (opt of reportTypeOptions; track opt.value) {
                <option [value]="opt.value">{{ opt.label }}</option>
              }
            </select>
          </div>

          <!-- From date -->
          <div>
            <label class="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5">From</label>
            <input
              type="date"
              [(ngModel)]="fromDate"
              class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition" />
          </div>

          <!-- To date -->
          <div>
            <label class="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5">To</label>
            <input
              type="date"
              [(ngModel)]="toDate"
              class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition" />
          </div>

          <!-- Actions -->
          <div class="flex gap-2">
            <button
              (click)="loadPreview()"
              [disabled]="loading()"
              class="flex-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 font-semibold text-sm px-4 py-2.5 hover:bg-blue-100 transition disabled:opacity-50 disabled:cursor-not-allowed">
              Preview
            </button>
            <button
              (click)="downloadCsv()"
              [disabled]="loading() || rows().length === 0"
              class="flex-1 rounded-lg bg-gray-900 text-white font-semibold text-sm px-4 py-2.5 hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-not-allowed">
              Download CSV
            </button>
          </div>
        </div>

        @if (errorMessage()) {
          <p class="mt-3 text-xs text-red-600">{{ errorMessage() }}</p>
        }
      </div>

      <!-- Preview table -->
      @if (loading()) {
        <div class="text-center py-8 text-gray-500">Loading report...</div>
      } @else if (rows().length > 0) {
        <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div class="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <p class="text-sm font-semibold text-gray-700">
              Preview — first {{ previewRows().length }} of {{ rows().length }} rows
            </p>
            <span class="text-xs text-gray-400">{{ selectedTypeLabel }}</span>
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full text-xs">
              <thead class="bg-gray-50">
                <tr>
                  @for (col of columns(); track col) {
                    <th class="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {{ col }}
                    </th>
                  }
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                @for (row of previewRows(); track $index) {
                  <tr class="hover:bg-gray-50">
                    @for (col of columns(); track col) {
                      <td class="px-4 py-2.5 text-gray-700 whitespace-nowrap">
                        {{ row[col] ?? '—' }}
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      } @else if (hasSearched()) {
        <div class="text-center py-8 text-gray-400">
          No data found for the selected period.
        </div>
      }
    </div>
  `,
})
export class ReportsComponent {
  private reportsService = inject(ReportsService);

  selectedType: ReportType = 'production';
  fromDate = this.defaultFromDate();
  toDate = this.defaultToDate();

  readonly loading = signal(false);
  readonly rows = signal<Record<string, unknown>[]>([]);
  readonly errorMessage = signal('');
  readonly hasSearched = signal(false);

  readonly reportTypeOptions: { value: ReportType; label: string }[] = [
    { value: 'production', label: 'Production' },
    { value: 'packing',    label: 'Packing' },
    { value: 'dispatch',   label: 'Dispatch' },
    { value: 'inventory',  label: 'Inventory Snapshot' },
    { value: 'returns',    label: 'Returns' },
  ];

  readonly columns = computed(() => {
    const r = this.rows();
    if (r.length === 0) return [];
    return Object.keys(r[0]);
  });

  readonly previewRows = computed(() => this.rows().slice(0, 10));

  get selectedTypeLabel(): string {
    return this.reportTypeOptions.find(o => o.value === this.selectedType)?.label ?? '';
  }

  async loadPreview(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    this.hasSearched.set(true);
    try {
      const data = await this.fetchRows();
      this.rows.set(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.errorMessage.set(`Failed to load report: ${msg}`);
      this.rows.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async downloadCsv(): Promise<void> {
    if (this.rows().length === 0) {
      await this.loadPreview();
    }
    await this.reportsService.downloadReport(this.selectedType, this.fromDate, this.toDate);
  }

  private async fetchRows(): Promise<Record<string, unknown>[]> {
    switch (this.selectedType) {
      case 'production':
        return (await this.reportsService.fetchProduction(this.fromDate, this.toDate)) as unknown as Record<string, unknown>[];
      case 'packing':
        return (await this.reportsService.fetchPacking(this.fromDate, this.toDate)) as unknown as Record<string, unknown>[];
      case 'dispatch':
        return (await this.reportsService.fetchDispatch(this.fromDate, this.toDate)) as unknown as Record<string, unknown>[];
      case 'inventory':
        return (await this.reportsService.fetchInventorySnapshot()) as unknown as Record<string, unknown>[];
      case 'returns':
        return (await this.reportsService.fetchReturns(this.fromDate, this.toDate)) as unknown as Record<string, unknown>[];
    }
  }

  private defaultFromDate(): string {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }

  private defaultToDate(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
