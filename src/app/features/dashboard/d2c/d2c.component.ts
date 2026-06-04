import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../../core/supabase.service';

interface D2CAllocation {
  id: string;
  channel_name: string;
  flavor_id: string;
  flavor_name: string;
  boxes_allocated: number;
}

interface FifoLine {
  batch_code: string;
  session_date: string;
  available: number;
  take: number;
}

const SUGGESTED_CHANNELS = ['Amazon', 'Swiggy', 'Zepto', 'Blinkit', 'Shopify'];

// D2C dispatch request types (populated from OPS API).
interface D2CRequestItem {
  id: string;
  flavor_id: string;
  boxes_requested: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  batch_breakdown: Array<{ production_batch_id: string; batch_code: string; batch_number: number | null; boxes: number }> | null;
  approved_by?: string | null;
  decided_at?: string | null;
  allocation_id?: string | null;
}

interface D2CRequest {
  id: string;
  channel: string;
  worker_id: string;
  header_status: 'pending' | 'partially_approved' | 'approved' | 'rejected' | 'cancelled';
  notes: string | null;
  created_at: string;
  updated_at: string;
  items: D2CRequestItem[];
}

interface FinishedGoodsRow {
  flavor_id: string;
  flavor_name: string;
  boxes_available: number;
}

const OPS_API = 'https://utpad-ops-api-seven.vercel.app/api/v1/ops';

