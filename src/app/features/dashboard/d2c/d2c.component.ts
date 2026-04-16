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
  reallocation_point: number;
}

interface FifoLine {
  batch_code: string;
  session_date: string;
  available: number;
  take: number;
}

const SUGGESTED_CHANNELS = ['Amazon', 'Swiggy', 'Zepto', 'Blinkit', 'Shopify'];

@Component({
  selector: 'app-d2c',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule],
  template: `
    <div style="padding:24px;max-width:1200px;">

      <!-- Header -->
      <div style="margin-bottom:24px;display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="font-family:'Cabin',sans-serif;font-size:22px;font-weight:700;color:#121212;margin:0 0 4px;">D2C Inventory</h1>
          <p style="color:#6B7280;font-size:14px;margin:0;">Manage direct-to-consumer channel stock allocations.</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button (click)="openAddChannelModal()"
                  style="padding:8px 16px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">
            <span class="material-icons-round" style="font-size:16px;">add</span> Add Channel
          </button>
          <button (click)="loadData()"
                  style="padding:8px 16px;background:#f3f4f6;border:1px solid #E5E7EB;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:6px;color:#374151;">
            <span class="material-icons-round" style="font-size:16px;">refresh</span> Refresh
          </button>
        </div>
      </div>

      <!-- Below-threshold alerts banner -->
      @if (!loading() && belowThresholdAllocations().length > 0) {
        <div style="background:#fff5f5;border:1px solid #fca5a5;border-radius:12px;padding:14px 18px;margin-bottom:20px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span class="material-icons-round" style="color:#dc2626;font-size:20px;">warning</span>
            <span style="font-size:14px;font-weight:700;color:#991b1b;">
              {{ belowThresholdAllocations().length }} allocation{{ belowThresholdAllocations().length > 1 ? 's' : '' }} below reallocation point
            </span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            @for (a of belowThresholdAllocations(); track a.id) {
              <span style="background:#fee2e2;border:1px solid #fca5a5;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600;color:#dc2626;">
                {{ a.channel_name }} — {{ a.flavor_name }}: {{ a.boxes_allocated }} / {{ a.reallocation_point }} boxes
              </span>
            }
          </div>
        </div>
      }

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
              @if (channelBelowThreshold(ch)) {
                <span style="display:inline-block;width:8px;height:8px;background:#dc2626;border-radius:50%;margin-left:6px;vertical-align:middle;"></span>
              }
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
                  <th style="text-align:right;padding:10px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Realloc. Point</th>
                  <th style="text-align:center;padding:10px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Status</th>
                  <th style="text-align:right;padding:10px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (alloc of channelAllocations(); track alloc.id) {
                  <tr style="border-bottom:1px solid #f3f4f6;"
                      [style.background]="isBelowThreshold(alloc) ? '#fff5f5' : 'transparent'">
                    <td style="padding:14px 16px;font-size:14px;font-weight:600;color:#121212;">{{ alloc.flavor_name }}</td>
                    <td style="padding:14px 16px;text-align:right;">
                      <span style="font-size:15px;font-weight:700;color:#121212;">{{ alloc.boxes_allocated }}</span>
                      <span style="font-size:12px;color:#6B7280;"> boxes</span>
                    </td>
                    <td style="padding:14px 16px;text-align:right;">
                      <span style="font-size:14px;color:#374151;">{{ alloc.reallocation_point }}</span>
                      <span style="font-size:12px;color:#9CA3AF;"> boxes</span>
                    </td>
                    <td style="padding:14px 16px;text-align:center;">
                      @if (isBelowThreshold(alloc)) {
                        <span style="display:inline-flex;align-items:center;gap:4px;background:#fee2e2;color:#dc2626;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;">
                          <span class="material-icons-round" style="font-size:12px;">warning</span> Low
                        </span>
                      } @else {
                        <span style="display:inline-flex;align-items:center;gap:4px;background:#dcfce7;color:#15803d;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;">
                          <span class="material-icons-round" style="font-size:12px;">check_circle</span> OK
                        </span>
                      }
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

            <!-- Reallocation Point -->
            <div style="margin-bottom:16px;">
              <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px;">
                Reallocation Point <span style="font-weight:400;color:#9CA3AF;">(alert when below this)</span>
              </label>
              <input [(ngModel)]="allocForm.reallocationPoint" type="number" min="0" step="1"
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

  loading  = signal(true);
  saving   = signal(false);
  errorMsg = signal('');
  fifoError = signal('');

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

  belowThresholdAllocations = computed(() =>
    this.allocations().filter(a => this.isBelowThreshold(a))
  );

  // Modal state
  showAddChannelModal  = signal(false);
  showAllocationModal  = signal(false);
  showDeleteModal      = signal(false);

  newChannelName = '';
  allocForm      = { flavorId: '', flavorName: '', boxes: 0, reallocationPoint: 0 };
  editingAllocation:  D2CAllocation | null = null;
  deletingAllocation: D2CAllocation | null = null;

  fifoLines = signal<FifoLine[]>([]);
  fifoTotal = () => this.fifoLines().reduce((s, l) => s + l.take, 0);

  readonly suggestedChannels = SUGGESTED_CHANNELS;

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadData(), this.loadFlavors()]);
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    const { data, error } = await this.supabase.client
      .from('gg_d2c_allocations')
      .select('id, channel_name, flavor_id, flavor_name, boxes_allocated, reallocation_point')
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

  isBelowThreshold(a: D2CAllocation): boolean {
    return (a.reallocation_point ?? 0) > 0 && a.boxes_allocated <= a.reallocation_point;
  }

  channelBelowThreshold(channel: string): boolean {
    return this.allocations().some(a => a.channel_name === channel && this.isBelowThreshold(a));
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
    this.allocForm = { flavorId: '', flavorName: '', boxes: 0, reallocationPoint: 0 };
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
      reallocationPoint: alloc.reallocation_point,
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
            boxes_allocated:    this.fifoTotal(),
            reallocation_point: this.allocForm.reallocationPoint,
            updated_at:         new Date().toISOString(),
          })
          .eq('id', this.editingAllocation.id);

      } else {
        // ── CREATE: insert allocation record, then dispatch events ──
        const { data: newAlloc, error } = await this.supabase.client
          .from('gg_d2c_allocations')
          .insert({
            channel_name:       this.selectedChannel(),
            flavor_id:          this.allocForm.flavorId,
            flavor_name:        this.allocForm.flavorName,
            boxes_allocated:    this.fifoTotal(),
            reallocation_point: this.allocForm.reallocationPoint,
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
