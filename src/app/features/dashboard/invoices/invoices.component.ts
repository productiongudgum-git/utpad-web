import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { SupabaseService } from '../../../core/supabase.service';

interface Customer { id: string; name: string; }
interface Flavor   { id: string; name: string; }

interface InvoiceItem {
  flavor_id: string;
  flavor_name: string;
  quantity_boxes: number;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  customer_name: string;
  items: InvoiceItem[];
  expected_dispatch_date: string | null;
  is_packed: boolean;
  is_dispatched: boolean;
  created_at: string;
}

@Component({
  selector: 'app-invoices',
  standalone: true,
  imports: [CommonModule, DatePipe, ReactiveFormsModule, FormsModule],
  styles: [`
    .inv-label { display:block; font-size:12px; font-weight:600; color:#374151; margin-bottom:6px; }
    .inv-toast { position:fixed; bottom:24px; right:24px; z-index:9999; padding:12px 18px; border-radius:10px; background:#1a1a1a; color:#fff; font-size:14px; font-weight:500; display:flex; align-items:center; gap:8px; box-shadow:0 4px 20px rgba(0,0,0,0.25); animation:slideUp 0.2s ease; }
    .inv-toast-err { background:#dc2626; }
    @keyframes slideUp { from { transform:translateY(16px); opacity:0; } to { transform:translateY(0); opacity:1; } }
    @keyframes slideDown { from { transform:translateY(-8px); opacity:0; } to { transform:translateY(0); opacity:1; } }
  `],
  template: `
    <!-- Toast -->
    @if (toast()) {
      <div class="inv-toast" [class.inv-toast-err]="toastKind() === 'error'">
        <span class="material-icons-round" style="font-size:16px;">{{ toastKind() === 'error' ? 'error_outline' : 'check_circle' }}</span>
        {{ toast() }}
      </div>
    }

    <!-- Customer name datalist -->
    <datalist id="cust-list">
      @for (c of customers(); track c.id) { <option [value]="c.name"> }
    </datalist>

    <div style="padding:24px;max-width:1100px;">

      <!-- Header -->
      <div style="margin-bottom:24px;display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="font-family:'Cabin',sans-serif;font-size:22px;font-weight:700;color:#121212;margin:0 0 4px;">Invoices</h1>
          <p style="color:#6B7280;font-size:14px;margin:0;">Create and manage customer invoices.</p>
        </div>
        <button (click)="openForm()" [disabled]="showForm()"
                style="padding:9px 18px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;"
                [style.opacity]="showForm() ? '0.6' : '1'">
          <span class="material-icons-round" style="font-size:18px;">add</span>
          New Invoice
        </button>
      </div>

      <!-- Filters -->
      <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;align-items:center;">
        <div style="position:relative;flex:1;min-width:200px;max-width:300px;">
          <span class="material-icons-round" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:16px;color:#9CA3AF;pointer-events:none;">search</span>
          <input [ngModel]="customerFilter()" (ngModelChange)="customerFilter.set($event)"
                 placeholder="Search customer…"
                 style="width:100%;padding:8px 12px 8px 32px;border:1px solid #E5E7EB;border-radius:8px;font-size:14px;color:#374151;outline:none;background:#fff;box-sizing:border-box;">
        </div>
        <select [ngModel]="statusFilter()" (ngModelChange)="statusFilter.set($event)"
                style="padding:8px 32px 8px 12px;border:1px solid #E5E7EB;border-radius:8px;font-size:14px;color:#374151;background:#fff url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%236B7280%22><path d=%22M7 10l5 5 5-5z%22/></svg>') no-repeat right 8px center/18px;appearance:none;outline:none;cursor:pointer;">
          <option value="all">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Packed">Packed</option>
          <option value="Dispatched">Dispatched</option>
        </select>
        @if (customerFilter() || statusFilter() !== 'all') {
          <span style="font-size:13px;color:#6B7280;">{{ filteredInvoices().length }} result{{ filteredInvoices().length === 1 ? '' : 's' }}</span>
        }
      </div>

      <!-- Create Invoice Form -->
      @if (showForm()) {
        <div style="background:#fff;border-radius:14px;border:1px solid #E5E7EB;padding:24px;margin-bottom:24px;animation:slideDown 0.15s ease;">

          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
            <h2 style="font-size:16px;font-weight:700;color:#121212;margin:0;">New Invoice</h2>
            <button (click)="closeForm()" style="border:none;background:none;cursor:pointer;color:#9CA3AF;display:flex;align-items:center;">
              <span class="material-icons-round" style="font-size:20px;">close</span>
            </button>
          </div>

          <form [formGroup]="form" (ngSubmit)="save()">

            <!-- Top fields -->
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:20px;" class="inv-top-grid">
              <div>
                <label class="inv-label">Invoice Number *</label>
                <input formControlName="invoice_number" class="gg-input" placeholder="e.g. INV-001"
                       [style.border-color]="form.get('invoice_number')!.invalid && form.get('invoice_number')!.touched ? '#dc2626' : ''">
              </div>
              <div>
                <label class="inv-label">Customer *
                  <span style="font-weight:400;color:#9CA3AF;">(type or pick)</span>
                </label>
                <input [(ngModel)]="customerNameInput" [ngModelOptions]="{standalone:true}"
                       list="cust-list" class="gg-input"
                       placeholder="Customer name"
                       (input)="onCustomerInput()">
                @if (customerHint()) {
                  <p style="font-size:11px;margin:3px 0 0;"
                     [style.color]="customerIsNew() ? '#d97706' : '#16a34a'">{{ customerHint() }}</p>
                }
              </div>
              <div>
                <label class="inv-label">Expected Dispatch Date *</label>
                <input formControlName="expected_dispatch_date" type="date" class="gg-input"
                       [style.border-color]="form.get('expected_dispatch_date')!.invalid && form.get('expected_dispatch_date')!.touched ? '#dc2626' : ''">
              </div>
            </div>

            <!-- Items -->
            <div style="margin-bottom:20px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                <label class="inv-label" style="margin:0;">
                  Flavors &amp; Quantities
                  <span style="font-weight:400;color:#9CA3AF;font-size:11px;"> — add one line per flavor</span>
                </label>
                <button type="button" (click)="addItemLine()"
                        style="padding:5px 12px;background:#f0fdf4;border:1px solid #01AC51;color:#01AC51;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;">
                  <span class="material-icons-round" style="font-size:14px;">add</span> Add flavor
                </button>
              </div>

              @if (itemLines().length === 0) {
                <div style="padding:20px;border:2px dashed #E5E7EB;border-radius:10px;text-align:center;color:#9CA3AF;font-size:13px;">
                  No items yet — click "Add flavor" to add order lines.
                </div>
              } @else {
                <div style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;">
                  <div style="display:grid;grid-template-columns:1fr 160px 36px;gap:8px;padding:8px 12px;background:#f8f9fa;border-bottom:1px solid #E5E7EB;">
                    <span style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Flavor</span>
                    <span style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">No. of Boxes</span>
                    <span></span>
                  </div>
                  @for (line of itemLines(); track $index) {
                    <div style="display:grid;grid-template-columns:1fr 160px 36px;gap:8px;padding:8px 12px;border-bottom:1px solid #f3f4f6;align-items:center;">
                      <select [(ngModel)]="line.flavor_id" [ngModelOptions]="{standalone:true}"
                              class="gg-input dropdown-with-arrow" style="font-size:13px;"
                              (change)="onFlavorSelect(line)">
                        <option value="">Select flavor…</option>
                        @for (f of flavors(); track f.id) {
                          <option [value]="f.id">{{ f.name }}</option>
                        }
                      </select>
                      <input [(ngModel)]="line.quantity_boxes" [ngModelOptions]="{standalone:true}"
                             type="number" min="1" step="1" class="gg-input"
                             placeholder="0" style="font-size:13px;">
                      <button type="button" (click)="removeItemLine($index)"
                              style="width:32px;height:32px;background:#fff5f5;border:1px solid #fca5a5;border-radius:6px;color:#dc2626;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <span class="material-icons-round" style="font-size:15px;">delete_outline</span>
                      </button>
                    </div>
                  }
                  <!-- Total row -->
                  <div style="display:grid;grid-template-columns:1fr 160px 36px;gap:8px;padding:8px 12px;background:#f8f9fa;align-items:center;">
                    <span style="font-size:12px;font-weight:600;color:#374151;">Total Boxes</span>
                    <span style="font-size:13px;font-weight:700;color:#01AC51;">{{ totalBoxes() | number }}</span>
                    <span></span>
                  </div>
                </div>
              }
            </div>

            @if (formError()) {
              <div style="display:flex;align-items:center;gap:6px;color:#dc2626;font-size:13px;margin-bottom:14px;padding:10px 14px;background:#fff5f5;border:1px solid #fca5a5;border-radius:8px;">
                <span class="material-icons-round" style="font-size:16px;">error_outline</span>
                {{ formError() }}
              </div>
            }

            <div style="display:flex;gap:10px;align-items:center;">
              <button type="submit" [disabled]="saving()"
                      style="padding:9px 20px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;"
                      [style.opacity]="saving() ? '0.7' : '1'">
                <span class="material-icons-round" style="font-size:16px;">save</span>
                {{ saving() ? 'Saving…' : 'Create Invoice' }}
              </button>
              <button type="button" (click)="closeForm()"
                      style="padding:9px 16px;background:#f3f4f6;border:1px solid #E5E7EB;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;color:#374151;">
                Cancel
              </button>
            </div>
          </form>
        </div>
      }

      <!-- Invoice list -->
      @if (loading()) {
        <div style="display:flex;flex-direction:column;gap:10px;">
          @for (i of [1,2,3]; track i) {
            <div class="gg-skeleton" style="height:72px;border-radius:12px;"></div>
          }
        </div>
      } @else if (filteredInvoices().length === 0) {
        <div style="text-align:center;padding:72px 0;color:#9CA3AF;">
          <span class="material-icons-round" style="font-size:52px;display:block;margin-bottom:14px;">description</span>
          <p style="font-size:15px;font-weight:600;margin:0 0 6px;color:#374151;">
            {{ invoices().length === 0 ? 'No invoices yet' : 'No invoices match your filter' }}
          </p>
          <p style="font-size:13px;margin:0;">
            {{ invoices().length === 0 ? 'Create your first invoice using the button above.' : 'Try adjusting your search or status filter.' }}
          </p>
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
                <th style="text-align:center;padding:12px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Status</th>
                <th style="text-align:center;padding:12px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (inv of filteredInvoices(); track inv.id) {
                <tr style="border-bottom:1px solid #f3f4f6;"
                    [style.background]="inv.is_dispatched ? '#f0fdf4' : inv.is_packed ? '#eff6ff' : 'transparent'">
                  <td style="padding:14px 16px;">
                    <span style="font-family:monospace;font-size:14px;font-weight:700;color:#121212;">{{ inv.invoice_number }}</span>
                  </td>
                  <td style="padding:14px 16px;font-size:14px;font-weight:500;color:#374151;">{{ inv.customer_name }}</td>
                  <td style="padding:14px 16px;max-width:280px;">
                    @for (item of inv.items; track item.flavor_id) {
                      <div style="font-size:12px;color:#6B7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        {{ item.flavor_name }}: <strong style="color:#374151;">{{ item.quantity_boxes | number }}</strong> boxes
                      </div>
                    }
                  </td>
                  <td style="padding:14px 16px;font-size:13px;color:#6B7280;white-space:nowrap;">
                    {{ inv.expected_dispatch_date ? (inv.expected_dispatch_date | date:'dd MMM yyyy') : '—' }}
                  </td>
                  <td style="padding:14px 16px;text-align:center;">
                    @if (inv.is_dispatched) {
                      <span style="padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;background:#dcfce7;color:#15803d;">Dispatched</span>
                    } @else if (inv.is_packed) {
                      <span style="padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;background:#dbeafe;color:#1d4ed8;">Packed</span>
                    } @else {
                      <span style="padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;background:#fef3c7;color:#b45309;">Pending</span>
                    }
                  </td>
                  <td style="padding:14px 16px;text-align:center;">
                    @if (!inv.is_dispatched) {
                      <button (click)="openEdit(inv)"
                              style="padding:5px 12px;background:#f8f9fa;border:1px solid #E5E7EB;border-radius:6px;font-size:12px;font-weight:600;color:#374151;cursor:pointer;display:inline-flex;align-items:center;gap:4px;">
                        <span class="material-icons-round" style="font-size:14px;">edit</span>
                        Edit
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <!-- Edit Invoice Modal -->
    @if (editingInvoice()) {
      <div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;"
           (click)="closeEdit()">
        <div style="background:#fff;border-radius:16px;width:100%;max-width:600px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.2);"
             (click)="$event.stopPropagation()">

          <!-- Modal header -->
          <div style="display:flex;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid #E5E7EB;position:sticky;top:0;background:#fff;z-index:1;">
            <div>
              <h2 style="font-size:16px;font-weight:700;color:#121212;margin:0 0 2px;">Edit Invoice</h2>
              <p style="font-size:12px;color:#9CA3AF;margin:0;font-family:monospace;">{{ editingInvoice()!.invoice_number }}</p>
            </div>
            <button (click)="closeEdit()" style="border:none;background:none;cursor:pointer;color:#9CA3AF;display:flex;align-items:center;padding:4px;">
              <span class="material-icons-round" style="font-size:20px;">close</span>
            </button>
          </div>

          <!-- Modal body -->
          <div style="padding:24px;">

            <!-- Customer + Dispatch Date -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px;" class="inv-top-grid">
              <div>
                <label class="inv-label">Customer *</label>
                <input [(ngModel)]="editCustomerInput" list="cust-list" class="gg-input"
                       placeholder="Customer name"
                       (input)="onEditCustomerInput()">
                @if (editCustomerHint()) {
                  <p style="font-size:11px;margin:3px 0 0;"
                     [style.color]="editCustomerIsNew() ? '#d97706' : '#16a34a'">{{ editCustomerHint() }}</p>
                }
              </div>
              <div>
                <label class="inv-label">Expected Dispatch Date</label>
                <input [ngModel]="editDispatchDate()" (ngModelChange)="editDispatchDate.set($event)"
                       type="date" class="gg-input">
              </div>
            </div>

            <!-- Items -->
            <div style="margin-bottom:20px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                <label class="inv-label" style="margin:0;">Flavors &amp; Quantities</label>
                <button type="button" (click)="addEditItemLine()"
                        style="padding:5px 12px;background:#f0fdf4;border:1px solid #01AC51;color:#01AC51;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;">
                  <span class="material-icons-round" style="font-size:14px;">add</span> Add flavor
                </button>
              </div>

              @if (editItemLines().length === 0) {
                <div style="padding:20px;border:2px dashed #E5E7EB;border-radius:10px;text-align:center;color:#9CA3AF;font-size:13px;">
                  No items — click "Add flavor" to add order lines.
                </div>
              } @else {
                <div style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;">
                  <div style="display:grid;grid-template-columns:1fr 160px 36px;gap:8px;padding:8px 12px;background:#f8f9fa;border-bottom:1px solid #E5E7EB;">
                    <span style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Flavor</span>
                    <span style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">No. of Boxes</span>
                    <span></span>
                  </div>
                  @for (line of editItemLines(); track $index) {
                    <div style="display:grid;grid-template-columns:1fr 160px 36px;gap:8px;padding:8px 12px;border-bottom:1px solid #f3f4f6;align-items:center;">
                      <select [(ngModel)]="line.flavor_id" class="gg-input dropdown-with-arrow" style="font-size:13px;"
                              (change)="onEditFlavorSelect(line)">
                        <option value="">Select flavor…</option>
                        @for (f of flavors(); track f.id) {
                          <option [value]="f.id">{{ f.name }}</option>
                        }
                      </select>
                      <input [(ngModel)]="line.quantity_boxes" type="number" min="1" step="1" class="gg-input"
                             placeholder="0" style="font-size:13px;">
                      <button type="button" (click)="removeEditItemLine($index)"
                              style="width:32px;height:32px;background:#fff5f5;border:1px solid #fca5a5;border-radius:6px;color:#dc2626;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <span class="material-icons-round" style="font-size:15px;">delete_outline</span>
                      </button>
                    </div>
                  }
                  <div style="display:grid;grid-template-columns:1fr 160px 36px;gap:8px;padding:8px 12px;background:#f8f9fa;align-items:center;">
                    <span style="font-size:12px;font-weight:600;color:#374151;">Total Boxes</span>
                    <span style="font-size:13px;font-weight:700;color:#01AC51;">{{ editTotalBoxes() | number }}</span>
                    <span></span>
                  </div>
                </div>
              }
            </div>

            @if (editError()) {
              <div style="display:flex;align-items:center;gap:6px;color:#dc2626;font-size:13px;margin-bottom:14px;padding:10px 14px;background:#fff5f5;border:1px solid #fca5a5;border-radius:8px;">
                <span class="material-icons-round" style="font-size:16px;">error_outline</span>
                {{ editError() }}
              </div>
            }

            <div style="display:flex;gap:10px;align-items:center;">
              <button (click)="saveEdit()" [disabled]="editSaving()"
                      style="padding:9px 20px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;"
                      [style.opacity]="editSaving() ? '0.7' : '1'">
                <span class="material-icons-round" style="font-size:16px;">save</span>
                {{ editSaving() ? 'Saving…' : 'Save Changes' }}
              </button>
              <button type="button" (click)="closeEdit()"
                      style="padding:9px 16px;background:#f3f4f6;border:1px solid #E5E7EB;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;color:#374151;">
                Cancel
              </button>
            </div>

          </div>
        </div>
      </div>
    }

    <style>
      @media (max-width:700px) { .inv-top-grid { grid-template-columns: 1fr !important; } }
    </style>
  `,
})
export class InvoicesComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly fb       = inject(FormBuilder);

  loading   = signal(true);
  saving    = signal(false);
  showForm  = signal(false);
  invoices  = signal<InvoiceRow[]>([]);
  customers = signal<Customer[]>([]);
  flavors   = signal<Flavor[]>([]);
  itemLines = signal<{ flavor_id: string; flavor_name: string; quantity_boxes: number }[]>([]);
  formError = signal('');
  toast     = signal('');
  toastKind = signal<'success' | 'error'>('success');

  customerNameInput = '';
  customerHint      = signal('');
  customerIsNew     = signal(false);

  // Edit state
  editingInvoice      = signal<InvoiceRow | null>(null);
  editItemLines       = signal<{ flavor_id: string; flavor_name: string; quantity_boxes: number }[]>([]);
  editCustomerInput   = '';
  editCustomerHint    = signal('');
  editCustomerIsNew   = signal(false);
  editDispatchDate    = signal('');
  editSaving          = signal(false);
  editError           = signal('');

  // Filters
  customerFilter = signal('');
  statusFilter   = signal('all');

  readonly totalBoxes = computed(() =>
    this.itemLines().reduce((s, l) => s + (Number(l.quantity_boxes) || 0), 0)
  );

  readonly editTotalBoxes = computed(() =>
    this.editItemLines().reduce((s, l) => s + (Number(l.quantity_boxes) || 0), 0)
  );

  readonly filteredInvoices = computed(() => {
    let list = this.invoices();
    const cq = this.customerFilter().trim().toLowerCase();
    const sf = this.statusFilter();
    if (cq) list = list.filter(inv => inv.customer_name.toLowerCase().includes(cq));
    if (sf === 'Pending')    list = list.filter(inv => !inv.is_packed && !inv.is_dispatched);
    if (sf === 'Packed')     list = list.filter(inv => inv.is_packed && !inv.is_dispatched);
    if (sf === 'Dispatched') list = list.filter(inv => inv.is_dispatched);
    return list;
  });

  form = this.fb.nonNullable.group({
    invoice_number:        ['', Validators.required],
    expected_dispatch_date: ['', Validators.required],
  });

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadCustomers(), this.loadFlavors()]);
    await this.loadInvoices();
  }

  openForm(): void {
    this.form.reset({ invoice_number: '', expected_dispatch_date: '' });
    this.customerNameInput = '';
    this.customerHint.set('');
    this.itemLines.set([{ flavor_id: '', flavor_name: '', quantity_boxes: 0 }]);
    this.formError.set('');
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.formError.set('');
    this.form.reset();
    this.customerNameInput = '';
    this.customerHint.set('');
    this.itemLines.set([]);
  }

  onCustomerInput(): void {
    const name = this.customerNameInput.trim();
    if (!name) { this.customerHint.set(''); return; }
    const existing = this.customers().find(c => c.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      this.customerIsNew.set(false);
      this.customerHint.set('✓ Existing customer');
    } else {
      this.customerIsNew.set(true);
      this.customerHint.set('New customer — will be created on save');
    }
  }

  onFlavorSelect(line: { flavor_id: string; flavor_name: string; quantity_boxes: number }): void {
    const f = this.flavors().find(fl => fl.id === line.flavor_id);
    if (f) line.flavor_name = f.name;
  }

  addItemLine(): void {
    this.itemLines.update(l => [...l, { flavor_id: '', flavor_name: '', quantity_boxes: 0 }]);
  }

  removeItemLine(i: number): void {
    this.itemLines.update(l => l.filter((_, idx) => idx !== i));
  }

  openEdit(inv: InvoiceRow): void {
    this.editingInvoice.set(inv);
    this.editCustomerInput = inv.customer_name;
    this.editCustomerHint.set('');
    this.editCustomerIsNew.set(false);
    this.editDispatchDate.set(inv.expected_dispatch_date ?? '');
    this.editItemLines.set(inv.items.map(it => ({ ...it })));
    this.editError.set('');
  }

  closeEdit(): void {
    this.editingInvoice.set(null);
    this.editItemLines.set([]);
    this.editError.set('');
  }

  onEditCustomerInput(): void {
    const name = this.editCustomerInput.trim();
    if (!name) { this.editCustomerHint.set(''); return; }
    const existing = this.customers().find(c => c.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      this.editCustomerIsNew.set(false);
      this.editCustomerHint.set('✓ Existing customer');
    } else {
      this.editCustomerIsNew.set(true);
      this.editCustomerHint.set('New customer — will be created on save');
    }
  }

  onEditFlavorSelect(line: { flavor_id: string; flavor_name: string; quantity_boxes: number }): void {
    const f = this.flavors().find(fl => fl.id === line.flavor_id);
    if (f) line.flavor_name = f.name;
  }

  addEditItemLine(): void {
    this.editItemLines.update(l => [...l, { flavor_id: '', flavor_name: '', quantity_boxes: 0 }]);
  }

  removeEditItemLine(i: number): void {
    this.editItemLines.update(l => l.filter((_, idx) => idx !== i));
  }

  async saveEdit(): Promise<void> {
    const inv = this.editingInvoice();
    if (!inv) return;

    const customerName = this.editCustomerInput.trim();
    if (!customerName) { this.editError.set('Please enter a customer name.'); return; }

    const validItems = this.editItemLines().filter(l => l.flavor_id && l.quantity_boxes > 0);
    if (validItems.length === 0) { this.editError.set('Add at least one flavor with a quantity.'); return; }

    this.editSaving.set(true);
    this.editError.set('');

    try {
      const customerId = await this.resolveCustomerId(customerName);

      // Determine if any flavor quantity increased — if so, reset is_packed
      const oldMap = new Map<string, number>(inv.items.map(it => [it.flavor_id, it.quantity_boxes]));
      const anyIncreased = validItems.some(it => (it.quantity_boxes ?? 0) > (oldMap.get(it.flavor_id) ?? 0));
      const newIsPacked = anyIncreased ? false : inv.is_packed;

      const { error } = await this.supabase.client
        .from('gg_invoices')
        .update({
          customer_id:            customerId,
          customer_name:          customerName,
          items:                  validItems,
          expected_dispatch_date: this.editDispatchDate() || null,
          is_packed:              newIsPacked,
        })
        .eq('id', inv.id);

      if (error) { this.editError.set(error.message); return; }

      this.showToast('Invoice updated successfully', 'success');
      this.closeEdit();
      await this.loadInvoices();
    } finally {
      this.editSaving.set(false);
    }
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const customerName = this.customerNameInput.trim();
    if (!customerName) { this.formError.set('Please enter a customer name.'); return; }

    const validItems = this.itemLines().filter(l => l.flavor_id && l.quantity_boxes > 0);
    if (validItems.length === 0) { this.formError.set('Add at least one flavor with a quantity.'); return; }

    this.saving.set(true);
    this.formError.set('');

    try {
      // Resolve or create customer
      const customerId = await this.resolveCustomerId(customerName);

      const v = this.form.getRawValue();
      const { error } = await this.supabase.client.from('gg_invoices').insert({
        invoice_number:        v.invoice_number,
        customer_id:           customerId,
        customer_name:         customerName,
        items:                 validItems,
        expected_dispatch_date: v.expected_dispatch_date || null,
        is_packed:             false,
        is_dispatched:         false,
      });

      if (error) { this.formError.set(error.message); return; }

      this.showToast('Invoice created successfully', 'success');
      this.closeForm();
      await this.loadInvoices();
    } finally {
      this.saving.set(false);
    }
  }

  private async resolveCustomerId(name: string): Promise<string | null> {
    const existing = this.customers().find(c => c.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;

    const { data, error } = await this.supabase.client
      .from('gg_customers')
      .insert({ name })
      .select('id, name')
      .single();
    if (error || !data) return null;
    this.customers.update(list => [...list, data].sort((a, b) => a.name.localeCompare(b.name)));
    return data.id;
  }

  private async loadInvoices(): Promise<void> {
    this.loading.set(true);
    const { data } = await this.supabase.client
      .from('gg_invoices')
      .select('id, invoice_number, customer_name, items, expected_dispatch_date, is_packed, is_dispatched, created_at')
      .order('created_at', { ascending: false })
      .limit(200);

    this.invoices.set((data ?? []).map((d: any) => ({
      id:                     d.id,
      invoice_number:         d.invoice_number,
      customer_name:          d.customer_name ?? '—',
      items:                  Array.isArray(d.items) ? d.items : [],
      expected_dispatch_date: d.expected_dispatch_date ?? null,
      is_packed:              d.is_packed ?? false,
      is_dispatched:          d.is_dispatched ?? false,
      created_at:             d.created_at,
    })));
    this.loading.set(false);
  }

  private async loadCustomers(): Promise<void> {
    const { data } = await this.supabase.client
      .from('gg_customers')
      .select('id, name')
      .order('name');
    this.customers.set(data ?? []);
  }

  private async loadFlavors(): Promise<void> {
    const { data } = await this.supabase.client
      .from('gg_flavors')
      .select('id, name')
      .eq('active', true)
      .order('name');
    this.flavors.set(data ?? []);
  }

  private showToast(msg: string, kind: 'success' | 'error'): void {
    this.toast.set(msg);
    this.toastKind.set(kind);
    setTimeout(() => this.toast.set(''), 3000);
  }
}
