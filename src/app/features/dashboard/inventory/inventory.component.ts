import { Component, OnDestroy, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from '../../../core/supabase.service';

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface BatchDetail {
  batchCode: string;
  boxesPacked: number;
  netStock: number;   // packed − dispatched (physically here)
  reserved: number;   // boxes committed to packed-but-not-dispatched invoices
  available: number;  // netStock − reserved (sellable now)
}

interface ReservedInvoice {
  invoice_number: string;
  customer_name: string;
  boxes_reserved: number;
  boxes_needed: number;       // from gg_invoices.items[flavor].quantity_boxes
  status: 'full' | 'partial'; // full = reserved >= needed, partial = reserved < needed
}

interface FlavorGroup {
  flavorId: string;
  flavorName: string;
  totalPacked: number;
  totalDispatched: number;
  netStock: number;       // totalPacked − totalDispatched
  totalReserved: number;  // sum of staged dispatch_events for this flavor
  available: number;      // netStock − totalReserved
  batches: BatchDetail[];
  reservedInvoices: ReservedInvoice[];  // who's holding the reservation
}

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, DecimalPipe],
  template: `
    <div style="padding:24px;max-width:1100px;">
      <div style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="font-family:'Cabin',sans-serif;font-size:22px;font-weight:700;color:#121212;margin:0 0 4px;">Inventory</h1>
          <p style="color:#6B7280;font-size:14px;margin:0;">Net box stock by flavor — only <strong>Available</strong> is shown at a glance. Expand a row for Packed, Dispatched, Net Stock and Reserved.</p>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#374151;cursor:pointer;background:#f3f4f6;border:1px solid #E5E7EB;border-radius:8px;padding:7px 12px;">
            <input type="checkbox" [checked]="showOnlyLow()" (change)="toggleShowOnlyLow()">
            Show only low (≤ {{ LOW_THRESHOLD }})
          </label>
          <button (click)="loadData()" style="padding:8px 16px;background:#f3f4f6;border:1px solid #E5E7EB;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:6px;color:#374151;">
            <span class="material-icons-round" style="font-size:16px;">refresh</span>
            Refresh
          </button>
        </div>
      </div>

      <!-- Date range filter -->
      <div style="margin-bottom:20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:8px;">
          <label style="font-size:13px;font-weight:600;color:#6B7280;white-space:nowrap;">From</label>
          <input type="date" [value]="fromDate()"
                 (change)="onFromDateChange($event)"
                 style="padding:7px 10px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px;color:#374151;background:#fff;cursor:pointer;outline:none;">
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <label style="font-size:13px;font-weight:600;color:#6B7280;white-space:nowrap;">To</label>
          <input type="date" [value]="toDate()"
                 (change)="onToDateChange($event)"
                 style="padding:7px 10px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px;color:#374151;background:#fff;cursor:pointer;outline:none;">
        </div>
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
      } @else if (filteredFlavors().length === 0 && showOnlyLow()) {
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div style="display:flex;align-items:center;gap:10px;color:#15803d;">
            <span class="material-icons-round" style="font-size:22px;">check_circle</span>
            <span style="font-size:14px;font-weight:600;">All flavours above {{ LOW_THRESHOLD }}.</span>
          </div>
          <button (click)="toggleShowOnlyLow()" style="background:none;border:none;color:#15803d;font-size:13px;font-weight:600;cursor:pointer;text-decoration:underline;">Show all</button>
        </div>
      } @else {
        <div style="background:#fff;border-radius:12px;border:1px solid #E5E7EB;overflow:hidden;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#f8f9fa;border-bottom:1px solid #E5E7EB;">
                <th style="text-align:left;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;width:40px;"></th>
                <th style="text-align:left;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">Flavor Name</th>
                <th (click)="cycleSort()"
                    style="text-align:right;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;cursor:pointer;user-select:none;">
                  <span style="display:inline-flex;align-items:center;gap:4px;">
                    Available
                    <span class="material-icons-round" style="font-size:14px;"
                          [style.color]="sortDir() ? '#01AC51' : '#9CA3AF'">
                      {{ sortDir() === 'asc' ? 'arrow_upward' : sortDir() === 'desc' ? 'arrow_downward' : 'unfold_more' }}
                    </span>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              @for (fg of filteredFlavors(); track fg.flavorId) {
                <!-- Flavor row -->
                <tr style="border-bottom:1px solid #f3f4f6;cursor:pointer;transition:background 0.1s;"
                    [style.background]="rowBackground(fg)"
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
                    <span style="display:inline-flex;align-items:center;gap:6px;justify-content:flex-end;">
                      @if (isOut(fg)) {
                        <span class="material-icons-round" style="font-size:16px;color:#dc2626;" title="Out of stock">dangerous</span>
                      } @else if (isLow(fg)) {
                        <span class="material-icons-round" style="font-size:16px;color:#ea580c;" title="Low stock">warning_amber</span>
                      }
                      <span style="font-size:14px;font-weight:700;"
                            [style.color]="isOut(fg) ? '#dc2626' : isLow(fg) ? '#ea580c' : '#01AC51'">
                        {{ fg.available | number:'1.0-0' }}
                      </span>
                    </span>
                  </td>
                </tr>

                <!-- Expanded session detail rows -->
                @if (expandedFlavorId() === fg.flavorId) {
                  <tr>
                    <td colspan="3" style="padding:0;background:#f8f9fa;border-bottom:1px solid #E5E7EB;">
                      <div style="padding:0 16px 12px 60px;">
                        <p style="font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.5px;margin:14px 0 6px;">Batches</p>
                        <table style="width:100%;border-collapse:collapse;margin-top:4px;">
                          <thead>
                            <tr style="border-bottom:1px solid #E5E7EB;">
                              <th style="text-align:left;padding:6px 12px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;">Batch Code</th>
                              <th style="text-align:right;padding:6px 12px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;">Packed</th>
                              <th style="text-align:right;padding:6px 12px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;">Dispatched</th>
                              <th style="text-align:right;padding:6px 12px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;">Net Stock</th>
                              <th style="text-align:right;padding:6px 12px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;">Reserved</th>
                              <th style="text-align:right;padding:6px 12px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;">Available</th>
                            </tr>
                          </thead>
                          <tbody>
                            @for (b of relevantBatches(fg.batches); track b.batchCode) {
                              <tr style="border-bottom:1px solid #f3f4f6;">
                                <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#374151;font-family:monospace;">{{ b.batchCode }}</td>
                                <td style="padding:8px 12px;text-align:right;font-size:12px;color:#374151;">
                                  {{ b.boxesPacked | number:'1.0-0' }}
                                </td>
                                <td style="padding:8px 12px;text-align:right;font-size:12px;color:#dc2626;">
                                  {{ (b.boxesPacked - b.netStock) | number:'1.0-0' }}
                                </td>
                                <td style="padding:8px 12px;text-align:right;font-size:12px;color:#374151;">
                                  {{ b.netStock | number:'1.0-0' }}
                                </td>
                                <td style="padding:8px 12px;text-align:right;font-size:12px;color:#b45309;">
                                  {{ b.reserved | number:'1.0-0' }}
                                </td>
                                <td style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600;"
                                    [style.color]="b.available > 0 ? '#01AC51' : b.available === 0 ? '#6B7280' : '#dc2626'">
                                  {{ b.available | number:'1.0-0' }}
                                </td>
                              </tr>
                            }
                          </tbody>
                        </table>

                        <!-- Reserved by invoice — only shown when there are reservations -->
                        @if (fg.reservedInvoices.length > 0) {
                          <p style="font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.5px;margin:14px 0 6px;">Reserved by invoice</p>
                          <table style="width:100%;border-collapse:collapse;margin-top:4px;">
                            <thead>
                              <tr style="border-bottom:1px solid #E5E7EB;">
                                <th style="text-align:left;padding:6px 12px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;">Invoice</th>
                                <th style="text-align:left;padding:6px 12px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;">Customer</th>
                                <th style="text-align:right;padding:6px 12px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;">Reserved / Needed</th>
                                <th style="text-align:center;padding:6px 12px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              @for (inv of fg.reservedInvoices; track inv.invoice_number) {
                                <tr style="border-bottom:1px solid #f3f4f6;">
                                  <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#374151;font-family:monospace;">{{ inv.invoice_number }}</td>
                                  <td style="padding:8px 12px;font-size:12px;color:#374151;">{{ inv.customer_name }}</td>
                                  <td style="padding:8px 12px;text-align:right;font-size:12px;font-weight:700;color:#b45309;">
                                    {{ inv.boxes_reserved | number:'1.0-0' }}
                                    @if (inv.boxes_needed > 0) {
                                      <span style="color:#9CA3AF;font-weight:500;"> / {{ inv.boxes_needed | number:'1.0-0' }}</span>
                                    }
                                  </td>
                                  <td style="padding:8px 12px;text-align:center;">
                                    @if (inv.status === 'partial') {
                                      <span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;background:#fef3c7;color:#b45309;text-transform:uppercase;letter-spacing:0.4px;">Partial</span>
                                    } @else {
                                      <span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;background:#dcfce7;color:#15803d;text-transform:uppercase;letter-spacing:0.4px;">Full</span>
                                    }
                                  </td>
                                </tr>
                              }
                            </tbody>
                          </table>
                        }
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
            {{ flavors().length }} flavour{{ flavors().length === 1 ? '' : 's' }}
            @if (lowCount() > 0) {
              <span style="color:#ea580c;font-weight:600;">· {{ lowCount() }} low</span>
            }
          </span>
          <span>Available total: <strong style="color:#01AC51;">{{ grandAvailable() | number:'1.0-0' }}</strong></span>
          <span style="color:#9CA3AF;">Expand a row for Packed / Dispatched / Net / Reserved.</span>
        </div>
      }
    </div>
  `,
})
export class InventoryComponent implements OnInit, OnDestroy {
  private readonly supabase = inject(SupabaseService);
  private channel: RealtimeChannel | null = null;
  private reloadDebounce: ReturnType<typeof setTimeout> | null = null;