@Component({
  selector: 'app-d2c',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule],
  template: `
    <div style="padding:24px;max-width:1200px;">

      <!-- Header -->
      <div style="margin-bottom:18px;display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="font-family:'Cabin',sans-serif;font-size:22px;font-weight:700;color:#121212;margin:0 0 4px;">D2C Inventory</h1>
          <p style="color:#6B7280;font-size:14px;margin:0;">Manage direct-to-consumer channel stock allocations.</p>
        </div>
        <div style="display:flex;gap:8px;">
          @if (currentView() === 'allocations') {
            <button (click)="openAddChannelModal()"
                    style="padding:8px 16px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">
              <span class="material-icons-round" style="font-size:16px;">add</span> Add Channel
            </button>
          }
          <button (click)="refreshCurrentView()"
                  style="padding:8px 16px;background:#f3f4f6;border:1px solid #E5E7EB;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:6px;color:#374151;">
            <span class="material-icons-round" style="font-size:16px;">refresh</span> Refresh
          </button>
        </div>
      </div>

      <!-- View tabs: Pending Requests, Approved, Rejected, Allocations -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:22px;border-bottom:1px solid #E5E7EB;">
        @for (v of viewTabs; track v.key) {
          <button (click)="setView(v.key)"
                  style="padding:10px 16px;background:transparent;border:none;border-bottom:2px solid;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;"
                  [style.color]="currentView() === v.key ? '#01AC51' : '#6B7280'"
                  [style.border-bottom-color]="currentView() === v.key ? '#01AC51' : 'transparent'">
            {{ v.label }}
            @if (v.key === 'requests' && pendingCount() > 0) {
              <span style="background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:8px;font-size:11px;font-weight:700;">{{ pendingCount() }}</span>
            }
          </button>
        }
      </div>

      <!-- Pending Requests view -->
      @if (currentView() === 'requests') {
        @if (requestsLoading()) {
          <div style="display:flex;flex-direction:column;gap:10px;">
            @for (i of [1,2,3]; track i) {
              <div class="gg-skeleton" style="height:140px;border-radius:12px;"></div>
            }
          </div>
        } @else if (pendingRequests().length === 0) {
          <div style="text-align:center;padding:80px 0;color:#9CA3AF;">
            <span class="material-icons-round" style="font-size:56px;display:block;margin-bottom:16px;color:#d1d5db;">inbox</span>
            <p style="font-size:16px;font-weight:600;color:#374151;margin:0 0 8px;">No pending requests</p>
            <p style="font-size:14px;margin:0;">Workers haven't submitted any D2C dispatch requests yet.</p>
          </div>
        } @else {
          <div style="display:flex;flex-direction:column;gap:16px;">
            @for (req of pendingRequests(); track req.id) {
              <div style="background:#fff;border:1px solid #E5E7EB;border-radius:14px;overflow:hidden;">
                <!-- Request header -->
                <div style="padding:14px 18px;background:#f8f9fa;border-bottom:1px solid #E5E7EB;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                  <div style="display:flex;align-items:center;gap:10px;">
                    <span style="background:#01AC51;color:#fff;padding:3px 9px;border-radius:6px;font-size:12px;font-weight:700;">{{ req.channel }}</span>
                    <span style="font-size:14px;font-weight:600;color:#121212;">{{ req.worker_id }}</span>
                    <span style="font-size:12px;color:#6B7280;">{{ req.created_at | date:'short' }}</span>
                    <span style="font-size:12px;color:#6B7280;">· {{ pendingItemCount(req) }} pending line{{ pendingItemCount(req) === 1 ? '' : 's' }}</span>
                  </div>
                  <div style="display:flex;gap:6px;">
                    <button (click)="rejectSelected(req)"
                            [disabled]="selectionCount(req) === 0 || decidingRequestId() === req.id"
                            style="padding:6px 14px;background:#fff5f5;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;"
                            [style.opacity]="selectionCount(req) === 0 ? '0.5' : '1'">
                      Reject selected ({{ selectionCount(req) }})
                    </button>
                    <button (click)="approveSelected(req)"
                            [disabled]="approvableSelectionCount(req) === 0 || decidingRequestId() === req.id"
                            style="padding:6px 14px;background:#01AC51;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;"
                            [style.opacity]="approvableSelectionCount(req) === 0 ? '0.5' : '1'">
                      {{ decidingRequestId() === req.id ? 'Working…' : 'Approve approvable (' + approvableSelectionCount(req) + ')' }}
                    </button>
                  </div>
                </div>
                <!-- Item list with select-all -->
                <div style="padding:12px 18px;">
                  <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#374151;cursor:pointer;margin-bottom:8px;">
                    <input type="checkbox"
                           [checked]="allApprovableSelected(req)"
                           (change)="toggleSelectAll(req)" />
                    Select all approvable
                  </label>
                  <table style="width:100%;border-collapse:collapse;">
                    <thead>
                      <tr style="border-bottom:1px solid #f3f4f6;">
                        <th style="text-align:left;padding:8px 6px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;width:28px;"></th>
                        <th style="text-align:left;padding:8px 6px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Flavour</th>
                        <th style="text-align:right;padding:8px 6px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Boxes</th>
                        <th style="text-align:left;padding:8px 12px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Live availability</th>
                        <th style="text-align:left;padding:8px 6px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Submit-time FIFO</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (item of req.items; track item.id) {
                        <tr [style.background]="item.status !== 'pending' ? '#fafafa' : 'transparent'" style="border-bottom:1px solid #f3f4f6;">
                          <td style="padding:10px 6px;">
                            @if (item.status === 'pending' && itemApprovable(item)) {
                              <input type="checkbox"
                                     [checked]="isSelected(item.id)"
                                     (change)="toggleItem(item.id)" />
                            } @else if (item.status === 'pending') {
                              <span title="Insufficient stock" style="color:#dc2626;">✕</span>
                            } @else {
                              <span style="color:#9CA3AF;">—</span>
                            }
                          </td>
                          <td style="padding:10px 6px;font-size:13px;font-weight:600;color:#121212;">{{ flavorName(item.flavor_id) }}</td>
                          <td style="padding:10px 6px;text-align:right;font-size:13px;font-weight:700;color:#121212;">{{ item.boxes_requested }}</td>
                          <td style="padding:10px 12px;">
                            @if (item.status !== 'pending') {
                              <span style="font-size:11px;padding:2px 7px;border-radius:5px;font-weight:600;text-transform:uppercase;"
                                    [style.background]="item.status === 'approved' ? '#d1fae5' : '#fee2e2'"
                                    [style.color]="item.status === 'approved' ? '#065f46' : '#991b1b'">
                                {{ item.status }}
                              </span>
                            } @else {
                              <span style="font-size:12px;"
                                    [style.color]="itemApprovable(item) ? '#01AC51' : '#dc2626'">
                                {{ availableFor(item.flavor_id) }} available
                              </span>
                              @if (!itemApprovable(item)) {
                                <span style="font-size:11px;color:#dc2626;margin-left:6px;">insufficient</span>
                              }
                            }
                          </td>
                          <td style="padding:10px 6px;font-size:12px;color:#6B7280;">
                            @for (s of item.batch_breakdown ?? []; track s.production_batch_id) {
                              <div>{{ s.boxes }} from {{ s.batch_code }}{{ s.batch_number != null ? ' #' + s.batch_number : '' }}</div>
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }
          </div>
        }
      }

      <!-- Approved / Rejected history view -->
      @if (currentView() === 'history') {
        @if (historyLoading()) {
          <div style="display:flex;flex-direction:column;gap:10px;">
            @for (i of [1,2,3]; track i) {
              <div class="gg-skeleton" style="height:90px;border-radius:12px;"></div>
            }
          </div>
        } @else {
          <div style="display:flex;gap:8px;margin-bottom:14px;">
            @for (s of ['approved','rejected','partially_approved','cancelled']; track s) {
              <button (click)="historyFilter.set(s)"
                      style="padding:7px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid #E5E7EB;"
                      [style.background]="historyFilter() === s ? '#01AC51' : '#fff'"
                      [style.color]="historyFilter() === s ? '#fff' : '#374151'">
                {{ s.replace('_', ' ') }}
              </button>
            }
          </div>
          @if (historyRequests().length === 0) {
            <div style="text-align:center;padding:64px 0;color:#9CA3AF;">
              <p style="font-size:14px;margin:0;">No requests in this state.</p>
            </div>
          } @else {
            <div style="display:flex;flex-direction:column;gap:10px;">
              @for (req of historyRequests(); track req.id) {
                <div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:14px 16px;">
                  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                    <div style="display:flex;align-items:center;gap:10px;">
                      <span style="background:#01AC51;color:#fff;padding:2px 8px;border-radius:5px;font-size:11px;font-weight:700;">{{ req.channel }}</span>
                      <span style="font-size:13px;font-weight:600;color:#121212;">{{ req.worker_id }}</span>
                      <span style="font-size:12px;color:#6B7280;">{{ req.created_at | date:'medium' }}</span>
                    </div>
                    <span style="font-size:11px;padding:3px 9px;border-radius:6px;font-weight:600;text-transform:uppercase;"
                          [style.background]="req.header_status === 'approved' ? '#d1fae5' : (req.header_status === 'rejected' ? '#fee2e2' : '#fef3c7')"
                          [style.color]="req.header_status === 'approved' ? '#065f46' : (req.header_status === 'rejected' ? '#991b1b' : '#92400e')">
                      {{ req.header_status.replace('_', ' ') }}
                    </span>
                  </div>
                  <div style="font-size:12px;color:#6B7280;margin-top:6px;">
                    @for (item of req.items; track item.id) {
                      <span>{{ flavorName(item.flavor_id) }} × {{ item.boxes_requested }} ({{ item.status }})</span>
                      @if (!$last) { <span> · </span> }
                    }
                  </div>
                </div>
              }
            </div>
          }
        }
      }

      <!-- Allocations view (existing) -->
      @if (currentView() === 'allocations') {
      @if (loading()) {
        <div style="display:flex;flex-direction:column;gap:10px;">
          @for (i of [1,2,3]; track i) {
            <div class="gg-skeleton" style="height:80px;border-radius:12px;"></div>
          }
        </div>
      } @else if (channels().length === 0) {
        <div style="text-align:center;padding:80px 0;color:#9CA3AF;">
          <span class="material-icons-round" style="font-size:56px;display:block;margin-bottom:16px;color:#d1d5db;">storefront</span>
          <p style="font-size:16px;font-weight:600;color:#374151;margin:0 0 8px;">No D2C channels yet</p>
          <p style="font-size:14px;margin:0 0 20px;">Add a channel to start allocating inventory.</p>
          <button (click)="openAddChannelModal()"
                  style="padding:10px 24px;background:#01AC51;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">
            Add First Channel
          </button>
        </div>
      } @else {

        <!-- Channel tabs -->
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;">
          @for (ch of channels(); track ch) {
            <button (click)="selectedChannel.set(ch)"
                    style="padding:8px 18px;border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;border:none;transition:all 0.15s;"
                    [style.background]="selectedChannel() === ch ? '#01AC51' : '#f3f4f6'"
                    [style.color]="selectedChannel() === ch ? '#fff' : '#374151'">
              {{ ch }}
            </button>
          }
        </div>

        <!-- Channel panel -->
        <div style="background:#fff;border-radius:14px;border:1px solid #E5E7EB;overflow:hidden;">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #E5E7EB;background:#f8f9fa;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span class="material-icons-round" style="color:#01AC51;font-size:22px;">storefront</span>
              <h2 style="font-size:16px;font-weight:700;color:#121212;margin:0;">{{ selectedChannel() }}</h2>
              <span style="font-size:12px;color:#6B7280;background:#e5e7eb;padding:2px 8px;border-radius:10px;">
                {{ channelAllocations().length }} flavour{{ channelAllocations().length !== 1 ? 's' : '' }}
              </span>
            </div>
            <button (click)="openAddAllocationModal()"
                    style="padding:7px 14px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">
              <span class="material-icons-round" style="font-size:15px;">add</span> Allocate Stock
            </button>
          </div>

          @if (channelAllocations().length === 0) {
            <div style="text-align:center;padding:48px 0;color:#9CA3AF;">
              <span class="material-icons-round" style="font-size:40px;display:block;margin-bottom:10px;">inventory_2</span>
              <p style="font-size:14px;margin:0;">No allocations for this channel yet.</p>
            </div>
          } @else {
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="border-bottom:1px solid #E5E7EB;">
                  <th style="text-align:left;padding:10px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Flavour</th>
                  <th style="text-align:right;padding:10px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Allocated</th>
                  <th style="text-align:right;padding:10px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (alloc of channelAllocations(); track alloc.id) {
                  <tr style="border-bottom:1px solid #f3f4f6;">
                    <td style="padding:14px 16px;font-size:14px;font-weight:600;color:#121212;">{{ alloc.flavor_name }}</td>
                    <td style="padding:14px 16px;text-align:right;">
                      <span style="font-size:15px;font-weight:700;color:#121212;">{{ alloc.boxes_allocated }}</span>
                      <span style="font-size:12px;color:#6B7280;"> boxes</span>
                    </td>
                    <td style="padding:14px 16px;text-align:right;">
                      <button (click)="openEditAllocationModal(alloc)"
                              style="padding:5px 12px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;margin-right:6px;">
                        Edit
                      </button>
                      <button (click)="openDeleteModal(alloc)"
                              style="padding:5px 12px;background:#fff5f5;color:#dc2626;border:1px solid #fca5a5;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">
                        Delete
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>
      }
      } <!-- close currentView === 'allocations' -->
    </div>

    <!-- ── ADD CHANNEL MODAL ── -->
    @if (showAddChannelModal()) {
      <div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;"
           (click)="showAddChannelModal.set(false)">
        <div style="background:#fff;border-radius:16px;width:100%;max-width:440px;box-shadow:0 20px 60px rgba(0,0,0,0.2);"
             (click)="$event.stopPropagation()">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid #E5E7EB;">
            <h2 style="font-size:16px;font-weight:700;color:#121212;margin:0;">Add D2C Channel</h2>
            <button (click)="showAddChannelModal.set(false)" style="border:none;background:none;cursor:pointer;color:#9CA3AF;">
              <span class="material-icons-round" style="font-size:20px;">close</span>
            </button>
          </div>
          <div style="padding:24px;">
            <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Channel Name</label>
            <input [(ngModel)]="newChannelName" type="text" class="gg-input" style="width:100%;font-size:14px;margin-bottom:10px;" placeholder="e.g. Amazon, Zepto…">
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px;">
              @for (ch of suggestedChannels; track ch) {
                @if (!channels().includes(ch)) {
                  <button (click)="newChannelName = ch"
                          style="padding:4px 12px;background:#f3f4f6;border:1px solid #E5E7EB;border-radius:16px;font-size:12px;cursor:pointer;color:#374151;"
                          [style.background]="newChannelName === ch ? '#dcfce7' : '#f3f4f6'"
                          [style.borderColor]="newChannelName === ch ? '#86efac' : '#E5E7EB'"
                          [style.color]="newChannelName === ch ? '#15803d' : '#374151'">
                    {{ ch }}
                  </button>
                }
              }
            </div>
            @if (errorMsg()) {
              <div style="background:#fff5f5;border:1px solid #fca5a5;border-radius:8px;padding:10px 14px;color:#dc2626;font-size:13px;margin-bottom:14px;">{{ errorMsg() }}</div>
            }
            <div style="display:flex;gap:8px;justify-content:flex-end;">
              <button (click)="showAddChannelModal.set(false)"
                      style="padding:9px 18px;background:#f3f4f6;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;color:#374151;">Cancel</button>
              <button (click)="addChannel()" [disabled]="saving()"
                      style="padding:9px 18px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;"
                      [style.opacity]="saving() ? '0.7' : '1'">
                {{ saving() ? 'Adding…' : 'Add Channel' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    }

    <!-- ── ADD / EDIT ALLOCATION MODAL ── -->
    @if (showAllocationModal()) {
      <div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;"
           (click)="closeAllocationModal()">
        <div style="background:#fff;border-radius:16px;width:100%;max-width:520px;box-shadow:0 20px 60px rgba(0,0,0,0.2);max-height:90vh;overflow-y:auto;"
             (click)="$event.stopPropagation()">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid #E5E7EB;">
            <h2 style="font-size:16px;font-weight:700;color:#121212;margin:0;">
              {{ editingAllocation ? 'Edit Allocation' : 'Allocate Stock' }} — {{ selectedChannel() }}
            </h2>
            <button (click)="closeAllocationModal()" style="border:none;background:none;cursor:pointer;color:#9CA3AF;">
              <span class="material-icons-round" style="font-size:20px;">close</span>
            </button>
          </div>
          <div style="padding:24px;">

            <!-- Flavor -->
            <div style="margin-bottom:14px;">
              <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px;">Flavour</label>
              <select [(ngModel)]="allocForm.flavorId" (ngModelChange)="onFlavorChange($event)" class="gg-input dropdown-with-arrow"
                      style="width:100%;font-size:14px;" [disabled]="!!editingAllocation">
                <option value="">Select flavour…</option>
                @for (f of flavors(); track f.id) {
                  <option [value]="f.id">{{ f.name }}</option>
                }
              </select>
            </div>

            <!-- Boxes -->
            <div style="margin-bottom:14px;">
              <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px;">Boxes to Allocate</label>
              <input [(ngModel)]="allocForm.boxes" (ngModelChange)="onBoxesChange()" type="number" min="0" step="1"
                     class="gg-input" style="width:100%;font-size:14px;" placeholder="0">
            </div>


            <!-- FIFO Preview -->
            @if (fifoLines().length > 0) {
              <div style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;margin-bottom:16px;">
                <div style="padding:8px 14px;background:#f0fdf4;border-bottom:1px solid #E5E7EB;display:flex;align-items:center;gap:6px;">
                  <span class="material-icons-round" style="font-size:15px;color:#15803d;">playlist_add_check</span>
                  <span style="font-size:12px;font-weight:700;color:#15803d;">FIFO Allocation Preview</span>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr 80px 80px;gap:6px;padding:6px 12px;background:#f8f9fa;border-bottom:1px solid #E5E7EB;">
                  <span style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;">Batch</span>
                  <span style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;">Session Date</span>
                  <span style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;text-align:right;">Available</span>
                  <span style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;text-align:right;">Taking</span>
                </div>
                @for (line of fifoLines(); track line.batch_code) {
                  <div style="display:grid;grid-template-columns:1fr 1fr 80px 80px;gap:6px;padding:8px 12px;border-bottom:1px solid #f3f4f6;align-items:center;">
                    <span style="font-family:monospace;font-size:12px;font-weight:700;color:#121212;">{{ line.batch_code }}</span>
                    <span style="font-size:12px;color:#374151;">{{ line.session_date | date:'dd MMM yyyy' }}</span>
                    <span style="font-size:12px;color:#6B7280;text-align:right;">{{ line.available }}</span>
                    <span style="font-size:12px;font-weight:700;color:#01AC51;text-align:right;">{{ line.take }}</span>
                  </div>
                }
                <div style="padding:8px 12px;background:#f0fdf4;display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-size:12px;font-weight:700;color:#374151;">Total allocating</span>
                  <span style="font-size:13px;font-weight:700;color:#15803d;">{{ fifoTotal() }} boxes</span>
                </div>
              </div>
            }

            @if (fifoError()) {
              <div style="background:#fff5f5;border:1px solid #fca5a5;border-radius:8px;padding:10px 14px;color:#dc2626;font-size:13px;margin-bottom:14px;display:flex;align-items:center;gap:6px;">
                <span class="material-icons-round" style="font-size:15px;">error_outline</span>
                {{ fifoError() }}
              </div>
            }

            @if (errorMsg()) {
              <div style="background:#fff5f5;border:1px solid #fca5a5;border-radius:8px;padding:10px 14px;color:#dc2626;font-size:13px;margin-bottom:14px;">{{ errorMsg() }}</div>
            }

            <div style="display:flex;gap:8px;justify-content:flex-end;">
              <button (click)="closeAllocationModal()"
                      style="padding:9px 18px;background:#f3f4f6;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;color:#374151;">Cancel</button>
              <button (click)="saveAllocation()" [disabled]="saving() || fifoLines().length === 0"
                      style="padding:9px 18px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;"
                      [style.opacity]="(saving() || fifoLines().length === 0) ? '0.7' : '1'">
                {{ saving() ? 'Saving…' : editingAllocation ? 'Update Allocation' : 'Allocate' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    }

    <!-- ── DELETE CONFIRM MODAL ── -->
    @if (showDeleteModal() && deletingAllocation) {
      <div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;"
           (click)="showDeleteModal.set(false)">
        <div style="background:#fff;border-radius:16px;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,0.2);"
             (click)="$event.stopPropagation()">
          <div style="padding:24px;">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
              <div style="width:44px;height:44px;background:#fee2e2;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <span class="material-icons-round" style="color:#dc2626;font-size:22px;">delete</span>
              </div>
              <div>
                <h3 style="font-size:16px;font-weight:700;color:#121212;margin:0 0 4px;">Delete Allocation</h3>
                <p style="font-size:13px;color:#6B7280;margin:0;">This will return {{ deletingAllocation.boxes_allocated }} boxes to main inventory.</p>
              </div>
            </div>
            <div style="background:#f8f9fa;border-radius:10px;padding:12px 16px;margin-bottom:20px;">
              <p style="font-size:13px;color:#374151;margin:0;">
                <strong>{{ deletingAllocation.channel_name }}</strong> — {{ deletingAllocation.flavor_name }}: {{ deletingAllocation.boxes_allocated }} boxes
              </p>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
              <button (click)="showDeleteModal.set(false)"
                      style="padding:9px 18px;background:#f3f4f6;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;color:#374151;">Cancel</button>
              <button (click)="deleteAllocation()" [disabled]="saving()"
                      style="padding:9px 18px;background:#dc2626;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;"
                      [style.opacity]="saving() ? '0.7' : '1'">
                {{ saving() ? 'Deleting…' : 'Delete & Return Stock' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class D2CComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);

  // View tabs
  readonly viewTabs: Array<{ key: 'requests' | 'history' | 'allocations'; label: string }> = [
    { key: 'requests',    label: 'Pending Requests' },
    { key: 'history',     label: 'History' },
    { key: 'allocations', label: 'Allocations' },
  ];
  currentView = signal<'requests' | 'history' | 'allocations'>('requests');

  loading  = signal(true);
  saving   = signal(false);
  errorMsg = signal('');
  fifoError = signal('');

  // Pending Requests + history
  requestsLoading       = signal(false);
  historyLoading        = signal(false);
  pendingRequests       = signal<D2CRequest[]>([]);
  historyRequests       = signal<D2CRequest[]>([]);
  historyFilter         = signal<'approved' | 'rejected' | 'partially_approved' | 'cancelled'>('approved');
  finishedGoods         = signal<FinishedGoodsRow[]>([]);
  selectedItemIds       = signal<Set<string>>(new Set());
  decidingRequestId     = signal<string | null>(null);

  pendingCount = computed(() => this.pendingRequests().length);

  allocations = signal<D2CAllocation[]>([]);
  flavors     = signal<{ id: string; name: string }[]>([]);

  channels = computed(() => {
    const names = new Set(this.allocations().map(a => a.channel_name));
    return Array.from(names).sort();
  });

  selectedChannel = signal('');

  channelAllocations = computed(() =>
    this.allocations().filter(a => a.channel_name === this.selectedChannel())
  );

  // Modal state
  showAddChannelModal  = signal(false);
  showAllocationModal  = signal(false);
  showDeleteModal      = signal(false);

  newChannelName = '';
  allocForm      = { flavorId: '', flavorName: '', boxes: 0 };
  editingAllocation:  D2CAllocation | null = null;
  deletingAllocation: D2CAllocation | null = null;

  fifoLines = signal<FifoLine[]>([]);
  fifoTotal = () => this.fifoLines().reduce((s, l) => s + l.take, 0);

  readonly suggestedChannels = SUGGESTED_CHANNELS;

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadData(), this.loadFlavors()]);
    // First-render default: open Pending Requests since that's where action lives.
    this.loadPendingRequests();
    this.loadFinishedGoods();
  }

  // ── View switching ──────────────────────────────────────────────────────

  setView(v: 'requests' | 'history' | 'allocations'): void {
    this.currentView.set(v);
    if (v === 'requests') this.loadPendingRequests();
    if (v === 'history')  this.loadHistoryRequests();
  }

  refreshCurrentView(): void {
    const v = this.currentView();
    if (v === 'requests')    { this.loadPendingRequests(); this.loadFinishedGoods(); }
    else if (v === 'history') this.loadHistoryRequests();
    else                      this.loadData();
  }

  // ── D2C requests data loading ──────────────────────────────────────────

  async loadPendingRequests(): Promise<void> {
    this.requestsLoading.set(true);
    try {
      const res = await fetch(`${OPS_API}/d2c-requests?status=pending`);
      if (res.ok) this.pendingRequests.set(await res.json());
      const res2 = await fetch(`${OPS_API}/d2c-requests?status=partially_approved`);
      if (res2.ok) {
        // Partially_approved requests with still-pending lines should also appear here.
        const partial = await res2.json();
        this.pendingRequests.update(rows => [...rows, ...partial]);
      }
    } finally {
      this.requestsLoading.set(false);
    }
  }

  async loadHistoryRequests(): Promise<void> {
    this.historyLoading.set(true);
    try {
      const res = await fetch(`${OPS_API}/d2c-requests?status=${this.historyFilter()}`);
      this.historyRequests.set(res.ok ? await res.json() : []);
    } finally {
      this.historyLoading.set(false);
    }
  }

  async loadFinishedGoods(): Promise<void> {
    const res = await fetch(`${OPS_API}/finished-goods-available`);
    if (res.ok) this.finishedGoods.set(await res.json());
  }

  // ── Pending list helpers ───────────────────────────────────────────────

  flavorName(flavorId: string): string {
    return this.flavors().find(f => f.id === flavorId)?.name
        ?? this.finishedGoods().find(fg => fg.flavor_id === flavorId)?.flavor_name
        ?? '(unknown)';
  }

  availableFor(flavorId: string): number {
    return this.finishedGoods().find(fg => fg.flavor_id === flavorId)?.boxes_available ?? 0;
  }

  itemApprovable(item: D2CRequestItem): boolean {
    return this.availableFor(item.flavor_id) >= item.boxes_requested;
  }

  pendingItemCount(req: D2CRequest): number {
    return req.items.filter(i => i.status === 'pending').length;
  }

  // Selection state per item id (scoped across requests is fine — each id is unique).
  isSelected(itemId: string): boolean { return this.selectedItemIds().has(itemId); }
  toggleItem(itemId: string): void {
    this.selectedItemIds.update(s => {
      const n = new Set(s);
      if (n.has(itemId)) n.delete(itemId); else n.add(itemId);
      return n;
    });
  }
  toggleSelectAll(req: D2CRequest): void {
    const approvableIds = req.items.filter(i => i.status === 'pending' && this.itemApprovable(i)).map(i => i.id);
    const allSel = approvableIds.length > 0 && approvableIds.every(id => this.selectedItemIds().has(id));
    this.selectedItemIds.update(s => {
      const n = new Set(s);
      if (allSel) approvableIds.forEach(id => n.delete(id));
      else        approvableIds.forEach(id => n.add(id));
      return n;
    });
  }
  allApprovableSelected(req: D2CRequest): boolean {
    const ids = req.items.filter(i => i.status === 'pending' && this.itemApprovable(i)).map(i => i.id);
    return ids.length > 0 && ids.every(id => this.selectedItemIds().has(id));
  }
  selectionCount(req: D2CRequest): number {
    return req.items.filter(i => this.selectedItemIds().has(i.id)).length;
  }
  approvableSelectionCount(req: D2CRequest): number {
    return req.items.filter(i => this.selectedItemIds().has(i.id) && i.status === 'pending' && this.itemApprovable(i)).length;
  }

  // ── Approve / Reject actions ───────────────────────────────────────────

  async approveSelected(req: D2CRequest): Promise<void> {
    const items = req.items.filter(i => this.selectedItemIds().has(i.id) && i.status === 'pending' && this.itemApprovable(i));
    if (items.length === 0) return;
    this.decidingRequestId.set(req.id);
    try {
      const approvedBy = (await this.supabase.client.auth.getUser()).data.user?.email ?? 'web_admin';
      const res = await fetch(`${OPS_API}/d2c-requests/${req.id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decisions: items.map(i => ({ item_id: i.id, action: 'approve' })),
          approved_by: approvedBy,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Clear selection + reload
      this.selectedItemIds.update(s => { const n = new Set(s); items.forEach(i => n.delete(i.id)); return n; });
      await Promise.all([this.loadPendingRequests(), this.loadFinishedGoods()]);
    } catch (e) {
      console.error('Approve failed', e);
      alert(`Approve failed: ${e}`);
    } finally {
      this.decidingRequestId.set(null);
    }
  }

  async rejectSelected(req: D2CRequest): Promise<void> {
    const items = req.items.filter(i => this.selectedItemIds().has(i.id) && i.status === 'pending');
    if (items.length === 0) return;
    if (!confirm(`Reject ${items.length} line(s)? This cannot be undone.`)) return;
    this.decidingRequestId.set(req.id);
    try {
      const approvedBy = (await this.supabase.client.auth.getUser()).data.user?.email ?? 'web_admin';
      const res = await fetch(`${OPS_API}/d2c-requests/${req.id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decisions: items.map(i => ({ item_id: i.id, action: 'reject' })),
          approved_by: approvedBy,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.selectedItemIds.update(s => { const n = new Set(s); items.forEach(i => n.delete(i.id)); return n; });
      await this.loadPendingRequests();
    } catch (e) {
      console.error('Reject failed', e);
      alert(`Reject failed: ${e}`);
    } finally {
      this.decidingRequestId.set(null);
    }
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    const { data, error } = await this.supabase.client
      .from('gg_d2c_allocations')
      .select('id, channel_name, flavor_id, flavor_name, boxes_allocated')
      .order('channel_name')
      .order('flavor_name');

    if (!error && data) {
      this.allocations.set(data as D2CAllocation[]);
      if (!this.selectedChannel() && data.length > 0) {
        this.selectedChannel.set(data[0].channel_name);
      }
    }
    this.loading.set(false);
  }

  private async loadFlavors(): Promise<void> {
    const { data } = await this.supabase.client
      .from('gg_flavors')
      .select('id, name')
      .eq('active', true)
      .order('name');
    this.flavors.set(data ?? []);
  }

  // ── Channel management ──────────────────────────────────

  openAddChannelModal(): void {
    this.newChannelName = '';
    this.errorMsg.set('');
    this.showAddChannelModal.set(true);
  }

  async addChannel(): Promise<void> {
    const name = this.newChannelName.trim();
    if (!name) { this.errorMsg.set('Enter a channel name.'); return; }
    if (this.channels().includes(name)) { this.errorMsg.set('Channel already exists.'); return; }
    this.showAddChannelModal.set(false);
    this.selectedChannel.set(name);
    // Channel is implicitly created when first allocation is saved
    this.openAddAllocationModal();
  }

  // ── Allocation management ────────────────────────────────

  openAddAllocationModal(): void {
    this.editingAllocation = null;
    this.allocForm = { flavorId: '', flavorName: '', boxes: 0 };
    this.fifoLines.set([]);
    this.fifoError.set('');
    this.errorMsg.set('');
    this.showAllocationModal.set(true);
  }

  openEditAllocationModal(alloc: D2CAllocation): void {
    this.editingAllocation = alloc;
    this.allocForm = {
      flavorId: alloc.flavor_id,
      flavorName: alloc.flavor_name,
      boxes: alloc.boxes_allocated,
    };
    this.fifoLines.set([]);
    this.fifoError.set('');
    this.errorMsg.set('');
    this.computeFifoPreview();
    this.showAllocationModal.set(true);
  }

  closeAllocationModal(): void {
    this.showAllocationModal.set(false);
    this.editingAllocation = null;
  }

  openDeleteModal(alloc: D2CAllocation): void {
    this.deletingAllocation = alloc;
    this.errorMsg.set('');
    this.showDeleteModal.set(true);
  }

  async onFlavorChange(flavorId: string): Promise<void> {
    const flavor = this.flavors().find(f => f.id === flavorId);
    this.allocForm.flavorName = flavor?.name ?? '';
    if (flavorId && this.allocForm.boxes > 0) await this.computeFifoPreview();
  }

  async onBoxesChange(): Promise<void> {
    if (this.allocForm.flavorId && this.allocForm.boxes > 0) await this.computeFifoPreview();
    else this.fifoLines.set([]);
  }

  private async computeFifoPreview(): Promise<void> {
    this.fifoError.set('');
    if (!this.allocForm.flavorId || this.allocForm.boxes <= 0) { this.fifoLines.set([]); return; }

    const lines = await this.computeFifo(this.allocForm.flavorId, this.allocForm.boxes);
    this.fifoLines.set(lines);

    const allocated = lines.reduce((s, l) => s + l.take, 0);
    if (allocated < this.allocForm.boxes) {
      this.fifoError.set(
        `Only ${allocated} of ${this.allocForm.boxes} boxes available in inventory.`
      );
    }
  }

  /** FIFO allocation: oldest packing sessions first, minus already-dispatched boxes. */
  private async computeFifo(flavorId: string, boxesNeeded: number): Promise<FifoLine[]> {
    // 1. Sum packing_sessions per batch for this flavor
    const { data: sessions } = await this.supabase.client
      .from('packing_sessions')
      .select('batch_code, session_date, boxes_packed')
      .eq('flavor_id', flavorId)
      .order('session_date', { ascending: true });

    // 2. Sum dispatch_events per batch for this flavor (includes existing D2C allocations)
    const { data: dispatched } = await this.supabase.client
      .from('dispatch_events')
      .select('batch_code, boxes_dispatched, sku_id, flavor_id')
      .or(`sku_id.eq.${flavorId},flavor_id.eq.${flavorId}`);

    // Build packed map (batch_code → { earliest_date, total_packed })
    const packedMap = new Map<string, { session_date: string; packed: number }>();
    for (const s of sessions ?? []) {
      const ex = packedMap.get(s.batch_code);
      if (!ex) {
        packedMap.set(s.batch_code, { session_date: s.session_date, packed: s.boxes_packed ?? 0 });
      } else {
        ex.packed += s.boxes_packed ?? 0;
      }
    }

    // Build dispatched map
    const dispatchedMap = new Map<string, number>();
    for (const d of dispatched ?? []) {
      dispatchedMap.set(d.batch_code, (dispatchedMap.get(d.batch_code) ?? 0) + (d.boxes_dispatched ?? 0));
    }

    // Sort batches FIFO (oldest first)
    const sorted = Array.from(packedMap.entries())
      .map(([batch_code, { session_date, packed }]) => ({
        batch_code,
        session_date,
        available: Math.max(0, packed - (dispatchedMap.get(batch_code) ?? 0)),
      }))
      .filter(b => b.available > 0)
      .sort((a, b) => a.session_date.localeCompare(b.session_date));

    let remaining = boxesNeeded;
    const lines: FifoLine[] = [];
    for (const batch of sorted) {
      if (remaining <= 0) break;
      const take = Math.min(batch.available, remaining);
      lines.push({ batch_code: batch.batch_code, session_date: batch.session_date, available: batch.available, take });
      remaining -= take;
    }
    return lines;
  }

  async saveAllocation(): Promise<void> {
    this.errorMsg.set('');
    if (!this.allocForm.flavorId) { this.errorMsg.set('Select a flavour.'); return; }
    if (this.allocForm.boxes <= 0) { this.errorMsg.set('Enter boxes to allocate.'); return; }
    if (this.fifoLines().length === 0) { this.errorMsg.set('No stock available for this flavour.'); return; }

    this.saving.set(true);
    try {
      const today = new Date().toISOString().substring(0, 10);

      if (this.editingAllocation) {
        // ── EDIT: clear old dispatch events, re-create with new FIFO ──
        await this.clearD2CDispatchEvents(this.editingAllocation.id);

        await this.insertD2CDispatchEvents(
          this.editingAllocation.id,
          this.selectedChannel(),
          this.allocForm.flavorId,
          this.fifoLines(),
          today
        );

        await this.supabase.client
          .from('gg_d2c_allocations')
          .update({
            boxes_allocated: this.fifoTotal(),
            updated_at:      new Date().toISOString(),
          })
          .eq('id', this.editingAllocation.id);

      } else {
        // ── CREATE: insert allocation record, then dispatch events ──
        const { data: newAlloc, error } = await this.supabase.client
          .from('gg_d2c_allocations')
          .insert({
            channel_name:    this.selectedChannel(),
            flavor_id:       this.allocForm.flavorId,
            flavor_name:     this.allocForm.flavorName,
            boxes_allocated: this.fifoTotal(),
          })
          .select('id')
          .single();

        if (error || !newAlloc) { this.errorMsg.set(error?.message ?? 'Failed to create allocation.'); return; }

        await this.insertD2CDispatchEvents(
          newAlloc.id,
          this.selectedChannel(),
          this.allocForm.flavorId,
          this.fifoLines(),
          today
        );
      }

      this.closeAllocationModal();
      await this.loadData();
    } finally {
      this.saving.set(false);
    }
  }

  async deleteAllocation(): Promise<void> {
    if (!this.deletingAllocation) return;
    this.saving.set(true);
    try {
      await this.clearD2CDispatchEvents(this.deletingAllocation.id);
      await this.supabase.client
        .from('gg_d2c_allocations')
        .delete()
        .eq('id', this.deletingAllocation.id);
      this.showDeleteModal.set(false);
      this.deletingAllocation = null;
      await this.loadData();
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * Nullify existing D2C dispatch_events for this allocation
   * by setting boxes_dispatched = 0 (preserves audit trail).
   */
  private async clearD2CDispatchEvents(allocationId: string): Promise<void> {
    await this.supabase.client
      .from('dispatch_events')
      .update({ boxes_dispatched: 0 })
      .eq('invoice_number', `D2C-${allocationId}`);
  }

  /**
   * Insert one dispatch_event per FIFO batch to immediately reduce main inventory.
   * invoice_number = 'D2C-{allocationId}' tags these as D2C events.
   */
  private async insertD2CDispatchEvents(
    allocationId: string,
    channelName: string,
    flavorId: string,
    lines: FifoLine[],
    today: string
  ): Promise<void> {
    const records = lines
      .filter(l => l.take > 0)
      .map(l => ({
        batch_code:       l.batch_code,
        sku_id:           flavorId,
        flavor_id:        flavorId,
        boxes_dispatched: l.take,
        customer_name:    channelName,
        invoice_number:   `D2C-${allocationId}`,
        dispatch_date:    today,
        worker_id:        null,
      }));

    if (records.length > 0) {
      await this.supabase.client.from('dispatch_events').insert(records);
    }
  }
}
