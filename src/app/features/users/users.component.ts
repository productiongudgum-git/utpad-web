import { CommonModule, DatePipe, TitleCasePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';

type WorkerModule = 'inwarding' | 'production' | 'packing' | 'dispatch' | 'returns';

interface OpsWorkerRow {
  worker_id: string;
  name: string;
  phone: string | null;
  worker_role: string;
  active: boolean;
  created_at: string;
  modules: WorkerModule[];
}

const ALL_MODULES: WorkerModule[] = ['inwarding', 'production', 'packing', 'dispatch', 'returns'];
const ROLES = ['inwarding_staff', 'production_operator', 'packing_staff', 'dispatch_staff', 'supervisor'];

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

              <!-- PIN + Role -->
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">PIN (4 digits) *</label>
                  <input
                    formControlName="pin"
                    type="password"
                    inputmode="numeric"
                    placeholder="••••"
                    maxlength="4"
                    class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 placeholder:text-gray-300" />
                  @if (workerForm.controls.pin.invalid && workerForm.controls.pin.touched) {
                    <p class="text-xs text-red-500 mt-1">Must be exactly 4 digits.</p>
                  }
                </div>
                <div>
                  <label class="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Role *</label>
                  <select
                    formControlName="role"
                    class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
                    @for (role of roleOptions; track role) {
                      <option [value]="role">{{ role | titlecase }}</option>
                    }
                  </select>
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
                <div class="group px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors">

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
                      {{ worker.worker_role | titlecase }} · {{ worker.phone ?? 'No phone' }}
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

                  <!-- Actions -->
                  <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      (click)="toggleWorkerActive(worker)"
                      [title]="worker.active ? 'Deactivate worker' : 'Activate worker'"
                      class="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-indigo-600 transition">
                      <span class="material-icons-round text-base">{{ worker.active ? 'toggle_on' : 'toggle_off' }}</span>
                    </button>
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
  `,
})
export class UsersComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly supabase = inject(SupabaseService);

  readonly moduleOptions: WorkerModule[] = ALL_MODULES;
  readonly roleOptions: string[] = ROLES;

  readonly workers = signal<OpsWorkerRow[]>([]);
  readonly loading = signal(false);
  readonly loadingWorkers = signal(false);
  readonly saving = signal(false);
  readonly statusMessage = signal('');
  readonly statusKind = signal<'success' | 'error'>('success');
  readonly selectedModules = signal<WorkerModule[]>(['inwarding']);
  readonly currentPage = signal(0);
  readonly pageSize = 8;

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
    pin: ['', [
      Validators.required,
      Validators.pattern(/^\d{4}$/),
    ]],
    role: [ROLES[0], Validators.required],
  });

  ngOnInit(): void {
    void this.loadWorkers();
  }

  async loadWorkers(): Promise<void> {
    this.loadingWorkers.set(true);
    const { data, error } = await this.supabase.client
      .from('ops_workers')
      .select('worker_id, name, phone, worker_role, active, created_at, ops_worker_module_access(module)')
      .order('created_at', { ascending: false });

    if (!error && data) {
      const rows: OpsWorkerRow[] = (data as any[]).map((w: any) => ({
        worker_id: w.worker_id,
        name: w.name,
        phone: w.phone,
        worker_role: w.worker_role,
        active: w.active,
        created_at: w.created_at,
        modules: (w.ops_worker_module_access ?? []).map((m: any) => m.module as WorkerModule),
      }));
      this.workers.set(rows);
    }
    this.loadingWorkers.set(false);
  }

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
    const { name, phone, pin, role } = this.workerForm.getRawValue();

    const { data: newWorker, error: workerError } = await this.supabase.client
      .from('ops_workers')
      .insert({
        name: name.trim(),
        phone: phone.trim(),
        pin_hash: pin.trim(), // hashing deferred to backend trigger or Supabase function
        worker_role: role,
        active: true,
      })
      .select('worker_id')
      .single();

    if (workerError || !newWorker) {
      this.setStatus(`Failed to create worker: ${workerError?.message ?? 'Unknown error'}`, 'error');
      this.saving.set(false);
      return;
    }

    const workerId = (newWorker as any).worker_id;
    const moduleRows = this.selectedModules().map(module => ({
      worker_id: workerId,
      module,
    }));

    const { error: moduleError } = await this.supabase.client
      .from('ops_worker_module_access')
      .insert(moduleRows);

    if (moduleError) {
      this.setStatus(`Worker created but module assignment failed: ${moduleError.message}`, 'error');
    } else {
      this.setStatus(`Worker "${name}" created successfully.`, 'success');
      this.workerForm.reset({ name: '', phone: '', pin: '', role: ROLES[0] });
      this.selectedModules.set(['inwarding']);
      this.currentPage.set(0);
      await this.loadWorkers();
    }
    this.saving.set(false);
  }

  async toggleWorkerActive(worker: OpsWorkerRow): Promise<void> {
    const { error } = await this.supabase.client
      .from('ops_workers')
      .update({ active: !worker.active })
      .eq('worker_id', worker.worker_id);

    if (!error) {
      this.workers.update(ws =>
        ws.map(w => w.worker_id === worker.worker_id ? { ...w, active: !w.active } : w)
      );
      this.setStatus(
        `Worker "${worker.name}" ${!worker.active ? 'activated' : 'deactivated'}.`,
        'success'
      );
    } else {
      this.setStatus(`Failed to update worker: ${error.message}`, 'error');
    }
  }

  nextPage(): void { if (this.canNext()) this.currentPage.update(p => p + 1); }
  prevPage(): void { if (this.canPrev()) this.currentPage.update(p => p - 1); }

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
}