  // Below this many "available" boxes a flavour is flagged low (inclusive of 100).
  readonly LOW_THRESHOLD = 100;

  loading = signal(true);
  flavors = signal<FlavorGroup[]>([]);
  expandedFlavorId = signal<string | null>(null);

  /** Toggle that filters the table to flavours with Available ≤ LOW_THRESHOLD. */
  showOnlyLow = signal(false);
  toggleShowOnlyLow(): void { this.showOnlyLow.update(v => !v); }

  /** Available-column sort state. null = default (alphabetical by name from the load). */
  sortDir = signal<'asc' | 'desc' | null>(null);
  cycleSort(): void {
    this.sortDir.update(d => d === null ? 'asc' : d === 'asc' ? 'desc' : null);
  }

  /** Single source of truth for the rendered list — applies filter + sort. */
  readonly filteredFlavors = computed(() => {
    let list = this.flavors();
    if (this.showOnlyLow()) list = list.filter(f => f.available <= this.LOW_THRESHOLD);
    const dir = this.sortDir();
    if (dir) {
      const mul = dir === 'asc' ? 1 : -1;
      list = [...list].sort((a, b) => (a.available - b.available) * mul);
    }
    return list;
  });

  readonly lowCount = computed(() =>
    this.flavors().filter(f => f.available <= this.LOW_THRESHOLD).length,
  );

