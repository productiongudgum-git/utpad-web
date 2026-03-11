import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../../core/supabase.service';
import { DispatchEvent } from '../../../shared/models/manufacturing.models';

@Component({
  selector: 'app-dispatch',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-gray-900">Dispatch Records</h2>
        <button (click)="load()" class="text-sm text-blue-600 hover:underline">Refresh</button>
      </div>

      @if (loading()) {
        <div class="text-center py-8 text-gray-500">Loading...</div>
      } @else if (events().length === 0) {
        <div class="text-center py-8 text-gray-400">No dispatch records yet.</div>
      } @else {
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left font-medium text-gray-500">Invoice</th>
                <th class="px-4 py-3 text-left font-medium text-gray-500">Customer</th>
                <th class="px-4 py-3 text-left font-medium text-gray-500">SKU</th>
                <th class="px-4 py-3 text-left font-medium text-gray-500">Batch</th>
                <th class="px-4 py-3 text-right font-medium text-gray-500">Boxes</th>
                <th class="px-4 py-3 text-left font-medium text-gray-500">Date</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 bg-white">
              @for (event of events(); track event.id) {
                <tr class="hover:bg-gray-50">
                  <td class="px-4 py-3 font-mono text-xs font-semibold">{{ event.invoice_number }}</td>
                  <td class="px-4 py-3">{{ event.customer_name ?? '—' }}</td>
                  <td class="px-4 py-3">{{ event.sku?.name ?? event.sku_id }}</td>
                  <td class="px-4 py-3 font-mono text-xs">{{ event.batch_code }}</td>
                  <td class="px-4 py-3 text-right font-semibold">{{ event.boxes_dispatched }}</td>
                  <td class="px-4 py-3">{{ event.dispatch_date }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class DispatchComponent implements OnInit {
  private supabase = inject(SupabaseService);

  events = signal<DispatchEvent[]>([]);
  loading = signal(false);

  ngOnInit(): void {
    this.load();
    this.subscribeRealtime();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    const { data, error } = await this.supabase.client
      .from('dispatch_events')
      .select('*, sku:flavor_definitions(id,name,code)')
      .order('dispatch_date', { ascending: false })
      .limit(100);
    if (!error && data) this.events.set(data as DispatchEvent[]);
    this.loading.set(false);
  }

  subscribeRealtime(): void {
    this.supabase.client
      .channel('dispatch-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dispatch_events' }, () => this.load())
      .subscribe();
  }
}
