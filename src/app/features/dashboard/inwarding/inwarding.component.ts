import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../../core/supabase.service';
import { WorkerDirectoryService } from '../../../core/services/worker-directory.service';
import { InwardEvent } from '../../../shared/models/manufacturing.models';

@Component({
  selector: 'app-inwarding',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-gray-900">Inwarding Records</h2>
        <button (click)="load()" class="text-sm text-blue-600 hover:underline">Refresh</button>
      </div>

      @if (loading()) {
        <div class="text-center py-8 text-gray-500">Loading...</div>
      } @else if (events().length === 0) {
        <div class="text-center py-8 text-gray-400">No inward records yet.</div>
      } @else {
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left font-medium text-gray-500">Ingredient</th>
                <th class="px-4 py-3 text-right font-medium text-gray-500">Qty</th>
                <th class="px-4 py-3 text-left font-medium text-gray-500">Unit</th>
                <th class="px-4 py-3 text-left font-medium text-gray-500">Date</th>
                <th class="px-4 py-3 text-left font-medium text-gray-500">Lot Ref</th>
                <th class="px-4 py-3 text-left font-medium text-gray-500">Supplier</th>
                <th class="px-4 py-3 text-left font-medium text-gray-500">Worker</th>
                <th class="px-4 py-3 text-left font-medium text-gray-500">Expiry</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 bg-white">
              @for (event of events(); track event.id) {
                <tr class="hover:bg-gray-50" [class.bg-red-50]="isExpiringSoon(event.expiry_date)">
                  <td class="px-4 py-3 font-medium">{{ event.ingredient?.name ?? event.ingredient_id }}</td>
                  <td class="px-4 py-3 text-right font-semibold">{{ event.qty }}</td>
                  <td class="px-4 py-3 text-gray-500">{{ event.unit }}</td>
                  <td class="px-4 py-3">{{ event.inward_date }}</td>
                  <td class="px-4 py-3 font-mono text-xs">{{ event.lot_ref ?? '—' }}</td>
                  <td class="px-4 py-3">{{ event.vendor?.name ?? '—' }}</td>
                  <td class="px-4 py-3">{{ getWorkerLabel(event.worker_id) }}</td>
                  <td class="px-4 py-3" [class.text-red-600]="isExpiringSoon(event.expiry_date)">
                    {{ event.expiry_date ?? '—' }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class InwardingComponent implements OnInit {
  private supabase = inject(SupabaseService);
  private workerDirectory = inject(WorkerDirectoryService);

  readonly workerMap = this.workerDirectory.workers;
  events = signal<InwardEvent[]>([]);
  loading = signal(false);

  ngOnInit(): void {
    void this.workerDirectory.refresh();
    this.load();
    this.subscribeRealtime();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    const { data, error } = await this.supabase.client
      .from('gg_inwarding')
      .select('*, ingredient:gg_ingredients(id,name,default_unit,active), vendor:gg_vendors(name)')
      .order('inward_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);
    if (!error && data) this.events.set(data as InwardEvent[]);
    this.loading.set(false);
  }

  subscribeRealtime(): void {
    this.supabase.client
      .channel('inwarding-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gg_inwarding' }, () => this.load())
      .subscribe();
  }

  isExpiringSoon(expiryDate: string | null): boolean {
    if (!expiryDate) return false;
    const daysUntilExpiry = (new Date(expiryDate).getTime() - Date.now()) / 86400000;
    return daysUntilExpiry <= 7;
  }

  getWorkerLabel(workerId: string | null | undefined): string {
    if (!workerId) return '—';
    return this.workerMap()[workerId]?.name ?? workerId;
  }
}
