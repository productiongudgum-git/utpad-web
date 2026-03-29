import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../../core/supabase.service';
import { ProductionBatch } from '../../../shared/models/manufacturing.models';

@Component({
  selector: 'app-production',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-gray-900">Production Batches</h2>
        <button (click)="load()" class="text-sm text-blue-600 hover:underline">Refresh</button>
      </div>

      @if (loading()) {
        <div class="text-center py-8 text-gray-500">Loading...</div>
      } @else if (batches().length === 0) {
        <div class="text-center py-8 text-gray-400">No production batches yet.</div>
      } @else {
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left font-medium text-gray-500">Batch Code</th>
                <th class="px-4 py-3 text-left font-medium text-gray-500">SKU</th>
                <th class="px-4 py-3 text-left font-medium text-gray-500">Date</th>
                <th class="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                <th class="px-4 py-3 text-right font-medium text-gray-500">Planned Yield</th>
                <th class="px-4 py-3 text-right font-medium text-gray-500">Actual Yield</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 bg-white">
              @for (batch of batches(); track batch.batch_code) {
                <tr class="hover:bg-gray-50">
                  <td class="px-4 py-3 font-mono text-xs">{{ batch.batch_code }}</td>
                  <td class="px-4 py-3">{{ batch.sku?.name ?? batch.sku_id }}</td>
                  <td class="px-4 py-3">{{ batch.production_date }}</td>
                  <td class="px-4 py-3">
                    <span [class]="statusClass(batch.status)"
                          class="text-xs font-semibold px-2 py-0.5 rounded-full capitalize">
                      {{ batch.status }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-right">{{ batch.planned_yield ?? '—' }}</td>
                  <td class="px-4 py-3 text-right">{{ batch.actual_yield ?? '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class ProductionComponent implements OnInit {
  private supabase = inject(SupabaseService);

  batches = signal<ProductionBatch[]>([]);
  loading = signal(false);

  ngOnInit(): void {
    this.load();
    this.subscribeRealtime();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    const { data, error } = await this.supabase.client
      .from('production_batches')
      .select('*, sku:flavor_definitions(id,name,code)')
      .order('production_date', { ascending: false })
      .limit(100);
    if (!error && data) this.batches.set(data as ProductionBatch[]);
    this.loading.set(false);
  }

  subscribeRealtime(): void {
    this.supabase.client
      .channel('production-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_batches' }, () => this.load())
      .subscribe();
  }

  statusClass(status: string): string {
    return status === 'packed'
      ? 'bg-green-100 text-green-700'
      : 'bg-amber-100 text-amber-700';
  }
}
