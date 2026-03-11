import { CommonModule, DatePipe, TitleCasePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { OperationsLiveService, WorkerCredential, WorkerModule } from '../../core/services/operations-live.service';
import { UserRole } from '../../shared/models/auth.models';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TitleCasePipe, DatePipe],
  template: `
    <section class="min-h-full px-6 py-8" style="background:#f1f3f6;">

      <!-- Page Header -->
      <div class="mb-8">
        <p class="text-xs font-bold uppercase tracking-widest mb-1" style="color:#5b6bff;">ACCESS MANAGEMENT</p>
        <h1 class="text-3xl font-bold text-gray-900 leading-tight">Worker Credentials</h1>
      </div>

      <!-- Single-column stacked layout -->
      <div class="flex flex-col gap-6">

        <!-- TOP: New Credential Form (full width) -->
        <div class="w-full">

          <!-- Form Card -->
          <div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <!-- Card header -->
            <div class="flex items-center gap-2 mb-5">
              <div class="w-7 h-7 rounded-full flex items-center justify-center" style="background:#5b6bff;">
                <span class="material-icons-round text-white text-sm">security</span>
              </div>
              <h2 class="font-semibold text-gray-800 text-base">New Credential</h2>
            </div>

            <form [formGroup]="credentialForm" (ngSubmit)="createCredential()" class="space-y-4">

              <!-- Worker Name -->
              <div>
                <label class="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Worker Name</label>
                <input
                  formControlName="name"
                  type="text"
                  placeholder="Johnathan Doe"
                  class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 placeholder:text-gray-300" />
              </div>

              <!-- Phone + PIN -->
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Phone</label>
                  <input
                    formControlName="phone"
                    type="text"
                    inputmode="numeric"
                    placeholder="9876543210"
                    (input)="onPhoneInput($event)"
                    class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 placeholder:text-gray-300" />
                </div>
                <div>
                  <label class="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">PIN</label>
                  <input
                    formControlName="pin"
                    type="password"
                    inputmode="numeric"
                    placeholder="••••••"
                    (input)="onPinInput($event)"
                    class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 placeholder:text-gray-300" />
                </div>
              </div>

              <!-- Access Level (Role) -->
              <div>
                <label class="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Access Level</label>
                <div class="relative">
                  <select
                    formControlName="role"
                    (change)="onRoleChanged()"
                    class="dropdown-with-arrow w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 pr-10 text-sm text-gray-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
                    @for (role of roleOptions; track role) {
                      <option [value]="role">{{ formatRole(role) }}</option>
                    }
                  </select>
                </div>
              </div>

              <!-- Module Access (Department) -->
              <div>
                <label class="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Module Access</label>
                <div class="flex flex-wrap gap-2">
                  @for (module of moduleOptions; track module) {
                    <button
                      type="button"
                      (click)="toggleCreateModule(module)"
                      class="rounded-full border px-3.5 py-1.5 text-xs font-semibold transition"
                      [class]="selectedModules().includes(module)
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-600'
                        : 'border-gray-200 bg-white text-gray-500 hover:border-indigo-300 hover:text-indigo-500'">
                      {{ module | titlecase }}
                    </button>
                  }
                </div>
              </div>

              <!-- Submit -->
              <button
                type="submit"
                [disabled]="credentialForm.invalid || selectedModules().length === 0"
                class="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style="background: linear-gradient(135deg, #5b6bff, #7b3fe4);">
                <span class="material-icons-round text-base">key</span>
                Generate Credential
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
        <!-- /TOP: New Credential Form -->
        </div>

        <!-- Active Workers Table (full width, below form) -->
        <div class="w-full bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

          <!-- Table header -->
          <div class="px-6 py-4 flex items-center justify-between border-b border-gray-100">
            <div class="flex items-center gap-3">
              <h2 class="text-base font-bold text-gray-900">Active Workers</h2>
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-600">
                {{ workers().length }} TOTAL
              </span>
            </div>
            <button type="button" class="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-indigo-600 transition">
              <span class="material-icons-round text-sm">filter_list</span>
              Filter
            </button>
          </div>

          <!-- Worker rows -->
          <div class="divide-y divide-gray-50">
            @if (visibleWorkers().length === 0) {
              <div class="px-6 py-12 text-center text-sm text-gray-400">
                No workers created yet. Use the form to add your first worker.
              </div>
            }

            @for (worker of visibleWorkers(); track worker.id) {
              <div 
                class="group px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors cursor-pointer"
                (click)="toggleWorkerCard(worker.id)">

                <!-- Avatar -->
                <div
                  class="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  [class]="worker.active
                    ? 'bg-indigo-100 text-indigo-600'
                    : 'bg-gray-100 text-gray-400'">
                  {{ workerInitials(worker.name) }}
                </div>

                <!-- Name + Role -->
                <div class="flex-1 min-w-0">
                  <p
                    class="text-sm font-semibold leading-tight"
                    [class]="worker.active ? 'text-gray-900' : 'text-gray-400 line-through'">
                    {{ worker.name }}
                  </p>
                  <p class="text-xs text-gray-400 mt-0.5 truncate">
                    {{ formatRole(worker.role) }} · {{ moduleLabel(worker.allowedModules) }}
                  </p>
                </div>

                <!-- Status + Date -->
                <div class="text-right flex-shrink-0 ml-auto">
                  <p
                    class="text-[11px] font-bold uppercase tracking-wider"
                    [class]="statusColor(worker)">
                    ● {{ statusLabel(worker) }}
                  </p>
                  <p class="text-[10px] text-gray-400 mt-0.5">
                    {{ worker.createdAt | date:'MMM d, yyyy' }}
                  </p>
                </div>

                <!-- Actions menu -->
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <!-- Toggle active button -->
                  <button
                    type="button"
                    (click)="toggleWorkerActive(worker); $event.stopPropagation()"
                    class="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-indigo-600 transition"
                    [title]="worker.active ? 'Deactivate' : 'Activate'">
                    <span class="material-icons-round text-base">{{ worker.active ? 'toggle_on' : 'toggle_off' }}</span>
                  </button>
                  <!-- Expand panel arrow (optional, indicating it's clickable) -->
                  <button
                    type="button"
                    class="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 transition pointer-events-none"
                    [title]="expandedWorkerId() === worker.id ? 'Collapse' : 'Expand'">
                    <span class="material-icons-round text-base">{{ expandedWorkerId() === worker.id ? 'expand_less' : 'expand_more' }}</span>
                  </button>
                </div>
              </div>

              <!-- ── EXPANDED PANEL ── -->
              @if (expandedWorkerId() === worker.id) {
                <div class="px-6 pb-5 bg-indigo-50/40 border-t border-indigo-100">

                  <!-- ── CREDENTIALS SECTION ── -->
                  <p class="text-[10px] font-bold uppercase tracking-widest text-indigo-400 pt-4 mb-3">Credentials</p>

                  <!-- Phone + PIN display row -->
                  <div class="grid grid-cols-2 gap-3 mb-4">

                    <!-- Phone -->
                    <div class="flex flex-col gap-1">
                      <span class="text-[10px] font-bold uppercase tracking-widest text-gray-400">Phone</span>
                      <div class="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                        <span class="material-icons-round text-gray-400 text-base">phone</span>
                        <span class="flex-1 text-sm font-mono text-gray-800 tracking-widest">
                          {{ revealPhoneId() === worker.id ? worker.phone : maskPhone(worker.phone) }}
                        </span>
                        <button
                          type="button"
                          (click)="toggleRevealPhone(worker.id)"
                          class="text-gray-400 hover:text-indigo-600 transition"
                          [title]="revealPhoneId() === worker.id ? 'Hide phone' : 'Reveal phone'">
                          <span class="material-icons-round text-base">
                            {{ revealPhoneId() === worker.id ? 'visibility_off' : 'visibility' }}
                          </span>
                        </button>
                      </div>
                    </div>

                    <!-- PIN -->
                    <div class="flex flex-col gap-1">
                      <span class="text-[10px] font-bold uppercase tracking-widest text-gray-400">PIN</span>
                      <div class="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                        <span class="material-icons-round text-gray-400 text-base">pin</span>
                        <span class="flex-1 text-sm font-mono text-gray-800 tracking-[0.3em]">
                          {{ revealPinId() === worker.id ? worker.pin : '••••••' }}
                        </span>
                        <button
                          type="button"
                          (click)="toggleRevealPin(worker.id)"
                          class="text-gray-400 hover:text-indigo-600 transition"
                          [title]="revealPinId() === worker.id ? 'Hide PIN' : 'Reveal PIN'">
                          <span class="material-icons-round text-base">
                            {{ revealPinId() === worker.id ? 'visibility_off' : 'visibility' }}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- Change credentials button / form -->
                  @if (credentialsEditId() !== worker.id) {
                    <button
                      type="button"
                      (click)="openCredentialsEdit(worker)"
                      class="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg border border-indigo-200 bg-white text-indigo-600 px-3 py-1.5 hover:bg-indigo-50 transition">
                      <span class="material-icons-round text-sm">edit</span>
                      Change Phone / PIN
                    </button>
                  } @else {
                    <!-- Mini credential edit form -->
                    <form
                      [formGroup]="editCredentialsForm"
                      (ngSubmit)="saveCredentials(worker.id)"
                      class="bg-white border border-indigo-200 rounded-xl p-4 space-y-3">

                      <p class="text-[10px] font-bold uppercase tracking-widest text-indigo-500 mb-1">Update Credentials</p>

                      <div class="grid grid-cols-2 gap-3">
                        <!-- New Phone -->
                        <div>
                          <label class="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">New Phone</label>
                          <input
                            formControlName="editPhone"
                            type="text"
                            inputmode="numeric"
                            placeholder="Leave blank to keep"
                            (input)="onEditPhoneInput($event)"
                            class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 placeholder:text-gray-300" />
                        </div>
                        <!-- New PIN -->
                        <div>
                          <label class="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">New PIN</label>
                          <div class="relative">
                            <input
                              formControlName="editPin"
                              [type]="showNewPin() ? 'text' : 'password'"
                              inputmode="numeric"
                              placeholder="Leave blank to keep"
                              (input)="onEditPinInput($event)"
                              class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 pr-9 text-sm text-gray-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 placeholder:text-gray-300" />
                            <button
                              type="button"
                              (click)="toggleShowNewPin()"
                              class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-600 transition">
                              <span class="material-icons-round text-base">{{ showNewPin() ? 'visibility_off' : 'visibility' }}</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      <div class="flex items-center gap-2">
                        <button
                          type="submit"
                          [disabled]="editCredentialsForm.invalid || (editCredentialsForm.controls['editPhone'].value === '' && editCredentialsForm.controls['editPin'].value === '')"
                          class="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                          style="background: linear-gradient(135deg, #5b6bff, #7b3fe4);">
                          <span class="material-icons-round text-sm">save</span>
                          Save
                        </button>
                        <button
                          type="button"
                          (click)="closeCredentialsEdit()"
                          class="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-500 hover:border-gray-300 hover:text-gray-700 transition">
                          Cancel
                        </button>
                      </div>
                    </form>
                  }

                  <!-- ── MODULE ACCESS SECTION ── -->
                  <p class="text-[10px] font-bold uppercase tracking-widest text-indigo-400 mt-5 mb-2">Module Access</p>
                  <div class="flex flex-wrap gap-2">
                    @for (module of moduleOptions; track module) {
                      <button
                        type="button"
                        (click)="toggleWorkerModule(worker, module)"
                        class="rounded-full border px-4 py-1.5 text-xs font-semibold transition"
                        [class]="worker.allowedModules.includes(module)
                          ? 'border-indigo-500 bg-indigo-600 text-white'
                          : 'border-gray-200 bg-white text-gray-500 hover:border-indigo-400 hover:text-indigo-500'">
                        {{ module | titlecase }}
                      </button>
                    }
                  </div>

                  <!-- ── DANGER ZONE ── -->
                  <div class="mt-6 pt-4 border-t border-red-100">
                    <p class="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-2">Danger Zone</p>
                    <button
                      type="button"
                      (click)="confirmDeleteWorker(worker)"
                      class="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50 hover:border-red-300 transition">
                      <span class="material-icons-round text-sm">delete</span>
                      Delete Worker
                    </button>
                    <p class="mt-1.5 text-[10px] text-gray-400">This permanently removes the worker. Deactivate instead if they have past records.</p>
                  </div>

                </div>
              }
            }
          </div>

          <!-- Table footer -->
          <div class="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
            <p class="text-xs text-gray-400">
              Showing 1 to {{ visibleWorkers().length }} of {{ workers().length }}
            </p>
            <div class="flex items-center gap-1">
              <button
                type="button"
                (click)="prevPage()"
                [disabled]="!canPrev()"
                class="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed transition">
                <span class="material-icons-round text-sm">chevron_left</span>
              </button>
              <button
                type="button"
                (click)="nextPage()"
                [disabled]="!canNext()"
                class="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed transition">
                <span class="material-icons-round text-sm">chevron_right</span>
              </button>
            </div>
          </div>
        </div>

      </div>
    </section>
  `,
})
export class UsersComponent {
  private readonly fb = inject(FormBuilder);
  private readonly operations = inject(OperationsLiveService);

