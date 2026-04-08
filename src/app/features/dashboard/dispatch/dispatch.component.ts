import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  imports: [CommonModule, DatePipe, FormsModule],
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

      <!-- FIFO Allocation Panel -->
      <div style="background:#fff;border-radius:14px;border:1px solid #E5E7EB;padding:20px;margin-bottom:24px;">
        <h2 style="font-size:15px;font-weight:700;color:#121212;margin:0 0 14px;display:flex;align-items:center;gap:8px;">
          <span class="material-icons-round" style="font-size:18px;color:#01AC51;">playlist_add_check</span>
          FIFO Batch Allocation
        </h2>
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">
          <div>
            <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px;">Flavor</label>
            <select [(ngModel)]="fifoFlavorId" class="gg-input dropdown-with-arrow" style="min-width:180px;font-size:13px;">
              <option value="">Select flavor…</option>
              @for (f of flavors(); track f.id) {
                <option [value]="f.id">{{ f.name }}</option>
              }
            </select>
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px;">Boxes Needed</label>
            <input [(ngModel)]="fifoBoxesNeeded" type="number" min="1" step="1"
                   class="gg-input" style="width:120px;font-size:13px;" placeholder="0">
          </div>
          <button (click)="computeFifo()" [disabled]="fifoComputing()"
                  style="padding:9px 18px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;height:38px;"
                  [style.opacity]="fifoComputing() ? '0.7' : '1'">
            <span class="material-icons-round" style="font-size:16px;">calculate</span>
            {{ fifoComputing() ? 'Computing…' : 'Compute FIFO' }}
          </button>
        </div>

        @if (fifoError()) {
          <div style="margin-top:12px;padding:10px 14px;background:#fff5f5;border:1px solid #fca5a5;border-radius:8px;color:#dc2626;font-size:13px;display:flex;align-items:center;gap:6px;">
            <span class="material-icons-round" style="font-size:16px;">error_outline</span>
            {{ fifoError() }}
          </div>
        }

        @if (fifoLines().length > 0) {
          <div style="margin-top:14px;border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;">
            <div style="display:grid;grid-template-columns:1fr 1fr 100px 100px;gap:8px;padding:8px 14px;background:#f8f9fa;border-bottom:1px solid #E5E7EB;">
              <span style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Batch Code</span>
              <span style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Production Date</span>
              <span style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;text-align:right;">Available</span>
              <span style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;text-align:right;">Take</span>
            </div>
            @for (line of fifoLines(); track line.batch_code) {
              <div style="display:grid;grid-template-columns:1fr 1fr 100px 100px;gap:8px;padding:10px 14px;border-bottom:1px solid #f3f4f6;align-items:center;">
                <span style="font-family:monospace;font-size:13px;font-weight:700;color:#121212;">{{ line.batch_code }}</span>
                <span style="font-size:13px;color:#374151;">{{ line.production_date | date:'dd MMM yyyy' }}</span>
                <span style="font-size:13px;color:#6B7280;text-align:right;">{{ line.boxes_available }} boxes</span>
                <span style="font-size:13px;font-weight:700;color:#01AC51;text-align:right;">{{ line.boxes_to_take }} boxes</span>
              </div>
            }
            <div style="display:grid;grid-template-columns:1fr 1fr 100px 100px;gap:8px;padding:8px 14px;background:#f0fdf4;">
              <span style="font-size:12px;font-weight:700;color:#374151;grid-column:span 3;">Total to dispatch</span>
              <span style="font-size:13px;font-weight:700;color:#15803d;text-align:right;">{{ fifoTotal() }} boxes</span>
            </div>
          </div>
        }
      </div>

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
interface FifoLine {
  batch_code: string;
  production_date: string;
  boxes_available: number;
  boxes_to_take: number;
}

export class DispatchComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);

  loading = signal(true);
  rows    = signal<DispatchRow[]>([]);

  // FIFO allocation state
  flavors         = signal<{ id: string; name: string }[]>([]);
  fifoFlavorId    = '';
  fifoBoxesNeeded: number | null = null;
  fifoLines       = signal<FifoLine[]>([]);
  fifoError       = signal('');
  fifoComputing   = signal(false);
  fifoTotal       = () => this.fifoLines().reduce((s, l) => s + l.boxes_to_take, 0);

  packedCount     = () => this.rows().filter(r => r.is_packed).length;
  dispatchedCount = () => this.rows().filter(r => r.is_dispatched).length;
  pendingCount    = () => this.rows().filter(r => !r.is_packed).length;

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadFlavors(), this.loadData()]);
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

  private async loadFlavors(): Promise<void> {
    const { data } = await this.supabase.client
      .from('gg_flavors')
      .select('id, name')
      .eq('active', true)
      .order('name');
    this.flavors.set(data ?? []);
  }

  async computeFifo(): Promise<void> {
    this.fifoError.set('');
    this.fifoLines.set([]);

    if (!this.fifoFlavorId) { this.fifoError.set('Select a flavor.'); return; }
    const needed = Number(this.fifoBoxesNeeded);
    if (!needed || needed <= 0) { this.fifoError.set('Enter a valid number of boxes.'); return; }

    this.fifoComputing.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('production_batches')
        .select('batch_code, production_date, expected_boxes')
        .eq('flavor_id', this.fifoFlavorId)
        .gt('expected_boxes', 0)
        .order('production_date', { ascending: true });

      if (error) { this.fifoError.set(error.message); return; }
      if (!data || data.length === 0) {
        this.fifoError.set('No production batches found for this flavor.');
        return;
      }

      let remaining = needed;
      const lines: FifoLine[] = [];
      for (const batch of data) {
        if (remaining <= 0) break;
        const available = batch.expected_boxes ?? 0;
        if (available <= 0) continue;
        const take = Math.min(available, remaining);
        lines.push({
          batch_code:       batch.batch_code,
          production_date:  batch.production_date,
          boxes_available:  available,
          boxes_to_take:    take,
        });
        remaining -= take;
      }

      if (remaining > 0) {
        this.fifoError.set(
          `Partial allocation only: ${needed - remaining} of ${needed} boxes available across all batches.`
        );
      }
      this.fifoLines.set(lines);
    } finally {
      this.fifoComputing.set(false);
    }
  }

  private summariseItems(items: any): string {
    if (!Array.isArray(items) || items.length === 0) return '—';
    return items.map((i: any) => `${i.flavor_name ?? i.flavor_id}: ${i.quantity_boxes ?? 0} boxes`).join(', ');
  }
}
