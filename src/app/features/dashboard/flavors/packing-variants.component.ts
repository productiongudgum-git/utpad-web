import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseService } from '../../../core/supabase.service';

/**
 * PACKING VARIANTS
 * ────────────────
 * A packing variant is the same gum in a different box format — Lemon is
 * normally 15 gums to a box, occasionally 10 for a particular customer.
 *
 * A variant is its own `gg_flavors` row with `parent_flavor_id` set, because
 * flavor_id is the stock key everywhere in this system: a 10-box and a 15-box
 * are different goods and must not share a stock line, or FIFO will allocate
 * one against an order for the other. See migration 0008 for the reasoning.
 *
 * This screen exists separately from the Flavors page because that page is
 * deliberately kept out of the nav — flavours are auto-created 1:1 with
 * recipes by the importer, and hand-creating them invites duplicates. A
 * packing variant is the one legitimate reason to add a flavour row by hand,
 * so it gets a purpose-built form that always sets a parent and a box count.
 *
 * Variants are packed, never produced: production always runs against the
 * base flavour, and the packer picks the box format at packing time.
 */

interface BaseFlavor {
  id: string;
  name: string;
  code: string;
  active: boolean;
  units_per_box: number;
}

interface Variant {
  id: string;
  name: string;
  code: string;
  active: boolean;
  units_per_box: number;
  parent_flavor_id: string;
  default_customer_id: string | null;
}

interface Customer { id: string; name: string; }

interface ParentGroup {
  parent: BaseFlavor;
  variants: Variant[];
}

