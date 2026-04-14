import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { SupabaseService } from '../../../core/supabase.service';

interface BatchDetail {
  batchCode: string;
  boxesPacked: number;
}

interface FlavorGroup {
  flavorId: string;
  flavorName: string;
  totalPacked: number;
  totalDispatched: number;
  netStock: number;
  batches: BatchDetail[];
}

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, DecimalPipe],
  template: `
    <div style="padding:24px;max-width:1100px;">
      <div style="margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="font-family:'Cabin',sans-serif;font-size:22px;font-weight:700;color:#121212;margin:0 0 4px;">Inventory</h1>
          <p style="color:#6B7280;font-size:14px;margin:0;">Net box stock by flavor. Packed from packing sessions minus dispatched via packed invoices. Click a row to expand.</p>
        </div>
        <button (click)="loadData()" style="padding:8px 16px;background:#f3f4f6;border:1px solid #E5E7EB;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:6px;color:#374151;">
          <span class="material-icons-round" style="font-size:16px;">refresh</span>
          Refresh
        </button>
      </div>

      @if (loading()) {
        <div style="display:flex;flex-direction:column;gap:10px;">
          @for (i of [1,2,3,4,5]; track i) {
            <div class="gg-skeleton" style="height:56px;border-radius:10px;"></div>
          }
        </div>
      } @else if (flavors().length === 0) {
        <div style="text-align:center;padding:60px 0;color:#9CA3AF;">
          <span class="material-icons-round" style="font-size:48px;display:block;margin-bottom:12px;">inventory_2</span>
          <p style="font-size:15px;margin:0;">No packing session data found.</p>
        </div>
      } @else {
        <div style="background:#fff;border-radius:12px;border:1px solid #E5E7EB;overflow:hidden;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#f8f9fa;border-bottom:1px solid #E5E7EB;">
                <th style="text-align:left;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;width:40px;"></th>
                <th style="text-align:left;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">Flavor Name</th>
                <th style="text-align:right;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">Packed</th>
                <th style="text-align:right;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">Dispatched</th>
                <th style="text-align:right;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">Net Stock</th>
              </tr>
            </thead>
            <tbody>
              @for (fg of flavors(); track fg.flavorId) {
                <!-- Flavor row -->
                <tr style="border-bottom:1px solid #f3f4f6;cursor:pointer;transition:background 0.1s;"
                    [style.background]="expandedFlavorId() === fg.flavorId ? '#f0fdf4' : '#fff'"
                    (click)="toggleExpand(fg.flavorId)">
                  <td style="padding:12px 16px;text-align:center;">
                    <span class="material-icons-round" style="font-size:16px;color:#6B7280;transition:transform 0.2s;"
                          [style.transform]="expandedFlavorId() === fg.flavorId ? 'rotate(90deg)' : 'rotate(0deg)'">
                      chevron_right
                    </span>
                  </td>
                  <td style="padding:12px 16px;">
                    <div style="display:flex;align-items:center;gap:10px;">
                      <div style="width:32px;height:32px;border-radius:8px;background:#dcfce7;display:flex;align-items:center;justify-content:center;">
                        <span class="material-icons-round" style="color:#15803d;font-size:16px;">local_dining</span>
                      </div>
                      <span style="font-size:14px;font-weight:600;color:#121212;">{{ fg.flavorName }}</span>
                    </div>
                  </td>
                  <td style="padding:12px 16px;text-align:right;">
                    <span style="font-size:14px;color:#374151;">{{ fg.totalPacked | number:'1.0-0' }}</span>
                  </td>
                  <td style="padding:12px 16px;text-align:right;">
                    <span style="font-size:14px;color:#dc2626;">{{ fg.totalDispatched | number:'1.0-0' }}</span>
                  </td>
                  <td style="padding:12px 16px;text-align:right;">
                    <span style="font-size:14px;font-weight:700;"
                          [style.color]="fg.netStock > 0 ? '#01AC51' : fg.netStock < 0 ? '#dc2626' : '#6B7280'">
                      {{ fg.netStock | number:'1.0-0' }}
                    </span>
                  </td>
                </tr>

                <!-- Expanded session detail rows -->
                @if (expandedFlavorId() === fg.flavorId) {
                  <tr>
                    <td colspan="5" style="padding:0;background:#f8f9fa;border-bottom:1px solid #E5E7EB;">
                      <div style="padding:0 16px 12px 60px;">
                        <p style="font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.5px;margin:10px 0 6px;">Batches</p>
                        <table style="width:100%;border-collapse:collapse;margin-top:4px;">
                          <thead>
                            <tr style="border-bottom:1px solid #E5E7EB;">
                              <th style="text-align:left;padding:6px 12px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;">Batch Code</th>
                              <th style="text-align:right;padding:6px 12px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;">Total Boxes Packed</th>
                            </tr>
                          </thead>
                          <tbody>
                            @for (b of fg.batches; track b.batchCode) {
                              <tr style="border-bottom:1px solid #f3f4f6;">
                                <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#374151;font-family:monospace;">{{ b.batchCode }}</td>
                                <td style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600;color:#374151;">{{ b.boxesPacked | number:'1.0-0' }}</td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>

        <!-- Summary -->
        <div style="margin-top:16px;display:flex;align-items:center;gap:16px;font-size:13px;color:#6B7280;flex-wrap:wrap;">
          <span style="display:flex;align-items:center;gap:6px;">
            <span class="material-icons-round" style="font-size:15px;">info_outline</span>
            {{ flavors().length }} flavor{{ flavors().length === 1 ? '' : 's' }}
          </span>
          <span>Total packed: <strong style="color:#374151;">{{ grandTotalPacked() | number:'1.0-0' }}</strong></span>
          <span>Total dispatched: <strong style="color:#dc2626;">{{ grandTotalDispatched() | number:'1.0-0' }}</strong></span>
          <span>Net stock: <strong style="color:#01AC51;">{{ grandNetStock() | number:'1.0-0' }}</strong></span>
        </div>
      }
    </div>
  `,
})
export class InventoryComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);

  loading = signal(true);
  flavors = signal<FlavorGroup[]>([]);
  expandedFlavorId = signal<string | null>(null);

  readonly grandTotalPacked = computed(() =>
    this.flavors().reduce((s, fg) => s + fg.totalPacked, 0)
  );
  readonly grandTotalDispatched = computed(() =>
    this.flavors().reduce((s, fg) => s + fg.totalDispatched, 0)
  );
  readonly grandNetStock = computed(() =>
    this.flavors().reduce((s, fg) => s + fg.netStock, 0)
  );

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  toggleExpand(flavorId: string): void {
    this.expandedFlavorId.update(id => (id === flavorId ? null : flavorId));
  }

  async loadData(): Promise<void> {
    this.loading.set(true);

    // ── 1. Fetch all packing sessions ───────────────────────────────
    const { data: sessions } = await this.supabase.client
      .from('packing_sessions')
      .select('batch_code, session_date, boxes_packed, flavor_id, flavor:gg_flavors!packing_sessions_flavor_id_fkey(id, name)')
      .order('session_date', { ascending: false });

    // ── 2. Fetch packed invoices and sum boxes per flavor ────────────
    const { data: invoices } = await this.supabase.client
      .from('gg_invoices')
      .select('items')
      .eq('is_packed', true);

    // Build dispatched map: flavorId → total boxes
    const dispatchedMap = new Map<string, number>();
    for (const inv of (invoices ?? []) as any[]) {
      const items: any[] = Array.isArray(inv.items) ? inv.items : [];
      for (const item of items) {
        const fid: string = item.flavor_id ?? '';
        const qty: number = Number(item.quantity_boxes) || 0;
        if (fid && qty > 0) {
          dispatchedMap.set(fid, (dispatchedMap.get(fid) ?? 0) + qty);
        }
      }
    }

    console.log('[Inventory] raw packing_sessions:', sessions);
    console.log('[Inventory] raw packed invoices:', invoices);
    console.log('[Inventory] dispatchedMap:', Object.fromEntries(dispatchedMap));

    // ── 3. Group packing sessions by flavor, then by batch_code ────────
    const groupMap = new Map<string, FlavorGroup>();
    for (const row of (sessions ?? []) as any[]) {
      const flavor = Array.isArray(row.flavor) ? row.flavor[0] : row.flavor;
      const flavorId: string = flavor?.id ?? row.flavor_id ?? 'unknown';
      const flavorName: string = flavor?.name ?? 'Unknown';
      const boxesPacked: number = Number(row.boxes_packed) || 0;
      const batchCode: string = row.batch_code ?? '—';

      if (!groupMap.has(flavorId)) {
        groupMap.set(flavorId, {
          flavorId,
          flavorName,
          totalPacked: 0,
          totalDispatched: 0,
          netStock: 0,
          batches: [],
        });
      }
      const group = groupMap.get(flavorId)!;
      group.totalPacked += boxesPacked;

      // Aggregate into existing batch row or create a new one
      const existing = group.batches.find(b => b.batchCode === batchCode);
      if (existing) {
        existing.boxesPacked += boxesPacked;
      } else {
        group.batches.push({ batchCode, boxesPacked });
      }
    }

    // ── 4. Apply dispatched totals and compute net ───────────────────
    for (const group of groupMap.values()) {
      group.totalDispatched = dispatchedMap.get(group.flavorId) ?? 0;
      group.netStock = group.totalPacked - group.totalDispatched;
    }

    // ── 5. Sort by flavor name ───────────────────────────────────────
    const sorted = Array.from(groupMap.values()).sort((a, b) =>
      a.flavorName.localeCompare(b.flavorName)
    );

    console.log('[Inventory] flavorGroups:', JSON.parse(JSON.stringify(sorted)));

    this.flavors.set(sorted);
    this.loading.set(false);
  }
}
