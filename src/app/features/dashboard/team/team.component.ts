import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe, TitleCasePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseService } from '../../../core/supabase.service';

type WorkerModule = 'inwarding' | 'production' | 'packing' | 'dispatch';
const ALL_MODULES: WorkerModule[] = ['inwarding', 'production', 'packing', 'dispatch'];

interface TeamMember {
  id: string; name: string; role: string;
  username: string; mobile_number: string;
  modules: string[]; active: boolean; created_at: string;
}

@Component({
  selector: 'app-team',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe, TitleCasePipe],
  template: `
    <div style="padding:24px;max-width:1000px;">
      <div style="margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="font-family:'Cabin',sans-serif;font-size:22px;font-weight:700;color:#121212;margin:0 0 4px;">Team</h1>
          <p style="color:#6B7280;font-size:14px;margin:0;">User accounts and access control.</p>
        </div>
        <button (click)="toggleForm()" style="padding:9px 18px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">
          <span class="material-icons-round" style="font-size:18px;">{{ showForm() ? 'close' : 'person_add' }}</span>
          {{ showForm() ? 'Cancel' : 'Add Member' }}
        </button>
      </div>

      @if (showForm()) {
        <div style="background:#fff;border-radius:12px;border:1px solid #E5E7EB;padding:24px;margin-bottom:24px;">
          <h2 style="font-family:'Cabin',sans-serif;font-size:16px;font-weight:600;margin:0 0 20px;">{{ editId() ? 'Edit' : 'Add' }} Team Member</h2>
          <form [formGroup]="form" (ngSubmit)="save()">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;" class="team-grid">
              <div>
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Full Name *</label>
                <input formControlName="name" class="gg-input" placeholder="e.g. Rajan Kumar">
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Role *</label>
                <select formControlName="role" class="gg-input dropdown-with-arrow">
                  <option value="admin">Admin</option>
                  <option value="worker">Worker</option>
                </select>
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Username *</label>
                <input formControlName="username" class="gg-input" placeholder="e.g. rajan.k">
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Mobile Number</label>
                <input formControlName="mobile_number" class="gg-input" placeholder="9876543210" maxlength="10">
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Password *</label>
                <input formControlName="password_hash" type="password" class="gg-input" placeholder="Set password">
              </div>
            </div>

            @if (form.get('role')?.value === 'worker') {
              <div style="margin-bottom:16px;">
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:8px;">Module Access</label>
                <div style="display:flex;flex-wrap:wrap;gap:8px;">
                  @for (mod of allModules; track mod) {
                    <button type="button" (click)="toggleModule(mod)"
                            [style.background]="selectedModules().includes(mod) ? '#f0fdf4' : '#fff'"
                            [style.borderColor]="selectedModules().includes(mod) ? '#01AC51' : '#E5E7EB'"
                            [style.color]="selectedModules().includes(mod) ? '#01AC51' : '#6B7280'"
                            style="padding:6px 14px;border:1.5px solid;border-radius:999px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.15s;">
                      {{ mod | titlecase }}
                    </button>
                  }
                </div>
              </div>
            }

            @if (formError()) { <p style="color:#FF2828;font-size:13px;margin-bottom:12px;">{{ formError() }}</p> }
            <div style="display:flex;gap:10px;">
              <button type="submit" [disabled]="saving()" class="gg-btn-primary">{{ saving() ? 'Saving...' : (editId() ? 'Update' : 'Add Member') }}</button>
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
          @for (i of [1,2,3]; track i) { <div class="gg-skeleton" style="height:80px;border-radius:12px;"></div> }
        </div>
      } @else if (members().length === 0) {
        <div style="text-align:center;padding:60px 0;color:#9CA3AF;">
          <span class="material-icons-round" style="font-size:48px;display:block;margin-bottom:12px;">group</span>
          <p style="font-size:15px;margin:0;">No team members yet.</p>
        </div>
      } @else {
        <div style="display:flex;flex-direction:column;gap:10px;">
          @for (m of members(); track m.id) {
            <div style="background:#fff;border-radius:12px;border:1px solid #E5E7EB;padding:14px 18px;">
              <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                <!-- Avatar -->
                <div [style.background]="m.role === 'admin' ? '#dbeafe' : '#f0fdf4'" style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                  <span [style.color]="m.role === 'admin' ? '#2563eb' : '#15803d'" style="font-size:14px;font-weight:700;">{{ initials(m.name) }}</span>
                </div>
                <!-- Info -->
                <div style="flex:1;min-width:0;">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
                    <span style="font-size:14px;font-weight:700;color:#121212;">{{ m.name }}</span>
                    <span [class]="m.role === 'admin' ? 'gg-badge-blue' : 'gg-badge-green'">{{ m.role | titlecase }}</span>
                    @if (!m.active) {
                      <span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;">Inactive</span>
                    }
                  </div>
                  <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:12px;color:#6B7280;">
                    @if (m.username) { <span>{{ m.username }}</span> }
                    @if (m.mobile_number) { <span>📞 {{ m.mobile_number }}</span> }
                    @if (m.role === 'worker' && m.modules.length > 0) {
                      <span>Modules: {{ m.modules.join(', ') }}</span>
                    }
                  </div>
                </div>
                <!-- Actions -->
                <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                  <button (click)="startEdit(m)" style="padding:5px 10px;background:#f0fdf4;border:1px solid #01AC51;color:#01AC51;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Edit</button>
                  <button (click)="toggleActive(m)" [style.borderColor]="m.active ? '#fca5a5' : '#bbf7d0'" [style.color]="m.active ? '#dc2626' : '#15803d'" style="padding:5px 10px;background:transparent;border:1px solid;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">
                    {{ m.active ? 'Deactivate' : 'Activate' }}
                  </button>
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>
    <style>
      @media (max-width:480px) { .team-grid { grid-template-columns: 1fr !important; } }
    </style>
  `,
})
export class TeamComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly fb = inject(FormBuilder);

  loading = signal(true);
  saving = signal(false);
  showForm = signal(false);
  editId = signal<string | null>(null);
  members = signal<TeamMember[]>([]);
  selectedModules = signal<WorkerModule[]>([]);
  allModules = ALL_MODULES;
  formError = signal('');
  toast = signal('');
  toastKind = signal<'success'|'error'>('success');

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    role: ['worker', Validators.required],
    username: ['', Validators.required],
    mobile_number: [''],
    password_hash: ['', Validators.required],
  });

  async ngOnInit(): Promise<void> { await this.loadData(); }
  toggleForm(): void { if (this.showForm()) { this.cancelEdit(); } else { this.showForm.set(true); } }

  toggleModule(mod: WorkerModule): void {
    this.selectedModules.update(ms => ms.includes(mod) ? ms.filter(m => m !== mod) : [...ms, mod]);
  }

  startEdit(m: TeamMember): void {
    this.editId.set(m.id);
    this.form.patchValue({ name: m.name, role: m.role, username: m.username, mobile_number: m.mobile_number, password_hash: '' });
    this.selectedModules.set(m.modules as WorkerModule[]);
    this.showForm.set(true);
  }

  cancelEdit(): void {
    this.editId.set(null); this.form.reset({ role: 'worker' });
    this.selectedModules.set([]); this.showForm.set(false);
  }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true); this.formError.set('');
    const v = this.form.getRawValue();
    const payload: any = {
      name: v.name, role: v.role, username: v.username,
      mobile_number: v.mobile_number || null,
      modules: v.role === 'worker' ? this.selectedModules() : [],
      active: true,
    };
    if (v.password_hash) payload.password_hash = v.password_hash;

    if (this.editId()) {
      const { error } = await this.supabase.client.from('gg_users').update(payload).eq('id', this.editId()!);
      if (error) { this.formError.set(error.message); this.saving.set(false); return; }
    } else {
      const { error } = await this.supabase.client.from('gg_users').insert(payload);
      if (error) { this.formError.set(error.message); this.saving.set(false); return; }
    }
    this.showToast(this.editId() ? 'Member updated' : 'Member added', 'success');
    this.cancelEdit(); await this.loadData(); this.saving.set(false);
  }

  async toggleActive(m: TeamMember): Promise<void> {
    const { error } = await this.supabase.client.from('gg_users').update({ active: !m.active }).eq('id', m.id);
    if (!error) { this.showToast(`${m.name} ${m.active ? 'deactivated' : 'activated'}`, 'success'); await this.loadData(); }
    else this.showToast(error.message, 'error');
  }

  initials(name: string): string {
    return name.split(' ').slice(0, 2).map(n => n[0]?.toUpperCase() ?? '').join('') || '?';
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);
    const { data } = await this.supabase.client.from('gg_users')
      .select('id, name, role, username, mobile_number, modules, active, created_at')
      .order('created_at', { ascending: false });
    this.members.set((data ?? []).map((u: any) => ({
      id: u.id, name: u.name ?? u.username, role: u.role,
      username: u.username ?? '', mobile_number: u.mobile_number ?? '',
      modules: u.modules ?? [], active: u.active ?? true,
      created_at: u.created_at,
    })));
    this.loading.set(false);
  }

  private showToast(msg: string, kind: 'success'|'error'): void {
    this.toast.set(msg); this.toastKind.set(kind);
    setTimeout(() => this.toast.set(''), 3000);
  }
}
