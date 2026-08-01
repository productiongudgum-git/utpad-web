import { Component, OnDestroy, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from '../../../core/supabase.service';
import { AuthService } from '../../../core/auth/auth.service';
import {
  planInventoryReset,
  batchCodeToTimestamp,
  ResetBatchInput,
  ResetRowInput,
  ResetPlan,
} from './inventory-reset';

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * INVENTORY STOCK MODEL (all-time balance, not per-period)
 * ────────────────────────────────────────────────────────
 * Stock is a running balance across ALL history. The date pickers do NOT
 * affect the stock math — they only drive the "Dispatched (in period)"
 * movement column.
 *
 * For each (flavor, batch), summed over all time:
 *   packed    = Σ packing_sessions.boxes_packed  (incl. opening-stock rows)
 *   shipped   = Σ dispatch_events.boxes_dispatched  where the event is DISPATCHED
 *   reserved  = Σ dispatch_events.boxes_dispatched  where the event is RESERVED
 *   returned  = Σ returns_events.qty_returned
 *
 * A dispatch_event counts as DISPATCHED when event.is_dispatched = true OR its
 * parent invoice (matched by invoice_number) has is_dispatched = true (mobile's
 * "blue dispatch" flips the invoice flag but not the event flag). Otherwise it
 * is RESERVED (committed to an order, still physically in the warehouse).
 *
 * Derived:
 *   onHand    = packed − shipped + returned      (physically on the shelf)
 *   available = onHand − reserved                (sellable right now)
 *
 * Returns fold straight back into sellable stock (business decision).
 * Negatives are shown (in red) as a warning, never clamped to 0 — clamping is
 * what hid the old bugs. Flavor totals are plain sums of their batch rows, so
 * the header can never disagree with the expanded detail.
 */

interface BatchDetail {
  batchCode: string;
  packed: number;
  shipped: number;              // all-time dispatched
  returned: number;             // all-time returned
  onHand: number;               // packed − shipped + returned
  reserved: number;             // committed, not yet shipped
  available: number;            // onHand − reserved
  dispatchedInPeriod: number;   // movement column — shipped within [from, to]
  /** Earliest session_date in the batch — matches the ops-api FIFO grouping. */
  sessionDate: string;
  /** Underlying packing_sessions rows, so a reset can target real (batch, production_batch) pairs. */
  rows: ResetRowInput[];
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
  totalShipped: number;
  totalReturned: number;
  onHand: number;               // totalPacked − totalShipped + totalReturned
  totalReserved: number;
  available: number;            // onHand − totalReserved
  dispatchedInPeriod: number;   // sum of batch dispatchedInPeriod
  batches: BatchDetail[];
  reservedInvoices: ReservedInvoice[];  // who's holding the reservation
}

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, DecimalPipe, FormsModule],
  template: `
    <div style="padding:24px;max-width:1100px;">
      <div style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="font-family:'Cabin',sans-serif;font-size:22px;font-weight:700;color:#121212;margin:0 0 4px;">Inventory</h1>
          <p style="color:#6B7280;font-size:14px;margin:0;">Live sellable stock by flavor. <strong>Available</strong> is always current (all-time). Expand a row for Packed, Dispatched, Returned, On-hand and Reserved.</p>
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

      <!-- Movement period filter — affects ONLY the "Dispatched (in period)" figure. Stock is always live. -->
      <div style="margin-bottom:20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:#f8f9fa;border:1px solid #E5E7EB;border-radius:8px;padding:10px 14px;">
        <span style="font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.4px;">Movement period</span>
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
        <span style="font-size:12px;color:#9CA3AF;">Only the “Dispatched (period)” column uses these dates — Available is always all-time.</span>
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
          <p style="font-size:15px;margin:0;">No stock data found.</p>
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
                        <span class="material-icons-round" style="font-size:16px;color:#dc2626;" title="Out of stock / oversold">dangerous</span>
                      } @else if (isLow(fg)) {
                        <span class="material-icons-round" style="font-size:16px;color:#ea580c;" title="Low stock">warning_amber</span>
                      }
                      <span style="font-size:14px;font-weight:700;"
                            [style.color]="fg.available < 0 ? '#dc2626' : isOut(fg) ? '#dc2626' : isLow(fg) ? '#ea580c' : '#01AC51'">
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
                        <!-- Flavor-level summary line -->
                        <div style="display:flex;flex-wrap:wrap;gap:16px;margin:14px 0 4px;font-size:12px;color:#6B7280;">
                          <span>Packed: <strong style="color:#374151;">{{ fg.totalPacked | number:'1.0-0' }}</strong></span>
                          <span>Dispatched: <strong style="color:#dc2626;">{{ fg.totalShipped | number:'1.0-0' }}</strong></span>
                          <span>Returned: <strong style="color:#2563eb;">{{ fg.totalReturned | number:'1.0-0' }}</strong></span>
                          <span>On-hand: <strong [style.color]="fg.onHand < 0 ? '#dc2626' : '#374151'">{{ fg.onHand | number:'1.0-0' }}</strong></span>
                          <span>Reserved: <strong style="color:#b45309;">{{ fg.totalReserved | number:'1.0-0' }}</strong></span>
                          <span style="color:#9CA3AF;">Dispatched {{ fromDate() }} → {{ toDate() }}: <strong style="color:#374151;">{{ fg.dispatchedInPeriod | number:'1.0-0' }}</strong></span>
                        </div>

                        @if (isAdmin()) {
                          <button (click)="openReset(fg, $event)"
                                  style="margin-top:10px;padding:6px 12px;background:#fff;border:1px solid #E5E7EB;border-radius:8px;font-size:12px;font-weight:600;color:#b45309;cursor:pointer;display:inline-flex;align-items:center;gap:6px;">
                            <span class="material-icons-round" style="font-size:14px;">restart_alt</span>
                            Reset stock
                          </button>
                        }

                        <p style="font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.5px;margin:14px 0 6px;">Batches</p>
                        <table style="width:100%;border-collapse:collapse;margin-top:4px;">
                          <thead>
                            <tr style="border-bottom:1px solid #E5E7EB;">
                              <th style="text-align:left;padding:6px 12px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;">Batch Code</th>
                              <th style="text-align:right;padding:6px 12px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;">Packed</th>
                              <th style="text-align:right;padding:6px 12px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;">Dispatched</th>
                              <th style="text-align:right;padding:6px 12px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;">Returned</th>
                              <th style="text-align:right;padding:6px 12px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;">On-hand</th>
                              <th style="text-align:right;padding:6px 12px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;">Reserved</th>
                              <th style="text-align:right;padding:6px 12px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;">Available</th>
                            </tr>
                          </thead>
                          <tbody>
                            @for (b of relevantBatches(fg.batches); track b.batchCode) {
                              <tr style="border-bottom:1px solid #f3f4f6;">
                                <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#374151;font-family:monospace;">{{ b.batchCode }}</td>
                                <td style="padding:8px 12px;text-align:right;font-size:12px;color:#374151;">
                                  {{ b.packed | number:'1.0-0' }}
                                </td>
                                <td style="padding:8px 12px;text-align:right;font-size:12px;color:#dc2626;">
                                  {{ b.shipped | number:'1.0-0' }}
                                </td>
                                <td style="padding:8px 12px;text-align:right;font-size:12px;color:#2563eb;">
                                  {{ b.returned | number:'1.0-0' }}
                                </td>
                                <td style="padding:8px 12px;text-align:right;font-size:12px;"
                                    [style.color]="b.onHand < 0 ? '#dc2626' : '#374151'">
                                  {{ b.onHand | number:'1.0-0' }}
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
            @if (negativeCount() > 0) {
              <span style="color:#dc2626;font-weight:600;">· {{ negativeCount() }} oversold</span>
            }
          </span>
          <span>Available total: <strong style="color:#01AC51;">{{ grandAvailable() | number:'1.0-0' }}</strong></span>
          <span style="color:#9CA3AF;">Dispatched in period: <strong style="color:#374151;">{{ grandDispatchedInPeriod() | number:'1.0-0' }}</strong></span>
        </div>
      }

      <!-- ── Reset stock dialog (admin) ────────────────────────────────────── -->
      @if (resetTarget(); as rt) {
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px;"
             (click)="closeReset()">
          <div style="background:#fff;border-radius:14px;max-width:620px;width:100%;max-height:88vh;overflow-y:auto;box-shadow:0 20px 40px rgba(0,0,0,0.2);"
               (click)="$event.stopPropagation()">

            <div style="padding:20px 22px 14px;border-bottom:1px solid #E5E7EB;">
              <h2 style="font-family:'Cabin',sans-serif;font-size:18px;font-weight:700;color:#121212;margin:0 0 4px;">Reset stock — {{ rt.flavorName }}</h2>
              <p style="color:#6B7280;font-size:13px;margin:0;">
                Keeps the newest boxes and resets the rest, following the same FIFO order dispatch uses.
              </p>
            </div>

            <div style="padding:18px 22px;">
              <!-- Current state -->
              <div style="display:flex;gap:18px;flex-wrap:wrap;background:#f8f9fa;border:1px solid #E5E7EB;border-radius:8px;padding:12px 14px;font-size:13px;color:#6B7280;">
                <span>On-hand: <strong style="color:#374151;">{{ rt.onHand | number:'1.0-0' }}</strong></span>
                <span>Reserved: <strong style="color:#b45309;">{{ rt.totalReserved | number:'1.0-0' }}</strong></span>
                <span>Available: <strong style="color:#01AC51;">{{ rt.available | number:'1.0-0' }}</strong></span>
              </div>

              @if (rt.totalReserved > 0) {
                <p style="font-size:12px;color:#6B7280;margin:10px 0 0;line-height:1.5;">
                  <strong style="color:#b45309;">{{ rt.totalReserved | number:'1.0-0' }}</strong> boxes are reserved against open invoices.
                  Reserved stock is excluded from Available, so a reset never touches it — on-hand will settle at your target plus {{ rt.totalReserved | number:'1.0-0' }}.
                </p>
              }

              <!-- Target -->
              <label style="display:block;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.4px;margin:18px 0 6px;">
                Reset available to
              </label>
              <input type="number" min="0" step="1" [value]="resetInput()" (input)="onResetInput($event)"
                     placeholder="e.g. 600" autofocus
                     style="width:100%;padding:10px 12px;border:1px solid #E5E7EB;border-radius:8px;font-size:15px;color:#121212;outline:none;box-sizing:border-box;">

              @if (resetPlan(); as plan) {
                @if (!plan.ok) {
                  <div style="margin-top:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 12px;font-size:13px;color:#991b1b;line-height:1.5;">
                    {{ plan.error }}
                  </div>
                } @else {
                  @for (w of plan.warnings; track w) {
                    <div style="margin-top:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;font-size:12px;color:#92400e;line-height:1.5;">
                      {{ w }}
                    </div>
                  }

                  <div style="margin-top:14px;display:flex;gap:16px;flex-wrap:wrap;font-size:13px;">
                    <span style="color:#6B7280;">Keeping <strong style="color:#01AC51;">{{ plan.target | number:'1.0-0' }}</strong></span>
                    <span style="color:#6B7280;">Resetting <strong style="color:#dc2626;">{{ plan.totalReset | number:'1.0-0' }}</strong></span>
                  </div>

                  <p style="font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.5px;margin:14px 0 6px;">Preview — newest first</p>
                  <table style="width:100%;border-collapse:collapse;">
                    <thead>
                      <tr style="border-bottom:1px solid #E5E7EB;">
                        <th style="text-align:left;padding:6px 10px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;">Batch</th>
                        <th style="text-align:left;padding:6px 10px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;">Packed on</th>
                        <th style="text-align:right;padding:6px 10px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;">Available</th>
                        <th style="text-align:right;padding:6px 10px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;">Keep</th>
                        <th style="text-align:right;padding:6px 10px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;">Reset</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (b of planRows(plan); track b.batchCode) {
                        <tr style="border-bottom:1px solid #f3f4f6;"
                            [style.background]="b.reset > 0 && b.keep === 0 ? '#fef2f2' : b.reset > 0 ? '#fffbeb' : 'transparent'">
                          <td style="padding:7px 10px;font-size:12px;font-weight:600;color:#374151;font-family:monospace;">{{ b.batchCode }}</td>
                          <td style="padding:7px 10px;font-size:12px;color:#9CA3AF;">{{ b.sessionDate || '—' }}</td>
                          <td style="padding:7px 10px;text-align:right;font-size:12px;color:#374151;">{{ b.availableBefore | number:'1.0-0' }}</td>
                          <td style="padding:7px 10px;text-align:right;font-size:12px;font-weight:600;color:#01AC51;">{{ b.keep | number:'1.0-0' }}</td>
                          <td style="padding:7px 10px;text-align:right;font-size:12px;font-weight:600;"
                              [style.color]="b.reset > 0 ? '#dc2626' : '#9CA3AF'">{{ b.reset | number:'1.0-0' }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                }
              }

              @if (resetError()) {
                <div style="margin-top:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 12px;font-size:13px;color:#991b1b;line-height:1.5;">
                  {{ resetError() }}
                </div>
              }
            </div>

            <div style="padding:14px 22px 20px;border-top:1px solid #E5E7EB;display:flex;justify-content:flex-end;gap:10px;">
              <button (click)="closeReset()" [disabled]="resetBusy()"
                      style="padding:9px 16px;background:#fff;border:1px solid #E5E7EB;border-radius:8px;font-size:14px;font-weight:500;color:#374151;cursor:pointer;">
                Cancel
              </button>
              <button (click)="confirmReset()"
                      [disabled]="resetBusy() || !resetPlan()?.ok"
                      [style.opacity]="(resetBusy() || !resetPlan()?.ok) ? '0.5' : '1'"
                      [style.cursor]="(resetBusy() || !resetPlan()?.ok) ? 'not-allowed' : 'pointer'"
                      style="padding:9px 16px;background:#dc2626;border:1px solid #dc2626;border-radius:8px;font-size:14px;font-weight:600;color:#fff;">
                {{ resetBusy() ? 'Resetting…' : 'Reset stock' }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class InventoryComponent implements OnInit, OnDestroy {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private channel: RealtimeChannel | null = null;
  private reloadDebounce: ReturnType<typeof setTimeout> | null = null;

  // ── Stock reset (admin only) ─────────────────────────────────────────────
  /** Only the admin role may correct stock. gg_users has exactly one admin. */
  readonly isAdmin = computed(() => this.auth.currentUser()?.role === 'admin');

  /**
   * Flavour id whose reset dialog is open, or null when closed.
   *
   * The ID rather than the FlavorGroup itself: a realtime dispatch or packing
   * event reloads the table and replaces every FlavorGroup object, so holding
   * the object would leave the dialog planning against stock figures that have
   * since moved. Re-deriving from flavors() keeps the preview live.
   */
  resetFlavorId = signal<string | null>(null);
  readonly resetTarget = computed<FlavorGroup | null>(() => {
    const id = this.resetFlavorId();
    if (!id) return null;
    return this.flavors().find(f => f.flavorId === id) ?? null;
  });

  /** Raw text of the target input — kept as a string so an empty box isn't 0. */
  resetInput = signal('');
  resetBusy = signal(false);
  resetError = signal('');

  /**
   * Live plan for the open dialog. Recomputes on every keystroke — and on every
   * realtime stock change — so the admin sees which batches survive before
   * anything is written.
   */
  readonly resetPlan = computed<ResetPlan | null>(() => {
    const fg = this.resetTarget();
    if (!fg) return null;
    const raw = this.resetInput().trim();
    if (raw === '') return null;
    const target = Number(raw);
    return planInventoryReset(this.toResetBatches(fg), target);
  });

  private toResetBatches(fg: FlavorGroup): ResetBatchInput[] {
    return fg.batches.map(b => ({
      batchCode: b.batchCode,
      sessionDate: b.sessionDate,
      available: b.available,
      reserved: b.reserved,
      rows: b.rows,
    }));
  }

  openReset(fg: FlavorGroup, event: Event): void {
    event.stopPropagation();   // don't collapse the row behind the dialog
    this.resetFlavorId.set(fg.flavorId);
    this.resetInput.set('');
    this.resetError.set('');
  }

  closeReset(): void {
    if (this.resetBusy()) return;   // never abandon a half-written reset
    this.resetFlavorId.set(null);
    this.resetInput.set('');
    this.resetError.set('');
  }

  onResetInput(event: Event): void {
    this.resetInput.set((event.target as HTMLInputElement).value);
    this.resetError.set('');
  }

  /** Batches shown in the preview: newest first, matching the plan's order. */
  planRows(plan: ResetPlan) {
    return plan.batches.filter(b => b.availableBefore !== 0 || b.reset !== 0);
  }

  /**
   * Write the reset: negative adjustment rows first, then the audit row.
   *
   * The adjustments are inserted as one statement so a partial correction can't
   * land. If the audit insert fails afterwards the stock figures are still
   * correct — we surface that rather than rolling back, because silently
   * undoing a stock correction the admin just confirmed is worse than an
   * audit gap.
   */
  async confirmReset(): Promise<void> {
    const fg = this.resetTarget();
    const plan = this.resetPlan();
    if (!fg || !plan || !plan.ok || this.resetBusy()) return;

    // Re-check the arithmetic against the plan we are about to write.
    const adjTotal = plan.adjustments.reduce((s, a) => s + a.boxes, 0);
    if (adjTotal !== plan.totalReset) {
      this.resetError.set('Safety check failed — nothing was written. Refresh and try again.');
      return;
    }

    this.resetBusy.set(true);
    this.resetError.set('');

    try {
      let insertedIds: string[] = [];

      if (plan.adjustments.length > 0) {
        const rows = plan.adjustments.map(a => ({
          flavor_id: fg.flavorId,
          batch_code: a.batchCode,
          production_batch_id: a.productionBatchId,
          // The offset row's own date, never today — dashboard-home sums
          // packing_sessions where session_date = today for "packed today".
          session_date: a.sessionDate || null,
          boxes_packed: -a.boxes,
          status: 'reset-adjustment',
        }));

        const { data, error } = await this.supabase.client
          .from('packing_sessions')
          .insert(rows)
          .select('id');
        if (error) throw new Error(error.message);
        insertedIds = ((data ?? []) as Array<{ id: string }>).map(r => r.id);
      }

      const { error: auditError } = await this.supabase.client
        .from('inventory_resets')
        .insert({
          flavor_id: fg.flavorId,
          flavor_name: fg.flavorName,
          previous_available: plan.currentAvailable,
          target_available: plan.target,
          boxes_reset: plan.totalReset,
          batch_breakdown: plan.batches.map(b => ({
            batch_code: b.batchCode,
            session_date: b.sessionDate,
            available_before: b.availableBefore,
            keep: b.keep,
            reset: b.reset,
          })),
          adjustment_session_ids: insertedIds,
          created_by: this.auth.currentUser()?.username ?? '',
        });

      if (auditError) {
        // Stock is already corrected — say so plainly instead of implying failure.
        this.resetError.set(
          `Stock was reset to ${plan.target}, but the audit record failed to save: ${auditError.message}`,
        );
        await this.loadData();
        return;
      }

      this.resetFlavorId.set(null);
      this.resetInput.set('');
      await this.loadData();
    } catch (err) {
      this.resetError.set(err instanceof Error ? err.message : 'Reset failed.');
    } finally {
      this.resetBusy.set(false);
    }
  }

  // Pull a generous cap so large tables aren't silently truncated to the
  // PostgREST default (1000 rows), which would corrupt the stock totals.
  private readonly ROW_CAP = 100000;

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
    this.flavors().filter(f => f.available > 0 && f.available <= this.LOW_THRESHOLD).length,
  );

  readonly negativeCount = computed(() =>
    this.flavors().filter(f => f.available < 0).length,
  );

  // ── Low-stock helpers ────────────────────────────────────────────────────
  isLow(fg: FlavorGroup): boolean { return fg.available > 0 && fg.available <= this.LOW_THRESHOLD; }
  isOut(fg: FlavorGroup): boolean { return fg.available <= 0; }

  rowBackground(fg: FlavorGroup): string {
    if (this.expandedFlavorId() === fg.flavorId) return '#f0fdf4';
    if (fg.available < 0) return '#fef2f2';
    if (this.isOut(fg)) return '#fef2f2';
    if (this.isLow(fg)) return '#fffbeb';
    return '#fff';
  }

  fromDate = signal(fmtDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  toDate = signal(fmtDate(new Date()));

  readonly grandTotalPacked = computed(() =>
    this.flavors().reduce((s, fg) => s + fg.totalPacked, 0)
  );
  readonly grandTotalShipped = computed(() =>
    this.flavors().reduce((s, fg) => s + fg.totalShipped, 0)
  );
  readonly grandOnHand = computed(() =>
    this.flavors().reduce((s, fg) => s + fg.onHand, 0)
  );
  readonly grandTotalReserved = computed(() =>
    this.flavors().reduce((s, fg) => s + fg.totalReserved, 0)
  );
  readonly grandAvailable = computed(() =>
    this.flavors().reduce((s, fg) => s + fg.available, 0)
  );
  readonly grandDispatchedInPeriod = computed(() =>
    this.flavors().reduce((s, fg) => s + fg.dispatchedInPeriod, 0)
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
   * Live updates: any change to dispatch_events, packing_sessions,
   * returns_events or gg_invoices triggers a reload. Debounced 400ms so a
   * burst of mobile dispatches only reloads once.
   */
  private subscribeRealtime(): void {
    this.channel = this.supabase.client
      .channel('inventory-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_events' },  () => this.scheduleReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'packing_sessions' }, () => this.scheduleReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'returns_events' },    () => this.scheduleReload())
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
   * Show batches that carry any physical stock, reservation, or return.
   * Filters out fully-empty, fully-settled batches.
   */
  relevantBatches(batches: BatchDetail[]): BatchDetail[] {
    return batches.filter(b => b.onHand !== 0 || b.reserved > 0 || b.returned > 0);
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    const from = this.fromDate();
    const to = this.toDate();

    // ── Fetch everything ALL-TIME (stock is a running balance). The date range
    //    is applied only to the movement column, in code, after the fetch. ──
    // id / session_date / production_batch_id are needed by the reset planner so
    // adjustment rows can mirror the exact rows they offset.
    const sessionsP = this.supabase.client
      .from('packing_sessions')
      .select('id, batch_code, boxes_packed, flavor_id, session_date, production_batch_id')
      .limit(this.ROW_CAP);

    const eventsP = this.supabase.client
      .from('dispatch_events')
      .select('flavor_id, sku_id, batch_code, boxes_dispatched, invoice_number, customer_name, dispatch_date, is_dispatched')
      .limit(this.ROW_CAP);

    const invoicesP = this.supabase.client
      .from('gg_invoices')
      .select('invoice_number, is_packed, is_dispatched, items')
      .limit(this.ROW_CAP);

    const returnsP = this.supabase.client
      .from('returns_events')
      .select('sku_id, batch_code, qty_returned')
      .limit(this.ROW_CAP);

    const flavorsP = this.supabase.client
      .from('gg_flavors')
      .select('id, name');

    const [
      { data: sessions },
      { data: allEvents },
      { data: invoicesData },
      { data: returnsData },
      { data: flavorsData },
    ] = await Promise.all([sessionsP, eventsP, invoicesP, returnsP, flavorsP]);

    // Flavor id → name (authoritative, so reserved/returned-only flavors still get a name).
    const flavorNameMap = new Map<string, string>();
    for (const f of (flavorsData ?? []) as any[]) {
      flavorNameMap.set(String(f.id), f.name ?? 'Unknown');
    }

    // Invoice number → status flags + needed-boxes-per-flavor.
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

    // ── Per-(flavor|batch) accumulators, all-time ──
    const packedBatchMap   = new Map<string, number>();  // packed
    const shippedBatchMap  = new Map<string, number>();  // dispatched (all-time)
    const reservedBatchMap = new Map<string, number>();  // reserved
    const returnedBatchMap = new Map<string, number>();  // returned
    const periodShipBatch  = new Map<string, number>();  // dispatched within [from,to]
    const rowsBatchMap     = new Map<string, ResetRowInput[]>();  // underlying packing rows
    const dateBatchMap     = new Map<string, string>();  // earliest session_date per batch

    // Per-flavor extras
    const reservedInvoiceMap = new Map<string, Map<string, ReservedInvoice>>();
    const flavorIds = new Set<string>();

    const key = (fid: string, bc: string) => `${fid}|${bc}`;
    const splitKey = (k: string): [string, string] => {
      const i = k.indexOf('|');
      return [k.substring(0, i), k.substring(i + 1)];
    };

    // 1. Packing sessions → packed
    for (const row of (sessions ?? []) as any[]) {
      const fid = String(row.flavor_id ?? 'unknown');
      const bc = String(row.batch_code ?? '—');
      const boxes = Number(row.boxes_packed) || 0;
      if (boxes === 0) continue;
      const k = key(fid, bc);
      packedBatchMap.set(k, (packedBatchMap.get(k) ?? 0) + boxes);
      flavorIds.add(fid);

      // Keep the raw rows (and the batch's earliest date) for the reset planner.
      const sessionDate = String(row.session_date ?? '');
      const list = rowsBatchMap.get(k) ?? [];
      list.push({
        id: String(row.id),
        sessionDate,
        productionBatchId: row.production_batch_id != null ? String(row.production_batch_id) : null,
        boxesPacked: boxes,
      });
      rowsBatchMap.set(k, list);
      const earliest = dateBatchMap.get(k);
      if (sessionDate && (!earliest || sessionDate < earliest)) dateBatchMap.set(k, sessionDate);
    }

    // 2. Dispatch events → shipped or reserved (classified by event OR invoice flag)
    for (const ev of (allEvents ?? []) as any[]) {
      const fid = String(ev.flavor_id ?? ev.sku_id ?? '');
      const bc = String(ev.batch_code ?? '—');
      const qty = Number(ev.boxes_dispatched) || 0;
      const inv = ev.invoice_number ?? '';
      const cust = ev.customer_name ?? '—';
      const date = ev.dispatch_date ?? '';
      if (!fid || qty <= 0) continue;
      flavorIds.add(fid);

      const status = inv ? invoiceStatus.get(inv) : undefined;
      const invoiceDispatched = status ? status.is_dispatched : false;
      const eventDispatched = !!ev.is_dispatched;
      const isDispatched = invoiceDispatched || eventDispatched;

      if (isDispatched) {
        // Shipped (all-time) — counts toward on-hand reduction regardless of date.
        shippedBatchMap.set(key(fid, bc), (shippedBatchMap.get(key(fid, bc)) ?? 0) + qty);
        // Movement column: only shipments whose dispatch_date is inside the range.
        if (date && date >= from && date <= to) {
          periodShipBatch.set(key(fid, bc), (periodShipBatch.get(key(fid, bc)) ?? 0) + qty);
        }
        continue;
      }

      // Reserved (committed, still on the shelf) — reduces available, not on-hand.
      reservedBatchMap.set(key(fid, bc), (reservedBatchMap.get(key(fid, bc)) ?? 0) + qty);
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

    // 3. Returns → returned (folds back into sellable stock)
    for (const r of (returnsData ?? []) as any[]) {
      const fid = String(r.sku_id ?? '');
      const bc = String(r.batch_code ?? '—');
      const qty = Number(r.qty_returned) || 0;
      if (!fid || qty <= 0) continue;
      returnedBatchMap.set(key(fid, bc), (returnedBatchMap.get(key(fid, bc)) ?? 0) + qty);
      flavorIds.add(fid);
    }

    // Finalise reserved-invoice partial/full using the summed totals.
    for (const perFlavor of reservedInvoiceMap.values()) {
      for (const rInv of perFlavor.values()) {
        rInv.status = rInv.boxes_needed > 0 && rInv.boxes_reserved < rInv.boxes_needed ? 'partial' : 'full';
      }
    }

    // ── Build flavor groups from the union of all batch keys ──
    const allBatchKeys = new Set<string>([
      ...packedBatchMap.keys(),
      ...shippedBatchMap.keys(),
      ...reservedBatchMap.keys(),
      ...returnedBatchMap.keys(),
    ]);

    const groupMap = new Map<string, FlavorGroup>();
    const ensureGroup = (fid: string): FlavorGroup => {
      let g = groupMap.get(fid);
      if (!g) {
        g = {
          flavorId: fid,
          flavorName: flavorNameMap.get(fid) ?? '(unknown flavor)',
          totalPacked: 0, totalShipped: 0, totalReturned: 0,
          onHand: 0, totalReserved: 0, available: 0,
          dispatchedInPeriod: 0,
          batches: [], reservedInvoices: [],
        };
        groupMap.set(fid, g);
      }
      return g;
    };

    for (const k of allBatchKeys) {
      const [fid, bc] = splitKey(k);
      const packed = packedBatchMap.get(k) ?? 0;
      const shipped = shippedBatchMap.get(k) ?? 0;
      const reserved = reservedBatchMap.get(k) ?? 0;
      const returned = returnedBatchMap.get(k) ?? 0;
      const dispatchedInPeriod = periodShipBatch.get(k) ?? 0;
      const onHand = packed - shipped + returned;
      const available = onHand - reserved;

      const g = ensureGroup(fid);
      g.batches.push({
        batchCode: bc,
        packed, shipped, returned, onHand, reserved, available,
        dispatchedInPeriod,
        sessionDate: dateBatchMap.get(k) ?? '',
        rows: rowsBatchMap.get(k) ?? [],
      });
    }

    // Flavor totals = sums of batch rows (guarantees header == detail).
    for (const g of groupMap.values()) {
      for (const b of g.batches) {
        g.totalPacked += b.packed;
        g.totalShipped += b.shipped;
        g.totalReturned += b.returned;
        g.onHand += b.onHand;
        g.totalReserved += b.reserved;
        g.available += b.available;
        g.dispatchedInPeriod += b.dispatchedInPeriod;
      }
      // Sort batches newest → oldest. Batch codes follow AXNNYY where the first
      // two chars are day (digit→letter, 0=A…9=J), so we decode back to a Date
      // to sort across month/year boundaries. Special codes (OPENING-STOCK,
      // RESET-STOCK, etc.) fall to epoch and land at the bottom.
      g.batches.sort((a, b) => batchCodeToTimestamp(b.batchCode) - batchCodeToTimestamp(a.batchCode));
      const invMap = reservedInvoiceMap.get(g.flavorId);
      g.reservedInvoices = invMap
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
