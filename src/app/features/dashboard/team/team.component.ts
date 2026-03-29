import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, TitleCasePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseService } from '../../../core/supabase.service';

type WorkerModule = 'inwarding' | 'production' | 'packing' | 'dispatch';
const ALL_MODULES: WorkerModule[] = ['inwarding', 'production', 'packing', 'dispatch'];
const PHONE_PATTERN = /^[6-9]\d{9}$/;

const MODULE_COLORS: Record<WorkerModule, { bg: string; fg: string; border: string }> = {
  inwarding: { bg: '#dbeafe', fg: '#2563eb', border: '#93c5fd' },
  production: { bg: '#dcfce7', fg: '#15803d', border: '#86efac' },
  packing: { bg: '#fff7ed', fg: '#c2410c', border: '#fdba74' },
  dispatch: { bg: '#f3e8ff', fg: '#7c3aed', border: '#c4b5fd' },
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
      <div style="margin-bottom:28px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="font-family:'Cabin',sans-serif;font-size:22px;font-weight:700;color:var(--foreground);margin:0 0 4px;">Team</h1>
          <p style="color:var(--muted-fg);font-size:14px;margin:0;">Manage users, mobile access, and worker permissions in one place.</p>
        </div>
        <button
          (click)="openCreateDialog()"
          style="padding:10px 20px;background:var(--primary);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">
          <span class="material-icons-round" style="font-size:18px;">person_add</span>
          Add User
        </button>
      </div>

      @if (toast()) {
        <div
          [style.background]="toastKind() === 'success' ? '#dcfce7' : '#fee2e2'"
          [style.color]="toastKind() === 'success' ? '#15803d' : '#dc2626'"
          [style.borderColor]="toastKind() === 'success' ? '#86efac' : '#fca5a5'"
          style="padding:10px 16px;border-radius:8px;border:1px solid;font-size:13px;font-weight:600;margin-bottom:16px;display:flex;align-items:center;gap:8px;">
          <span class="material-icons-round" style="font-size:16px;">{{ toastKind() === 'success' ? 'check_circle' : 'error' }}</span>
          {{ toast() }}
        </div>
      }

      @if (loading()) {
        <div style="display:flex;flex-direction:column;gap:12px;">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="skeleton" style="height:80px;border-radius:12px;"></div>
          }
        </div>
      } @else {
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
                    <div style="width:44px;height:44px;border-radius:50%;background:#dbeafe;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                      <span class="material-icons-round" style="font-size:22px;color:#2563eb;">shield</span>
                    </div>
                    <div style="flex:1;min-width:0;">
                      <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
                        <span style="font-size:15px;font-weight:700;color:var(--foreground);">{{ m.name }}</span>
                        @if (m.active) {
                          <span class="badge-green" style="font-size:11px;">Active</span>
                        } @else {
                          <span class="badge-red" style="font-size:11px;">Inactive</span>
                        }
                      </div>
                      <span style="font-size:13px;color:var(--muted-fg);display:block;">&#64;{{ m.username }}</span>
                      @if (m.mobile_number) {
                        <span style="font-size:12px;color:var(--muted-fg);display:block;margin-top:4px;">{{ m.mobile_number }}</span>
                      }
                    </div>
                    <button
                      (click)="openEditDialog(m)"
                      class="team-edit-btn"
                      style="padding:6px 14px;background:var(--secondary);border:1px solid var(--border);color:var(--muted-fg);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;opacity:0;transition:opacity 0.15s;">
                      <span class="material-icons-round" style="font-size:14px;">edit</span>
                      Edit
                    </button>
                  </div>
                </div>
              }
            </div>
          }
        </div>

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
                    <div style="width:44px;height:44px;border-radius:50%;background:#dcfce7;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                      <span class="material-icons-round" style="font-size:22px;color:#15803d;">person</span>
                    </div>
                    <div style="flex:1;min-width:0;">
                      <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
                        <span style="font-size:15px;font-weight:700;color:var(--foreground);">{{ m.name }}</span>
                        @if (m.active) {
                          <span class="badge-green" style="font-size:11px;">Active</span>
                        } @else {
                          <span class="badge-red" style="font-size:11px;">Inactive</span>
                        }
                      </div>
                      <span style="font-size:13px;color:var(--muted-fg);display:block;">&#64;{{ m.username }}</span>
                      @if (m.mobile_number) {
                        <span style="font-size:12px;color:var(--muted-fg);display:block;margin:4px 0 6px;">{{ m.mobile_number }}</span>
                      }
                      @if (m.modules.length > 0) {
                        <div style="display:flex;flex-wrap:wrap;gap:6px;">
                          @for (mod of m.modules; track mod) {
                            <span
                              [style.background]="getModuleColor(mod).bg"
                              [style.color]="getModuleColor(mod).fg"
                              [style.borderColor]="getModuleColor(mod).border"
                              style="padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;border:1px solid;">
                              {{ mod | titlecase }}
                            </span>
                          }
                        </div>
                      }
                    </div>
                    <button
                      (click)="openEditDialog(m)"
                      class="team-edit-btn"
                      style="padding:6px 14px;background:var(--secondary);border:1px solid var(--border);color:var(--muted-fg);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;opacity:0;transition:opacity 0.15s;">
                      <span class="material-icons-round" style="font-size:14px;">edit</span>
                      Edit
                    </button>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }

      @if (dialogOpen()) {
        <div (click)="closeDialog()" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:50;display:flex;align-items:center;justify-content:center;padding:16px;">
          <div (click)="$event.stopPropagation()" style="background:#fff;border-radius:16px;padding:28px;max-width:520px;width:100%;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.15);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
              <h2 style="font-family:'Cabin',sans-serif;font-size:18px;font-weight:700;color:var(--foreground);margin:0;">
                {{ editId() ? 'Edit User' : 'Create User' }}
              </h2>
              <button (click)="closeDialog()" style="background:none;border:none;cursor:pointer;color:var(--muted-fg);display:flex;padding:4px;">
                <span class="material-icons-round" style="font-size:22px;">close</span>
              </button>
            </div>

            <form [formGroup]="form" (ngSubmit)="save()">
              <div style="margin-bottom:16px;">
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Full Name *</label>
                <input formControlName="name" class="beautiful-input" placeholder="e.g. Rajan Kumar" style="width:100%;box-sizing:border-box;">
              </div>

              <div style="margin-bottom:16px;">
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Username *</label>
                <input
                  formControlName="username"
                  class="beautiful-input"
                  placeholder="e.g. rajan.k"
                  [style.opacity]="editId() ? '0.6' : '1'"
                  [attr.disabled]="editId() ? true : null"
                  style="width:100%;box-sizing:border-box;">
                @if (editId()) {
                  <p style="font-size:11px;color:var(--muted-fg);margin:4px 0 0;">Username cannot be changed.</p>
                }
              </div>

              <div style="margin-bottom:16px;">
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">
                  Password {{ editId() ? '' : '*' }}
                </label>
                <input
                  formControlName="password_hash"
                  type="password"
                  class="beautiful-input"
                  style="width:100%;box-sizing:border-box;"
                  [placeholder]="editId() ? 'Leave blank to keep current password' : 'Set a password'">
                @if (editId()) {
                  <p style="font-size:11px;color:var(--muted-fg);margin:4px 0 0;">Leave blank to keep existing password.</p>
                }
              </div>

              <div style="margin-bottom:16px;">
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Role *</label>
                <select formControlName="role" class="beautiful-input" style="width:100%;box-sizing:border-box;cursor:pointer;">
                  <option value="admin">Admin</option>
                  <option value="worker">Worker</option>
                </select>
              </div>

              <div style="margin-bottom:16px;">
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">
                  Mobile Number {{ form.get('role')?.value === 'worker' ? '*' : '(optional)' }}
                </label>
                <input
                  formControlName="mobile_number"
                  class="beautiful-input"
                  placeholder="e.g. 9876543210"
                  inputmode="numeric"
                  maxlength="10"
                  style="width:100%;box-sizing:border-box;">
                @if (form.get('role')?.value === 'worker') {
                  <p style="font-size:11px;color:var(--muted-fg);margin:4px 0 0;">Android workers log in with this phone number.</p>
                }
              </div>

              @if (form.get('role')?.value === 'worker') {
                <div style="margin-bottom:16px;">
                  <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:10px;">Module Access</label>
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;" class="module-grid">
                    @for (mod of allModules; track mod) {
                      <button
                        type="button"
                        (click)="toggleModule(mod)"
                        [style.background]="selectedModules().includes(mod) ? getModuleColor(mod).bg : '#fff'"
                        [style.borderColor]="selectedModules().includes(mod) ? getModuleColor(mod).fg : 'var(--border)'"
                        style="display:flex;align-items:center;gap:10px;padding:12px;border:1.5px solid;border-radius:10px;cursor:pointer;transition:all 0.15s;">
                        <span
                          class="material-icons-round"
                          [style.color]="selectedModules().includes(mod) ? getModuleColor(mod).fg : 'var(--muted-fg)'"
                          style="font-size:20px;">
                          {{ selectedModules().includes(mod) ? 'check_box' : 'check_box_outline_blank' }}
                        </span>
                        <span
                          [style.color]="selectedModules().includes(mod) ? getModuleColor(mod).fg : 'var(--muted-fg)'"
                          style="font-size:13px;font-weight:600;">
                          {{ mod | titlecase }}
                        </span>
                      </button>
                    }
                  </div>
                </div>
              }

              @if (editId()) {
                <div style="margin-bottom:20px;display:flex;align-items:center;gap:12px;">
                  <label style="font-size:13px;font-weight:600;color:#374151;">Active</label>
                  <button
                    type="button"
                    (click)="activeToggle.set(!activeToggle())"
                    [style.background]="activeToggle() ? 'var(--primary)' : '#d1d5db'"
                    style="width:44px;height:24px;border-radius:999px;border:none;cursor:pointer;position:relative;transition:background 0.2s;">
                    <span
                      [style.left]="activeToggle() ? '22px' : '2px'"
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

              <div style="display:flex;gap:10px;justify-content:flex-end;padding-top:8px;border-top:1px solid var(--border);">
                <button
                  type="button"
                  (click)="closeDialog()"
                  style="padding:9px 18px;background:var(--secondary);border:1px solid var(--border);border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;color:#374151;">
                  Cancel
                </button>
                <button type="submit" [disabled]="saving()" class="beautiful-button" style="padding:9px 22px;font-size:14px;">
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

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly dialogOpen = signal(false);
  readonly editId = signal<string | null>(null);
  readonly members = signal<TeamMember[]>([]);
  readonly selectedModules = signal<WorkerModule[]>([]);
  readonly activeToggle = signal(true);
  readonly allModules = ALL_MODULES;
  readonly formError = signal('');
  readonly toast = signal('');
  readonly toastKind = signal<'success' | 'error'>('success');

  readonly admins = computed(() => this.members().filter((member) => member.role === 'admin'));
  readonly workers = computed(() => this.members().filter((member) => member.role === 'worker'));

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    role: ['worker', Validators.required],
    username: ['', Validators.required],
    password_hash: ['', Validators.required],
    mobile_number: [''],
  });

  constructor() {
    this.applyRoleValidation(this.form.controls.role.getRawValue());
    this.form.controls.role.valueChanges.subscribe((role) => this.applyRoleValidation(role ?? 'worker'));
  }

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  openCreateDialog(): void {
    this.editId.set(null);
    this.form.reset({
      role: 'worker',
      name: '',
      username: '',
      password_hash: '',
      mobile_number: '',
    });
    this.form.controls.password_hash.setValidators(Validators.required);
    this.form.controls.password_hash.updateValueAndValidity({ emitEvent: false });
    this.form.controls.username.enable();
    this.selectedModules.set([]);
    this.activeToggle.set(true);
    this.formError.set('');
    this.dialogOpen.set(true);
    this.applyRoleValidation('worker');
  }

  openEditDialog(member: TeamMember): void {
    this.editId.set(member.id);
    this.form.patchValue({
      name: member.name,
      role: member.role,
      username: member.username,
      password_hash: '',
      mobile_number: member.mobile_number,
    });
    this.form.controls.password_hash.clearValidators();
    this.form.controls.password_hash.updateValueAndValidity({ emitEvent: false });
    this.form.controls.username.disable();
    this.selectedModules.set(member.modules as WorkerModule[]);
    this.activeToggle.set(member.active);
    this.formError.set('');
    this.dialogOpen.set(true);
    this.applyRoleValidation(member.role);
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
    this.editId.set(null);
    this.form.reset({
      role: 'worker',
      name: '',
      username: '',
      password_hash: '',
      mobile_number: '',
    });
    this.form.controls.username.enable();
    this.selectedModules.set([]);
    this.formError.set('');
    this.applyRoleValidation('worker');
  }

  toggleModule(mod: WorkerModule): void {
    this.selectedModules.update((modules) =>
      modules.includes(mod) ? modules.filter((module) => module !== mod) : [...modules, mod],
    );
  }

  getModuleColor(mod: string): { bg: string; fg: string; border: string } {
    return MODULE_COLORS[mod as WorkerModule] ?? { bg: '#f3f4f6', fg: '#6b7280', border: '#d1d5db' };
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const formValue = this.form.getRawValue();
    const normalizedPhone = this.normalizePhone(formValue.mobile_number);
    const modules = formValue.role === 'worker' ? [...this.selectedModules()] : [];

    if (formValue.role === 'worker') {
      if (!PHONE_PATTERN.test(normalizedPhone)) {
        this.formError.set('Workers must have a valid 10-digit Indian mobile number.');
        return;
      }
      if (modules.length === 0) {
        this.formError.set('Assign at least one module so the worker can access the Android app.');
        return;
      }
    }

    this.saving.set(true);
    this.formError.set('');

    const duplicatePhoneError = await this.validateUniquePhone(normalizedPhone, this.editId());
    if (duplicatePhoneError) {
      this.formError.set(duplicatePhoneError);
      this.saving.set(false);
      return;
    }

    const payload: Record<string, unknown> = {
      name: formValue.name.trim(),
      role: formValue.role === 'worker' ? 'worker' : 'Platform_Admin',
      username: formValue.username.trim(),
      modules,
      active: this.editId() ? this.activeToggle() : true,
      mobile_number: normalizedPhone || null,
    };

    if (formValue.password_hash.trim()) {
      payload['password_hash'] = formValue.password_hash.trim();
    }

    try {
      let userId = this.editId();

      if (userId) {
        const { error } = await this.supabase.client
          .from('gg_users')
          .update(payload)
          .eq('id', userId);

        if (error) {
          throw new Error(error.message);
        }
      } else {
        payload['password_hash'] = formValue.password_hash.trim();
        const { data, error } = await this.supabase.client
          .from('gg_users')
          .insert(payload)
          .select('id')
          .single();

        if (error) {
          throw new Error(error.message);
        }

        userId = data.id as string;
      }

      if (!userId) {
        throw new Error('User save succeeded but no user id was returned.');
      }

      if (formValue.role === 'worker') {
        await this.syncWorkerAccessRecord({
          userId,
          name: formValue.name.trim(),
          phone: normalizedPhone,
          modules,
          active: (payload['active'] as boolean) ?? true,
        });
      } else {
        await this.removeWorkerAccessRecord(userId);
      }

      this.showToast(this.editId() ? 'User updated successfully' : 'User created successfully', 'success');
      this.closeDialog();
      await this.loadData();
    } catch (error) {
      this.formError.set(error instanceof Error ? error.message : 'Unable to save user.');
    } finally {
      this.saving.set(false);
    }
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);
    const { data, error } = await this.supabase.client
      .from('gg_users')
      .select('id, name, role, username, mobile_number, modules, active, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      this.showToast(error.message, 'error');
      this.loading.set(false);
      return;
    }

    this.members.set(
      (data ?? []).map((user: any) => ({
        id: user.id,
        name: user.name ?? user.username,
        role: this.toDashboardRole(user.role),
        username: user.username ?? '',
        mobile_number: user.mobile_number ?? '',
        modules: user.modules ?? [],
        active: user.active ?? true,
        created_at: user.created_at,
      })),
    );
    this.loading.set(false);
  }

  private applyRoleValidation(role: string): void {
    if (role === 'worker') {
      this.form.controls.mobile_number.setValidators([
        Validators.required,
        Validators.pattern(PHONE_PATTERN),
      ]);
    } else {
      this.form.controls.mobile_number.clearValidators();
      this.selectedModules.set([]);
    }
    this.form.controls.mobile_number.updateValueAndValidity({ emitEvent: false });
  }

  private toDashboardRole(role: string | null | undefined): 'admin' | 'worker' {
    return role?.trim().toLowerCase() === 'worker' ? 'worker' : 'admin';
  }

  private normalizePhone(value: string): string {
    const digits = value.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) {
      return digits.slice(2);
    }
    return digits.slice(0, 10);
  }

  private async validateUniquePhone(phone: string, currentUserId: string | null): Promise<string | null> {
    if (!phone) {
      return null;
    }

    let query = this.supabase.client
      .from('gg_users')
      .select('id, username')
      .eq('mobile_number', phone)
      .limit(1);

    if (currentUserId) {
      query = query.neq('id', currentUserId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      return `Unable to validate phone number: ${error.message}`;
    }
    if (data) {
      return `Mobile number ${phone} is already assigned to ${data.username ?? 'another user'}.`;
    }
    return null;
  }

  private async syncWorkerAccessRecord(input: {
    userId: string;
    name: string;
    phone: string;
    modules: string[];
    active: boolean;
  }): Promise<void> {
    const { error: workerError } = await this.supabase.client
      .from('ops_workers')
      .upsert(
        {
          worker_id: input.userId,
          name: input.name,
          phone: input.phone,
          worker_role: 'worker',
          active: input.active,
        },
        { onConflict: 'worker_id' },
      );

    if (workerError) {
      throw new Error(`User saved, but worker sync failed: ${workerError.message}`);
    }

    const { error: deleteError } = await this.supabase.client
      .from('ops_worker_module_access')
      .delete()
      .eq('worker_id', input.userId);

    if (deleteError) {
      throw new Error(`Worker access reset failed: ${deleteError.message}`);
    }

    const moduleRows = input.modules.map((module) => ({
      worker_id: input.userId,
      module_name: module,
    }));

    if (moduleRows.length > 0) {
      const { error: moduleError } = await this.supabase.client
        .from('ops_worker_module_access')
        .insert(moduleRows);

      if (moduleError) {
        throw new Error(`Worker module sync failed: ${moduleError.message}`);
      }
    }
  }

  private async removeWorkerAccessRecord(userId: string): Promise<void> {
    const { error: modulesError } = await this.supabase.client
      .from('ops_worker_module_access')
      .delete()
      .eq('worker_id', userId);

    if (modulesError) {
      throw new Error(`Failed to clear worker access: ${modulesError.message}`);
    }

    const { error: workerError } = await this.supabase.client
      .from('ops_workers')
      .delete()
      .eq('worker_id', userId);

    if (workerError) {
      throw new Error(`Failed to remove worker session record: ${workerError.message}`);
    }
  }

  private showToast(msg: string, kind: 'success' | 'error'): void {
    this.toast.set(msg);
    this.toastKind.set(kind);
    setTimeout(() => this.toast.set(''), 3000);
  }
}
