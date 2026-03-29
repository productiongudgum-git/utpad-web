import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../../core/supabase.service';
import { DispatchEvent, FlavorDefinition } from '../../../shared/models/manufacturing.models';

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
          </div>
        </div>
      }

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
                  <td style="text-align:right;font-weight:600;">{{ event.boxes_dispatched }}</td>
                  <td>{{ event.dispatch_date }}</td>
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
  private supabase = inject(SupabaseService);

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
      sku_id: this.selectedFlavorId || this.selectedBatchCode,
      invoice_number: this.newInvoiceNumber.trim(),
      customer_name: this.newCustomerName.trim() || null,
      boxes_dispatched: this.newBoxesDispatched,
      dispatch_date: new Date().toISOString().split('T')[0],
      worker_id: this.newWorkerId.trim() || 'web-admin',
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

  subscribeRealtime(): void {
    this.supabase.client
      .channel('dispatch-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dispatch_events' }, () => this.load())
      .subscribe();
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
}
