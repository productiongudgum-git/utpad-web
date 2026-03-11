import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../../core/supabase.service';
import { PackingSession } from '../../../shared/models/manufacturing.models';

@Component({
  selector: 'app-packing',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-gray-900">Packing Sessions</h2>
        <button (click)="load()" class="text-sm text-blue-600 hover:underline">Refresh</button>
      </div>

      @if (loading()) {
        <div class="text-center py-8 text-gray-500">Loading...</div>
      } @else if (sessions().length === 0) {
        <div class="text-center py-8 text-gray-400">No packing sessions yet.</div>
      } @else {
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left font-medium text-gray-500">Batch Code</th>
                <th class="px-4 py-3 text-left font-medium text-gray-500">SKU</th>
                <th class="px-4 py-3 text-left font-medium text-gray-500">Date</th>
                <th class="px-4 py-3 text-right font-medium text-gray-500">Boxes Packed</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 bg-white">
              @for (session of sessions(); track session.id) {
                <tr class="hover:bg-gray-50">
                  <td class="px-4 py-3 font-mono text-xs">{{ session.batch_code }}</td>
                  <td class="px-4 py-3">{{ getSkuName(session) }}</td>
                  <td class="px-4 py-3">{{ session.session_date }}</td>
                  <td class="px-4 py-3 text-right font-semibold">{{ session.boxes_packed }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class PackingComponent implements OnInit {
  private supabase = inject(SupabaseService);

  sessions = signal<PackingSession[]>([]);
  loading = signal(false);

  ngOnInit(): void {
    this.load();
    this.subscribeRealtime();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    const { data, error } = await this.supabase.client
      .from('packing_sessions')
      .select('*, batch:production_batches(batch_code,sku_id,flavor:flavor_definitions(id,name,code))')
      .order('session_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);
    if (!error && data) this.sessions.set(data as PackingSession[]);
    this.loading.set(false);
  }

  getSkuName(session: PackingSession & { batch?: { sku_id: string; flavor?: { name: string } } }): string {
    return (session as any).batch?.flavor?.name ?? (session as any).batch?.sku_id ?? session.batch_code;
  }

  subscribeRealtime(): void {
    this.supabase.client
      .channel('packing-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'packing_sessions' }, () => this.load())
      .subscribe();
  }
}