  // ── Low-stock helpers ────────────────────────────────────────────────────
  isLow(fg: FlavorGroup): boolean { return fg.available > 0 && fg.available <= this.LOW_THRESHOLD; }
  isOut(fg: FlavorGroup): boolean { return fg.available <= 0; }

  rowBackground(fg: FlavorGroup): string {
    if (this.expandedFlavorId() === fg.flavorId) return '#f0fdf4';
    if (this.isOut(fg)) return '#fef2f2';
    if (this.isLow(fg)) return '#fffbeb';
    return '#fff';
  }

  fromDate = signal(fmtDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  toDate = signal(fmtDate(new Date()));

  readonly grandTotalPacked = computed(() =>
    this.flavors().reduce((s, fg) => s + fg.totalPacked, 0)
  );
  readonly grandTotalDispatched = computed(() =>
    this.flavors().reduce((s, fg) => s + fg.totalDispatched, 0)
  );
  readonly grandNetStock = computed(() =>
    this.flavors().reduce((s, fg) => s + fg.netStock, 0)
  );
  readonly grandTotalReserved = computed(() =>
    this.flavors().reduce((s, fg) => s + fg.totalReserved, 0)
  );
  readonly grandAvailable = computed(() =>
    this.flavors().reduce((s, fg) => s + fg.available, 0)
  );

  async ngOnInit(): Promise<void> {
    await this.loadData();
    this.subscribeRealtime();
  }

  ngOnDestroy(): void {
    if (this.reloadDebounce) {
      clearTimeout(this.reloadDebounce);
      this.reloadDebounce = null;
    }
    if (this.channel) {
      void this.supabase.client.removeChannel(this.channel);
      this.channel = null;
    }
  }

  /**
   * Live updates: any change to dispatch_events or packing_sessions
   * triggers a reload. Debounced 400ms so a burst of mobile dispatches
   * (e.g. 4 line items all flipping at once) only reloads once.
   */
  private subscribeRealtime(): void {
    this.channel = this.supabase.client
      .channel('inventory-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_events' },  () => this.scheduleReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'packing_sessions' }, () => this.scheduleReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gg_invoices' },       () => this.scheduleReload())
      .subscribe();
  }

