import { Component, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PackAllocationService } from './pack-allocation.service';
import {
  AllocationResult,
  FlavorAllocation,
  InvoiceForPacking,
} from './pack-types';

type ModalState = 'computing' | 'preview' | 'committing' | 'error';

@Component({
  selector: 'app-pack-modal',
  standalone: true,
  imports: [CommonModule, DatePipe, DecimalPipe, FormsModule],
  template: `
    <div class="pack-overlay" (click)="onBackdropClick()">
      <div class="pack-modal" (click)="$event.stopPropagation()">

        <!-- Header -->
        <div class="pack-header">
          <div>
            <h2 style="font-size:16px;font-weight:700;color:#121212;margin:0 0 2px;">
              Mark Packed
              <span style="font-family:monospace;color:#374151;margin-left:6px;">{{ invoice.invoice_number }}</span>
            </h2>
            <p style="font-size:12px;color:#9CA3AF;margin:0;">{{ invoice.customer_name }} · {{ totalNeeded() }} boxes total</p>
          </div>
          <button (click)="onCancel()" [disabled]="state() === 'committing'"
                  style="border:none;background:none;cursor:pointer;color:#9CA3AF;display:flex;align-items:center;padding:4px;">
            <span class="material-icons-round" style="font-size:20px;">close</span>
          </button>
        </div>

        <!-- Body -->
        <div class="pack-body">

          @if (state() === 'computing') {
            <div style="padding:48px;text-align:center;">
              <div class="pack-spinner"></div>
              <p style="font-size:14px;color:#6B7280;margin:14px 0 0;">Calculating FIFO allocation…</p>
            </div>
          }

          @if (state() === 'committing') {
            <div style="padding:48px;text-align:center;">
              <div class="pack-spinner"></div>
              <p style="font-size:14px;color:#6B7280;margin:14px 0 0;">Saving reservation…</p>
            </div>
          }

          @if (state() === 'error') {
            <div style="padding:32px;text-align:center;">
              <span class="material-icons-round" style="font-size:36px;color:#dc2626;display:block;margin-bottom:10px;">error_outline</span>
              <p style="font-size:14px;color:#991b1b;font-weight:600;margin:0 0 4px;">Something went wrong</p>
              <p style="font-size:13px;color:#6B7280;margin:0;">{{ errorMsg() }}</p>
            </div>
          }

          @if (state() === 'preview' && result()) {

            <!-- Top banner: full or partial -->
            @if (result()!.fullyAllocated) {
              <div class="pack-banner pack-banner-ok">
                <span class="material-icons-round" style="font-size:18px;color:#15803d;">check_circle</span>
                <span>Full allocation possible — {{ totalNeeded() }} of {{ totalNeeded() }} boxes covered.</span>
              </div>
            } @else {
              <div class="pack-banner pack-banner-warn">
                <span class="material-icons-round" style="font-size:18px;color:#b45309;">warning_amber</span>
                <span>
                  Partial allocation: insufficient stock for
                  <strong>{{ result()!.partialFlavors.join(', ') }}</strong>.
                  Confirm to pack what's available.
                </span>
              </div>
            }

            <!-- Customize toggle -->
            <div style="display:flex;justify-content:flex-end;align-items:center;margin-bottom:8px;gap:10px;">
              @if (customize()) {
                <button (click)="onResetFifo()" class="pack-link"
                        title="Reset all batches to default FIFO suggestion">
                  <span class="material-icons-round" style="font-size:14px;">restart_alt</span>
                  Reset to FIFO
                </button>
              }
              <button (click)="toggleCustomize()" class="pack-link">
                <span class="material-icons-round" style="font-size:14px;">{{ customize() ? 'lock' : 'edit' }}</span>
                {{ customize() ? 'Lock allocation' : 'Customize' }}
              </button>
            </div>

            <!-- Per-flavor cards -->
            <div style="display:flex;flex-direction:column;gap:14px;">
              @for (fa of result()!.flavors; track fa.flavor_id) {
                <div class="pack-flavor-card">
                  <!-- Flavor header -->
                  <div class="pack-flavor-header">
                    <div style="display:flex;align-items:center;gap:10px;">
                      <div class="pack-flavor-icon">
                        <span class="material-icons-round" style="color:#15803d;font-size:14px;">local_dining</span>
                      </div>
                      <span style="font-size:14px;font-weight:700;color:#121212;">{{ fa.flavor_name }}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                      <span style="font-size:12px;color:#6B7280;">Need {{ fa.needed }}</span>
                      <span class="pack-status"
                            [class.pack-status-full]="allocatedFor(fa) === fa.needed && fa.needed > 0"
                            [class.pack-status-partial]="allocatedFor(fa) > 0 && allocatedFor(fa) < fa.needed"
                            [class.pack-status-empty]="allocatedFor(fa) === 0">
                        {{ allocatedFor(fa) }} / {{ fa.needed }}
                      </span>
                    </div>
                  </div>

                  <!-- Batches table -->
                  @if (fa.batches.length === 0) {
                    <div style="padding:14px 16px;text-align:center;color:#9CA3AF;font-size:12px;">
                      No batches with available stock for this flavor.
                    </div>
                  } @else {
                    <div class="pack-batch-grid pack-batch-header">
                      <span>Batch</span>
                      <span>Production</span>
                      <span style="text-align:right;">Available</span>
                      <span style="text-align:right;">Take</span>
                    </div>
                    @for (b of fa.batches; track b.batch_code) {
                      <div class="pack-batch-grid pack-batch-row">
                        <span style="font-family:monospace;font-weight:600;color:#121212;">{{ b.batch_code }}</span>
                        <span style="color:#374151;">{{ b.production_date | date:'dd MMM yyyy' }}</span>
                        <span style="color:#6B7280;text-align:right;">{{ b.available_boxes | number }}</span>
                        @if (customize()) {
                          <input type="number" min="0" [max]="b.available_boxes" step="1"
                                 [(ngModel)]="b.boxes_to_take" (ngModelChange)="onTakeChanged()"
                                 class="pack-take-input">
                        } @else {
                          <span style="color:#15803d;font-weight:700;text-align:right;">{{ b.boxes_to_take | number }}</span>
                        }
                      </div>
                    }
                  }
                </div>
              }
            </div>
          }
        </div>

        <!-- Footer -->
        <div class="pack-footer">
          @if (state() === 'preview') {
            <button (click)="onCancel()" class="pack-btn pack-btn-secondary">Cancel</button>
            <button (click)="onConfirm()" class="pack-btn"
                    [class.pack-btn-primary]="result()!.fullyAllocated"
                    [class.pack-btn-warn]="!result()!.fullyAllocated"
                    [disabled]="overallocated() || totalAllocated() === 0">
              <span class="material-icons-round" style="font-size:16px;">{{ result()!.fullyAllocated ? 'check' : 'warning' }}</span>
              {{ result()!.fullyAllocated ? 'Confirm allocation' : 'Confirm partial' }}
              ({{ totalAllocated() | number }} boxes)
            </button>
          }
          @if (state() === 'error') {
            <button (click)="onCancel()" class="pack-btn pack-btn-secondary">Close</button>
            <button (click)="recompute()" class="pack-btn pack-btn-primary">Retry</button>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .pack-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:1000; display:flex; align-items:center; justify-content:center; padding:16px; }
    .pack-modal { background:#fff; border-radius:16px; width:100%; max-width:640px; max-height:90vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.2); }
    .pack-header { display:flex; align-items:center; justify-content:space-between; padding:18px 22px; border-bottom:1px solid #E5E7EB; flex-shrink:0; }
    .pack-body { flex:1; overflow-y:auto; padding:18px 22px; }
    .pack-footer { display:flex; gap:10px; align-items:center; justify-content:flex-end; padding:14px 22px; border-top:1px solid #E5E7EB; flex-shrink:0; background:#f8f9fa; }
    .pack-footer:empty { display:none; }
    .pack-btn { padding:9px 18px; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:6px; border:none; }
    .pack-btn:disabled { opacity:0.5; cursor:not-allowed; }
    .pack-btn-primary { background:#01AC51; color:#fff; }
    .pack-btn-warn    { background:#b45309; color:#fff; }
    .pack-btn-secondary { background:#fff; color:#374151; border:1px solid #E5E7EB; }
    .pack-link { background:none; border:none; color:#01AC51; font-size:12px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:4px; padding:4px 6px; border-radius:6px; }
    .pack-link:hover { background:#f0fdf4; }
    .pack-spinner { margin:0 auto; width:28px; height:28px; border:3px solid #E5E7EB; border-top-color:#01AC51; border-radius:50%; animation:packspin 0.7s linear infinite; }
    @keyframes packspin { to { transform:rotate(360deg); } }
    .pack-banner { display:flex; align-items:flex-start; gap:8px; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:12px; }
    .pack-banner-ok   { background:#f0fdf4; border:1px solid #bbf7d0; color:#166534; }
    .pack-banner-warn { background:#fffbeb; border:1px solid #fde68a; color:#92400e; }
    .pack-flavor-card { border:1px solid #E5E7EB; border-radius:10px; overflow:hidden; }
    .pack-flavor-header { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#f8f9fa; border-bottom:1px solid #E5E7EB; }
    .pack-flavor-icon { width:24px; height:24px; border-radius:6px; background:#dcfce7; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .pack-status { padding:3px 8px; border-radius:999px; font-size:11px; font-weight:700; }
    .pack-status-full    { background:#dcfce7; color:#15803d; }
    .pack-status-partial { background:#fef3c7; color:#b45309; }
    .pack-status-empty   { background:#fee2e2; color:#991b1b; }
    .pack-batch-grid { display:grid; grid-template-columns:1fr 1fr 100px 100px; gap:8px; padding:7px 14px; font-size:12px; align-items:center; }
    .pack-batch-header { background:#f8f9fa; border-bottom:1px solid #E5E7EB; font-size:10px; font-weight:700; color:#6B7280; text-transform:uppercase; letter-spacing:0.4px; }
    .pack-batch-row    { border-bottom:1px solid #f3f4f6; }
    .pack-batch-row:last-child { border-bottom:none; }
    .pack-take-input { padding:4px 8px; border:1px solid #E5E7EB; border-radius:6px; font-size:12px; text-align:right; width:80px; justify-self:end; }
    .pack-take-input:focus { outline:none; border-color:#01AC51; }
  `],
})
export class PackModalComponent implements OnInit {
  private readonly allocator = inject(PackAllocationService);

