import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { SupabaseService } from '../../../core/supabase.service';

interface IngredientStat {
  ingredient_id: string;
  name: string;
  unit: string;
  total_qty: number;
  last_inward_date: string | null;
}

interface Vendor {
  id: string;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  linked_ingredients: Array<{ id: string; name: string }>;
  purchase_stats: IngredientStat[];
  total_purchased: number;
  last_purchase_date: string | null;
  is_active: boolean;
}

interface IngredientOption { id: string; name: string; }

@Component({
  selector: 'app-vendors',
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

    <!-- Ingredient-link modal -->
    @if (mappingVendor()) {
      <div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:60;display:flex;align-items:center;justify-content:center;padding:16px;" (click)="mappingVendor.set(null)">
        <div style="background:#fff;border-radius:16px;padding:24px;max-width:460px;width:100%;max-height:80vh;overflow-y:auto;" (click)="$event.stopPropagation()">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <h3 style="font-size:16px;font-weight:700;color:#121212;margin:0;">Ingredients — {{ mappingVendor()!.name }}</h3>
            <button (click)="mappingVendor.set(null)" style="background:none;border:none;cursor:pointer;color:#9CA3AF;display:flex;"><span class="material-icons-round" style="font-size:20px;">close</span></button>
          </div>
          <p style="font-size:13px;color:#6B7280;margin:0 0 16px;">Select which ingredients this vendor supplies.</p>

          <!-- Search inside modal -->
          <div style="position:relative;margin-bottom:12px;">
            <span class="material-icons-round" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:15px;color:#9CA3AF;">search</span>
            <input [(ngModel)]="modalSearch" placeholder="Search ingredients…"
                   style="width:100%;padding:8px 12px 8px 32px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box;">
          </div>

          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px;">
            @for (ing of filteredModalIngredients(); track ing.id) {
              <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:9px 12px;border-radius:8px;border:1px solid #E5E7EB;transition:background 0.1s;"
                     [style.background]="isLinked(mappingVendor()!.id, ing.id) ? '#f0fdf4' : 'transparent'"
                     [style.border-color]="isLinked(mappingVendor()!.id, ing.id) ? '#bbf7d0' : '#E5E7EB'">
                <input type="checkbox" [checked]="isLinked(mappingVendor()!.id, ing.id)"
                       (change)="toggleIngredientLink(mappingVendor()!.id, ing.id, $event)"
                       style="width:16px;height:16px;accent-color:#01AC51;cursor:pointer;flex-shrink:0;">
                <span style="font-size:14px;color:#121212;">{{ ing.name }}</span>
              </label>
            }
            @if (filteredModalIngredients().length === 0) {
              <p style="text-align:center;color:#9CA3AF;font-size:13px;padding:16px 0;">No ingredients match.</p>
            }
          </div>
          <button (click)="mappingVendor.set(null)"
                  style="width:100%;padding:10px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
            Done
          </button>
        </div>
      </div>
    }

    <div style="padding:24px;max-width:1080px;">

      <!-- Header -->
      <div style="margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="font-size:22px;font-weight:700;color:var(--foreground);margin:0 0 4px;font-family:'Cabin',sans-serif;">Vendors</h1>
          <p style="color:#6B7280;font-size:14px;margin:0;">Supplier directory, ingredient mappings, and purchase history.</p>
        </div>
        <button (click)="openNewForm()"
                style="padding:9px 18px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">
          <span class="material-icons-round" style="font-size:18px;">add</span> Add Vendor
        </button>
      </div>

      <!-- Summary strip -->
      @if (!loading() && vendors().length > 0) {
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;" class="vn-summary-grid">
          <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 18px;">
            <p style="font-size:12px;color:#6B7280;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;margin:0 0 4px;">Total Vendors</p>
            <p style="font-size:24px;font-weight:700;color:var(--foreground);margin:0;">{{ vendors().length }}</p>
            <p style="font-size:12px;color:#6B7280;margin:4px 0 0;">{{ activeCount() }} active</p>
          </div>
          <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 18px;">
            <p style="font-size:12px;color:#6B7280;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;margin:0 0 4px;">Total Purchased</p>
            <p style="font-size:24px;font-weight:700;color:var(--foreground);margin:0;">{{ grandTotalPurchased() | number:'1.0-0' }} <span style="font-size:14px;font-weight:400;color:#6B7280;">units</span></p>
            <p style="font-size:12px;color:#6B7280;margin:4px 0 0;">across all vendors</p>
          </div>
          <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 18px;">
            <p style="font-size:12px;color:#6B7280;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;margin:0 0 4px;">Top Supplier</p>
            <p style="font-size:16px;font-weight:700;color:var(--foreground);margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ topVendor()?.name ?? '—' }}</p>
            <p style="font-size:12px;color:#6B7280;margin:4px 0 0;">{{ topVendor()?.total_purchased | number:'1.0-0' }} units purchased</p>
          </div>
        </div>
      }

      <!-- Add / Edit form -->
      @if (showForm()) {
        <div style="background:var(--card);border-radius:12px;border:1px solid var(--border);padding:24px;margin-bottom:20px;animation:slideDown 0.15s ease;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
            <h2 style="font-size:16px;font-weight:700;color:var(--foreground);margin:0;">{{ editId() ? 'Edit Vendor' : 'New Vendor' }}</h2>
            <button (click)="closeForm()" style="border:none;background:none;cursor:pointer;color:#9CA3AF;display:flex;">
              <span class="material-icons-round" style="font-size:20px;">close</span>
            </button>
          </div>
          <form [formGroup]="form" (ngSubmit)="save()">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;" class="vn-form-grid">
              <div>
                <label class="vn-label">Vendor Name *</label>
                <input formControlName="name" class="gg-input" placeholder="e.g. Alpha Supplies"
                       [style.border-color]="form.get('name')!.invalid && form.get('name')!.touched ? '#dc2626' : ''">
              </div>
              <div>
                <label class="vn-label">Contact Person</label>
                <input formControlName="contact_person" class="gg-input" placeholder="e.g. Ramesh Kumar">
              </div>
              <div>
                <label class="vn-label">Phone</label>
                <input formControlName="phone" class="gg-input" placeholder="9876543210">
              </div>
              <div>
                <label class="vn-label">Email</label>
                <input formControlName="email" type="email" class="gg-input" placeholder="vendor@example.com">
              </div>
              <div style="grid-column:1/-1;">
                <label class="vn-label">Address</label>
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
                {{ saving() ? 'Saving…' : (editId() ? 'Update Vendor' : 'Add Vendor') }}
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
        <input [(ngModel)]="rawSearch" (ngModelChange)="searchSig.set($event)" placeholder="Search vendors…"
               style="width:100%;padding:9px 12px 9px 34px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:var(--card);color:var(--foreground);outline:none;box-sizing:border-box;">
      </div>

      <!-- Vendor list -->
      @if (loading()) {
        <div style="display:flex;flex-direction:column;gap:12px;">
          @for (i of [1,2,3]; track i) { <div class="gg-skeleton" style="height:90px;border-radius:12px;"></div> }
        </div>
      } @else if (filteredVendors().length === 0) {
        <div style="text-align:center;padding:64px 0;color:#9CA3AF;">
          <span class="material-icons-round" style="font-size:52px;display:block;margin-bottom:14px;">storefront</span>
          <p style="font-size:15px;font-weight:600;color:#374151;margin:0 0 6px;">{{ vendors().length === 0 ? 'No vendors yet' : 'No vendors match your search' }}</p>
          <p style="font-size:13px;margin:0;">Add your first supplier using the button above.</p>
        </div>
      } @else {
        <div style="display:flex;flex-direction:column;gap:10px;">
          @for (v of filteredVendors(); track v.id) {
            <div style="background:var(--card);border-radius:12px;border:1px solid var(--border);overflow:hidden;transition:box-shadow 0.15s;" class="vn-card">

              <!-- Card header (always visible) -->
              <div style="padding:16px 20px;cursor:pointer;" (click)="toggleExpand(v.id)">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">

                  <!-- Left info -->
                  <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
                      <span style="font-size:15px;font-weight:700;color:var(--foreground);font-family:'Cabin',sans-serif;">{{ v.name }}</span>
                      <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;text-transform:uppercase;"
                            [style.background]="v.is_active ? '#dcfce7' : '#f3f4f6'"
                            [style.color]="v.is_active ? '#15803d' : '#9CA3AF'">
                        {{ v.is_active ? 'Active' : 'Inactive' }}
                      </span>
                    </div>

                    <!-- Contact row -->
                    <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:12px;color:#6B7280;margin-bottom:8px;">
                      @if (v.contact_person) {
                        <span style="display:flex;align-items:center;gap:3px;">
                          <span class="material-icons-round" style="font-size:13px;">person</span>{{ v.contact_person }}
                        </span>
                      }
                      @if (v.phone) {
                        <span style="display:flex;align-items:center;gap:3px;">
                          <span class="material-icons-round" style="font-size:13px;">phone</span>{{ v.phone }}
                        </span>
                      }
                      @if (v.email) {
                        <span style="display:flex;align-items:center;gap:3px;">
                          <span class="material-icons-round" style="font-size:13px;">mail</span>{{ v.email }}
                        </span>
                      }
                    </div>

                    <!-- Stats pills -->
                    <div style="display:flex;flex-wrap:wrap;gap:6px;">
                      <span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d;padding:3px 9px;border-radius:6px;font-weight:600;">
                        <span class="material-icons-round" style="font-size:13px;">category</span>
                        {{ v.linked_ingredients.length }} ingredient{{ v.linked_ingredients.length !== 1 ? 's' : '' }} linked
                      </span>
                      @if (v.total_purchased > 0) {
                        <span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;background:#dbeafe;border:1px solid #93c5fd;color:#2563eb;padding:3px 9px;border-radius:6px;font-weight:600;">
                          <span class="material-icons-round" style="font-size:13px;">scale</span>
                          {{ v.total_purchased | number:'1.0-0' }} units total
                        </span>
                      }
                      @if (v.last_purchase_date) {
                        <span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;background:#f9fafb;border:1px solid #E5E7EB;color:#6B7280;padding:3px 9px;border-radius:6px;">
                          <span class="material-icons-round" style="font-size:13px;">event</span>
                          Last: {{ v.last_purchase_date | date:'d MMM yyyy' }}
                        </span>
                      }
                    </div>
                  </div>

                  <!-- Right actions -->
                  <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;" (click)="$event.stopPropagation()">
                    <button (click)="openMapping(v)"
                            style="padding:6px 11px;background:#eff6ff;border:1px solid #93c5fd;color:#2563eb;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;">
                      <span class="material-icons-round" style="font-size:14px;">link</span> Ingredients
                    </button>
                    <button (click)="startEdit(v)"
                            style="padding:6px 11px;background:#f0fdf4;border:1px solid #01AC51;color:#01AC51;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">
                      Edit
                    </button>
                    <button (click)="deleteVendor(v.id)"
                            style="padding:6px 9px;background:#fff5f5;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:12px;cursor:pointer;display:flex;align-items:center;">
                      <span class="material-icons-round" style="font-size:16px;">delete_outline</span>
                    </button>
                    <span class="material-icons-round" style="font-size:20px;color:#9CA3AF;transition:transform 0.2s;margin-left:2px;"
                          [style.transform]="expanded().has(v.id) ? 'rotate(180deg)' : 'none'">expand_more</span>
                  </div>
                </div>
              </div>

              <!-- Expanded: purchase stats per ingredient -->
              @if (expanded().has(v.id)) {
                <div style="border-top:1px solid var(--border);background:#fafafa;">
                  @if (v.purchase_stats.length === 0) {
                    <div style="padding:20px 24px;text-align:center;color:#9CA3AF;font-size:13px;">
                      <span class="material-icons-round" style="font-size:28px;display:block;margin-bottom:6px;color:#E5E7EB;">receipt_long</span>
                      No purchases recorded from this vendor yet.
                    </div>
                  } @else {
                    <div style="padding:0;">
                      <div style="padding:10px 20px;background:#f3f4f6;border-bottom:1px solid var(--border);">
                        <p style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;margin:0;letter-spacing:0.5px;">
                          Purchase breakdown — {{ v.purchase_stats.length }} ingredient{{ v.purchase_stats.length !== 1 ? 's' : '' }}
                        </p>
                      </div>
                      <table style="width:100%;border-collapse:collapse;">
                        <thead>
                          <tr style="background:#f8f9fa;">
                            <th style="text-align:left;padding:9px 20px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">#</th>
                            <th style="text-align:left;padding:9px 12px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Ingredient</th>
                            <th style="text-align:right;padding:9px 12px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Total Purchased</th>
                            <th style="text-align:right;padding:9px 20px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Last Inward</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (stat of v.purchase_stats; track stat.ingredient_id; let idx = $index) {
                            <tr style="border-top:1px solid #f0f0f0;">
                              <td style="padding:10px 20px;font-size:12px;color:#9CA3AF;">{{ idx + 1 }}</td>
                              <td style="padding:10px 12px;">
                                <span style="font-size:13px;font-weight:600;color:var(--foreground);">{{ stat.name }}</span>
                              </td>
                              <td style="padding:10px 12px;text-align:right;">
                                <span style="font-size:13px;font-weight:700;color:#2563eb;">{{ stat.total_qty | number:'1.0-2' }}</span>
                                <span style="font-size:11px;font-weight:600;color:#6B7280;background:#f3f4f6;padding:1px 5px;border-radius:4px;margin-left:4px;">{{ stat.unit }}</span>
                              </td>
                              <td style="padding:10px 20px;text-align:right;font-size:12px;color:#6B7280;">
                                {{ stat.last_inward_date ? (stat.last_inward_date | date:'d MMM yyyy') : '—' }}
                              </td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>
      }
    </div>

    <style>
      .vn-label { display:block; font-size:12px; font-weight:600; color:#374151; margin-bottom:6px; }
      .vn-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.07); }
      @keyframes slideUp   { from { transform:translateY(16px); opacity:0; } to { transform:translateY(0); opacity:1; } }
      @keyframes slideDown { from { transform:translateY(-8px); opacity:0; } to { transform:translateY(0); opacity:1; } }
      @media (max-width:700px) { .vn-form-grid { grid-template-columns: 1fr !important; } }
      @media (max-width:600px) { .vn-summary-grid { grid-template-columns: 1fr 1fr !important; } }
      @media (max-width:400px) { .vn-summary-grid { grid-template-columns: 1fr !important; } }
    </style>
  `,
})
export class VendorsComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly fb = inject(FormBuilder);

  loading  = signal(true);
  saving   = signal(false);
  showForm = signal(false);
  editId   = signal<string | null>(null);
  vendors  = signal<Vendor[]>([]);
  allIngredients  = signal<IngredientOption[]>([]);
  linkedMap       = signal<Map<string, Set<string>>>(new Map());
  mappingVendor   = signal<Vendor | null>(null);
  expanded        = signal<Set<string>>(new Set());
  formError = signal('');
  toast     = signal('');
  toastKind = signal<'success' | 'error'>('success');

  // Modal ingredient search
  modalSearch = '';
  rawSearch = '';
  searchSig = signal('');

  readonly filteredVendors = computed(() => {
    const q = this.searchSig().toLowerCase().trim();
    if (!q) return this.vendors();
    return this.vendors().filter(v =>
      v.name.toLowerCase().includes(q) ||
      v.contact_person.toLowerCase().includes(q) ||
      v.email.toLowerCase().includes(q)
    );
  });

  readonly filteredModalIngredients = computed(() => {
    const q = this.modalSearch.toLowerCase().trim();
    if (!q) return this.allIngredients();
    return this.allIngredients().filter(i => i.name.toLowerCase().includes(q));
  });

  readonly activeCount = computed(() => this.vendors().filter(v => v.is_active).length);

  readonly grandTotalPurchased = computed(() =>
    this.vendors().reduce((sum, v) => sum + v.total_purchased, 0)
  );

  readonly topVendor = computed(() =>
    [...this.vendors()].sort((a, b) => b.total_purchased - a.total_purchased)[0] ?? null
  );

  form = this.fb.nonNullable.group({
    name:           ['', Validators.required],
    contact_person: [''],
    phone:          [''],
    email:          [''],
    address:        [''],
  });

  async ngOnInit(): Promise<void> { await this.loadData(); }

  // ── Expand ────────────────────────────────────────────────────────────

  toggleExpand(id: string): void {
    this.expanded.update(s => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Form ──────────────────────────────────────────────────────────────

  openNewForm(): void {
    this.editId.set(null);
    this.form.reset();
    this.formError.set('');
    this.showForm.set(true);
  }

  startEdit(v: Vendor): void {
    this.editId.set(v.id);
    this.form.setValue({ name: v.name, contact_person: v.contact_person, phone: v.phone, email: v.email, address: v.address });
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
      const { error } = await this.supabase.client.from('gg_vendors').update(val).eq('id', isEdit);
      if (error) { this.formError.set(error.message); this.saving.set(false); return; }
    } else {
      const { error } = await this.supabase.client.from('gg_vendors').insert(val);
      if (error) { this.formError.set(error.message); this.saving.set(false); return; }
    }
    this.showToast(isEdit ? 'Vendor updated' : 'Vendor added', 'success');
    this.closeForm();
    await this.loadData();
    this.saving.set(false);
  }

  async deleteVendor(id: string): Promise<void> {
    if (!confirm('Delete this vendor? This will also remove ingredient links.')) return;
    await this.supabase.client.from('gg_vendor_ingredients').delete().eq('vendor_id', id);
    const { error } = await this.supabase.client.from('gg_vendors').delete().eq('id', id);
    if (error) { this.showToast(error.message, 'error'); return; }
    this.showToast('Vendor deleted', 'success');
    await this.loadData();
  }

  // ── Ingredient linking ────────────────────────────────────────────────

  openMapping(v: Vendor): void {
    this.modalSearch = '';
    this.mappingVendor.set(v);
  }

  isLinked(vendorId: string, ingId: string): boolean {
    return this.linkedMap().get(vendorId)?.has(ingId) ?? false;
  }

  async toggleIngredientLink(vendorId: string, ingId: string, event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      await this.supabase.client.from('gg_vendor_ingredients').upsert({ vendor_id: vendorId, ingredient_id: ingId });
    } else {
      await this.supabase.client.from('gg_vendor_ingredients').delete().eq('vendor_id', vendorId).eq('ingredient_id', ingId);
    }
    await this.loadData();
    // Refresh mappingVendor reference
    const updated = this.vendors().find(v => v.id === vendorId);
    if (updated) this.mappingVendor.set(updated);
  }

  // ── Data ──────────────────────────────────────────────────────────────

  private async loadData(): Promise<void> {
    this.loading.set(true);

    const [{ data: vnd }, { data: ings }, { data: vi }, { data: inward }] = await Promise.all([
      this.supabase.client.from('gg_vendors').select('id, name, contact_person, phone, email, address').order('name'),
      this.supabase.client.from('gg_ingredients').select('id, name').order('name'),
      this.supabase.client.from('gg_vendor_ingredients').select('vendor_id, ingredient_id, gg_ingredients(name)'),
      this.supabase.client.from('gg_inwarding').select('vendor_id, ingredient_id, qty, unit, inward_date, gg_ingredients(name, default_unit)').order('inward_date', { ascending: false }),
    ]);

    this.allIngredients.set(ings ?? []);

    // Build linked-map
    const lm = new Map<string, Set<string>>();
    const viMap = new Map<string, Array<{ id: string; name: string }>>();
    (vi ?? []).forEach((row: any) => {
      if (!lm.has(row.vendor_id)) lm.set(row.vendor_id, new Set());
      lm.get(row.vendor_id)!.add(row.ingredient_id);
      if (!viMap.has(row.vendor_id)) viMap.set(row.vendor_id, []);
      if (row.gg_ingredients?.name) viMap.get(row.vendor_id)!.push({ id: row.ingredient_id, name: row.gg_ingredients.name });
    });
    this.linkedMap.set(lm);

    // Build purchase stats per vendor+ingredient
    // Map: vendor_id → ingredient_id → { name, unit, total_qty, last_inward_date }
    const ninety_days_ago = new Date();
    ninety_days_ago.setDate(ninety_days_ago.getDate() - 90);

    type IngStat = { name: string; unit: string; total_qty: number; last_inward_date: string | null };
    const purchaseMap = new Map<string, Map<string, IngStat>>();

    (inward ?? []).forEach((row: any) => {
      const vid = row.vendor_id;
      const iid = row.ingredient_id;
      if (!vid || !iid) return;
      if (!purchaseMap.has(vid)) purchaseMap.set(vid, new Map());
      const ingMap = purchaseMap.get(vid)!;
      const existing = ingMap.get(iid);
      const qty = row.qty ?? 0;
      const date = row.inward_date ?? null;
      if (existing) {
        existing.total_qty += qty;
        if (date && (!existing.last_inward_date || date > existing.last_inward_date)) {
          existing.last_inward_date = date;
        }
      } else {
        ingMap.set(iid, {
          name: row.gg_ingredients?.name ?? iid,
          unit: row.unit ?? row.gg_ingredients?.default_unit ?? 'kg',
          total_qty: qty,
          last_inward_date: date,
        });
      }
    });

    this.vendors.set((vnd ?? []).map((v: any) => {
      const ingStats = purchaseMap.get(v.id) ?? new Map();
      const stats: IngredientStat[] = Array.from(ingStats.entries()).map(([ingId, s]) => ({
        ingredient_id: ingId,
        name: s.name,
        unit: s.unit,
        total_qty: s.total_qty,
        last_inward_date: s.last_inward_date,
      })).sort((a, b) => b.total_qty - a.total_qty);

      const total = stats.reduce((sum, s) => sum + s.total_qty, 0);
      const lastDate = stats.reduce((latest, s) => {
        if (!s.last_inward_date) return latest;
        return !latest || s.last_inward_date > latest ? s.last_inward_date : latest;
      }, null as string | null);

      const isActive = lastDate ? new Date(lastDate) >= ninety_days_ago : false;

      return {
        id: v.id,
        name: v.name,
        contact_person: v.contact_person ?? '',
        phone: v.phone ?? '',
        email: v.email ?? '',
        address: v.address ?? '',
        linked_ingredients: viMap.get(v.id) ?? [],
        purchase_stats: stats,
        total_purchased: total,
        last_purchase_date: lastDate,
        is_active: isActive,
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