  private scheduleReload(): void {
    if (this.reloadDebounce) clearTimeout(this.reloadDebounce);
    this.reloadDebounce = setTimeout(() => {
      this.reloadDebounce = null;
      void this.loadData();
    }, 400);
  }

  toggleExpand(flavorId: string): void {
    this.expandedFlavorId.update(id => (id === flavorId ? null : flavorId));
  }

  onFromDateChange(event: Event): void {
    this.fromDate.set((event.target as HTMLInputElement).value);
    this.loadData();
  }

  onToDateChange(event: Event): void {
    this.toDate.set((event.target as HTMLInputElement).value);
    this.loadData();
  }

  /**
   * Show batches that have either physical stock or active reservations.
   * Filters out fully-empty batches (nothing left, nothing reserved).
   */
  relevantBatches(batches: BatchDetail[]): BatchDetail[] {
    return batches.filter(b => b.netStock > 0 || b.reserved > 0);
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    const from = this.fromDate();
    const to = this.toDate();

    // ── 1. Fetch packing sessions filtered by date range ────────────
    const sessionsP = this.supabase.client
      .from('packing_sessions')
      .select('batch_code, boxes_packed, flavor_id, flavor:gg_flavors!packing_sessions_flavor_id_fkey(name)')
      .gte('session_date', from)
      .lte('session_date', to);

    // ── 2. Fetch ALL dispatch_events ─────────────────────────────────
    //   Mobile's submitBlueDispatch only flips gg_invoices.is_dispatched
    //   and leaves dispatch_events.is_dispatched untouched. So we can't
    //   trust the event's own flag — we bucket by the parent invoice's
    //   is_dispatched instead.
    //
    //   Includes invoice_number + customer_name so the expanded row can
    //   show "who is holding this reservation".
    const eventsP = this.supabase.client
      .from('dispatch_events')
      .select('flavor_id, sku_id, batch_code, boxes_dispatched, invoice_number, customer_name, dispatch_date, is_dispatched');

    // ── 3. Fetch invoice statuses + items ────────────────────────────
    //   Source of truth for "is this invoice dispatched yet?" plus the
    //   quantity_boxes per flavor (used to compute partial vs full pack
    //   in the Reserved-by-invoice expand).
    const invoicesP = this.supabase.client
      .from('gg_invoices')
      .select('invoice_number, is_packed, is_dispatched, items');

    const [{ data: sessions }, { data: allEvents }, { data: invoicesData }] =
      await Promise.all([sessionsP, eventsP, invoicesP]);

    // Map invoice_number → status flags + needed-boxes-per-flavor
    const invoiceStatus = new Map<
      string,
      { is_packed: boolean; is_dispatched: boolean; needsByFlavor: Map<string, number> }
    >();
    for (const inv of (invoicesData ?? []) as any[]) {
      const needsByFlavor = new Map<string, number>();
      const items = Array.isArray(inv.items) ? inv.items : [];
      for (const it of items) {
        const fid = String(it?.flavor_id ?? '');
        const need = Number(it?.quantity_boxes) || 0;
        if (!fid || need <= 0) continue;
        needsByFlavor.set(fid, (needsByFlavor.get(fid) ?? 0) + need);
      }
      invoiceStatus.set(inv.invoice_number, {
        is_packed: !!inv.is_packed,
        is_dispatched: !!inv.is_dispatched,
        needsByFlavor,
      });
    }

    // Walk every event once, bucket by its parent invoice's flags.
    const dispatchedMap      = new Map<string, number>();
    const batchDispatchedMap = new Map<string, number>();
    const reservedFlavorMap  = new Map<string, number>();
    const reservedBatchMap   = new Map<string, number>();
    const reservedInvoiceMap = new Map<string, Map<string, ReservedInvoice>>();

    for (const ev of (allEvents ?? []) as any[]) {
      const fid: string = ev.flavor_id ?? ev.sku_id ?? '';
      const bc:  string = ev.batch_code ?? '';
      const qty: number = Number(ev.boxes_dispatched) || 0;
      const inv: string = ev.invoice_number ?? '';
      const cust: string = ev.customer_name ?? '—';
      const date: string = ev.dispatch_date ?? '';
      if (!fid || qty <= 0) continue;

      // Determine bucket using BOTH flags (OR):
      //   Dispatched if event.is_dispatched=true (individual shipment) OR
      //                 invoice.is_dispatched=true (mobile blue dispatch
      //                                             flips invoice but not
      //                                             event flags).
      //   Reserved otherwise (covers BLUE fully-packed AND YELLOW partial).
      //
      // This handles the case where one event of a multi-flavor invoice is
      // already shipped (event flag true) but other flavors aren't yet, so
      // the invoice flag is still false. Without OR, the shipped event
      // would wrongly be counted as Reserved.
      const status = inv ? invoiceStatus.get(inv) : undefined;
      const invoiceDispatched = status ? status.is_dispatched : false;
      const eventDispatched   = !!ev.is_dispatched;
      const isDispatched      = invoiceDispatched || eventDispatched;

      if (isDispatched) {
        // DISPATCHED: applies date filter (only events shipped in range).
        if (date && date >= from && date <= to) {
          dispatchedMap.set(fid, (dispatchedMap.get(fid) ?? 0) + qty);
          if (bc) {
            const key = `${fid}|${bc}`;
            batchDispatchedMap.set(key, (batchDispatchedMap.get(key) ?? 0) + qty);
          }
        }
        continue;
      }

      // RESERVED: current-state, no date filter.
      reservedFlavorMap.set(fid, (reservedFlavorMap.get(fid) ?? 0) + qty);
      if (bc) {
        const key = `${fid}|${bc}`;
        reservedBatchMap.set(key, (reservedBatchMap.get(key) ?? 0) + qty);
      }
      if (inv) {
        if (!reservedInvoiceMap.has(fid)) reservedInvoiceMap.set(fid, new Map());
        const perFlavor = reservedInvoiceMap.get(fid)!;
        const existing = perFlavor.get(inv);
        if (existing) {
          existing.boxes_reserved += qty;
        } else {
          const needed = status?.needsByFlavor.get(fid) ?? 0;
          perFlavor.set(inv, {
            invoice_number: inv,
            customer_name: cust,
            boxes_reserved: qty,
            boxes_needed: needed,
            status: needed > 0 && qty < needed ? 'partial' : 'full',
          });
        }
      }
    }

    // After accumulation, recompute partial/full for each reserved invoice
    // since boxes_reserved may have summed across multiple events for the
    // same (flavor, invoice). Status depends on the final reserved total.
    for (const perFlavor of reservedInvoiceMap.values()) {
      for (const r of perFlavor.values()) {
        r.status = r.boxes_needed > 0 && r.boxes_reserved < r.boxes_needed ? 'partial' : 'full';
      }
    }

    // Aggregate packing sessions by flavor + batch
    const groupMap       = new Map<string, FlavorGroup>();
    const batchPackedMap = new Map<string, number>();

    for (const row of (sessions ?? []) as any[]) {
      const flavorId: string   = row.flavor_id ?? 'unknown';
      const flavorName: string = (row.flavor as any)?.name ?? 'Unknown';
      const boxesPacked: number = Number(row.boxes_packed) || 0;
      const batchCode: string  = row.batch_code ?? '—';
      const batchKey           = `${flavorId}|${batchCode}`;

      if (!groupMap.has(flavorId)) {
        groupMap.set(flavorId, {
          flavorId, flavorName,
          totalPacked: 0, totalDispatched: 0, netStock: 0,
          totalReserved: 0, available: 0,
          batches: [], reservedInvoices: [],
        });
      }
      groupMap.get(flavorId)!.totalPacked += boxesPacked;
      batchPackedMap.set(batchKey, (batchPackedMap.get(batchKey) ?? 0) + boxesPacked);
    }

    // Make sure flavors that ONLY have reservations (no packing in date range)
    // still appear so the user knows about the commitment.
    for (const fid of reservedFlavorMap.keys()) {
      if (!groupMap.has(fid)) {
        groupMap.set(fid, {
          flavorId: fid, flavorName: '(unknown — no recent packing)',
          totalPacked: 0, totalDispatched: 0, netStock: 0,
          totalReserved: 0, available: 0,
          batches: [], reservedInvoices: [],
        });
      }
    }

    // Build batch breakdown per flavor
    for (const [batchKey, packed] of batchPackedMap) {
      const sep       = batchKey.indexOf('|');
      const flavorId  = batchKey.substring(0, sep);
      const batchCode = batchKey.substring(sep + 1);
      const batchDispatched = batchDispatchedMap.get(batchKey) ?? 0;
      const batchReserved   = reservedBatchMap.get(batchKey) ?? 0;
      const netStock        = packed - batchDispatched;
      groupMap.get(flavorId)?.batches.push({
        batchCode,
        boxesPacked: packed,
        netStock,
        reserved: batchReserved,
        available: netStock - batchReserved,
      });
    }

    // Apply flavor-level totals + reservedInvoices breakdown
    for (const group of groupMap.values()) {
      group.totalDispatched = dispatchedMap.get(group.flavorId) ?? 0;
      group.totalReserved   = reservedFlavorMap.get(group.flavorId) ?? 0;
      group.netStock        = group.totalPacked - group.totalDispatched;
      group.available       = group.netStock - group.totalReserved;
      const invMap = reservedInvoiceMap.get(group.flavorId);
      group.reservedInvoices = invMap
        ? Array.from(invMap.values()).sort((a, b) => b.boxes_reserved - a.boxes_reserved)
        : [];
    }

    const sorted = Array.from(groupMap.values()).sort((a, b) =>
      a.flavorName.localeCompare(b.flavorName)
    );

    this.flavors.set(sorted);
    this.loading.set(false);
  }
}