  @Input({ required: true }) invoice!: InvoiceForPacking;
  @Output() closed = new EventEmitter<{ packed: boolean }>();

  state = signal<ModalState>('computing');
  result = signal<AllocationResult | null>(null);
  errorMsg = signal('');
  customize = signal(false);

  readonly totalNeeded = computed(() =>
    (this.invoice?.items ?? []).reduce((s, it) => s + (it.quantity_boxes || 0), 0)
  );

  readonly totalAllocated = computed(() =>
    (this.result()?.flavors ?? []).reduce(
      (s, fa) => s + fa.batches.reduce((b, x) => b + (Number(x.boxes_to_take) || 0), 0),
      0
    )
  );

  /** True if any flavor has been allocated more than its needed quantity. */
  readonly overallocated = computed(() => {
    const r = this.result();
    if (!r) return false;
    return r.flavors.some((fa) => this.allocatedFor(fa) > fa.needed);
  });

  async ngOnInit(): Promise<void> {
    await this.recompute();
  }

  async recompute(): Promise<void> {
    this.state.set('computing');
    this.errorMsg.set('');
    try {
      const flavorIds = this.invoice.items.map((i) => i.flavor_id);
      const availability = await this.allocator.loadAvailability(flavorIds);
      const result = this.allocator.computeFifo(this.invoice.items, availability);
      this.result.set(result);
      this.state.set('preview');
    } catch (err) {
      console.error('[pack-modal] recompute failed', err);
      this.errorMsg.set(err instanceof Error ? err.message : 'Failed to compute allocation.');
      this.state.set('error');
    }
  }