@Component({
  selector: 'app-packing-variants',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div style="padding:24px;max-width:960px;">

      <div style="margin-bottom:20px;display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="font-family:'Cabin',sans-serif;font-size:22px;font-weight:700;color:#121212;margin:0 0 4px;">Packing Variants</h1>
          <p style="color:#6B7280;font-size:14px;margin:0;max-width:620px;">
            The same flavour packed in a different box format. Each variant carries its own stock,
            its own packing materials, and can be picked directly on an invoice.
          </p>
        </div>
        <button (click)="toggleForm()"
                style="padding:9px 18px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap;">
          <span class="material-icons-round" style="font-size:18px;">{{ showForm() ? 'close' : 'add' }}</span>
          {{ showForm() ? 'Cancel' : 'Add Variant' }}
        </button>
      </div>

      @if (showForm()) {
        <div style="background:#fff;border-radius:12px;border:1px solid #E5E7EB;padding:24px;margin-bottom:24px;">
          <h2 style="font-family:'Cabin',sans-serif;font-size:16px;font-weight:600;margin:0 0 4px;">{{ editId() ? 'Edit' : 'New' }} packing variant</h2>
          <p style="font-size:13px;color:#6B7280;margin:0 0 20px;">
            Stock for this variant is tracked separately from its parent flavour.
          </p>

          <form [formGroup]="form" (ngSubmit)="save()">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;" class="pv-grid">

              <div>
                <label class="pv-label">Parent flavour *</label>
                <select formControlName="parent_flavor_id" class="gg-input dropdown-with-arrow"
                        (change)="onParentChange()">
                  <option value="">Select flavour…</option>
                  @for (f of baseFlavors(); track f.id) {
                    <option [value]="f.id">{{ f.name }} — standard {{ f.units_per_box }}/box</option>
                  }
                </select>
                <p class="pv-hint">The gum that gets packed. Production always runs against this flavour.</p>
              </div>

              <div>
                <label class="pv-label">Gums per box *</label>
                <input formControlName="units_per_box" type="number" min="1" step="1" class="gg-input" placeholder="e.g. 10">
                <p class="pv-hint">How many gums go into one box of this variant.</p>
              </div>

              <div>
                <label class="pv-label">Variant name *</label>
                <input formControlName="name" class="gg-input" placeholder="e.g. Lemon 10s">
                <p class="pv-hint">Shown in the invoice and inventory lists — make it unmistakable.</p>
              </div>

              <div>
                <label class="pv-label">Code *</label>
                <input formControlName="code" class="gg-input" placeholder="e.g. LEM-10">
              </div>

              <div style="grid-column:1/-1;">
                <label class="pv-label">Usually packed for <span style="font-weight:400;color:#9CA3AF;">(optional)</span></label>
                <select formControlName="default_customer_id" class="gg-input dropdown-with-arrow">
                  <option value="">No particular customer</option>
                  @for (c of customers(); track c.id) {
                    <option [value]="c.id">{{ c.name }}</option>
                  }
                </select>
                <p class="pv-hint">
                  Floats this variant to the top of the flavour picker on that customer's invoices.
                  It stays selectable for everyone — this is a shortcut, not a restriction.
                </p>
              </div>
            </div>

            @if (formError()) { <p style="color:#FF2828;font-size:13px;margin-bottom:12px;">{{ formError() }}</p> }

            <div style="display:flex;gap:10px;">
              <button type="submit" [disabled]="saving()" class="gg-btn-primary">
                {{ saving() ? 'Saving…' : (editId() ? 'Update variant' : 'Create variant') }}
              </button>
              @if (editId()) {
                <button type="button" (click)="cancelEdit()"
                        style="padding:8px 16px;background:#f3f4f6;border:1px solid #E5E7EB;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;color:#374151;">Cancel</button>
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
          @for (i of [1,2,3]; track i) { <div class="gg-skeleton" style="height:88px;border-radius:12px;"></div> }
        </div>
      } @else if (groups().length === 0) {
        <div style="text-align:center;padding:56px 20px;color:#9CA3AF;">
          <span class="material-icons-round" style="font-size:44px;display:block;margin-bottom:10px;">inventory_2</span>
          <p style="font-size:15px;margin:0 0 4px;color:#6B7280;">No packing variants yet.</p>
          <p style="font-size:13px;margin:0;">Every flavour is packed at its standard box count.</p>
        </div>
      } @else {
        <div style="display:flex;flex-direction:column;gap:14px;">
          @for (g of groups(); track g.parent.id) {
            <div style="background:#fff;border-radius:12px;border:1px solid #E5E7EB;overflow:hidden;">

              <div style="padding:12px 18px;background:#f8f9fa;border-bottom:1px solid #E5E7EB;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                <span style="font-size:15px;font-weight:700;color:#121212;font-family:'Cabin',sans-serif;">{{ g.parent.name }}</span>
                <span style="background:#f3f4f6;color:#6B7280;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600;font-family:monospace;">{{ g.parent.code }}</span>
                <span style="background:#dcfce7;color:#15803d;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:600;">Standard · {{ g.parent.units_per_box }}/box</span>
              </div>

              @for (v of g.variants; track v.id) {
                <div style="padding:14px 18px;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                  <div style="flex:1;min-width:200px;">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:3px;">
                      <span style="font-size:14px;font-weight:600;color:#121212;">{{ v.name }}</span>
                      <span style="background:#f3f4f6;color:#6B7280;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600;font-family:monospace;">{{ v.code }}</span>
                      <span style="background:#dbeafe;color:#2563eb;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:600;">{{ v.units_per_box }}/box</span>
                      @if (!v.active) {
                        <span style="background:#fee2e2;color:#dc2626;padding:1px 7px;border-radius:4px;font-size:10px;font-weight:600;">Inactive</span>
                      }
                    </div>
                    @if (v.default_customer_id) {
                      <p style="font-size:12px;color:#6B7280;margin:0;display:flex;align-items:center;gap:4px;">
                        <span class="material-icons-round" style="font-size:13px;">person</span>
                        Usually for {{ customerName(v.default_customer_id) }}
                      </p>
                    }
                  </div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button (click)="toggleActive(v)"
                            [style.color]="v.active ? '#d97706' : '#01AC51'"
                            [style.borderColor]="v.active ? '#fde68a' : '#bbf7d0'"
                            style="padding:4px 10px;background:transparent;border:1px solid;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">
                      {{ v.active ? 'Deactivate' : 'Activate' }}
                    </button>
                    <button (click)="startEdit(v)"
                            style="padding:4px 10px;background:#f0fdf4;border:1px solid #01AC51;color:#01AC51;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Edit</button>
                    <button (click)="deleteVariant(v)" [disabled]="deletingId() === v.id"
                            style="padding:4px 10px;background:#fff5f5;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">
                      {{ deletingId() === v.id ? 'Checking…' : 'Delete' }}
                    </button>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }
    </div>

    <style>
      .pv-label { display:block; font-size:12px; font-weight:600; color:#374151; margin-bottom:6px; }
      .pv-hint  { font-size:11px; color:#9CA3AF; margin:4px 0 0; line-height:1.4; }
      @media (max-width:640px) { .pv-grid { grid-template-columns: 1fr !important; } }
    </style>
  `,
})
export class PackingVariantsComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly fb = inject(FormBuilder);

  loading    = signal(true);
  saving     = signal(false);
  showForm   = signal(false);
  editId     = signal<string | null>(null);
  deletingId = signal<string | null>(null);
  formError  = signal('');
  toast      = signal('');
  toastKind  = signal<'success' | 'error'>('success');

  baseFlavors = signal<BaseFlavor[]>([]);
  variants    = signal<Variant[]>([]);
  customers   = signal<Customer[]>([]);

  /** Only parents that actually have variants — an empty catalogue reads as empty. */
  readonly groups = computed<ParentGroup[]>(() => {
    const byParent = new Map<string, Variant[]>();
    for (const v of this.variants()) {
      byParent.set(v.parent_flavor_id, [...(byParent.get(v.parent_flavor_id) ?? []), v]);
    }
    return this.baseFlavors()
      .filter(p => byParent.has(p.id))
      .map(p => ({
        parent: p,
        variants: (byParent.get(p.id) ?? []).sort((a, b) => a.units_per_box - b.units_per_box),
      }));
  });

  form = this.fb.nonNullable.group({
    parent_flavor_id:    ['', Validators.required],
    name:                ['', Validators.required],
    code:                ['', Validators.required],
    units_per_box:       [10, [Validators.required, Validators.min(1)]],
    default_customer_id: [''],
  });

  async ngOnInit(): Promise<void> { await this.loadData(); }

  toggleForm(): void {
    if (this.showForm()) this.cancelEdit();
    else { this.resetForm(); this.showForm.set(true); }
  }

  /** Pre-fill name and code from the parent so the common case is one click. */
  onParentChange(): void {
    if (this.editId()) return;
    const parent = this.baseFlavors().find(f => f.id === this.form.getRawValue().parent_flavor_id);
    if (!parent) return;
    const units = this.form.getRawValue().units_per_box;
    if (!this.form.getRawValue().name) this.form.patchValue({ name: `${parent.name} ${units}s` });
    if (!this.form.getRawValue().code) {
      this.form.patchValue({ code: `${parent.code}-${units}` });
    }
  }

  startEdit(v: Variant): void {
    this.editId.set(v.id);
    this.formError.set('');
    this.form.setValue({
      parent_flavor_id:    v.parent_flavor_id,
      name:                v.name,
      code:                v.code,
      units_per_box:       v.units_per_box,
      default_customer_id: v.default_customer_id ?? '',
    });
    this.showForm.set(true);
  }

  cancelEdit(): void {
    this.editId.set(null);
    this.resetForm();
    this.showForm.set(false);
  }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();

    const units = Number(v.units_per_box);
    if (!Number.isInteger(units) || units < 1) {
      this.formError.set('Gums per box must be a whole number of at least 1.');
      return;
    }

    // A variant that matches its parent's box count is not a variant — it would
    // split stock for no reason and confuse the invoice picker.
    const parent = this.baseFlavors().find(f => f.id === v.parent_flavor_id);
    if (parent && units === parent.units_per_box) {
      this.formError.set(
        `${parent.name} is already packed ${parent.units_per_box} to a box — a variant needs a different count.`
      );
      return;
    }

    this.saving.set(true);
    this.formError.set('');

    const row = {
      parent_flavor_id:    v.parent_flavor_id,
      name:                v.name.trim(),
      code:                v.code.trim(),
      units_per_box:       units,
      default_customer_id: v.default_customer_id || null,
    };

    const { error } = this.editId()
      ? await this.supabase.client.from('gg_flavors').update(row).eq('id', this.editId()!)
      : await this.supabase.client.from('gg_flavors').insert({ ...row, active: true });

    if (error) {
      this.formError.set(error.message);
      this.saving.set(false);
      return;
    }

    this.showToast(this.editId() ? 'Variant updated' : 'Variant created', 'success');
    this.cancelEdit();
    await this.loadData();
    this.saving.set(false);
  }

  async toggleActive(v: Variant): Promise<void> {
    const { error } = await this.supabase.client
      .from('gg_flavors').update({ active: !v.active }).eq('id', v.id);
    if (error) { this.showToast(error.message, 'error'); return; }
    this.showToast(`${v.name} ${v.active ? 'deactivated' : 'activated'}`, 'success');
    await this.loadData();
  }

  /**
   * Deleting a variant that has ever been packed or invoiced would orphan those
   * rows — the packing session, dispatch event or invoice line would point at a
   * flavour that no longer exists, and every stock screen would show a blank
   * name against real boxes. Refuse and steer to Deactivate, which keeps the
   * history readable while hiding the variant from new orders.
   */
  async deleteVariant(v: Variant): Promise<void> {
    this.deletingId.set(v.id);
    try {
      const [packed, dispatched] = await Promise.all([
        this.supabase.client.from('packing_sessions')
          .select('id', { count: 'exact', head: true }).eq('flavor_id', v.id),
        this.supabase.client.from('dispatch_events')
          .select('id', { count: 'exact', head: true }).eq('sku_id', v.id),
      ]);
      const inUse = (packed.count ?? 0) + (dispatched.count ?? 0);
      if (inUse > 0) {
        this.showToast(
          `${v.name} has ${inUse} packing/dispatch record${inUse === 1 ? '' : 's'} — deactivate it instead of deleting.`,
          'error',
        );
        return;
      }

      if (!confirm(`Delete ${v.name}? It has no stock history, so nothing is lost.`)) return;

      const { error } = await this.supabase.client.from('gg_flavors').delete().eq('id', v.id);
      if (error) { this.showToast(error.message, 'error'); return; }
      this.showToast('Variant deleted', 'success');
      await this.loadData();
    } finally {
      this.deletingId.set(null);
    }
  }

  customerName(id: string): string {
    return this.customers().find(c => c.id === id)?.name ?? 'a customer';
  }

  private resetForm(): void {
    this.form.reset({
      parent_flavor_id: '', name: '', code: '', units_per_box: 10, default_customer_id: '',
    });
    this.formError.set('');
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);
    try {
      const [flavorsRes, customersRes] = await Promise.all([
        this.supabase.client
          .from('gg_flavors')
          .select('id, name, code, active, units_per_box, parent_flavor_id, default_customer_id')
          .order('name'),
        this.supabase.client.from('gg_customers').select('id, name').order('name'),
      ]);

      const all = (flavorsRes.data ?? []) as any[];
      this.baseFlavors.set(
        all.filter(f => !f.parent_flavor_id)
           .map(f => ({
             id: f.id, name: f.name, code: f.code ?? '',
             active: f.active !== false,
             units_per_box: Number(f.units_per_box ?? 15),
           })),
      );
      this.variants.set(
        all.filter(f => f.parent_flavor_id)
           .map(f => ({
             id: f.id, name: f.name, code: f.code ?? '',
             active: f.active !== false,
             units_per_box: Number(f.units_per_box ?? 15),
             parent_flavor_id: f.parent_flavor_id,
             default_customer_id: f.default_customer_id ?? null,
           })),
      );
      this.customers.set((customersRes.data ?? []) as Customer[]);
    } finally {
      this.loading.set(false);
    }
  }

  private showToast(msg: string, kind: 'success' | 'error'): void {
    this.toast.set(msg);
    this.toastKind.set(kind);
    setTimeout(() => this.toast.set(''), 4000);
  }
}
