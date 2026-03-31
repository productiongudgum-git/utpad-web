import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { SupabaseService } from '../../../core/supabase.service';

interface DispatchRow {
  id: string;
  invoice_number: string;
  customer_name: string;
  is_packed: boolean;
  is_dispatched: boolean;
  expected_dispatch_date: string | null;
  created_at: string;
  items_summary: string;
}

@Component({
  selector: 'app-dispatch',
  standalone: true,
  imports: [CommonModule, DatePipe],
  template: `
    <div style="padding:24px;max-width:1100px;">

      <!-- Header -->
      <div style="margin-bottom:24px;display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="font-family:'Cabin',sans-serif;font-size:22px;font-weight:700;color:#121212;margin:0 0 4px;">Dispatch</h1>
          <p style="color:#6B7280;font-size:14px;margin:0;">Track invoice packing and dispatch status.</p>
        </div>
        <button (click)="loadData()"
                style="padding:8px 16px;background:#f3f4f6;border:1px solid #E5E7EB;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:6px;color:#374151;">
          <span class="material-icons-round" style="font-size:16px;">refresh</span> Refresh
        </button>
      </div>

      <!-- Stats bar -->
      @if (!loading() && rows().length > 0) {
        <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:10px 16px;display:flex;align-items:center;gap:8px;">
            <span class="material-icons-round" style="color:#15803d;font-size:18px;">inventory_2</span>
            <span style="font-size:13px;font-weight:600;color:#15803d;">{{ packedCount() }} packed</span>
          </div>
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:10px 16px;display:flex;align-items:center;gap:8px;">
            <span class="material-icons-round" style="color:#1d4ed8;font-size:18px;">local_shipping</span>
            <span style="font-size:13px;font-weight:600;color:#1d4ed8;">{{ dispatchedCount() }} dispatched</span>
          </div>
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 16px;display:flex;align-items:center;gap:8px;">
            <span class="material-icons-round" style="color:#d97706;font-size:18px;">pending</span>
            <span style="font-size:13px;font-weight:600;color:#d97706;">{{ pendingCount() }} pending</span>
          </div>
        </div>
      }

      <!-- Table -->
      @if (loading()) {
        <div style="display:flex;flex-direction:column;gap:10px;">
          @for (i of [1,2,3,4]; track i) {
            <div class="gg-skeleton" style="height:60px;border-radius:10px;"></div>
          }
        </div>
      } @else if (rows().length === 0) {
        <div style="text-align:center;padding:64px 0;color:#9CA3AF;">
          <span class="material-icons-round" style="font-size:48px;display:block;margin-bottom:12px;">local_shipping</span>
          <p style="font-size:15px;margin:0 0 8px;color:#374151;font-weight:600;">No invoices yet</p>
          <p style="font-size:13px;margin:0;">Create invoices from the <strong>Invoices</strong> page to see them here.</p>
        </div>
      } @else {
        <div style="background:#fff;border-radius:12px;border:1px solid #E5E7EB;overflow:hidden;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#f8f9fa;border-bottom:1px solid #E5E7EB;">
                <th style="text-align:left;padding:12px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Invoice #</th>
                <th style="text-align:left;padding:12px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Customer</th>
                <th style="text-align:left;padding:12px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Items</th>
                <th style="text-align:left;padding:12px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Dispatch Date</th>
                <th style="text-align:center;padding:12px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Packed</th>
                <th style="text-align:center;padding:12px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Dispatched</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.id) {
                <tr style="border-bottom:1px solid #f3f4f6;"
                    [style.background]="row.is_dispatched ? '#f0fdf4' : row.is_packed ? '#eff6ff' : 'transparent'">
                  <td style="padding:14px 16px;">
                    <span style="font-family:monospace;font-size:14px;font-weight:700;color:#121212;">{{ row.invoice_number }}</span>
                  </td>
                  <td style="padding:14px 16px;font-size:14px;color:#374151;font-weight:500;">{{ row.customer_name }}</td>
                  <td style="padding:14px 16px;font-size:12px;color:#6B7280;max-width:240px;">{{ row.items_summary }}</td>
                  <td style="padding:14px 16px;font-size:13px;color:#6B7280;">
                    {{ row.expected_dispatch_date ? (row.expected_dispatch_date | date:'dd MMM yyyy') : '—' }}
                  </td>
                  <td style="padding:14px 16px;text-align:center;">
                    <button (click)="togglePacked(row)"
                            style="width:32px;height:32px;border-radius:8px;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all 0.15s;"
                            [style.background]="row.is_packed ? '#dcfce7' : '#f3f4f6'"
                            [title]="row.is_packed ? 'Mark as unpacked' : 'Mark as packed'">
                      <span class="material-icons-round" style="font-size:18px;"
                            [style.color]="row.is_packed ? '#15803d' : '#9CA3AF'">
                        {{ row.is_packed ? 'check_box' : 'check_box_outline_blank' }}
                      </span>
                    </button>
                  </td>
                  <td style="padding:14px 16px;text-align:center;">
                    <button (click)="toggleDispatched(row)"
                            [disabled]="!row.is_packed"
                            style="width:32px;height:32px;border-radius:8px;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all 0.15s;"
                            [style.background]="row.is_dispatched ? '#dbeafe' : '#f3f4f6'"
                            [style.opacity]="!row.is_packed ? '0.4' : '1'"
                            [title]="!row.is_packed ? 'Pack first before dispatching' : row.is_dispatched ? 'Mark as undispatched' : 'Mark as dispatched'">
                      <span class="material-icons-round" style="font-size:18px;"
                            [style.color]="row.is_dispatched ? '#1d4ed8' : '#9CA3AF'">
                        local_shipping
                      </span>
                    </button>
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
export class DispatchComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);

  loading = signal(true);
  rows    = signal<DispatchRow[]>([]);

  packedCount     = () => this.rows().filter(r => r.is_packed).length;
  dispatchedCount = () => this.rows().filter(r => r.is_dispatched).length;
  pendingCount    = () => this.rows().filter(r => !r.is_packed).length;

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    const { data, error } = await this.supabase.client
      .from('gg_invoices')
      .select('id, invoice_number, customer_name, is_packed, is_dispatched, expected_dispatch_date, created_at, items')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('Dispatch load error:', error);
      this.loading.set(false);
      return;
    }

    this.rows.set((data ?? []).map((d: any) => ({
      id:                     d.id,
      invoice_number:         d.invoice_number ?? '—',
      customer_name:          d.customer_name ?? '—',
      is_packed:              d.is_packed ?? false,
      is_dispatched:          d.is_dispatched ?? false,
      expected_dispatch_date: d.expected_dispatch_date ?? null,
      created_at:             d.created_at,
      items_summary:          this.summariseItems(d.items),
    })));
    this.loading.set(false);
  }

  async togglePacked(row: DispatchRow): Promise<void> {
    const next = !row.is_packed;
    const update: any = { is_packed: next };
    if (!next) update.is_dispatched = false;
    await this.supabase.client.from('gg_invoices').update(update).eq('id', row.id);
    this.rows.update(list => list.map(r =>
      r.id === row.id ? { ...r, is_packed: next, is_dispatched: next ? r.is_dispatched : false } : r
    ));
  }

  async toggleDispatched(row: DispatchRow): Promise<void> {
    if (!row.is_packed) return;
    const next = !row.is_dispatched;
    await this.supabase.client.from('gg_invoices').update({ is_dispatched: next }).eq('id', row.id);
    this.rows.update(list => list.map(r => r.id === row.id ? { ...r, is_dispatched: next } : r));
  }

  private summariseItems(items: any): string {
    if (!Array.isArray(items) || items.length === 0) return '—';
    return items.map((i: any) => `${i.flavor_name ?? i.flavor_id}: ${i.quantity_units ?? 0} units`).join(', ');
  }
}
