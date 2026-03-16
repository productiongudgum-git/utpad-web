import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { SupabaseService } from '../../../core/supabase.service';
import { RealtimeChannel } from '@supabase/supabase-js';

interface Batch {
  id: string;
  batch_code: string;
  status: string;
  created_at: string;
  flavor_name: string;
}

@Component({
  selector: 'app-kanban',
  standalone: true,
  imports: [CommonModule, DatePipe],
  template: `
    <div style="padding:24px;">
      <div style="margin-bottom:24px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <h1 style="font-family:'Cabin',sans-serif;font-size:22px;font-weight:700;color:#121212;margin:0;">Live Kanban</h1>
        <span style="display:flex;align-items:center;gap:5px;padding:4px 10px;background:#dcfce7;border-radius:999px;font-size:12px;font-weight:600;color:#15803d;">
          <span style="width:6px;height:6px;background:#01AC51;border-radius:50%;display:inline-block;animation:blink 1.5s infinite;"></span>
          Live
        </span>
        @if (loading()) {
          <span style="font-size:13px;color:#6B7280;">Refreshing...</span>
        }
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;" class="kanban-grid">
        @for (col of columns; track col.status) {
          <div>
            <!-- Column header -->
            <div [style.borderTopColor]="col.color" style="background:#fff;border-radius:10px 10px 0 0;border:1px solid #E5E7EB;border-top:3px solid;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span class="material-icons-round" [style.color]="col.color" style="font-size:18px;">{{ col.icon }}</span>
                <span style="font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.5px;">{{ col.label }}</span>
              </div>
              <span [style.background]="col.color + '22'" [style.color]="col.color" style="padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700;">
                {{ getBatches(col.status).length }}
              </span>
            </div>

            <!-- Cards -->
            <div style="background:#f8f9fa;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 10px 10px;padding:10px;min-height:200px;max-height:500px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;">
              @if (getBatches(col.status).length === 0) {
                <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:32px 0;text-align:center;">
                  <div>
                    <span class="material-icons-round" style="font-size:28px;color:#d1d5db;display:block;margin-bottom:6px;">inbox</span>
                    <p style="font-size:12px;color:#9CA3AF;margin:0;">No batches</p>
                  </div>
                </div>
              }
              @for (batch of getBatches(col.status); track batch.id) {
                <div style="background:#fff;border-radius:8px;border:1px solid #E5E7EB;padding:12px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
                  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px;">
                    <span style="font-size:13px;font-weight:700;color:#121212;font-family:'Cabin',sans-serif;">{{ batch.batch_code }}</span>
                    <span [style.background]="col.color + '22'" [style.color]="col.color" style="font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;white-space:nowrap;">
                      {{ col.label }}
                    </span>
                  </div>
                  <p style="font-size:12px;color:#6B7280;margin:0 0 6px;">{{ batch.flavor_name }}</p>
                  <p style="font-size:11px;color:#9CA3AF;margin:0;">{{ batch.created_at | date:'MMM d, h:mm a' }}</p>
                </div>
              }
            </div>
          </div>
        }
      </div>
    </div>

    <style>
      @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
      @media (max-width:900px) { .kanban-grid { grid-template-columns: repeat(2,1fr) !important; } }
      @media (max-width:500px) { .kanban-grid { grid-template-columns: 1fr !important; } }
    </style>
  `,
})
export class KanbanComponent implements OnInit, OnDestroy {
  private readonly supabase = inject(SupabaseService);

  loading = signal(false);
  batches = signal<Batch[]>([]);

  columns = [
    { status: 'production', label: 'Production', color: '#2563eb', icon: 'precision_manufacturing' },
    { status: 'packing',    label: 'Packing',    color: '#d97706', icon: 'inventory_2' },
    { status: 'dispatch',   label: 'Dispatch',   color: '#01AC51', icon: 'local_shipping' },
    { status: 'completed',  label: 'Completed',  color: '#6B7280', icon: 'check_circle' },
  ];

  private channel: RealtimeChannel | null = null;

  async ngOnInit(): Promise<void> {
    await this.loadBatches();
    this.subscribeRealtime();
  }

  ngOnDestroy(): void {
    if (this.channel) {
      void this.supabase.client.removeChannel(this.channel);
    }
  }

  getBatches(status: string): Batch[] {
    return this.batches().filter(b => b.status === status);
  }

  private async loadBatches(): Promise<void> {
    this.loading.set(true);
    const { data, error } = await this.supabase.client
      .from('gg_batches')
      .select('id, batch_code, status, created_at, gg_flavors(name)')
      .order('created_at', { ascending: false })
      .limit(200);

    if (!error && data) {
      this.batches.set(data.map((b: any) => ({
        id: b.id,
        batch_code: b.batch_code,
        status: b.status,
        created_at: b.created_at,
        flavor_name: b.gg_flavors?.name ?? 'Unknown',
      })));
    }
    this.loading.set(false);
  }

  private subscribeRealtime(): void {
    this.channel = this.supabase.client
      .channel('gg-kanban')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gg_batches' }, () => {
        void this.loadBatches();
      })
      .subscribe();
  }
}
