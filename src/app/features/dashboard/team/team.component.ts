import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, TitleCasePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseService } from '../../../core/supabase.service';

type WorkerModule = 'inwarding' | 'production' | 'packing' | 'dispatch';
const ALL_MODULES: WorkerModule[] = ['inwarding', 'production', 'packing', 'dispatch'];

const MODULE_COLORS: Record<WorkerModule, { bg: string; fg: string; border: string }> = {
  inwarding:  { bg: '#dbeafe', fg: '#2563eb', border: '#93c5fd' },
  production: { bg: '#dcfce7', fg: '#15803d', border: '#86efac' },
  packing:    { bg: '#fff7ed', fg: '#c2410c', border: '#fdba74' },
  dispatch:   { bg: '#f3e8ff', fg: '#7c3aed', border: '#c4b5fd' },
};

interface TeamMember {
  id: string;
  name: string;
  role: 'admin' | 'worker';
  username: string;
  mobile_number: string;
  modules: string[];
  active: boolean;
  created_at: string;
}

@Component({
  selector: 'app-team',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TitleCasePipe],
  template: `
    <div style="padding:24px;max-width:1000px;">
      <!-- Header -->
      <div style="margin-bottom:28px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="font-family:'Cabin',sans-serif;font-size:22px;font-weight:700;color:var(--foreground);margin:0 0 4px;">Team</h1>
          <p style="color:var(--muted-fg);font-size:14px;margin:0;">Manage user accounts and access control.</p>
        </div>
        <button (click)="openCreateDialog()"
                style="padding:10px 20px;background:var(--primary);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">
          <span class="material-icons-round" style="font-size:18px;">person_add</span>
          Add User
        </button>
      </div>

      @if (toast()) {
        <div [style.background]="toastKind() === 'success' ? '#dcfce7' : '#fee2e2'"
             [style.color]="toastKind() === 'success' ? '#15803d' : '#dc2626'"
             [style.borderColor]="toastKind() === 'success' ? '#86efac' : '#fca5a5'"
             style="padding:10px 16px;border-radius:8px;border:1px solid;font-size:13px;font-weight:600;margin-bottom:16px;display:flex;align-items:center;gap:8px;">
          <span class="material-icons-round" style="font-size:16px;">{{ toastKind() === 'success' ? 'check_circle' : 'error' }}</span>
          {{ toast() }}
        </div>
      }

      @if (loading()) {
        <div style="display:flex;flex-direction:column;gap:12px;">
          @for (i of [1,2,3,4]; track i) {
            <div class="skeleton" style="height:80px;border-radius:12px;"></div>
          }
        </div>
      } @else {
        <!-- Admins Section -->
        <div style="margin-bottom:28px;">
          <h2 style="font-family:'Cabin',sans-serif;font-size:16px;font-weight:700;color:var(--foreground);margin:0 0 12px;display:flex;align-items:center;gap:8px;">
            <span class="material-icons-round" style="font-size:20px;color:#2563eb;">admin_panel_settings</span>
            Admins
          </h2>
          @if (admins().length === 0) {
            <div style="text-align:center;padding:32px 0;color:var(--muted-fg);">
              <p style="font-size:14px;margin:0;">No admins found.</p>
            </div>
          } @else {
            <div style="display:flex;flex-direction:column;gap:10px;">
              @for (m of admins(); track m.id) {
                <div class="beautiful-card team-card" style="padding:14px 18px;border-radius:12px;position:relative;overflow:hidden;">
                  <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
                    <!-- Avatar with shield -->
                    <div style="width:44px;height:44px;border-radius:50%;background:#dbeafe;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                      <span class="material-icons-round" style="font-size:22px;color:#2563eb;">shield</span>
                    </div>
                    <!-- Info -->
                    <div style="flex:1;min-width:0;">
                      <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
                        <span style="font-size:15px;font-weight:700;color:var(--foreground);">{{ m.name }}</span>
                        @if (m.active) {
                          <span class="badge-green" style="font-size:11px;">Active</span>
                        } @else {
                          <span class="badge-red" style="font-size:11px;">Inactive</span>
                        }
                      </div>
                      <span style="font-size:13px;color:var(--muted-fg);">&#64;{{ m.username }}</span>
                    </div>
                    <!-- Edit button (visible on hover via CSS) -->
                    <button (click)="openEditDialog(m)" class="team-edit-btn"
                            style="padding:6px 14px;background:var(--secondary);border:1px solid var(--border);color:var(--muted-fg);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;opacity:0;transition:opacity 0.15s;">
                      <span class="material-icons-round" style="font-size:14px;">edit</span> Edit
                    </button>
                  </div>
                </div>
              }
            </div>
          }
        </div>

        <!-- Workers Section -->
        <div>
          <h2 style="font-family:'Cabin',sans-serif;font-size:16px;font-weight:700;color:var(--foreground);margin:0 0 12px;display:flex;align-items:center;gap:8px;">
            <span class="material-icons-round" style="font-size:20px;color:#15803d;">badge</span>
            Workers ({{ workers().length }})
          </h2>
          @if (workers().length === 0) {
            <div style="text-align:center;padding:40px 0;color:var(--muted-fg);">
              <span class="material-icons-round" style="font-size:44px;display:block;margin-bottom:10px;">group</span>
              <p style="font-size:14px;margin:0;">No workers yet. Add one to get started.</p>
            </div>
          } @else {
            <div style="display:flex;flex-direction:column;gap:10px;">
              @for (m of workers(); track m.id) {
                <div class="beautiful-card team-card" style="padding:14px 18px;border-radius:12px;position:relative;overflow:hidden;">
                  <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
                    <!-- Avatar with person -->
                    <div style="width:44px;height:44px;border-radius:50%;background:#dcfce7;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                      <span class="material-icons-round" style="font-size:22px;color:#15803d;">person</span>
                    </div>
                    <!-- Info -->
                    <div style="flex:1;min-width:0;">
                      <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
                        <span style="font-size:15px;font-weight:700;color:var(--foreground);">{{ m.name }}</span>
                        @if (m.active) {
                          <span class="badge-green" style="font-size:11px;">Active</span>
                        } @else {
                          <span class="badge-red" style="font-size:11px;">Inactive</span>
                        }
                      </div>
                      <span style="font-size:13px;color:var(--muted-fg);display:block;margin-bottom:6px;">&#64;{{ m.username }}</span>
                      <!-- Module badges -->
                      @if (m.modules.length > 0) {
                        <div style="display:flex;flex-wrap:wrap;gap:6px;">
                          @for (mod of m.modules; track mod) {
                            <span [style.background]="getModuleColor(mod).bg"
                                  [style.color]="getModuleColor(mod).fg"
                                  [style.borderColor]="getModuleColor(mod).border"
                                  style="padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;border:1px solid;">
                              {{ mod | titlecase }}
                            </span>
                          }
                        </div>
                      }
                    </div>
                    <!-- Edit button -->
                    <button (click)="openEditDialog(m)" class="team-edit-btn"
                            style="padding:6px 14px;background:var(--secondary);border:1px solid var(--border);color:var(--muted-fg);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;opacity:0;transition:opacity 0.15s;">
                      <span class="material-icons-round" style="font-size:14px;">edit</span> Edit
                    </button>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- Create / Edit Dialog Overlay -->
      @if (dialogOpen()) {
        <div (click)="closeDialog()" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:50;display:flex;align-items:center;justify-content:center;padding:16px;">
          <div (click)="$event.stopPropagation()" style="background:#fff;border-radius:16px;padding:28px;max-width:520px;width:100%;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.15);">
            <!-- Dialog header -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
              <h2 style="font-family:'Cabin',sans-serif;font-size:18px;font-weight:700;color:var(--foreground);margin:0;">
                {{ editId() ? 'Edit User' : 'Create User' }}
              </h2>
              <button (click)="closeDialog()" style="background:none;border:none;cursor:pointer;color:var(--muted-fg);display:flex;padding:4px;">
                <span class="material-icons-round" style="font-size:22px;">close</span>
              </button>
            </div>

            <form [formGroup]="form" (ngSubmit)="save()">
              <!-- Name -->
              <div style="margin-bottom:16px;">
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Full Name *</label>
                <input formControlName="name" class="beautiful-input" placeholder="e.g. Rajan Kumar" style="width:100%;box-sizing:border-box;">
              </div>

              <!-- Username -->
              <div style="margin-bottom:16px;">
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Username *</label>
                <input formControlName="username" class="beautiful-input" placeholder="e.g. rajan.k"
                       [style.opacity]="editId() ? '0.6' : '1'"
                       [attr.disabled]="editId() ? true : null"
                       style="width:100%;box-sizing:border-box;">
                @if (editId()) {
                  <p style="font-size:11px;color:var(--muted-fg);margin:4px 0 0;">Username cannot be changed.</p>
                }
              </div>

              <!-- Password -->
              <div style="margin-bottom:16px;">
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">
                  Password {{ editId() ? '' : '*' }}
                </label>
                <input formControlName="password_hash" type="password" class="beautiful-input" style="width:100%;box-sizing:border-box;"
                       [placeholder]="editId() ? 'Leave blank to keep current password' : 'Set a password'">
                @if (editId()) {
                  <p style="font-size:11px;color:var(--muted-fg);margin:4px 0 0;">Leave blank to keep existing password.</p>
                }
              </div>

              <!-- Role dropdown -->
              <div style="margin-bottom:16px;">
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Role *</label>
                <select formControlName="role" class="beautiful-input" style="width:100%;box-sizing:border-box;cursor:pointer;">
                  <option value="admin">Admin</option>
                  <option value="worker">Worker</option>
                </select>
              </div>

              <!-- Module checkboxes (shown only for workers) -->
              @if (form.get('role')?.value === 'worker') {
                <div style="margin-bottom:16px;">
                  <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:10px;">Module Access</label>
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;" class="module-grid">
                    @for (mod of allModules; track mod) {
                      <button type="button" (click)="toggleModule(mod)"
                              [style.background]="selectedModules().includes(mod) ? getModuleColor(mod).bg : '#fff'"
                              [style.borderColor]="selectedModules().includes(mod) ? getModuleColor(mod).fg : 'var(--border)'"
                              style="display:flex;align-items:center;gap:10px;padding:12px;border:1.5px solid;border-radius:10px;cursor:pointer;transition:all 0.15s;">
                        <span class="material-icons-round"
                              [style.color]="selectedModules().includes(mod) ? getModuleColor(mod).fg : 'var(--muted-fg)'"
                              style="font-size:20px;">
                          {{ selectedModules().includes(mod) ? 'check_box' : 'check_box_outline_blank' }}
                        </span>
                        <span [style.color]="selectedModules().includes(mod) ? getModuleColor(mod).fg : 'var(--muted-fg)'"
                              style="font-size:13px;font-weight:600;">
                          {{ mod | titlecase }}
                        </span>
                      </button>
                    }
                  </div>
                </div>
              }

              <!-- Active toggle (edit mode only) -->
              @if (editId()) {
                <div style="margin-bottom:20px;display:flex;align-items:center;gap:12px;">
                  <label style="font-size:13px;font-weight:600;color:#374151;">Active</label>
                  <button type="button" (click)="activeToggle.set(!activeToggle())"
                          [style.background]="activeToggle() ? 'var(--primary)' : '#d1d5db'"
                          style="width:44px;height:24px;border-radius:999px;border:none;cursor:pointer;position:relative;transition:background 0.2s;">
                    <span [style.left]="activeToggle() ? '22px' : '2px'"
                          style="position:absolute;top:2px;width:20px;height:20px;border-radius:50%;background:#fff;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2);"></span>
                  </button>
                  <span style="font-size:12px;color:var(--muted-fg);">{{ activeToggle() ? 'User is active' : 'User is deactivated' }}</span>
                </div>
              }

              @if (formError()) {
                <p style="color:var(--destructive);font-size:13px;margin-bottom:12px;display:flex;align-items:center;gap:6px;">
                  <span class="material-icons-round" style="font-size:16px;">error_outline</span>
                  {{ formError() }}
                </p>
              }

              <!-- Actions -->
              <div style="display:flex;gap:10px;justify-content:flex-end;padding-top:8px;border-top:1px solid var(--border);">
                <button type="button" (click)="closeDialog()"
                        style="padding:9px 18px;background:var(--secondary);border:1px solid var(--border);border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;color:#374151;">
                  Cancel
                </button>
                <button type="submit" [disabled]="saving()" class="beautiful-button"
                        style="padding:9px 22px;font-size:14px;">
                  @if (saving()) {
                    Saving...
                  } @else {
                    {{ editId() ? 'Update User' : 'Create User' }}
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      }
    </div>
    <style>
      .team-card:hover .team-edit-btn { opacity: 1 !important; }
      @media (max-width: 480px) {
        .module-grid { grid-template-columns: 1fr !important; }
        .team-edit-btn { opacity: 1 !important; }
      }
    </style>
  `,
})
export class TeamComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly fb = inject(FormBuilder);

  loading = signal(true);
  saving = signal(false);
  dialogOpen = signal(false);
  editId = signal<string | null>(null);
  members = signal<TeamMember[]>([]);
  selectedModules = signal<WorkerModule[]>([]);
  activeToggle = signal(true);
  allModules = ALL_MODULES;
  formError = signal('');
  toast = signal('');
  toastKind = signal<'success' | 'error'>('success');

  admins = computed(() => this.members().filter(m => m.role === 'admin'));
  workers = computed(() => this.members().filter(m => m.role === 'worker'));

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    role: ['worker', Validators.required],
    username: ['', Validators.required],
    password_hash: ['', Validators.required],
  });

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  openCreateDialog(): void {
    this.editId.set(null);
    this.form.reset({ role: 'worker', name: '', username: '', password_hash: '' });
    this.form.get('password_hash')!.setValidators(Validators.required);
    this.form.get('password_hash')!.updateValueAndValidity();
    this.form.get('username')!.enable();
    this.selectedModules.set([]);
    this.activeToggle.set(true);
    this.formError.set('');
    this.dialogOpen.set(true);
  }

  openEditDialog(m: TeamMember): void {
    this.editId.set(m.id);
    this.form.patchValue({
      name: m.name,
      role: m.role,
      username: m.username,
      password_hash: '',
    });
    this.form.get('password_hash')!.clearValidators();
    this.form.get('password_hash')!.updateValueAndValidity();
    this.form.get('username')!.disable();
    this.selectedModules.set(m.modules as WorkerModule[]);
    this.activeToggle.set(m.active);
    this.formError.set('');
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
    this.editId.set(null);
    this.form.reset({ role: 'worker' });
    this.form.get('username')!.enable();
    this.selectedModules.set([]);
    this.formError.set('');
  }

  toggleModule(mod: WorkerModule): void {
    this.selectedModules.update(ms =>
      ms.includes(mod) ? ms.filter(m => m !== mod) : [...ms, mod]
    );
  }

  getModuleColor(mod: string): { bg: string; fg: string; border: string } {
    return MODULE_COLORS[mod as WorkerModule] ?? { bg: '#f3f4f6', fg: '#6B7280', border: '#d1d5db' };
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.formError.set('');

    const v = this.form.getRawValue();
    const payload: Record<string, unknown> = {
      name: v.name,
      role: v.role,
      username: v.username,
      modules: v.role === 'worker' ? this.selectedModules() : [],
      active: this.editId() ? this.activeToggle() : true,
    };

    if (v.password_hash) {
      payload['password_hash'] = v.password_hash;
    }

    if (this.editId()) {
      const { error } = await this.supabase.client
        .from('gg_users')
        .update(payload)
        .eq('id', this.editId()!);
      if (error) {
        this.formError.set(error.message);
        this.saving.set(false);
        return;
      }
    } else {
      payload['password_hash'] = v.password_hash;
      const { error } = await this.supabase.client
        .from('gg_users')
        .insert(payload);
      if (error) {
        this.formError.set(error.message);
        this.saving.set(false);
        return;
      }
    }

    this.showToast(
      this.editId() ? 'User updated successfully' : 'User created successfully',
      'success'
    );
    this.closeDialog();
    await this.loadData();
    this.saving.set(false);
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);
    const { data } = await this.supabase.client
      .from('gg_users')
      .select('id, name, role, username, mobile_number, modules, active, created_at')
      .order('created_at', { ascending: false });

    this.members.set(
      (data ?? []).map((u: any) => ({
        id: u.id,
        name: u.name ?? u.username,
        role: u.role,
        username: u.username ?? '',
        mobile_number: u.mobile_number ?? '',
        modules: u.modules ?? [],
        active: u.active ?? true,
        created_at: u.created_at,
      }))
    );
    this.loading.set(false);
  }

  private showToast(msg: string, kind: 'success' | 'error'): void {
    this.toast.set(msg);
    this.toastKind.set(kind);
    setTimeout(() => this.toast.set(''), 3000);
  }
}
