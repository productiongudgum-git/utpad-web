import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { SupabaseService } from '../../../core/supabase.service';

interface DispatchEntry {
  id: string;
  quantity_dispatched: number;
  dispatch_date: string;
  batch_code: string;
  flavor_name: string;
}

interface Customer {
  id: string;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  total_dispatched_kg: number;
  dispatch_count: number;
  last_dispatch_date: string | null;
  dispatches: DispatchEntry[];
}

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [CommonModule, DatePipe, DecimalPipe, ReactiveFormsModule, FormsModule],
  template: `
    <!-- Toast -->
    @if (toast()) {
      <div style="position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 18px;border-radius:10px;display:flex;align-items:center;gap:8px;font-size:14px;font-weight:500;color:#fff;box-shadow:0 4px 20px rgba(0,0,0,0.2);animation:slideUp 0.2s ease;"
           [style.background]="toastKind()==='error' ? '#dc2626' : '#1a1a1a'">
        <span class="material-icons-round" style="font-size:16px;">{{ toastKind()==='error' ? 'error_outline' : 'check_circle' }}</span>
        {{ toast() }}
      </div>
    }

    <div style="padding:24px;max-width:1080px;">

      <!-- Header -->
      <div style="margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="font-size:22px;font-weight:700;color:var(--foreground);margin:0 0 4px;font-family:'Cabin',sans-serif;">Customers</h1>
          <p style="color:#6B7280;font-size:14px;margin:0;">B2B customer directory and dispatch history.</p>
        </div>
        <button (click)="openNewForm()"
                style="padding:9px 18px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">
          <span class="material-icons-round" style="font-size:18px;">add</span> Add Customer
        </button>
      </div>

      <!-- Summary strip -->
      @if (!loading() && customers().length > 0) {
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;" class="cust-summary-grid">
          <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 18px;">
            <p style="font-size:12px;color:#6B7280;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;margin:0 0 4px;">Total Customers</p>
            <p style="font-size:24px;font-weight:700;color:var(--foreground);margin:0;">{{ customers().length }}</p>
          </div>
          <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 18px;">
            <p style="font-size:12px;color:#6B7280;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;margin:0 0 4px;">Total Dispatched</p>
            <p style="font-size:24px;font-weight:700;color:var(--foreground);margin:0;">
              {{ grandTotalKg() | number:'1.0-0' }} <span style="font-size:14px;font-weight:400;color:#6B7280;">units</span>
            </p>
          </div>
          <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 18px;">
            <p style="font-size:12px;color:#6B7280;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;margin:0 0 4px;">Top Customer</p>
            <p style="font-size:16px;font-weight:700;color:var(--foreground);margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ topCustomer()?.name ?? '—' }}</p>
            <p style="font-size:12px;color:#6B7280;margin:4px 0 0;">{{ topCustomer()?.total_dispatched_kg | number:'1.0-0' }} units · {{ topCustomer()?.dispatch_count }} dispatches</p>
          </div>
        </div>

        <!-- Volume distribution chart -->
        @if (customers().length > 1 && grandTotalKg() > 0) {
          <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:18px 20px;margin-bottom:20px;">
            <p style="font-size:13px;font-weight:700;color:var(--foreground);margin:0 0 14px;display:flex;align-items:center;gap:6px;">
              <span class="material-icons-round" style="font-size:16px;color:#7c3aed;">bar_chart</span>
              Dispatch Volume Split
            </p>
            <div style="display:flex;flex-direction:column;gap:8px;">
              @for (c of chartCustomers(); track c.id) {
                <div style="display:flex;align-items:center;gap:10px;">
                  <span style="font-size:12px;font-weight:500;color:#374151;min-width:120px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0;">{{ c.name }}</span>
                  <div style="flex:1;height:8px;border-radius:4px;background:#f3f4f6;overflow:hidden;">
                    <div style="height:100%;border-radius:4px;transition:width 0.4s ease;"
                         [style.width]="volumePct(c) + '%'"
                         [style.background]="chartColors[$index % chartColors.length]">
                    </div>
                  </div>
                  <span style="font-size:12px;font-weight:700;color:#374151;min-width:60px;text-align:right;flex-shrink:0;">
                    {{ volumePct(c) | number:'1.0-1' }}%
                  </span>
                  <span style="font-size:11px;color:#9CA3AF;min-width:50px;text-align:right;flex-shrink:0;">
                    {{ c.total_dispatched_kg | number:'1.0-0' }} units
                  </span>
                </div>
              }
            </div>
          </div>
        }
      }

      <!-- Add / Edit form -->
      @if (showForm()) {
        <div style="background:var(--card);border-radius:12px;border:1px solid var(--border);padding:24px;margin-bottom:20px;animation:slideDown 0.15s ease;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
            <h2 style="font-size:16px;font-weight:700;color:var(--foreground);margin:0;">{{ editId() ? 'Edit Customer' : 'New Customer' }}</h2>
            <button (click)="closeForm()" style="border:none;background:none;cursor:pointer;color:#9CA3AF;display:flex;">
              <span class="material-icons-round" style="font-size:20px;">close</span>
            </button>
          </div>
          <form [formGroup]="form" (ngSubmit)="save()">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;" class="cust-form-grid">
              <div>
                <label class="cust-label">Business Name *</label>
                <input formControlName="name" class="gg-input" placeholder="e.g. Sharma Traders"
                       [style.border-color]="form.get('name')!.invalid && form.get('name')!.touched ? '#dc2626' : ''">
              </div>
              <div>
                <label class="cust-label">Contact Person</label>
                <input formControlName="contact_person" class="gg-input" placeholder="e.g. Suresh Sharma">
              </div>
              <div>
                <label class="cust-label">Phone</label>
                <input formControlName="phone" class="gg-input" placeholder="9876543210">
              </div>
              <div>
                <label class="cust-label">Email</label>
                <input formControlName="email" type="email" class="gg-input" placeholder="customer@example.com">
              </div>
              <div style="grid-column:1/-1;">
                <label class="cust-label">Address</label>
                <input formControlName="address" class="gg-input" placeholder="Full address…">
              </div>
            </div>
            @if (formError()) {
              <div style="display:flex;align-items:center;gap:6px;color:#dc2626;font-size:13px;margin-bottom:12px;padding:10px 14px;background:#fff5f5;border:1px solid #fca5a5;border-radius:8px;">
                <span class="material-icons-round" style="font-size:15px;">error_outline</span> {{ formError() }}
              </div>
            }
            <div style="display:flex;gap:10px;">
              <button type="submit" [disabled]="saving()"
                      style="padding:9px 20px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;"
                      [style.opacity]="saving() ? '0.7' : '1'">
                <span class="material-icons-round" style="font-size:16px;">save</span>
                {{ saving() ? 'Saving…' : (editId() ? 'Update Customer' : 'Add Customer') }}
              </button>
              <button type="button" (click)="closeForm()"
                      style="padding:9px 16px;background:var(--secondary);border:1px solid var(--border);border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;color:var(--foreground);">
                Cancel
              </button>
            </div>
          </form>
        </div>
      }

      <!-- Search -->
      <div style="margin-bottom:16px;position:relative;">
        <span class="material-icons-round" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:16px;color:#9CA3AF;pointer-events:none;">search</span>
        <input [(ngModel)]="rawSearch" (ngModelChange)="searchSig.set($event)" placeholder="Search customers…"
               style="width:100%;padding:9px 12px 9px 34px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:var(--card);color:var(--foreground);outline:none;box-sizing:border-box;">
      </div>

      <!-- Customer list -->
      @if (loading()) {
        <div style="display:flex;flex-direction:column;gap:12px;">
          @for (i of [1,2,3]; track i) { <div class="gg-skeleton" style="height:90px;border-radius:12px;"></div> }
        </div>
      } @else if (filteredCustomers().length === 0) {
        <div style="text-align:center;padding:64px 0;color:#9CA3AF;">
          <span class="material-icons-round" style="font-size:52px;display:block;margin-bottom:14px;">people</span>
          <p style="font-size:15px;font-weight:600;color:#374151;margin:0 0 6px;">{{ customers().length === 0 ? 'No customers yet' : 'No customers match your search' }}</p>
          <p style="font-size:13px;margin:0;">Add your first customer using the button above.</p>
        </div>
      } @else {
        <div style="display:flex;flex-direction:column;gap:10px;">
          @for (c of filteredCustomers(); track c.id) {
            <div style="background:var(--card);border-radius:12px;overflow:hidden;transition:box-shadow 0.15s;"
                 class="cust-card"
                 [style.border]="isTopCustomer(c) ? '1px solid #c4b5fd' : '1px solid var(--border)'">

              <!-- Card header -->
              <div style="padding:16px 20px;cursor:pointer;" (click)="toggleExpand(c.id)">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">

                  <!-- Left -->
                  <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
                      <span style="font-size:15px;font-weight:700;color:var(--foreground);font-family:'Cabin',sans-serif;">{{ c.name }}</span>
                      @if (isTopCustomer(c)) {
                        <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;background:#7c3aed;color:#fff;text-transform:uppercase;display:flex;align-items:center;gap:3px;">
                          <span class="material-icons-round" style="font-size:11px;">star</span> Top Customer
                        </span>
                      }
                    </div>

                    <!-- Contact -->
                    <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:12px;color:#6B7280;margin-bottom:8px;">
                      @if (c.contact_person) {
                        <span style="display:flex;align-items:center;gap:3px;">
                          <span class="material-icons-round" style="font-size:13px;">person</span>{{ c.contact_person }}
                        </span>
                      }
                      @if (c.phone) {
                        <span style="display:flex;align-items:center;gap:3px;">
                          <span class="material-icons-round" style="font-size:13px;">phone</span>{{ c.phone }}
                        </span>
                      }
                      @if (c.email) {
                        <span style="display:flex;align-items:center;gap:3px;">
                          <span class="material-icons-round" style="font-size:13px;">mail</span>{{ c.email }}
                        </span>
                      }
                    </div>

                    <!-- Stats pills -->
                    <div style="display:flex;flex-wrap:wrap;gap:6px;">
                      <span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d;padding:3px 9px;border-radius:6px;font-weight:600;">
                        <span class="material-icons-round" style="font-size:13px;">local_shipping</span>
                        {{ c.dispatch_count }} dispatch{{ c.dispatch_count !== 1 ? 'es' : '' }}
                      </span>
                      <span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;background:#dbeafe;border:1px solid #93c5fd;color:#2563eb;padding:3px 9px;border-radius:6px;font-weight:600;">
                        <span class="material-icons-round" style="font-size:13px;">tag</span>
                        {{ c.total_dispatched_kg | number:'1.0-0' }} units
                      </span>
                      @if (c.last_dispatch_date) {
                        <span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;background:#f9fafb;border:1px solid #E5E7EB;color:#6B7280;padding:3px 9px;border-radius:6px;">
                          <span class="material-icons-round" style="font-size:13px;">event</span>
                          Last: {{ c.last_dispatch_date | date:'d MMM yyyy' }}
                        </span>
                      }
                    </div>
                  </div>

                  <!-- Right actions -->
                  <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;" (click)="$event.stopPropagation()">
                    <button (click)="startEdit(c)"
                            style="padding:6px 11px;background:#f0fdf4;border:1px solid #01AC51;color:#01AC51;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">
                      Edit
                    </button>
                    <button (click)="deleteCustomer(c.id)"
                            style="padding:6px 9px;background:#fff5f5;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:12px;cursor:pointer;display:flex;align-items:center;">
                      <span class="material-icons-round" style="font-size:16px;">delete_outline</span>
                    </button>
                    <span class="material-icons-round" style="font-size:20px;color:#9CA3AF;transition:transform 0.2s;margin-left:2px;"
                          [style.transform]="expanded().has(c.id) ? 'rotate(180deg)' : 'none'">expand_more</span>
                  </div>
                </div>
              </div>

              <!-- Expanded: dispatch history -->
              @if (expanded().has(c.id)) {
                <div style="border-top:1px solid var(--border);background:#fafafa;">
                  @if (c.dispatches.length === 0) {
                    <div style="padding:24px;text-align:center;color:#9CA3AF;font-size:13px;">
                      <span class="material-icons-round" style="font-size:28px;display:block;margin-bottom:6px;color:#E5E7EB;">local_shipping</span>
                      No dispatches recorded for this customer.
                    </div>
                  } @else {
                    <div style="padding:10px 20px 0;display:flex;align-items:center;justify-content:space-between;background:#f3f4f6;border-bottom:1px solid var(--border);">
                      <p style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;margin:0;letter-spacing:0.5px;padding:10px 0;">
                        Dispatch history — {{ c.dispatches.length }} record{{ c.dispatches.length !== 1 ? 's' : '' }}
                      </p>
                      <p style="font-size:11px;color:#6B7280;margin:0;">
                        {{ c.total_dispatched_kg | number:'1.0-0' }} units total
                      </p>
                    </div>
                    <table style="width:100%;border-collapse:collapse;">
                      <thead>
                        <tr style="background:#f8f9fa;">
                          <th style="text-align:left;padding:9px 20px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Date</th>
                          <th style="text-align:left;padding:9px 12px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Batch</th>
                          <th style="text-align:left;padding:9px 12px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Flavor</th>
                          <th style="text-align:right;padding:9px 20px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Qty (units)</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (d of c.dispatches; track d.id) {
                          <tr style="border-top:1px solid #f0f0f0;">
                            <td style="padding:10px 20px;font-size:12px;color:#6B7280;white-space:nowrap;">
                              {{ d.dispatch_date | date:'d MMM yyyy' }}
                            </td>
                            <td style="padding:10px 12px;">
                              <span style="font-family:monospace;font-size:12px;font-weight:700;color:var(--foreground);background:var(--secondary);padding:2px 7px;border-radius:5px;">
                                {{ d.batch_code }}
                              </span>
                            </td>
                            <td style="padding:10px 12px;font-size:13px;color:#374151;">
                              {{ d.flavor_name || '—' }}
                            </td>
                            <td style="padding:10px 20px;text-align:right;">
                              <span style="font-size:13px;font-weight:700;color:#2563eb;">{{ d.quantity_dispatched | number:'1.0-0' }}</span>
                              <span style="font-size:11px;color:#9CA3AF;margin-left:3px;">units</span>
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  }
                </div>
              }
            </div>
          }
        </div>
      }
    </div>

    <style>
      .cust-label { display:block; font-size:12px; font-weight:600; color:#374151; margin-bottom:6px; }
      .cust-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.07); }
      @keyframes slideUp   { from { transform:translateY(16px); opacity:0; } to { transform:translateY(0); opacity:1; } }
      @keyframes slideDown { from { transform:translateY(-8px); opacity:0; } to { transform:translateY(0); opacity:1; } }
      @media (max-width:700px) { .cust-form-grid { grid-template-columns: 1fr !important; } }
      @media (max-width:600px) { .cust-summary-grid { grid-template-columns: 1fr 1fr !important; } }
      @media (max-width:400px) { .cust-summary-grid { grid-template-columns: 1fr !important; } }
    </style>
  `,
})
export class CustomersComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly fb = inject(FormBuilder);

  loading   = signal(true);
  saving    = signal(false);
  showForm  = signal(false);
  editId    = signal<string | null>(null);
  customers = signal<Customer[]>([]);
  expanded  = signal<Set<string>>(new Set());
  formError = signal('');
  toast     = signal('');
  toastKind = signal<'success' | 'error'>('success');

  rawSearch = '';
  searchSig = signal('');

  readonly chartColors = ['#7c3aed', '#2563eb', '#16a34a', '#d97706', '#dc2626', '#0891b2', '#db2777', '#374151'];

  readonly filteredCustomers = computed(() => {
    const q = this.searchSig().toLowerCase().trim();
    if (!q) return this.customers();
    return this.customers().filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.contact_person.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q)
    );
  });

  readonly grandTotalKg = computed(() =>
    this.customers().reduce((sum, c) => sum + c.total_dispatched_kg, 0)
  );

  readonly topCustomer = computed(() =>
    [...this.customers()].sort((a, b) => b.total_dispatched_kg - a.total_dispatched_kg)[0] ?? null
  );

  /** Top 6 customers by volume for the chart */
  readonly chartCustomers = computed(() =>
    [...this.customers()]
      .filter(c => c.total_dispatched_kg > 0)
      .sort((a, b) => b.total_dispatched_kg - a.total_dispatched_kg)
      .slice(0, 6)
  );

  form = this.fb.nonNullable.group({
    name:           ['', Validators.required],
    contact_person: [''],
    phone:          [''],
    email:          [''],
    address:        [''],
  });

  async ngOnInit(): Promise<void> { await this.loadData(); }

  // ── Helpers ───────────────────────────────────────────────────────────

  toggleExpand(id: string): void {
    this.expanded.update(s => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  isTopCustomer(c: Customer): boolean {
    const top = this.topCustomer();
    return !!top && top.id === c.id && c.total_dispatched_kg > 0;
  }

  volumePct(c: Customer): number {
    const total = this.grandTotalKg();
    return total > 0 ? (c.total_dispatched_kg / total) * 100 : 0;
  }

  // ── Form ──────────────────────────────────────────────────────────────

  openNewForm(): void {
    this.editId.set(null);
    this.form.reset();
    this.formError.set('');
    this.showForm.set(true);
  }

  startEdit(c: Customer): void {
    this.editId.set(c.id);
    this.form.setValue({ name: c.name, contact_person: c.contact_person, phone: c.phone, email: c.email, address: c.address });
    this.formError.set('');
    this.showForm.set(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  closeForm(): void {
    this.editId.set(null);
    this.form.reset();
    this.showForm.set(false);
    this.formError.set('');
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.saving.set(true);
    this.formError.set('');
    const val = this.form.getRawValue();
    const isEdit = this.editId();
    if (isEdit) {
      const { error } = await this.supabase.client.from('gg_customers').update(val).eq('id', isEdit);
      if (error) { this.formError.set(error.message); this.saving.set(false); return; }
    } else {
      const { error } = await this.supabase.client.from('gg_customers').insert(val);
      if (error) { this.formError.set(error.message); this.saving.set(false); return; }
    }
    this.showToast(isEdit ? 'Customer updated' : 'Customer added', 'success');
    this.closeForm();
    await this.loadData();
    this.saving.set(false);
  }

  async deleteCustomer(id: string): Promise<void> {
    if (!confirm('Delete this customer?')) return;
    const { error } = await this.supabase.client.from('gg_customers').delete().eq('id', id);
    if (error) { this.showToast(error.message, 'error'); return; }
    this.showToast('Customer deleted', 'success');
    await this.loadData();
  }

  // ── Data ──────────────────────────────────────────────────────────────

  private async loadData(): Promise<void> {
    this.loading.set(true);

    const [{ data: custs }, { data: disp }] = await Promise.all([
      this.supabase.client
        .from('gg_customers')
        .select('id, name, contact_person, phone, email, address')
        .order('name'),
      this.supabase.client
        .from('dispatch_events')
        .select('id, customer_name, boxes_dispatched, dispatch_date, batch_code, sku:gg_flavors(name)')
        .order('dispatch_date', { ascending: false }),
    ]);

    // Group dispatches by customer name (case-insensitive for safety, although exact match is better)
    const dispMap = new Map<string, { count: number; total: number; lastDate: string | null; entries: DispatchEntry[] }>();
    (disp ?? []).forEach((d: any) => {
      const cname = (d.customer_name || '').toLowerCase().trim();
      if (!cname) return;
      if (!dispMap.has(cname)) dispMap.set(cname, { count: 0, total: 0, lastDate: null, entries: [] });
      const bucket = dispMap.get(cname)!;
      const qty = (d.boxes_dispatched ?? 0) * 1.5; // Dummy unit logic to match previous quantity_dispatched
      bucket.count++;
      bucket.total += qty;
      if (d.dispatch_date && (!bucket.lastDate || d.dispatch_date > bucket.lastDate)) {
        bucket.lastDate = d.dispatch_date;
      }
      bucket.entries.push({
        id: d.id,
        quantity_dispatched: qty,
        dispatch_date: d.dispatch_date ?? '',
        batch_code: d.batch_code ?? '?',
        flavor_name: d.sku?.name ?? '',
      });
    });

    this.customers.set((custs ?? []).map((c: any) => {
      const cname = (c.name || '').toLowerCase().trim();
      const bucket = dispMap.get(cname);
      return {
        id: c.id,
        name: c.name,
        contact_person: c.contact_person ?? '',
        phone: c.phone ?? '',
        email: c.email ?? '',
        address: c.address ?? '',
        total_dispatched_kg: bucket?.total ?? 0,
        dispatch_count: bucket?.count ?? 0,
        last_dispatch_date: bucket?.lastDate ?? null,
        dispatches: bucket?.entries ?? [],
      };
    }));

    this.loading.set(false);
  }

  private showToast(msg: string, kind: 'success' | 'error'): void {
    this.toast.set(msg);
    this.toastKind.set(kind);
    setTimeout(() => this.toast.set(''), 3500);
  }
}
