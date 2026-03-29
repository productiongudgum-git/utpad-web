import { CommonModule, DatePipe, TitleCasePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';

type WorkerModule = 'inwarding' | 'production' | 'packing' | 'dispatch';

interface OpsWorkerRow {
  worker_id: string;
  name: string;
  phone: string | null;
  worker_role: string;
  active: boolean;
  created_at: string;
  modules: WorkerModule[];
}

const ALL_MODULES: WorkerModule[] = ['inwarding', 'production', 'packing', 'dispatch'];

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TitleCasePipe, DatePipe],
  template: `
    <section class="min-h-full px-6 py-8" style="background:#f1f3f6;">

      <!-- Page Header -->
      <div class="mb-8">
        <p class="text-xs font-bold uppercase tracking-widest mb-1" style="color:#5b6bff;">ACCESS MANAGEMENT</p>
        <h1 class="text-3xl font-bold text-gray-900 leading-tight">Worker Management</h1>
      </div>

      <div class="flex flex-col gap-6">

        <!-- Create Worker Form -->
        <div class="w-full">
          <div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <div class="flex items-center gap-2 mb-5">
              <div class="w-7 h-7 rounded-full flex items-center justify-center" style="background:#5b6bff;">
                <span class="material-icons-round text-white text-sm">person_add</span>
              </div>
              <h2 class="font-semibold text-gray-800 text-base">Add New Worker</h2>
            </div>

            <form [formGroup]="workerForm" (ngSubmit)="createWorker()" class="space-y-4">

              <!-- Name + Phone -->
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Worker Name *</label>
                  <input
                    formControlName="name"
                    type="text"
                    placeholder="e.g. Rajan Kumar"
                    class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 placeholder:text-gray-300" />
                  @if (workerForm.controls.name.invalid && workerForm.controls.name.touched) {
                    <p class="text-xs text-red-500 mt-1">Name is required.</p>
                  }
                </div>
                <div>
                  <label class="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Phone (10 digits) *</label>
                  <input
                    formControlName="phone"
                    type="text"
                    inputmode="numeric"
                    placeholder="9876543210"
                    maxlength="10"
                    class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 placeholder:text-gray-300" />
                  @if (workerForm.controls.phone.invalid && workerForm.controls.phone.touched) {
                    <p class="text-xs text-red-500 mt-1">Must be 10 digits starting with 6-9.</p>
                  }
                </div>
              </div>

              <!-- Module Access -->
              <div>
                <label class="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Module Access</label>
                <div class="flex flex-wrap gap-2">
                  @for (module of moduleOptions; track module) {
                    <button
                      type="button"
                      (click)="toggleCreateModule(module)"
                      [class]="selectedModules().includes(module)
                        ? 'rounded-full border px-3.5 py-1.5 text-xs font-semibold border-indigo-500 bg-indigo-50 text-indigo-600 transition'
                        : 'rounded-full border px-3.5 py-1.5 text-xs font-semibold border-gray-200 bg-white text-gray-500 hover:border-indigo-300 hover:text-indigo-500 transition'">
                      {{ module | titlecase }}
                    </button>
                  }
                </div>
              </div>

              <!-- Submit -->
              <button
                type="submit"
                [disabled]="workerForm.invalid || selectedModules().length === 0 || saving()"
                class="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style="background: linear-gradient(135deg, #5b6bff, #7b3fe4);">
                {{ saving() ? 'Saving...' : 'Create Worker' }}
              </button>
            </form>

            @if (statusMessage()) {
              <div
                class="mt-3 rounded-lg border px-4 py-2.5 text-xs font-medium text-center"
                [class]="statusKind() === 'success'
                  ? 'border-green-200 bg-green-50 text-green-700'
                  : 'border-red-200 bg-red-50 text-red-700'">
                {{ statusMessage() }}
              </div>
            }
          </div>
        </div>

        <!-- Workers Table -->
        <div class="w-full bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div class="px-6 py-4 flex items-center justify-between border-b border-gray-100">
            <div class="flex items-center gap-3">
              <h2 class="text-base font-bold text-gray-900">Workers</h2>
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-600">
                {{ workers().length }} TOTAL
              </span>
            </div>
            <button type="button" (click)="loadWorkers()" class="text-xs text-blue-600 hover:underline">Refresh</button>
          </div>

          @if (loadingWorkers()) {
            <div class="px-6 py-8 text-center text-sm text-gray-400">Loading workers...</div>
          } @else if (workers().length === 0) {
            <div class="px-6 py-12 text-center text-sm text-gray-400">
              No workers yet. Use the form above to add your first worker.
            </div>
          } @else {
            <div class="divide-y divide-gray-50">
              @for (worker of visibleWorkers(); track worker.worker_id) {
                <div
                  class="group px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors cursor-pointer"
                  (click)="openWorkerDetail(worker)">

                  <!-- Avatar -->
                  <div
                    class="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    [class]="worker.active ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'">
                    {{ workerInitials(worker.name) }}
                  </div>

                  <!-- Info -->
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold leading-tight"
                       [class]="worker.active ? 'text-gray-900' : 'text-gray-400 line-through'">
                      {{ worker.name }}
                    </p>
                    <p class="text-xs text-gray-400 mt-0.5">
                      {{ worker.phone ?? 'No phone' }}
                    </p>
                    <div class="flex flex-wrap gap-1 mt-1">
                      @for (mod of worker.modules; track mod) {
                        <span class="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-600">
                          {{ mod | titlecase }}
                        </span>
                      }
                    </div>
                  </div>

                  <!-- Status + Date -->
                  <div class="text-right flex-shrink-0 ml-auto">
                    <p class="text-[11px] font-bold uppercase tracking-wider"
                       [class]="worker.active ? 'text-green-600' : 'text-red-400'">
                      ● {{ worker.active ? 'Active' : 'Inactive' }}
                    </p>
                    <p class="text-[10px] text-gray-400 mt-0.5">{{ worker.created_at | date:'MMM d, yyyy' }}</p>
                  </div>

                  <!-- Edit hint -->
                  <div class="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span class="material-icons-round text-gray-300 text-base">chevron_right</span>
                  </div>
                </div>
              }
            </div>

            <!-- Pagination -->
            <div class="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
              <p class="text-xs text-gray-400">
                Showing {{ visibleWorkers().length }} of {{ workers().length }}
              </p>
              <div class="flex items-center gap-1">
                <button type="button" (click)="prevPage()" [disabled]="!canPrev()"
                  class="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed transition">
                  <span class="material-icons-round text-sm">chevron_left</span>
                </button>
                <button type="button" (click)="nextPage()" [disabled]="!canNext()"
                  class="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed transition">
                  <span class="material-icons-round text-sm">chevron_right</span>
                </button>
              </div>
            </div>
          }
        </div>

      </div>
    </section>

    <!-- ── Worker Detail Drawer ───────────────────────────────── -->
    @if (selectedWorker()) {
      <!-- Backdrop -->
      <div
        class="fixed inset-0 bg-black/30 z-40 transition-opacity"
        (click)="closeDrawer()">
      </div>

      <!-- Drawer panel -->
      <div class="fixed top-0 right-0 h-full w-full max-w-md bg-white z-50 shadow-2xl flex flex-col overflow-hidden">

        <!-- Drawer Header -->
        <div class="flex items-center justify-between px-6 py-5 border-b border-gray-100" style="background: linear-gradient(135deg, #5b6bff11, #7b3fe411);">
          <div class="flex items-center gap-3">
            <div
              class="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
              [class]="selectedWorker()!.active ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'">
              {{ workerInitials(selectedWorker()!.name) }}
            </div>
            <div>
              <p class="text-sm font-bold text-gray-900">{{ selectedWorker()!.name }}</p>
              <p class="text-[11px]"
                 [class]="selectedWorker()!.active ? 'text-green-600 font-semibold' : 'text-red-400 font-semibold'">
                ● {{ selectedWorker()!.active ? 'Active' : 'Inactive' }}
              </p>
            </div>
          </div>
          <button type="button" (click)="closeDrawer()" class="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition">
            <span class="material-icons-round text-xl">close</span>
          </button>
        </div>

        <!-- Drawer Body -->
        <div class="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          <form [formGroup]="editForm" class="space-y-4">

            <!-- Name -->
            <div>
              <label class="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Worker Name *</label>
              <input
                formControlName="name"
                type="text"
                class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
              @if (editForm.controls.name.invalid && editForm.controls.name.touched) {
                <p class="text-xs text-red-500 mt-1">Name is required.</p>
              }
            </div>

            <!-- Phone -->
            <div>
              <label class="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Phone *</label>
              <input
                formControlName="phone"
                type="text"
                inputmode="numeric"
                maxlength="10"
                class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
              @if (editForm.controls.phone.invalid && editForm.controls.phone.touched) {
                <p class="text-xs text-red-500 mt-1">Must be 10 digits starting with 6-9.</p>
              }
            </div>

          </form>

          <!-- Module Access -->
          <div>
            <label class="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Module Access</label>
            <div class="flex flex-wrap gap-2">
              @for (module of moduleOptions; track module) {
                <button
                  type="button"
                  (click)="toggleEditModule(module)"
                  [class]="editModules().includes(module)
                    ? 'rounded-full border px-3.5 py-1.5 text-xs font-semibold border-indigo-500 bg-indigo-50 text-indigo-600 transition'
                    : 'rounded-full border px-3.5 py-1.5 text-xs font-semibold border-gray-200 bg-white text-gray-500 hover:border-indigo-300 hover:text-indigo-500 transition'">
                  {{ module | titlecase }}
                </button>
              }
            </div>
            @if (editModules().length === 0) {
              <p class="text-xs text-red-500 mt-1.5">Select at least one module.</p>
            }
          </div>

          <!-- Worker Info (read-only) -->
          <div class="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 space-y-1.5">
            <p class="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Worker Info</p>
            <div class="flex justify-between text-xs">
              <span class="text-gray-400">Worker ID</span>
              <span class="text-gray-600 font-mono text-[11px]">{{ selectedWorker()!.worker_id }}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-gray-400">Created</span>
              <span class="text-gray-600">{{ selectedWorker()!.created_at | date:'MMM d, yyyy, h:mm a' }}</span>
            </div>
          </div>

          @if (editStatusMessage()) {
            <div
              class="rounded-lg border px-4 py-2.5 text-xs font-medium text-center"
              [class]="editStatusKind() === 'success'
                ? 'border-green-200 bg-green-50 text-green-700'
                : 'border-red-200 bg-red-50 text-red-700'">
              {{ editStatusMessage() }}
            </div>
          }

        </div>

        <!-- Drawer Footer -->
        <div class="px-6 py-4 border-t border-gray-100 space-y-2 bg-white">
          <button
            type="button"
            (click)="saveWorker()"
            [disabled]="editForm.invalid || editModules().length === 0 || editSaving()"
            class="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style="background: linear-gradient(135deg, #5b6bff, #7b3fe4);">
            <span class="material-icons-round text-base">save</span>
            {{ editSaving() ? 'Saving...' : 'Save Changes' }}
          </button>
          <button
            type="button"
            (click)="toggleWorkerActive(selectedWorker()!)"
            [disabled]="editSaving()"
            class="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold border transition disabled:opacity-50"
            [class]="selectedWorker()!.active
              ? 'border-red-200 text-red-500 hover:bg-red-50'
              : 'border-green-200 text-green-600 hover:bg-green-50'">
            <span class="material-icons-round text-base">{{ selectedWorker()!.active ? 'delete_outline' : 'toggle_on' }}</span>
            {{ selectedWorker()!.active ? 'Delete Worker' : 'Restore Worker' }}
          </button>
        </div>

      </div>
    }
  `,
})
export class UsersComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly supabase = inject(SupabaseService);

  readonly moduleOptions: WorkerModule[] = ALL_MODULES;

  readonly workers = signal<OpsWorkerRow[]>([]);
  readonly loading = signal(false);
  readonly loadingWorkers = signal(false);
  readonly saving = signal(false);
  readonly statusMessage = signal('');
  readonly statusKind = signal<'success' | 'error'>('success');
  readonly selectedModules = signal<WorkerModule[]>(['inwarding']);
  readonly currentPage = signal(0);
  readonly pageSize = 8;

  // Edit drawer state
  readonly selectedWorker = signal<OpsWorkerRow | null>(null);
  readonly editModules = signal<WorkerModule[]>([]);
  readonly editSaving = signal(false);
  readonly editStatusMessage = signal('');
  readonly editStatusKind = signal<'success' | 'error'>('success');

  readonly sortedWorkers = computed(() =>
    [...this.workers()].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
  );

  readonly visibleWorkers = computed(() => {
    const start = this.currentPage() * this.pageSize;
    return this.sortedWorkers().slice(start, start + this.pageSize);
  });

  readonly canNext = computed(() =>
    (this.currentPage() + 1) * this.pageSize < this.sortedWorkers().length
  );
  readonly canPrev = computed(() => this.currentPage() > 0);

  readonly workerForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    phone: ['', [
      Validators.required,
      Validators.pattern(/^[6-9]\d{9}$/),
    ]],
  });

  readonly editForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    phone: ['', [
      Validators.required,
      Validators.pattern(/^[6-9]\d{9}$/),
    ]],
  });

  ngOnInit(): void {
    void this.loadWorkers();
  }

  async loadWorkers(): Promise<void> {
    this.loadingWorkers.set(true);
    const { data, error } = await this.supabase.client
      .from('ops_workers')
      .select('worker_id, name, phone, worker_role, active, created_at, ops_worker_module_access(module_name)')
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (!error && data) {
      const rows: OpsWorkerRow[] = (data as any[]).map((w: any) => ({
        worker_id: w.worker_id,
        name: w.name,
        phone: w.phone,
        worker_role: w.worker_role,
        active: w.active,
        created_at: w.created_at,
        modules: (w.ops_worker_module_access ?? []).map((m: any) => (m.module_name ?? m.module) as WorkerModule),
      }));
      this.workers.set(rows);
    }
    this.loadingWorkers.set(false);
  }

  // ── Create Worker ────────────────────────────────────────────

  toggleCreateModule(module: WorkerModule): void {
    this.selectedModules.update(modules =>
      modules.includes(module)
        ? modules.filter(m => m !== module)
        : [...modules, module]
    );
  }

  async createWorker(): Promise<void> {
    if (this.workerForm.invalid) {
      this.workerForm.markAllAsTouched();
      return;
    }
    if (this.selectedModules().length === 0) {
      this.setStatus('Select at least one module.', 'error');
      return;
    }

    this.saving.set(true);
    const { name, phone } = this.workerForm.getRawValue();
    const phoneTrimmed = phone.trim();
    const nameTrimmed = name.trim();

    // Prevent duplicate workers with the same phone number
    const { data: existing } = await this.supabase.client
      .from('ops_workers')
      .select('worker_id')
      .eq('phone', phoneTrimmed)
      .maybeSingle();
    if (existing) {
      this.setStatus(`A worker with phone ${phoneTrimmed} already exists.`, 'error');
      this.saving.set(false);
      return;
    }

    const workerId = crypto.randomUUID();
    const modules = [...this.selectedModules()];

    const { error: workerError } = await this.supabase.client
      .from('ops_workers')
      .insert({
        worker_id: workerId,
        name: nameTrimmed,
        phone: phoneTrimmed,
        worker_role: 'worker',
        active: true,
      });

    if (workerError) {
      this.setStatus(`Failed to create worker: ${workerError.message}`, 'error');
      this.saving.set(false);
      return;
    }

    const { error: moduleError } = await this.supabase.client
      .from('ops_worker_module_access')
      .insert(modules.map(module => ({ worker_id: workerId, module_name: module })));

    if (moduleError) {
      this.setStatus(`Worker created but module assignment failed: ${moduleError.message}`, 'error');
    } else {
      // Sync to gg_users for Android app login (phone-based auth)
      await this.syncWorkerToGgUsers(nameTrimmed, phoneTrimmed, modules, true);

      this.setStatus(`Worker "${name}" created successfully.`, 'success');
      this.workerForm.reset({ name: '', phone: '' });
      this.selectedModules.set(['inwarding']);
      this.currentPage.set(0);
      await this.loadWorkers();
    }
    this.saving.set(false);
  }

  // ── Edit Drawer ──────────────────────────────────────────────

  openWorkerDetail(worker: OpsWorkerRow): void {
    this.selectedWorker.set(worker);
    this.editModules.set([...worker.modules]);
    this.editStatusMessage.set('');
    this.editForm.reset({
      name: worker.name,
      phone: worker.phone ?? '',
    });
  }

  closeDrawer(): void {
    this.selectedWorker.set(null);
  }

  toggleEditModule(module: WorkerModule): void {
    this.editModules.update(modules =>
      modules.includes(module)
        ? modules.filter(m => m !== module)
        : [...modules, module]
    );
  }

  async saveWorker(): Promise<void> {
    const worker = this.selectedWorker();
    if (!worker || this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    if (this.editModules().length === 0) {
      this.setEditStatus('Select at least one module.', 'error');
      return;
    }

    this.editSaving.set(true);
    const { name, phone } = this.editForm.getRawValue();

    const updateData: Record<string, string> = { name: name.trim(), phone: phone.trim() };

    const { error: updateError } = await this.supabase.client
      .from('ops_workers')
      .update(updateData)
      .eq('worker_id', worker.worker_id);

    if (updateError) {
      this.setEditStatus(`Failed to update: ${updateError.message}`, 'error');
      this.editSaving.set(false);
      return;
    }

    // Replace module access: delete all existing, insert new selection
    await this.supabase.client
      .from('ops_worker_module_access')
      .delete()
      .eq('worker_id', worker.worker_id);

    const { error: moduleError } = await this.supabase.client
      .from('ops_worker_module_access')
      .insert(this.editModules().map(m => ({ worker_id: worker.worker_id, module_name: m })));

    if (moduleError) {
      this.setEditStatus(`Details saved but module update failed: ${moduleError.message}`, 'error');
    } else {
      // Sync to gg_users for Android app login
      const updatedModules = [...this.editModules()];
      await this.syncWorkerToGgUsers(name.trim(), phone.trim(), updatedModules, worker.active);

      this.setEditStatus('Worker updated successfully.', 'success');
      await this.loadWorkers();
      // Refresh drawer to reflect saved state
      const updated = this.workers().find(w => w.worker_id === worker.worker_id);
      if (updated) this.selectedWorker.set(updated);
    }
    this.editSaving.set(false);
  }

  // ── Toggle Active ────────────────────────────────────────────

  async toggleWorkerActive(worker: OpsWorkerRow): Promise<void> {
    const newActive = !worker.active;
    const { error } = await this.supabase.client
      .from('ops_workers')
      .update({ active: newActive })
      .eq('worker_id', worker.worker_id);

    if (!error) {
      // Sync active status to gg_users for Android app
      if (worker.phone) {
        await this.supabase.client
          .from('gg_users')
          .update({ active: newActive })
          .eq('mobile_number', worker.phone);
      }

      await this.loadWorkers();
      if (this.selectedWorker()?.worker_id === worker.worker_id) {
        const updated = this.workers().find(w => w.worker_id === worker.worker_id);
        if (updated) this.selectedWorker.set(updated);
      }
      this.setStatus(
        `Worker "${worker.name}" ${newActive ? 'activated' : 'deactivated'}.`,
        'success'
      );
    } else {
      this.setStatus(`Failed to update worker: ${error.message}`, 'error');
    }
  }

  // ── Pagination ───────────────────────────────────────────────

  nextPage(): void { if (this.canNext()) this.currentPage.update(p => p + 1); }
  prevPage(): void { if (this.canPrev()) this.currentPage.update(p => p - 1); }

  // ── Helpers ──────────────────────────────────────────────────

  workerInitials(name: string): string {
    return name
      .split(' ')
      .filter(p => p.length > 0)
      .slice(0, 2)
      .map(p => p[0]?.toUpperCase() ?? '')
      .join('') || 'WK';
  }

  private setStatus(message: string, kind: 'success' | 'error'): void {
    this.statusKind.set(kind);
    this.statusMessage.set(message);
    setTimeout(() => this.statusMessage.set(''), 5000);
  }

  private setEditStatus(message: string, kind: 'success' | 'error'): void {
    this.editStatusKind.set(kind);
    this.editStatusMessage.set(message);
  }

  private async syncWorkerToGgUsers(
    name: string,
    phone: string,
    modules: WorkerModule[],
    active: boolean,
  ): Promise<void> {
    const username = `worker_${phone}`;
    const existing = await this.supabase.client
      .from('gg_users')
      .select('id')
      .eq('mobile_number', phone)
      .maybeSingle();

    const payload = {
      name,
      username,
      role: 'worker',
      modules,
      mobile_number: phone,
      active,
    };

    if (existing.data?.id) {
      const { error } = await this.supabase.client
        .from('gg_users')
        .update(payload)
        .eq('id', existing.data.id);
      if (error) {
        throw new Error(error.message);
      }
      return;
    }

    const { error } = await this.supabase.client
      .from('gg_users')
      .insert(payload);

    if (error) {
      throw new Error(error.message);
    }
  }
}
