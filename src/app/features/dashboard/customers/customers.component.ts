import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseService } from '../../../core/supabase.service';

interface Customer {
  id: string; name: string; contact_person: string;
  phone: string; email: string; address: string;
  total_dispatched_kg: number; dispatch_count: number;
}

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe],
  template: `
    <div style="padding:24px;max-width:1000px;">
      <div style="margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="font-family:'Cabin',sans-serif;font-size:22px;font-weight:700;color:#121212;margin:0 0 4px;">Customers</h1>
          <p style="color:#6B7280;font-size:14px;margin:0;">B2B customer directory and dispatch history.</p>
        </div>
        <button (click)="toggleForm()" style="padding:9px 18px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">
          <span class="material-icons-round" style="font-size:18px;">{{ showForm() ? 'close' : 'add' }}</span>
          {{ showForm() ? 'Cancel' : 'Add Customer' }}
        </button>
      </div>

      @if (showForm()) {
        <div style="background:#fff;border-radius:12px;border:1px solid #E5E7EB;padding:24px;margin-bottom:24px;">
          <h2 style="font-family:'Cabin',sans-serif;font-size:16px;font-weight:600;margin:0 0 20px;">{{ editId() ? 'Edit' : 'Add' }} Customer</h2>
          <form [formGroup]="form" (ngSubmit)="save()">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;" class="cust-grid">
              <div>
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Business Name *</label>
                <input formControlName="name" class="gg-input" placeholder="e.g. Sharma Traders">
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Contact Person</label>
                <input formControlName="contact_person" class="gg-input" placeholder="e.g. Suresh Sharma">
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Phone</label>
                <input formControlName="phone" class="gg-input" placeholder="9876543210">
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Email</label>
                <input formControlName="email" type="email" class="gg-input" placeholder="customer@example.com">
              </div>
              <div style="grid-column:1/-1;">
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Address</label>
                <input formControlName="address" class="gg-input" placeholder="Full address...">
              </div>
            </div>
            @if (formError()) { <p style="color:#FF2828;font-size:13px;margin-bottom:12px;">{{ formError() }}</p> }
            <div style="display:flex;gap:10px;">
              <button type="submit" [disabled]="saving()" class="gg-btn-primary">{{ saving() ? 'Saving...' : (editId() ? 'Update' : 'Add Customer') }}</button>
              @if (editId()) {
                <button type="button" (click)="cancelEdit()" style="padding:8px 16px;background:#f3f4f6;border:1px solid #E5E7EB;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;color:#374151;">Cancel</button>
              }
            </div>
          </form>
        </div>
      }

      @if (toast()) {
        <div class="toast" [class.toast-success]="toastKind()==='success'" [class.toast-error]="toastKind()==='error'">{{ toast() }}</div>
      }

      @if (loading()) {
        <div style="display:flex;flex-direction:column;gap:12px;">
          @for (i of [1,2,3]; track i) { <div class="gg-skeleton" style="height:90px;border-radius:12px;"></div> }
        </div>
      } @else if (customers().length === 0) {
        <div style="text-align:center;padding:60px 0;color:#9CA3AF;">
          <span class="material-icons-round" style="font-size:48px;display:block;margin-bottom:12px;">people</span>
          <p style="font-size:15px;margin:0;">No customers yet.</p>
        </div>
      } @else {
        <div style="display:flex;flex-direction:column;gap:12px;">
          @for (c of customers(); track c.id) {
            <div style="background:#fff;border-radius:12px;border:1px solid #E5E7EB;padding:16px 20px;">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                <div style="flex:1;min-width:0;">
                  <p style="font-size:15px;font-weight:700;color:#121212;margin:0 0 4px;font-family:'Cabin',sans-serif;">{{ c.name }}</p>
                  <div style="display:flex;flex-wrap:wrap;gap:12px;font-size:13px;color:#6B7280;margin-bottom:8px;">
                    @if (c.contact_person) { <span>👤 {{ c.contact_person }}</span> }
                    @if (c.phone) { <span>📞 {{ c.phone }}</span> }
                    @if (c.email) { <span>✉️ {{ c.email }}</span> }
                  </div>
                  <div style="display:flex;gap:12px;flex-wrap:wrap;">
                    <span style="background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600;">
                      {{ c.dispatch_count }} dispatch{{ c.dispatch_count !== 1 ? 'es' : '' }}
                    </span>
                    <span style="background:#dbeafe;border:1px solid #93c5fd;color:#2563eb;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600;">
                      {{ c.total_dispatched_kg | number:'1.0-1' }} kg total
                    </span>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                  <button (click)="viewHistory(c)" style="padding:6px 12px;background:#f3f4f6;border:1px solid #E5E7EB;color:#374151;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;">
                    <span class="material-icons-round" style="font-size:14px;">history</span> History
                  </button>
                  <button (click)="startEdit(c)" style="padding:6px 12px;background:#f0fdf4;border:1px solid #01AC51;color:#01AC51;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Edit</button>
                  <button (click)="deleteCustomer(c.id)" style="padding:6px 12px;background:#fff5f5;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Delete</button>
                </div>
              </div>
            </div>
          }
        </div>
      }

      <!-- History modal -->
      @if (historyCustomer()) {
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:50;display:flex;align-items:center;justify-content:center;padding:16px;">
          <div style="background:#fff;border-radius:16px;padding:24px;max-width:560px;width:100%;max-height:80vh;overflow-y:auto;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
              <h3 style="font-family:'Cabin',sans-serif;font-size:16px;font-weight:700;margin:0;">Dispatch History — {{ historyCustomer()!.name }}</h3>
              <button (click)="historyCustomer.set(null)" style="background:none;border:none;cursor:pointer;color:#6B7280;font-size:20px;display:flex;">✕</button>
            </div>
            @if (historyLoading()) {
              <p style="color:#6B7280;font-size:13px;">Loading...</p>
            } @else if (customerHistory().length === 0) {
              <p style="color:#9CA3AF;font-size:14px;text-align:center;padding:24px 0;">No dispatches found.</p>
            } @else {
              <div style="display:flex;flex-direction:column;gap:8px;">
                @for (d of customerHistory(); track d.id) {
                  <div style="background:#f8f9fa;border-radius:8px;padding:12px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                      <span style="font-size:13px;font-weight:600;color:#121212;">Batch: {{ d.batch_code }}</span>
                      <span style="font-size:12px;font-weight:600;color:#01AC51;">{{ d.quantity_dispatched | number:'1.0-1' }} kg</span>
                    </div>
                    <p style="font-size:12px;color:#6B7280;margin:0;">{{ d.dispatch_date | date:'dd MMM yyyy' }}</p>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      }
    </div>
    <style>
      @media (max-width:480px) { .cust-grid { grid-template-columns: 1fr !important; } }
    </style>
  `,
})
export class CustomersComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly fb = inject(FormBuilder);

  loading = signal(true);
  saving = signal(false);
  showForm = signal(false);
  editId = signal<string | null>(null);
  customers = signal<Customer[]>([]);
  formError = signal('');
  toast = signal('');
  toastKind = signal<'success'|'error'>('success');
  historyCustomer = signal<Customer | null>(null);
  customerHistory = signal<any[]>([]);
  historyLoading = signal(false);

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    contact_person: [''], phone: [''], email: [''], address: [''],
  });

  async ngOnInit(): Promise<void> { await this.loadData(); }
  toggleForm(): void { if (this.showForm()) { this.cancelEdit(); } else { this.showForm.set(true); } }

  startEdit(c: Customer): void {
    this.editId.set(c.id);
    this.form.setValue({ name: c.name, contact_person: c.contact_person, phone: c.phone, email: c.email, address: c.address });
    this.showForm.set(true);
  }
  cancelEdit(): void { this.editId.set(null); this.form.reset(); this.showForm.set(false); }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true); this.formError.set('');
    const v = this.form.getRawValue();
    if (this.editId()) {
      const { error } = await this.supabase.client.from('gg_customers').update(v).eq('id', this.editId()!);
      if (error) { this.formError.set(error.message); this.saving.set(false); return; }
    } else {
      const { error } = await this.supabase.client.from('gg_customers').insert(v);
      if (error) { this.formError.set(error.message); this.saving.set(false); return; }
    }
    this.showToast(this.editId() ? 'Customer updated' : 'Customer added', 'success');
    this.cancelEdit(); await this.loadData(); this.saving.set(false);
  }

  async deleteCustomer(id: string): Promise<void> {
    if (!confirm('Delete this customer?')) return;
    const { error } = await this.supabase.client.from('gg_customers').delete().eq('id', id);
    if (!error) { this.showToast('Deleted', 'success'); await this.loadData(); }
    else this.showToast(error.message, 'error');
  }

  async viewHistory(c: Customer): Promise<void> {
    this.historyCustomer.set(c); this.historyLoading.set(true);
    const { data } = await this.supabase.client.from('gg_dispatch')
      .select('id, quantity_dispatched, dispatch_date, gg_batches(batch_code)')
      .eq('customer_id', c.id).order('dispatch_date', { ascending: false });
    this.customerHistory.set((data ?? []).map((d: any) => ({
      id: d.id, quantity_dispatched: d.quantity_dispatched ?? 0,
      dispatch_date: d.dispatch_date, batch_code: (d.gg_batches as any)?.batch_code ?? '?',
    })));
    this.historyLoading.set(false);
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);
    const [{ data: custs }, { data: disp }] = await Promise.all([
      this.supabase.client.from('gg_customers').select('id, name, contact_person, phone, email, address').order('name'),
      this.supabase.client.from('gg_dispatch').select('customer_id, quantity_dispatched'),
    ]);
    const dispMap = new Map<string, { count: number; total: number }>();
    (disp ?? []).forEach((d: any) => {
      const e = dispMap.get(d.customer_id) ?? { count: 0, total: 0 };
      e.count++; e.total += d.quantity_dispatched ?? 0;
      dispMap.set(d.customer_id, e);
    });
    this.customers.set((custs ?? []).map((c: any) => ({
      id: c.id, name: c.name, contact_person: c.contact_person ?? '',
      phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '',
      total_dispatched_kg: dispMap.get(c.id)?.total ?? 0,
      dispatch_count: dispMap.get(c.id)?.count ?? 0,
    })));
    this.loading.set(false);
  }

  private showToast(msg: string, kind: 'success'|'error'): void {
    this.toast.set(msg); this.toastKind.set(kind);
    setTimeout(() => this.toast.set(''), 3000);
  }
}
