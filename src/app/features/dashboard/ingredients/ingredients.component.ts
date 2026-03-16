import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseService } from '../../../core/supabase.service';

interface Ingredient {
  id: string; name: string; barcode: string;
  default_unit: string; reorder_point: number; current_stock: number;
  vendor_names: string[];
}

@Component({
  selector: 'app-ingredients',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div style="padding:24px;max-width:1000px;">
      <div style="margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="font-family:'Cabin',sans-serif;font-size:22px;font-weight:700;color:#121212;margin:0 0 4px;">Ingredients</h1>
          <p style="color:#6B7280;font-size:14px;margin:0;">Master list of all raw ingredients.</p>
        </div>
        <button (click)="toggleForm()" style="padding:9px 18px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">
          <span class="material-icons-round" style="font-size:18px;">{{ showForm() ? 'close' : 'add' }}</span>
          {{ showForm() ? 'Cancel' : 'Add Ingredient' }}
        </button>
      </div>

      @if (showForm()) {
        <div style="background:#fff;border-radius:12px;border:1px solid #E5E7EB;padding:24px;margin-bottom:24px;">
          <h2 style="font-family:'Cabin',sans-serif;font-size:16px;font-weight:600;color:#121212;margin:0 0 20px;">{{ editId() ? 'Edit' : 'Add' }} Ingredient</h2>
          <form [formGroup]="form" (ngSubmit)="save()">
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:16px;" class="ing-grid">
              <div>
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Name *</label>
                <input formControlName="name" class="gg-input" placeholder="e.g. Gum Base">
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Barcode</label>
                <input formControlName="barcode" class="gg-input" placeholder="e.g. 8901234567890">
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Default Unit *</label>
                <select formControlName="default_unit" class="gg-input dropdown-with-arrow">
                  <option value="kg">kg</option><option value="g">g</option>
                  <option value="L">L</option><option value="ml">ml</option>
                  <option value="pcs">pcs</option><option value="boxes">boxes</option>
                </select>
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Reorder Point</label>
                <input formControlName="reorder_point" type="number" min="0" class="gg-input" placeholder="10">
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Current Stock</label>
                <input formControlName="current_stock" type="number" min="0" step="0.01" class="gg-input" placeholder="0">
              </div>
            </div>
            @if (formError()) {
              <p style="color:#FF2828;font-size:13px;margin-bottom:12px;">{{ formError() }}</p>
            }
            <div style="display:flex;gap:10px;">
              <button type="submit" [disabled]="saving()" class="gg-btn-primary">{{ saving() ? 'Saving...' : (editId() ? 'Update' : 'Add Ingredient') }}</button>
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
        <div style="display:flex;flex-direction:column;gap:10px;">
          @for (i of [1,2,3,4]; track i) { <div class="gg-skeleton" style="height:64px;border-radius:10px;"></div> }
        </div>
      } @else if (ingredients().length === 0) {
        <div style="text-align:center;padding:60px 0;color:#9CA3AF;">
          <span class="material-icons-round" style="font-size:48px;display:block;margin-bottom:12px;">category</span>
          <p style="font-size:15px;margin:0;">No ingredients yet.</p>
        </div>
      } @else {
        <div style="background:#fff;border-radius:12px;border:1px solid #E5E7EB;overflow:hidden;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#f8f9fa;border-bottom:1px solid #E5E7EB;">
                <th style="text-align:left;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;">Name</th>
                <th style="text-align:left;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;">Barcode</th>
                <th style="text-align:right;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;">Stock</th>
                <th style="text-align:right;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;">Reorder</th>
                <th style="text-align:left;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;">Vendors</th>
                <th style="text-align:center;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (ing of ingredients(); track ing.id) {
                <tr style="border-bottom:1px solid #f3f4f6;">
                  <td style="padding:12px 16px;">
                    <span style="font-size:14px;font-weight:600;color:#121212;">{{ ing.name }}</span>
                    <span style="margin-left:6px;background:#f3f4f6;color:#6B7280;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:500;">{{ ing.default_unit }}</span>
                  </td>
                  <td style="padding:12px 16px;font-size:13px;color:#6B7280;font-family:monospace;">{{ ing.barcode || '—' }}</td>
                  <td style="padding:12px 16px;text-align:right;font-size:13px;font-weight:600;" [style.color]="ing.current_stock <= ing.reorder_point ? '#dc2626' : '#15803d'">
                    {{ ing.current_stock | number:'1.0-2' }} {{ ing.default_unit }}
                  </td>
                  <td style="padding:12px 16px;text-align:right;font-size:13px;color:#6B7280;">{{ ing.reorder_point | number:'1.0-2' }}</td>
                  <td style="padding:12px 16px;font-size:12px;color:#6B7280;">
                    {{ ing.vendor_names.length ? ing.vendor_names.join(', ') : '—' }}
                  </td>
                  <td style="padding:12px 16px;text-align:center;">
                    <div style="display:flex;align-items:center;justify-content:center;gap:6px;">
                      <button (click)="startEdit(ing)" style="padding:4px 10px;background:#f0fdf4;border:1px solid #01AC51;color:#01AC51;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Edit</button>
                      <button (click)="deleteIngredient(ing.id)" style="padding:4px 10px;background:#fff5f5;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Delete</button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
    <style>
      @media (max-width:700px) { .ing-grid { grid-template-columns: 1fr 1fr !important; } }
      @media (max-width:480px) { .ing-grid { grid-template-columns: 1fr !important; } }
    </style>
  `,
})
export class IngredientsComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly fb = inject(FormBuilder);

  loading = signal(true);
  saving = signal(false);
  showForm = signal(false);
  editId = signal<string | null>(null);
  ingredients = signal<Ingredient[]>([]);
  formError = signal('');
  toast = signal('');
  toastKind = signal<'success'|'error'>('success');

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    barcode: [''],
    default_unit: ['kg', Validators.required],
    reorder_point: [10],
    current_stock: [0],
  });

  async ngOnInit(): Promise<void> { await this.loadData(); }

  toggleForm(): void {
    if (this.showForm()) { this.cancelEdit(); } else { this.showForm.set(true); }
  }

  startEdit(ing: Ingredient): void {
    this.editId.set(ing.id);
    this.form.setValue({ name: ing.name, barcode: ing.barcode, default_unit: ing.default_unit, reorder_point: ing.reorder_point, current_stock: ing.current_stock });
    this.showForm.set(true);
  }

  cancelEdit(): void {
    this.editId.set(null);
    this.form.reset({ name: '', barcode: '', default_unit: 'kg', reorder_point: 10, current_stock: 0 });
    this.showForm.set(false);
  }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.formError.set('');
    const v = this.form.getRawValue();
    if (this.editId()) {
      const { error } = await this.supabase.client.from('gg_ingredients').update(v).eq('id', this.editId()!);
      if (error) { this.formError.set(error.message); this.saving.set(false); return; }
    } else {
      const { error } = await this.supabase.client.from('gg_ingredients').insert(v);
      if (error) { this.formError.set(error.message); this.saving.set(false); return; }
    }
    this.showToast(this.editId() ? 'Updated' : 'Ingredient added', 'success');
    this.cancelEdit();
    await this.loadData();
    this.saving.set(false);
  }

  async deleteIngredient(id: string): Promise<void> {
    if (!confirm('Delete this ingredient?')) return;
    const { error } = await this.supabase.client.from('gg_ingredients').delete().eq('id', id);
    if (!error) { this.showToast('Deleted', 'success'); await this.loadData(); }
    else this.showToast(error.message, 'error');
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);
    const { data: ings } = await this.supabase.client.from('gg_ingredients')
      .select('id, name, barcode, default_unit, reorder_point, current_stock').order('name');
    const { data: vi } = await this.supabase.client
      .from('gg_vendor_ingredients').select('ingredient_id, gg_vendors(name)');

    const vendorMap = new Map<string, string[]>();
    (vi ?? []).forEach((row: any) => {
      const key = row.ingredient_id;
      if (!vendorMap.has(key)) vendorMap.set(key, []);
      if (row.gg_vendors?.name) vendorMap.get(key)!.push(row.gg_vendors.name);
    });

    this.ingredients.set((ings ?? []).map((i: any) => ({
      id: i.id, name: i.name, barcode: i.barcode ?? '',
      default_unit: i.default_unit ?? 'kg', reorder_point: i.reorder_point ?? 0,
      current_stock: i.current_stock ?? 0,
      vendor_names: vendorMap.get(i.id) ?? [],
    })));
    this.loading.set(false);
  }

  private showToast(msg: string, kind: 'success'|'error'): void {
    this.toast.set(msg); this.toastKind.set(kind);
    setTimeout(() => this.toast.set(''), 3000);
  }
}
