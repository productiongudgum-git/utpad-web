import { Component, OnInit, inject, signal } from '@angular/core';
<<<<<<< HEAD
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../../core/supabase.service';
import { WorkerDirectoryService } from '../../../core/services/worker-directory.service';
import { DispatchEvent } from '../../../shared/models/manufacturing.models';
=======
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
>>>>>>> bdc4f38 (Add wastage page, invoice management, dispatch window, batch size dropdown)

interface BatchFlavorOption {
  batch_code: string;
  flavor_id: string;
  flavor_name: string;
  flavor_code: string;
  production_date: string;
}

@Component({
  selector: 'app-dispatch',
  standalone: true,
<<<<<<< HEAD
  imports: [CommonModule, FormsModule],
  styles: [`
    .wizard-card {
      background: #fff; border-radius: 16px; border: 1px solid #E5E7EB;
      padding: 28px; margin-bottom: 24px; box-shadow: 0 4px 20px rgb(0 0 0 / 0.03);
    }
    .wizard-header {
      display: flex; align-items: center; gap: 12px; margin-bottom: 24px;
    }
    .wizard-icon {
      width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
      font-size: 22px; color: #fff;
    }
    .field-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
    }
    @media (max-width: 640px) { .field-grid { grid-template-columns: 1fr; } }
    .field-label {
      display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;
    }
    .flavor-chip {
      display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600;
    }
    .flavor-chip.mint { background: #dcfce7; color: #15803d; }
    .flavor-chip.berry { background: #fce7f3; color: #be185d; }
    .flavor-chip.citrus { background: #fef9c3; color: #a16207; }
    .flavor-chip.default { background: #dbeafe; color: #2563eb; }

    .batch-option-card {
      padding: 12px 16px; border: 2px solid #E5E7EB; border-radius: 12px; cursor: pointer;
      transition: all 0.2s; display: flex; align-items: center; justify-content: space-between;
    }
    .batch-option-card:hover { border-color: #F59E0B; background: #FFFBEB; }
    .batch-option-card.selected { border-color: #F59E0B; background: #FFFBEB; box-shadow: 0 0 0 3px rgba(245,158,11,0.12); }

    .table-wrapper {
      overflow-x: auto; border-radius: 12px; border: 1px solid #E5E7EB;
    }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead { background: #F9FAFB; }
    th { padding: 12px 16px; text-align: left; font-weight: 600; color: #6B7280; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }
    td { padding: 12px 16px; border-top: 1px solid #F3F4F6; color: #374151; }
    tr:hover td { background: #F9FAFB; }
  `],
  template: `
    <div style="padding:6px 0;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="font-family:'Cabin',sans-serif;font-size:22px;font-weight:700;color:#121212;margin:0 0 4px;">Dispatch Records</h1>
          <p style="color:#6B7280;font-size:14px;margin:0;">Track outgoing dispatch with batch + flavor details.</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button (click)="toggleNewEntry()" class="beautiful-button" style="font-size:13px;padding:8px 18px;background:linear-gradient(to bottom, rgba(245,158,11,0.9), #F59E0B);box-shadow:0 4px 12px rgba(245,158,11,0.25);">
            <span class="material-icons-round" style="font-size:18px;">{{ showNewEntry() ? 'close' : 'add' }}</span>
            {{ showNewEntry() ? 'Cancel' : 'New Dispatch' }}
          </button>
          <button (click)="load()" style="padding:8px 14px;background:#F1F5F9;border:1px solid #E5E7EB;border-radius:12px;cursor:pointer;display:flex;align-items:center;gap:6px;font-size:13px;font-weight:500;color:#374151;">
            <span class="material-icons-round" style="font-size:16px;">refresh</span> Refresh
          </button>
        </div>
      </div>

      <!-- ═══ NEW DISPATCH WIZARD ═══ -->
      @if (showNewEntry()) {
        <div class="wizard-card" style="border-left:4px solid #F59E0B;">
          <div class="wizard-header">
            <div class="wizard-icon" style="background:linear-gradient(135deg,#F59E0B,#D97706);">
              <span class="material-icons-round">local_shipping</span>
            </div>
            <div>
              <h2 style="font-family:'Cabin',sans-serif;font-size:17px;font-weight:700;color:#121212;margin:0;">New Dispatch Entry</h2>
              <p style="font-size:13px;color:#6B7280;margin:2px 0 0;">Select batch + flavor, then enter dispatch details.</p>
            </div>
          </div>

          <!-- Step 1: Select Batch + Flavor -->
          <div style="margin-bottom:20px;">
            <label class="field-label" style="margin-bottom:10px;">Select Batch & Flavor (SKU)</label>
            @if (batchFlavors().length === 0) {
              <div style="padding:20px;text-align:center;color:#9CA3AF;background:#F9FAFB;border-radius:12px;border:1px dashed #E5E7EB;">
                <span class="material-icons-round" style="font-size:32px;display:block;margin-bottom:8px;">info</span>
                <p style="margin:0;font-size:13px;">No production batches available for dispatch.</p>
              </div>
            } @else {
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;">
                @for (bf of batchFlavors(); track bf.batch_code + bf.flavor_id) {
                  <div class="batch-option-card"
                       [class.selected]="selectedBatchCode === bf.batch_code && selectedFlavorId === bf.flavor_id"
                       (click)="selectBatchFlavor(bf)">
                    <div>
                      <div style="font-family:monospace;font-size:13px;font-weight:600;color:#121212;">{{ bf.batch_code }}</div>
                      <span [class]="'flavor-chip ' + getFlavorClass(bf.flavor_name)">{{ bf.flavor_name }}</span>
                    </div>
                    <div style="text-align:right;">
                      <div style="font-size:11px;color:#9CA3AF;">{{ bf.production_date }}</div>
                      @if (selectedBatchCode === bf.batch_code && selectedFlavorId === bf.flavor_id) {
                        <span class="material-icons-round" style="color:#F59E0B;font-size:20px;">check_circle</span>
                      }
                    </div>
                  </div>
                }
              </div>
            }
          </div>

          <!-- Step 2: Dispatch details -->
          @if (selectedBatchCode) {
            <div class="field-grid" style="margin-bottom:20px;">
              <div>
                <label class="field-label">Invoice Number *</label>
                <input [(ngModel)]="newInvoiceNumber" class="beautiful-input" placeholder="e.g. INV-2026-001" style="font-size:14px;">
              </div>
              <div>
                <label class="field-label">Customer Name</label>
                <input [(ngModel)]="newCustomerName" class="beautiful-input" placeholder="e.g. Sharma Traders" style="font-size:14px;">
              </div>
              <div>
                <label class="field-label">Boxes Dispatched *</label>
                <input [(ngModel)]="newBoxesDispatched" type="number" min="1" class="beautiful-input" placeholder="e.g. 25" style="font-size:14px;">
              </div>
              <div>
                <label class="field-label">Worker ID</label>
                <input [(ngModel)]="newWorkerId" class="beautiful-input" placeholder="e.g. worker-dispatch-1" style="font-size:14px;">
              </div>
            </div>
          }

          @if (formError()) {
            <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:10px 14px;margin-bottom:16px;display:flex;align-items:center;gap:8px;">
              <span class="material-icons-round" style="font-size:18px;color:#DC2626;">error</span>
              <span style="font-size:13px;color:#991B1B;">{{ formError() }}</span>
            </div>
          }

          <div style="display:flex;gap:10px;">
            <button (click)="submitDispatch()" [disabled]="saving() || !selectedBatchCode" class="beautiful-button" style="font-size:13px;padding:10px 24px;background:linear-gradient(to bottom, rgba(245,158,11,0.9), #F59E0B);box-shadow:0 4px 12px rgba(245,158,11,0.25);">
              @if (saving()) {
                <span class="spinner" style="width:16px;height:16px;"></span> Saving...
              } @else {
                <span class="material-icons-round" style="font-size:18px;">check</span> Submit Dispatch
              }
            </button>
            <button (click)="toggleNewEntry()" style="padding:10px 20px;background:#F3F4F6;border:1px solid #E5E7EB;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;color:#374151;">Cancel</button>
=======
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
>>>>>>> bdc4f38 (Add wastage page, invoice management, dispatch window, batch size dropdown)
          </div>
        </div>
      }

<<<<<<< HEAD
      <!-- ═══ TOAST ═══ -->
      @if (toast()) {
        <div class="toast" [class.toast-success]="toastKind()==='success'" [class.toast-error]="toastKind()==='error'">{{ toast() }}</div>
      }

      <!-- ═══ TABLE ═══ -->
      @if (loading()) {
        <div style="display:grid;gap:8px;">
          @for (i of [1,2,3,4]; track i) { <div class="skeleton" style="height:52px;border-radius:10px;"></div> }
        </div>
      } @else if (events().length === 0) {
        <div style="text-align:center;padding:60px 0;color:#9CA3AF;">
          <span class="material-icons-round" style="font-size:48px;display:block;margin-bottom:12px;">local_shipping</span>
          <p style="font-size:15px;margin:0;">No dispatch records yet.</p>
          <p style="font-size:13px;margin:6px 0 0;">Click "New Dispatch" to record a shipment.</p>
        </div>
      } @else {
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Flavor / SKU</th>
                <th>Batch</th>
                <th>Worker</th>
                <th style="text-align:right;">Boxes</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              @for (event of events(); track event.id) {
                <tr>
                  <td style="font-family:monospace;font-size:12px;font-weight:600;">{{ event.invoice_number }}</td>
                  <td>{{ event.customer_name ?? '—' }}</td>
                  <td>
                    <span [class]="'flavor-chip ' + getFlavorClassFromEvent(event)">
                      {{ event.sku?.name ?? event.sku_id }}
                    </span>
                  </td>
                  <td style="font-family:monospace;font-size:12px;">{{ event.batch_code }}</td>
                  <td>{{ getWorkerLabel(event.worker_id) }}</td>
                  <td style="text-align:right;font-weight:600;">{{ event.boxes_dispatched }}</td>
                  <td>{{ event.dispatch_date }}</td>
=======
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
                        {{ row.is_dispatched ? 'local_shipping' : 'local_shipping' }}
                      </span>
                    </button>
                  </td>
>>>>>>> bdc4f38 (Add wastage page, invoice management, dispatch window, batch size dropdown)
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
<<<<<<< HEAD
  private supabase = inject(SupabaseService);
  private workerDirectory = inject(WorkerDirectoryService);
  private readonly uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  readonly workerMap = this.workerDirectory.workers;

  events = signal<DispatchEvent[]>([]);
  batchFlavors = signal<BatchFlavorOption[]>([]);
  loading = signal(false);
  saving = signal(false);
  showNewEntry = signal(false);
  formError = signal('');
  toast = signal('');
  toastKind = signal<'success' | 'error'>('success');

  // Form fields
  selectedBatchCode = '';
  selectedFlavorId = '';
  newInvoiceNumber = '';
  newCustomerName = '';
  newBoxesDispatched: number | null = null;
  newWorkerId = '';

  ngOnInit(): void {
    void this.workerDirectory.refresh();
    this.load();
    this.loadBatchFlavors();
    this.subscribeRealtime();
  }

  toggleNewEntry(): void {
    this.showNewEntry.update(v => !v);
    if (this.showNewEntry()) this.loadBatchFlavors();
    else this.resetForm();
  }

  selectBatchFlavor(bf: BatchFlavorOption): void {
    this.selectedBatchCode = bf.batch_code;
    this.selectedFlavorId = bf.flavor_id;
  }

  async load(): Promise<void> {
    this.loading.set(true);
    const { data, error } = await this.supabase.client
      .from('dispatch_events')
      .select('*, sku:gg_flavors(id,name,code)')
      .order('dispatch_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);
    if (!error && data) this.events.set(data as DispatchEvent[]);
    this.loading.set(false);
  }

  async loadBatchFlavors(): Promise<void> {
    const { data } = await this.supabase.client
      .from('production_batches')
      .select('batch_code, flavor_id, production_date, flavor:gg_flavors!production_batches_flavor_id_fkey(id,name,code)')
      .order('production_date', { ascending: false })
      .limit(50);

    if (data) {
      this.batchFlavors.set(data.map((d: any) => ({
        batch_code: d.batch_code,
        flavor_id: d.flavor_id ?? '',
        flavor_name: d.flavor?.name ?? d.flavor_id ?? 'Unknown',
        flavor_code: d.flavor?.code ?? '',
        production_date: d.production_date,
      })));
    }
  }

  async submitDispatch(): Promise<void> {
    this.formError.set('');

    if (!this.selectedBatchCode) {
      this.formError.set('Please select a batch + flavor.');
      return;
    }
    if (!this.newInvoiceNumber.trim()) {
      this.formError.set('Invoice number is required.');
      return;
    }
    if (!this.newBoxesDispatched || this.newBoxesDispatched < 1) {
      this.formError.set('Boxes dispatched must be at least 1.');
      return;
    }

    this.saving.set(true);

    const payload: any = {
      batch_code: this.selectedBatchCode,
      sku_id: this.selectedFlavorId || null,
      invoice_number: this.newInvoiceNumber.trim(),
      customer_name: this.newCustomerName.trim() || null,
      boxes_dispatched: this.newBoxesDispatched,
      dispatch_date: new Date().toISOString().split('T')[0],
      worker_id: this.toUuidOrNull(this.newWorkerId),
    };

    const { error } = await this.supabase.client
      .from('dispatch_events')
      .insert(payload);

    if (error) {
      this.formError.set(error.message);
      this.saving.set(false);
      return;
    }

    this.showToast('Dispatch recorded!', 'success');
    this.showNewEntry.set(false);
    this.resetForm();
    this.saving.set(false);
    await this.load();
  }

  getFlavorClass(name: string): string {
    const lc = name.toLowerCase();
    if (lc.includes('mint') || lc.includes('spear')) return 'mint';
    if (lc.includes('berry') || lc.includes('straw') || lc.includes('bubble')) return 'berry';
    if (lc.includes('lemon') || lc.includes('citrus') || lc.includes('watermelon')) return 'citrus';
    return 'default';
  }

  getFlavorClassFromEvent(e: DispatchEvent): string {
    return this.getFlavorClass(e.sku?.name ?? '');
  }

  getWorkerLabel(workerId: string | null | undefined): string {
    if (!workerId) return '—';
    return this.workerMap()[workerId]?.name ?? workerId;
  }

  subscribeRealtime(): void {
    this.supabase.client
      .channel('dispatch-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_events' }, () => this.load())
      .subscribe();
=======
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
    if (!next) update.is_dispatched = false; // unpacking also un-dispatches
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
>>>>>>> bdc4f38 (Add wastage page, invoice management, dispatch window, batch size dropdown)
  }

  private resetForm(): void {
    this.selectedBatchCode = '';
    this.selectedFlavorId = '';
    this.newInvoiceNumber = '';
    this.newCustomerName = '';
    this.newBoxesDispatched = null;
    this.newWorkerId = '';
    this.formError.set('');
  }

  private showToast(msg: string, kind: 'success' | 'error'): void {
    this.toast.set(msg);
    this.toastKind.set(kind);
    setTimeout(() => this.toast.set(''), 3000);
  }

  private toUuidOrNull(value: string): string | null {
    const trimmed = value.trim();
    return this.uuidPattern.test(trimmed) ? trimmed : null;
  }
}
