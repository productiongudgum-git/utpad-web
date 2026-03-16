import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseService } from '../../../core/supabase.service';

interface Vendor {
  id: string; name: string; contact_person: string;
  phone: string; email: string; address: string;
  ingredients: Array<{id: string; name: string}>;
}
interface IngredientOption { id: string; name: string; }

@Component({
  selector: 'app-vendors',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div style="padding:24px;max-width:1000px;">
      <div style="margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="font-family:'Cabin',sans-serif;font-size:22px;font-weight:700;color:#121212;margin:0 0 4px;">Vendors</h1>
          <p style="color:#6B7280;font-size:14px;margin:0;">Supplier directory and ingredient mappings.</p>
        </div>
        <button (click)="toggleForm()" style="padding:9px 18px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">
          <span class="material-icons-round" style="font-size:18px;">{{ showForm() ? 'close' : 'add' }}</span>
          {{ showForm() ? 'Cancel' : 'Add Vendor' }}
        </button>
      </div>

      @if (showForm()) {
        <div style="background:#fff;border-radius:12px;border:1px solid #E5E7EB;padding:24px;margin-bottom:24px;">
          <h2 style="font-family:'Cabin',sans-serif;font-size:16px;font-weight:600;margin:0 0 20px;">{{ editId() ? 'Edit' : 'Add' }} Vendor</h2>
          <form [formGroup]="form" (ngSubmit)="save()">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;" class="vn-grid">
              <div>
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Vendor Name *</label>
                <input formControlName="name" class="gg-input" placeholder="e.g. Alpha Supplies">
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Contact Person</label>
                <input formControlName="contact_person" class="gg-input" placeholder="e.g. Ramesh Kumar">
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Phone</label>
                <input formControlName="phone" class="gg-input" placeholder="9876543210">
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Email</label>
                <input formControlName="email" type="email" class="gg-input" placeholder="vendor@example.com">
              </div>
              <div style="grid-column:1/-1;">
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Address</label>
                <input formControlName="address" class="gg-input" placeholder="Full address...">
              </div>
            </div>
            @if (formError()) { <p style="color:#FF2828;font-size:13px;margin-bottom:12px;">{{ formError() }}</p> }
            <div style="display:flex;gap:10px;">
              <button type="submit" [disabled]="saving()" class="gg-btn-primary">{{ saving() ? 'Saving...' : (editId() ? 'Update' : 'Add Vendor') }}</button>
              @if (editId()) {
                <button type="button" (click)="cancelEdit()" style="padding:8px 16px;background:#f3f4f6;border:1px solid #E5E7EB;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;color:#374151;">Cancel</button>
              }
            </div>
          </form>
        </div>
      }

      <!-- Ingredient mapping modal -->
      @if (mappingVendor()) {
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:50;display:flex;align-items:center;justify-content:center;padding:16px;">
          <div style="background:#fff;border-radius:16px;padding:24px;max-width:480px;width:100%;max-height:80vh;overflow-y:auto;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
              <h3 style="font-family:'Cabin',sans-serif;font-size:16px;font-weight:700;margin:0;">Ingredients for {{ mappingVendor()!.name }}</h3>
              <button (click)="mappingVendor.set(null)" style="background:none;border:none;cursor:pointer;color:#6B7280;font-size:20px;display:flex;">✕</button>
            </div>
            <p style="font-size:13px;color:#6B7280;margin:0 0 16px;">Check/uncheck to link ingredients to this vendor.</p>
            <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
              @for (ing of allIngredients(); track ing.id) {
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:8px;border-radius:8px;border:1px solid #E5E7EB;">
                  <input type="checkbox" [checked]="isLinked(mappingVendor()!.id, ing.id)"
                         (change)="toggleIngredientLink(mappingVendor()!.id, ing.id, $event)"
                         style="width:16px;height:16px;accent-color:#01AC51;">
                  <span style="font-size:14px;color:#121212;">{{ ing.name }}</span>
                </label>
              }
            </div>
            <button (click)="mappingVendor.set(null)" class="gg-btn-primary" style="width:100%;">Done</button>
          </div>
        </div>
      }

      @if (toast()) {
        <div class="toast" [class.toast-success]="toastKind()==='success'" [class.toast-error]="toastKind()==='error'">{{ toast() }}</div>
      }

      @if (loading()) {
        <div style="display:flex;flex-direction:column;gap:12px;">
          @for (i of [1,2,3]; track i) { <div class="gg-skeleton" style="height:90px;border-radius:12px;"></div> }
        </div>
      } @else if (vendors().length === 0) {
        <div style="text-align:center;padding:60px 0;color:#9CA3AF;">
          <span class="material-icons-round" style="font-size:48px;display:block;margin-bottom:12px;">storefront</span>
          <p style="font-size:15px;margin:0;">No vendors yet.</p>
        </div>
      } @else {
        <div style="display:flex;flex-direction:column;gap:12px;">
          @for (v of vendors(); track v.id) {
            <div style="background:#fff;border-radius:12px;border:1px solid #E5E7EB;padding:16px 20px;">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                <div style="flex:1;min-width:0;">
                  <p style="font-size:15px;font-weight:700;color:#121212;margin:0 0 4px;font-family:'Cabin',sans-serif;">{{ v.name }}</p>
                  <div style="display:flex;flex-wrap:wrap;gap:12px;font-size:13px;color:#6B7280;">
                    @if (v.contact_person) { <span>👤 {{ v.contact_person }}</span> }
                    @if (v.phone) { <span>📞 {{ v.phone }}</span> }
                    @if (v.email) { <span>✉️ {{ v.email }}</span> }
                  </div>
                  @if (v.ingredients.length > 0) {
                    <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;">
                      @for (ing of v.ingredients; track ing.id) {
                        <span style="background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;">{{ ing.name }}</span>
                      }
                    </div>
                  }
                </div>
                <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                  <button (click)="openMapping(v)" style="padding:6px 12px;background:#dbeafe;border:1px solid #93c5fd;color:#2563eb;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;">
                    <span class="material-icons-round" style="font-size:14px;">link</span> Ingredients
                  </button>
                  <button (click)="startEdit(v)" style="padding:6px 12px;background:#f0fdf4;border:1px solid #01AC51;color:#01AC51;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Edit</button>
                  <button (click)="deleteVendor(v.id)" style="padding:6px 12px;background:#fff5f5;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Delete</button>
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>
    <style>
      @media (max-width:480px) { .vn-grid { grid-template-columns: 1fr !important; } }
    </style>
  `,
})
export class VendorsComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly fb = inject(FormBuilder);

  loading = signal(true);
  saving = signal(false);
  showForm = signal(false);
  editId = signal<string | null>(null);
  vendors = signal<Vendor[]>([]);
  allIngredients = signal<IngredientOption[]>([]);
  linkedMap = signal<Map<string, Set<string>>>(new Map());
  mappingVendor = signal<Vendor | null>(null);
  formError = signal('');
  toast = signal('');
  toastKind = signal<'success'|'error'>('success');

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    contact_person: [''], phone: [''], email: [''], address: [''],
  });

  async ngOnInit(): Promise<void> { await this.loadData(); }

  toggleForm(): void { if (this.showForm()) { this.cancelEdit(); } else { this.showForm.set(true); } }

  startEdit(v: Vendor): void {
    this.editId.set(v.id);
    this.form.setValue({ name: v.name, contact_person: v.contact_person, phone: v.phone, email: v.email, address: v.address });
    this.showForm.set(true);
  }

  cancelEdit(): void { this.editId.set(null); this.form.reset(); this.showForm.set(false); }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true); this.formError.set('');
    const v = this.form.getRawValue();
    if (this.editId()) {
      const { error } = await this.supabase.client.from('gg_vendors').update(v).eq('id', this.editId()!);
      if (error) { this.formError.set(error.message); this.saving.set(false); return; }
    } else {
      const { error } = await this.supabase.client.from('gg_vendors').insert(v);
      if (error) { this.formError.set(error.message); this.saving.set(false); return; }
    }
    this.showToast(this.editId() ? 'Vendor updated' : 'Vendor added', 'success');
    this.cancelEdit(); await this.loadData(); this.saving.set(false);
  }

  async deleteVendor(id: string): Promise<void> {
    if (!confirm('Delete this vendor?')) return;
    await this.supabase.client.from('gg_vendor_ingredients').delete().eq('vendor_id', id);
    const { error } = await this.supabase.client.from('gg_vendors').delete().eq('id', id);
    if (!error) { this.showToast('Deleted', 'success'); await this.loadData(); }
    else this.showToast(error.message, 'error');
  }

  openMapping(v: Vendor): void { this.mappingVendor.set(v); }

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
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);
    const [{ data: vnd }, { data: ings }, { data: vi }] = await Promise.all([
      this.supabase.client.from('gg_vendors').select('id, name, contact_person, phone, email, address').order('name'),
      this.supabase.client.from('gg_ingredients').select('id, name').order('name'),
      this.supabase.client.from('gg_vendor_ingredients').select('vendor_id, ingredient_id, gg_ingredients(name)'),
    ]);
    this.allIngredients.set(ings ?? []);
    const lm = new Map<string, Set<string>>();
    const viMap = new Map<string, Array<{id:string;name:string}>>();
    (vi ?? []).forEach((row: any) => {
      if (!lm.has(row.vendor_id)) lm.set(row.vendor_id, new Set());
      lm.get(row.vendor_id)!.add(row.ingredient_id);
      if (!viMap.has(row.vendor_id)) viMap.set(row.vendor_id, []);
      if (row.gg_ingredients?.name) viMap.get(row.vendor_id)!.push({ id: row.ingredient_id, name: row.gg_ingredients.name });
    });
    this.linkedMap.set(lm);
    this.vendors.set((vnd ?? []).map((v: any) => ({
      id: v.id, name: v.name, contact_person: v.contact_person ?? '', phone: v.phone ?? '',
      email: v.email ?? '', address: v.address ?? '',
      ingredients: viMap.get(v.id) ?? [],
    })));
    this.loading.set(false);
  }

  private showToast(msg: string, kind: 'success'|'error'): void {
    this.toast.set(msg); this.toastKind.set(kind);
    setTimeout(() => this.toast.set(''), 3000);
  }
}
