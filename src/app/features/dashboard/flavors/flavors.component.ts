import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseService } from '../../../core/supabase.service';

interface Flavor {
  id: string; name: string; code: string; description: string; active: boolean;
  recipe_count: number;
}

@Component({
  selector: 'app-flavors',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div style="padding:24px;max-width:900px;">
      <div style="margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="font-family:'Cabin',sans-serif;font-size:22px;font-weight:700;color:#121212;margin:0 0 4px;">Flavors</h1>
          <p style="color:#6B7280;font-size:14px;margin:0;">Flavor catalog for production recipes.</p>
        </div>
        <button (click)="toggleForm()" style="padding:9px 18px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">
          <span class="material-icons-round" style="font-size:18px;">{{ showForm() ? 'close' : 'add' }}</span>
          {{ showForm() ? 'Cancel' : 'Add Flavor' }}
        </button>
      </div>

      @if (showForm()) {
        <div style="background:#fff;border-radius:12px;border:1px solid #E5E7EB;padding:24px;margin-bottom:24px;">
          <h2 style="font-family:'Cabin',sans-serif;font-size:16px;font-weight:600;margin:0 0 20px;">{{ editId() ? 'Edit' : 'Add' }} Flavor</h2>
          <form [formGroup]="form" (ngSubmit)="save()">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;" class="fl-grid">
              <div>
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Name *</label>
                <input formControlName="name" class="gg-input" placeholder="e.g. Spearmint">
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Code *</label>
                <input formControlName="code" class="gg-input" placeholder="e.g. SPM-01">
              </div>
              <div style="grid-column:1/-1;">
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Description</label>
                <textarea formControlName="description" class="gg-input" rows="2" placeholder="Optional description..." style="resize:vertical;"></textarea>
              </div>
            </div>
            @if (formError()) { <p style="color:#FF2828;font-size:13px;margin-bottom:12px;">{{ formError() }}</p> }
            <div style="display:flex;gap:10px;">
              <button type="submit" [disabled]="saving()" class="gg-btn-primary">{{ saving() ? 'Saving...' : (editId() ? 'Update' : 'Add Flavor') }}</button>
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
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;">
          @for (i of [1,2,3,4,5,6]; track i) { <div class="gg-skeleton" style="height:100px;border-radius:12px;"></div> }
        </div>
      } @else if (flavors().length === 0) {
        <div style="text-align:center;padding:60px 0;color:#9CA3AF;">
          <span class="material-icons-round" style="font-size:48px;display:block;margin-bottom:12px;">local_dining</span>
          <p style="font-size:15px;margin:0;">No flavors yet.</p>
        </div>
      } @else {
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;">
          @for (f of flavors(); track f.id) {
            <div style="background:#fff;border-radius:12px;border:1px solid #E5E7EB;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;">
                <div>
                  <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
                    <span style="font-size:15px;font-weight:700;color:#121212;font-family:'Cabin',sans-serif;">{{ f.name }}</span>
                    @if (!f.active) {
                      <span style="background:#fee2e2;color:#dc2626;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;">Inactive</span>
                    }
                  </div>
                  <span style="background:#f3f4f6;color:#6B7280;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600;font-family:monospace;">{{ f.code }}</span>
                </div>
                <span style="background:#dbeafe;color:#2563eb;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;">{{ f.recipe_count }} recipe{{ f.recipe_count !== 1 ? 's' : '' }}</span>
              </div>
              @if (f.description) {
                <p style="font-size:13px;color:#6B7280;margin:0 0 10px;line-height:1.4;">{{ f.description }}</p>
              }
              <div style="display:flex;gap:6px;justify-content:flex-end;">
                <button (click)="toggleActive(f)" [style.color]="f.active ? '#d97706' : '#01AC51'" [style.borderColor]="f.active ? '#fde68a' : '#bbf7d0'" style="padding:4px 10px;background:transparent;border:1px solid;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">
                  {{ f.active ? 'Deactivate' : 'Activate' }}
                </button>
                <button (click)="startEdit(f)" style="padding:4px 10px;background:#f0fdf4;border:1px solid #01AC51;color:#01AC51;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Edit</button>
                <button (click)="deleteFlavor(f.id)" style="padding:4px 10px;background:#fff5f5;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Delete</button>
              </div>
            </div>
          }
        </div>
      }
    </div>
    <style>
      @media (max-width:480px) { .fl-grid { grid-template-columns: 1fr !important; } }
    </style>
  `,
})
export class FlavorsComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly fb = inject(FormBuilder);

  loading = signal(true);
  saving = signal(false);
  showForm = signal(false);
  editId = signal<string | null>(null);
  flavors = signal<Flavor[]>([]);
  formError = signal('');
  toast = signal('');
  toastKind = signal<'success'|'error'>('success');

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    code: ['', Validators.required],
    description: [''],
  });

  async ngOnInit(): Promise<void> { await this.loadData(); }

  toggleForm(): void { if (this.showForm()) { this.cancelEdit(); } else { this.showForm.set(true); } }

  startEdit(f: Flavor): void {
    this.editId.set(f.id);
    this.form.setValue({ name: f.name, code: f.code, description: f.description });
    this.showForm.set(true);
  }

  cancelEdit(): void {
    this.editId.set(null); this.form.reset(); this.showForm.set(false);
  }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true); this.formError.set('');
    const v = this.form.getRawValue();
    if (this.editId()) {
      const { error } = await this.supabase.client.from('gg_flavors').update({ ...v }).eq('id', this.editId()!);
      if (error) { this.formError.set(error.message); this.saving.set(false); return; }
    } else {
      const { error } = await this.supabase.client.from('gg_flavors').insert({ ...v, active: true });
      if (error) { this.formError.set(error.message); this.saving.set(false); return; }
    }
    this.showToast(this.editId() ? 'Flavor updated' : 'Flavor added', 'success');
    this.cancelEdit(); await this.loadData(); this.saving.set(false);
  }

  async toggleActive(f: Flavor): Promise<void> {
    const { error } = await this.supabase.client.from('gg_flavors').update({ active: !f.active }).eq('id', f.id);
    if (!error) { this.showToast(`${f.name} ${f.active ? 'deactivated' : 'activated'}`, 'success'); await this.loadData(); }
    else this.showToast(error.message, 'error');
  }

  async deleteFlavor(id: string): Promise<void> {
    if (!confirm('Delete this flavor?')) return;
    const { error } = await this.supabase.client.from('gg_flavors').delete().eq('id', id);
    if (!error) { this.showToast('Deleted', 'success'); await this.loadData(); }
    else this.showToast(error.message, 'error');
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);
    const { data: fl } = await this.supabase.client.from('gg_flavors').select('id, name, code, description, active').order('name');
    const { data: rc } = await this.supabase.client.from('gg_recipes').select('flavor_id').eq('is_active', true);
    const rcMap = new Map<string, number>();
    (rc ?? []).forEach((r: any) => rcMap.set(r.flavor_id, (rcMap.get(r.flavor_id) ?? 0) + 1));
    this.flavors.set((fl ?? []).map((f: any) => ({ ...f, description: f.description ?? '', recipe_count: rcMap.get(f.id) ?? 0 })));
    this.loading.set(false);
  }

  private showToast(msg: string, kind: 'success'|'error'): void {
    this.toast.set(msg); this.toastKind.set(kind);
    setTimeout(() => this.toast.set(''), 3000);
  }
}
