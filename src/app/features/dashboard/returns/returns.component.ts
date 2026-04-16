import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { SupabaseService } from '../../../core/supabase.service';

interface ReturnRow {
  id: string;
  batch_code: string;
  sku_id: string;
  qty_returned: number;
  reason: string | null;
  return_date: string;
  invoice_id: string | null;
  invoice_number: string;
  customer_name: string;
  flavor_name: string;
}

interface InvoiceSummary {
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  total_dispatched: number;
  total_returned: number;
  status: 'partially_returned' | 'completely_returned';
}

@Component({
  selector: 'app-returns',
  standalone: true,
  imports: [CommonModule, DatePipe],
  styles: [`
    .ret-card { background:#fff; border-radius:12px; border:1px solid #E5E7EB; padding:20px 24px; }
    .ret-toast { position:fixed; bottom:24px; right:24px; z-index:9999; padding:12px 18px; border-radius:10px; background:#1a1a1a; color:#fff; font-size:14px; font-weight:500; display:flex; align-items:center; gap:8px; box-shadow:0 4px 20px rgba(0,0,0,0.25); animation:slideUp 0.2s ease; }
    @keyframes slideUp { from { transform:translateY(16px); opacity:0; } to { transform:translateY(0); opacity:1; } }
  `],
  template: `
    <div style="padding:24px; max-width:1200px;">

      <!-- Header -->
      <div style="margin-bottom:24px;">
        <h1 style="font-family:'Cabin',sans-serif;font-size:22px;font-weight:700;color:#121212;margin:0 0 4px;">Returns</h1>
        <p style="color:#6B7280;font-size:14px;margin:0;">Track all product returns from customers.</p>
      </div>

      <!-- Summary Cards -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:28px;">

        <div class="ret-card">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <div style="width:36px;height:36px;border-radius:10px;background:#fef3c7;display:flex;align-items:center;justify-content:center;">
              <span class="material-icons-round" style="font-size:18px;color:#d97706;">assignment_return</span>
            </div>
            <span style="font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">Returns Today</span>
          </div>
          <div style="font-size:28px;font-weight:700;color:#121212;">{{ todayCount() }}</div>
          <div style="font-size:12px;color:#9CA3AF;margin-top:2px;">events recorded</div>
        </div>

        <div class="ret-card">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <div style="width:36px;height:36px;border-radius:10px;background:#fee2e2;display:flex;align-items:center;justify-content:center;">
              <span class="material-icons-round" style="font-size:18px;color:#dc2626;">inventory</span>
            </div>
            <span style="font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">Boxes This Month</span>
          </div>
          <div style="font-size:28px;font-weight:700;color:#121212;">{{ monthBoxes() }}</div>
          <div style="font-size:12px;color:#9CA3AF;margin-top:2px;">boxes returned</div>
        </div>

        <div class="ret-card">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <div style="width:36px;height:36px;border-radius:10px;background:#fff7ed;display:flex;align-items:center;justify-content:center;">
              <span class="material-icons-round" style="font-size:18px;color:#ea580c;">receipt_long</span>
            </div>
            <span style="font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">Invoices with Returns</span>
          </div>
          <div style="font-size:28px;font-weight:700;color:#121212;">{{ invoiceStatuses().length }}</div>
          <div style="font-size:12px;color:#9CA3AF;margin-top:2px;">affected invoices</div>
        </div>

      </div>

      <!-- Invoice Return Status Section -->
      @if (invoiceStatuses().length > 0) {
        <div class="ret-card" style="margin-bottom:24px;">
          <h2 style="font-size:14px;font-weight:700;color:#374151;margin:0 0 14px;display:flex;align-items:center;gap:8px;">
            <span class="material-icons-round" style="font-size:16px;color:#d97706;">warning</span>
            Invoice Return Status
          </h2>
          <div style="display:flex;flex-wrap:wrap;gap:10px;">
            @for (inv of invoiceStatuses(); track inv.invoice_id) {
              <div style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:10px;border:1px solid;"
                   [style.background]="inv.status === 'completely_returned' ? '#fff1f2' : '#fffbeb'"
                   [style.border-color]="inv.status === 'completely_returned' ? '#fecaca' : '#fde68a'">
                <span style="font-family:monospace;font-size:12px;font-weight:700;"
                      [style.color]="inv.status === 'completely_returned' ? '#dc2626' : '#92400e'">
                  {{ inv.invoice_number }}
                </span>
                <span style="font-size:12px;"
                      [style.color]="inv.status === 'completely_returned' ? '#dc2626' : '#92400e'">
                  {{ inv.customer_name }}
                </span>
                <span style="padding:3px 8px;border-radius:999px;font-size:10px;font-weight:700;"
                      [style.background]="inv.status === 'completely_returned' ? '#dc2626' : '#d97706'"
                      style="color:#fff;">
                  {{ inv.status === 'completely_returned' ? 'Completely Returned' : 'Partially Returned' }}
                </span>
                <span style="font-size:11px;"
                      [style.color]="inv.status === 'completely_returned' ? '#dc2626' : '#92400e'">
                  {{ inv.total_returned }}/{{ inv.total_dispatched }} boxes
                </span>
              </div>
            }
          </div>
        </div>
      }

      <!-- Returns Table -->
      @if (loading()) {
        <div style="display:flex;flex-direction:column;gap:10px;">
          @for (i of [1,2,3,4,5]; track i) {
            <div class="gg-skeleton" style="height:52px;border-radius:10px;"></div>
          }
        </div>
      } @else if (returns().length === 0) {
        <div style="text-align:center;padding:72px 0;color:#9CA3AF;">
          <span class="material-icons-round" style="font-size:52px;display:block;margin-bottom:14px;">assignment_return</span>
          <p style="font-size:15px;font-weight:600;margin:0 0 6px;color:#374151;">No returns recorded yet</p>
          <p style="font-size:13px;margin:0;">Returns will appear here once they are logged.</p>
        </div>
      } @else {
        <div class="ret-card" style="padding:0;overflow:hidden;">
          <div style="padding:16px 20px;border-bottom:1px solid #E5E7EB;display:flex;align-items:center;justify-content:space-between;">
            <h2 style="font-size:14px;font-weight:700;color:#374151;margin:0;">All Returns</h2>
            <span style="font-size:12px;color:#9CA3AF;">{{ returns().length }} record{{ returns().length === 1 ? '' : 's' }}</span>
          </div>
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="background:#f8f9fa;border-bottom:1px solid #E5E7EB;">
                  <th style="text-align:left;padding:11px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Invoice #</th>
                  <th style="text-align:left;padding:11px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Customer</th>
                  <th style="text-align:left;padding:11px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Batch Code</th>
                  <th style="text-align:left;padding:11px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Flavor</th>
                  <th style="text-align:right;padding:11px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Boxes Returned</th>
                  <th style="text-align:left;padding:11px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Reason</th>
                  <th style="text-align:left;padding:11px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Return Date</th>
                </tr>
              </thead>
              <tbody>
                @for (row of returns(); track row.id) {
                  <tr style="border-bottom:1px solid #f3f4f6;" onmouseover="this.style.background='#fafafa'" onmouseout="this.style.background='transparent'">
                    <td style="padding:12px 16px;">
                      <span style="font-family:monospace;font-size:13px;font-weight:700;color:#121212;">{{ row.invoice_number }}</span>
                    </td>
                    <td style="padding:12px 16px;font-size:13px;color:#374151;">{{ row.customer_name }}</td>
                    <td style="padding:12px 16px;">
                      <span style="font-family:monospace;font-size:12px;background:#f3f4f6;padding:3px 7px;border-radius:5px;color:#374151;">{{ row.batch_code }}</span>
                    </td>
                    <td style="padding:12px 16px;font-size:13px;color:#374151;">{{ row.flavor_name }}</td>
                    <td style="padding:12px 16px;text-align:right;">
                      <span style="font-size:13px;font-weight:700;color:#dc2626;">{{ row.qty_returned }}</span>
                    </td>
                    <td style="padding:12px 16px;font-size:13px;color:#6B7280;max-width:200px;">
                      {{ row.reason || '—' }}
                    </td>
                    <td style="padding:12px 16px;font-size:13px;color:#6B7280;white-space:nowrap;">
                      {{ row.return_date | date:'dd MMM yyyy' }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

    </div>
  `,
})
export class ReturnsComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);

  loading = signal(true);
  returns = signal<ReturnRow[]>([]);

  private dispatchedInvoices = signal<{ invoice_id: string; invoice_number: string; customer_name: string; total_dispatched: number }[]>([]);

  readonly todayCount = computed(() => {
    const today = new Date().toISOString().split('T')[0];
    return this.returns().filter(r => r.return_date === today).length;
  });

  readonly monthBoxes = computed(() => {
    const now = new Date();
    const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return this.returns()
      .filter(r => r.return_date.startsWith(prefix))
      .reduce((s, r) => s + r.qty_returned, 0);
  });

  readonly invoiceStatuses = computed((): InvoiceSummary[] => {
    // Aggregate returns by invoice_id
    const retMap = new Map<string, number>();
    for (const r of this.returns()) {
      if (!r.invoice_id) continue;
      retMap.set(r.invoice_id, (retMap.get(r.invoice_id) ?? 0) + r.qty_returned);
    }

    return this.dispatchedInvoices()
      .filter(inv => retMap.has(inv.invoice_id))
      .map(inv => {
        const total_returned = retMap.get(inv.invoice_id)!;
        return {
          invoice_id:       inv.invoice_id,
          invoice_number:   inv.invoice_number,
          customer_name:    inv.customer_name,
          total_dispatched: inv.total_dispatched,
          total_returned,
          status:           total_returned >= inv.total_dispatched
                              ? 'completely_returned'
                              : 'partially_returned',
        };
      })
      .sort((a, b) => a.invoice_number.localeCompare(b.invoice_number));
  });

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);

    // 1. Flavors lookup
    const { data: flavors } = await this.supabase.client
      .from('gg_flavors')
      .select('id, name');
    const flavorMap = new Map<string, string>(
      (flavors ?? []).map((f: any) => [f.id, f.name as string])
    );

    // 2. Dispatched invoices for status computation
    const { data: invoices } = await this.supabase.client
      .from('gg_invoices')
      .select('id, invoice_number, customer_name, items, is_dispatched')
      .eq('is_dispatched', true);

    const invoiceMap = new Map<string, any>(
      (invoices ?? []).map((inv: any) => [inv.id, inv])
    );

    this.dispatchedInvoices.set(
      (invoices ?? []).map((inv: any) => ({
        invoice_id:       inv.id,
        invoice_number:   inv.invoice_number,
        customer_name:    inv.customer_name ?? '—',
        total_dispatched: Array.isArray(inv.items)
          ? inv.items.reduce((s: number, it: any) => s + (Number(it.quantity_boxes) || 0), 0)
          : 0,
      }))
    );

    // 3. Returns events
    const { data: returnsData } = await this.supabase.client
      .from('returns_events')
      .select('id, batch_code, sku_id, qty_returned, reason, return_date, invoice_id')
      .order('return_date', { ascending: false })
      .limit(500);

    const rows: ReturnRow[] = (returnsData ?? []).map((r: any) => {
      const inv = r.invoice_id ? invoiceMap.get(r.invoice_id) : null;
      return {
        id:             r.id,
        batch_code:     r.batch_code ?? '—',
        sku_id:         r.sku_id,
        qty_returned:   r.qty_returned ?? 0,
        reason:         r.reason ?? null,
        return_date:    r.return_date,
        invoice_id:     r.invoice_id ?? null,
        invoice_number: inv?.invoice_number ?? '—',
        customer_name:  inv?.customer_name ?? '—',
        flavor_name:    flavorMap.get(r.sku_id) ?? r.sku_id ?? '—',
      };
    });

    this.returns.set(rows);
    this.loading.set(false);
  }
}