  toggleCustomize(): void {
    this.customize.update((v) => !v);
  }

  /**
   * Reset all take quantities to the default FIFO suggestion. Useful
   * if the user has fiddled in customize mode and wants to start over.
   */
  onResetFifo(): void {
    void this.recompute();
  }

  onTakeChanged(): void {
    // Force the result signal to recompute downstream computeds.
    this.result.set({ ...this.result()! });
  }

  allocatedFor(fa: FlavorAllocation): number {
    return fa.batches.reduce((s, b) => s + (Number(b.boxes_to_take) || 0), 0);
  }

  async onConfirm(): Promise<void> {
    const r = this.result();
    if (!r) return;
    if (this.overallocated()) return;
    if (this.totalAllocated() === 0) return;

    this.state.set('committing');
    try {
      await this.allocator.commitAllocation(this.invoice.id, r.flavors);
      this.closed.emit({ packed: true });
    } catch (err) {
      console.error('[pack-modal] commit failed', err);
      this.errorMsg.set(err instanceof Error ? err.message : 'Failed to save reservation.');
      this.state.set('error');
    }
  }

  onCancel(): void {
    if (this.state() === 'committing') return;
    this.closed.emit({ packed: false });
  }

  onBackdropClick(): void {
    if (this.state() === 'committing') return;
    this.onCancel();
  }
}