  readonly workers = this.operations.workers;
  readonly statusMessage = signal('');
  readonly statusKind = signal<'success' | 'error'>('success');
  readonly expandedWorkerId = signal<string | null>(null);
  readonly currentPage = signal(0);
  readonly pageSize = 6;
  readonly today = new Date();

  // --- Reveal toggles ---
  readonly revealPhoneId = signal<string | null>(null);
  readonly revealPinId = signal<string | null>(null);

  // --- Credential edit ---
  readonly credentialsEditId = signal<string | null>(null);
  readonly showNewPin = signal(false);

  readonly moduleOptions: WorkerModule[] = ['inwarding', 'production', 'packing', 'dispatch'];
  readonly roleOptions: UserRole[] = [
    UserRole.InwardingStaff,
    UserRole.ProductionOperator,
    UserRole.PackingStaff,
    UserRole.DispatchStaff,
    UserRole.FactorySupervisor,
  ];

  readonly selectedModules = signal<WorkerModule[]>(['inwarding']);

  readonly sortedWorkers = computed(() =>
    [...this.workers()].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
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

  readonly credentialForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    phone: ['', Validators.required],
    pin: ['', Validators.required],
    role: [UserRole.InwardingStaff, Validators.required],
  });

  readonly editCredentialsForm = this.fb.nonNullable.group({
    editPhone: [''],
    editPin: [''],
  });

  nextPage(): void { if (this.canNext()) this.currentPage.update(p => p + 1); }
  prevPage(): void { if (this.canPrev()) this.currentPage.update(p => p - 1); }

  onRoleChanged(): void {
    const role = this.credentialForm.controls.role.value;
    this.selectedModules.set(this.defaultModulesForRole(role));
  }

  onPhoneInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.credentialForm.controls.phone.setValue(input.value, { emitEvent: false });
  }

  onPinInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.credentialForm.controls.pin.setValue(input.value, { emitEvent: false });
  }

  onEditPhoneInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.editCredentialsForm.controls.editPhone.setValue(input.value, { emitEvent: false });
  }

  onEditPinInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.editCredentialsForm.controls.editPin.setValue(input.value, { emitEvent: false });
  }

  toggleCreateModule(module: WorkerModule): void {
    this.selectedModules.update((modules) =>
      modules.includes(module)
        ? modules.filter((item) => item !== module)
        : [...modules, module],
    );
  }

  createCredential(): void {
    if (this.credentialForm.invalid) {
      this.setStatus('Please complete all fields with valid values.', 'error');
      return;
    }
    if (this.selectedModules().length === 0) {
      this.setStatus('Select at least one module access.', 'error');
      return;
    }

    const values = this.credentialForm.getRawValue();
    const phone = values.phone.trim();
    const pin = values.pin.trim();
    if (!phone || !pin) {
      this.setStatus('Phone and PIN cannot be empty.', 'error');
      return;
    }

    const created = this.operations.createWorkerCredential({
      name: values.name.trim(),
      phone,
      pin,
      role: values.role,
      allowedModules: this.selectedModules(),
    });

    const granted = created.allowedModules.map((m) => this.prettyModule(m)).join(', ');
    this.setStatus(`Credential created for ${created.name}. Access: ${granted}.`, 'success');

    this.credentialForm.reset({ name: '', phone: '', pin: '', role: UserRole.InwardingStaff });
    this.selectedModules.set(['inwarding']);
    this.expandedWorkerId.set(created.id);
    this.currentPage.set(0);
  }

  toggleWorkerCard(workerId: string): void {
    const next = this.expandedWorkerId() === workerId ? null : workerId;
    this.expandedWorkerId.set(next);
    // Close credential edit when collapsing
    if (!next) {
      this.credentialsEditId.set(null);
      this.revealPhoneId.set(null);
      this.revealPinId.set(null);
    }
  }

  toggleWorkerActive(worker: WorkerCredential): void {
    this.operations.setWorkerActive(worker.id, !worker.active);
  }

  toggleWorkerModule(worker: WorkerCredential, module: WorkerModule): void {
    const nextModules = worker.allowedModules.includes(module)
      ? worker.allowedModules.filter((item) => item !== module)
      : [...worker.allowedModules, module];

    if (nextModules.length === 0) {
      this.setStatus('At least one module must remain assigned.', 'error');
      return;
    }
    this.operations.updateWorkerAccess(worker.id, nextModules);
  }

  // --- Reveal toggles ---
  toggleRevealPhone(workerId: string): void {
    this.revealPhoneId.update(id => id === workerId ? null : workerId);
  }

  toggleRevealPin(workerId: string): void {
    this.revealPinId.update(id => id === workerId ? null : workerId);
  }

  // --- Credential edit ---
  openCredentialsEdit(worker: WorkerCredential): void {
    this.credentialsEditId.set(worker.id);
    this.showNewPin.set(false);
    this.editCredentialsForm.reset({ editPhone: '', editPin: '' });
  }

  toggleShowNewPin(): void {
    this.showNewPin.update(v => !v);
  }

  closeCredentialsEdit(): void {
    this.credentialsEditId.set(null);
    this.editCredentialsForm.reset({ editPhone: '', editPin: '' });
  }

  saveCredentials(workerId: string): void {
    const { editPhone, editPin } = this.editCredentialsForm.getRawValue();
    if (!editPhone && !editPin) return;

    this.operations.updateWorkerCredentials(
      workerId,
      editPhone.trim() || undefined,
      editPin.trim() || undefined,
    );

    this.setStatus('Credentials updated successfully.', 'success');
    this.closeCredentialsEdit();
    // Auto-reveal so admin can verify the change
    if (editPhone) this.revealPhoneId.set(workerId);
    if (editPin) this.revealPinId.set(workerId);
  }

  confirmDeleteWorker(worker: WorkerCredential): void {
    const confirmed = globalThis.confirm(
      `Delete worker "${worker.name}"? This will deactivate access immediately.`,
    );
    if (!confirmed) {
      return;
    }

    this.operations.setWorkerActive(worker.id, false);
    this.expandedWorkerId.set(null);
    this.credentialsEditId.set(null);
    this.setStatus(`Worker "${worker.name}" deactivated.`, 'success');
  }


  // --- Display helpers ---
  maskPhone(phone: string): string {
    if (!phone || phone.length < 4) return '••••••••••';
    return '•'.repeat(phone.length - 3) + phone.slice(-3);
  }

  workerInitials(name: string): string {
    return name
      .split(' ')
      .filter((part) => part.length > 0)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'WK';
  }

  moduleLabel(modules: WorkerModule[]): string {
    if (modules.length === 0) return 'No modules';
    if (modules.length === 1) return modules[0].charAt(0).toUpperCase() + modules[0].slice(1);
    return modules.map(m => m.charAt(0).toUpperCase() + m.slice(1)).join(', ');
  }

  statusLabel(worker: WorkerCredential): string {
    if (!worker.active) return 'Revoked';
    const lastActive = new Date(worker.createdAt).getTime();
    const age = Date.now() - lastActive;
    if (age > 30 * 24 * 60 * 60 * 1000) return 'Reviewing';
    return 'Active';
  }

  statusColor(worker: WorkerCredential): string {
    const label = this.statusLabel(worker);
    if (label === 'Active') return 'text-green-600';
    if (label === 'Reviewing') return 'text-amber-500';
    return 'text-red-400';
  }

  formatRole(role: string): string {
    return role.replaceAll('_', ' ');
  }

  private setStatus(message: string, kind: 'success' | 'error'): void {
    this.statusKind.set(kind);
    this.statusMessage.set(message);
    setTimeout(() => this.statusMessage.set(''), 5000);
  }

  private defaultModulesForRole(role: UserRole): WorkerModule[] {
    switch (role) {
      case UserRole.InwardingStaff: return ['inwarding'];
      case UserRole.ProductionOperator: return ['production'];
      case UserRole.PackingStaff: return ['packing'];
      case UserRole.DispatchStaff: return ['dispatch'];
      case UserRole.FactorySupervisor:
      case UserRole.TenantAdmin:
      case UserRole.PlatformAdmin:
        return ['inwarding', 'production', 'packing', 'dispatch'];
      default: return ['inwarding'];
    }
  }

  private prettyModule(module: WorkerModule): string {
    return module.charAt(0).toUpperCase() + module.slice(1);
  }
}
