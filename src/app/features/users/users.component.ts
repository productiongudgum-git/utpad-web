import { CommonModule, TitleCasePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { OperationsLiveService, WorkerCredential, WorkerModule } from '../../core/services/operations-live.service';
import { UserRole } from '../../shared/models/auth.models';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TitleCasePipe],
  template: `
    <section class="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 py-5 sm:px-6 lg:px-8">
      <header class="w-full max-w-3xl rounded-2xl border border-border-light bg-surface-light px-4 py-3 shadow-sm dark:border-border-dark dark:bg-surface-dark">
        <div class="flex items-center justify-between gap-3">
          <button type="button" class="rounded-full p-2 text-text-sub-light transition hover:bg-black/5 dark:text-text-sub-dark dark:hover:bg-white/10" aria-label="Back">
            <span class="material-icons-round text-[20px]">arrow_back</span>
          </button>

          <div class="flex-1 text-center">
            <h1 class="text-xl font-bold tracking-tight text-text-main-light dark:text-text-main-dark">Worker Credentials</h1>
            <p class="text-xs text-text-sub-light dark:text-text-sub-dark">Manage manufacturing staff access</p>
          </div>

          <button type="button" class="rounded-full p-2 text-primary transition hover:bg-primary/10" aria-label="Info">
            <span class="material-icons-round text-[20px]">info</span>
          </button>
        </div>
      </header>

      <div class="grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(360px,480px)_minmax(380px,1fr)] lg:items-start">
        <article class="mx-auto w-full max-w-xl rounded-2xl border border-border-light bg-surface-light p-4 shadow-sm dark:border-border-dark dark:bg-surface-dark">
          <p class="text-center text-xs font-semibold uppercase tracking-[0.16em] text-primary">New Credential</p>

          <form [formGroup]="credentialForm" (ngSubmit)="createCredential()" class="mt-4 space-y-4">
            <div class="space-y-1.5">
              <label class="block text-center text-xs font-medium uppercase tracking-wider text-text-sub-light dark:text-text-sub-dark">Full Name</label>
              <input
                formControlName="name"
                type="text"
                placeholder="e.g. Rahul Sharma"
                class="h-12 w-full rounded-xl border border-border-light bg-[#f8f8f8] px-3 text-center text-sm text-text-main-light outline-none transition focus:border-primary dark:border-border-dark dark:bg-[#20232f] dark:text-text-main-dark" />
            </div>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div class="space-y-1.5">
                <label class="block text-center text-xs font-medium uppercase tracking-wider text-text-sub-light dark:text-text-sub-dark">Phone Number</label>
                <input
                  formControlName="phone"
                  type="text"
                  inputmode="numeric"
                  maxlength="10"
                  placeholder="9876543210"
                  (input)="onPhoneInput($event)"
                  class="h-12 w-full rounded-xl border border-border-light bg-[#f8f8f8] px-3 text-center text-sm tracking-[0.08em] text-text-main-light outline-none transition focus:border-primary dark:border-border-dark dark:bg-[#20232f] dark:text-text-main-dark" />
              </div>

              <div class="space-y-1.5">
                <label class="block text-center text-xs font-medium uppercase tracking-wider text-text-sub-light dark:text-text-sub-dark">6-Digit PIN</label>
                <input
                  formControlName="pin"
                  type="text"
                  inputmode="numeric"
                  maxlength="6"
                  placeholder="••••••"
                  (input)="onPinInput($event)"
                  class="h-12 w-full rounded-xl border border-border-light bg-[#f8f8f8] px-3 text-center text-sm tracking-[0.22em] text-text-main-light outline-none transition focus:border-primary dark:border-border-dark dark:bg-[#20232f] dark:text-text-main-dark" />
              </div>
            </div>

            <div class="space-y-1.5">
              <label class="block text-center text-xs font-medium uppercase tracking-wider text-text-sub-light dark:text-text-sub-dark">Primary Role</label>
              <select
                formControlName="role"
                (change)="onRoleChanged()"
                class="h-12 w-full rounded-xl border border-border-light bg-[#f8f8f8] px-3 text-center text-sm text-text-main-light outline-none transition focus:border-primary dark:border-border-dark dark:bg-[#20232f] dark:text-text-main-dark">
                @for (role of roleOptions; track role) {
                  <option [value]="role">{{ formatRole(role) }}</option>
                }
              </select>
            </div>

            <div class="space-y-2">
              <label class="block text-center text-xs font-medium uppercase tracking-wider text-text-sub-light dark:text-text-sub-dark">Module Access</label>
              <div class="flex flex-wrap justify-center gap-2">
                @for (module of moduleOptions; track module) {
                  <button
                    type="button"
                    (click)="toggleCreateModule(module)"
                    class="rounded-full border px-3 py-1.5 text-xs font-semibold transition"
                    [ngClass]="selectedModules().includes(module)
                      ? 'border-primary bg-primary text-white'
                      : 'border-border-light bg-white text-text-sub-light hover:border-primary/40 hover:text-primary dark:border-border-dark dark:bg-transparent dark:text-text-sub-dark'">
                    {{ module | titlecase }}
                  </button>
                }
              </div>
            </div>

            <button
              type="submit"
              [disabled]="credentialForm.invalid || selectedModules().length === 0"
              class="mx-auto flex h-12 w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-white shadow-lg shadow-primary/25 transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">
              <span class="material-icons-round text-[18px]">person_add</span>
              Create Credential
            </button>
          </form>

          @if (statusMessage()) {
            <div
              class="mx-auto mt-3 max-w-sm rounded-xl border px-3 py-2 text-center text-xs font-medium"
              [ngClass]="statusKind() === 'success'
                ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/40 dark:bg-green-900/15 dark:text-green-300'
                : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/15 dark:text-red-300'">
              {{ statusMessage() }}
            </div>
          }
        </article>

        <article class="mx-auto flex w-full max-w-2xl flex-col items-center space-y-3">
          <div class="flex w-full max-w-xl items-center justify-between">
            <h2 class="text-center text-xl font-bold text-text-main-light dark:text-text-main-dark">
              Active Workers <span class="text-text-sub-light dark:text-text-sub-dark">({{ activeWorkerCount() }})</span>
            </h2>
            <button type="button" (click)="toggleShowAllWorkers()" class="text-sm font-semibold text-primary transition hover:text-primary-hover">
              {{ showAllWorkers() ? 'Show Less' : 'View All' }}
            </button>
          </div>

          <div class="w-full max-w-xl space-y-2.5">
            @if (visibleWorkers().length === 0) {
              <div class="rounded-xl border border-dashed border-border-light bg-surface-light p-4 text-center text-sm text-text-sub-light dark:border-border-dark dark:bg-surface-dark dark:text-text-sub-dark">
                No workers found yet.
              </div>
            }

            @for (worker of visibleWorkers(); track worker.id) {
              <article class="rounded-xl border border-border-light bg-surface-light px-3 py-3 shadow-sm transition dark:border-border-dark dark:bg-surface-dark">
                <div class="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    (click)="toggleWorkerCard(worker.id)"
                    class="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <div
                      class="flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                      [ngClass]="worker.active
                        ? 'bg-primary/15 text-primary'
                        : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-300'">
                      {{ workerInitials(worker.name) }}
                    </div>

                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-semibold text-text-main-light dark:text-text-main-dark">{{ worker.name }}</p>
                      <p class="truncate text-[11px] uppercase tracking-[0.08em] text-text-sub-light dark:text-text-sub-dark">
                        {{ formatRole(worker.role) }} · {{ worker.phone }} · {{ worker.pin }}
                      </p>
                    </div>
                  </button>

                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      (click)="toggleWorkerActive(worker)"
                      class="rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
                      [ngClass]="worker.active
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'">
                      {{ worker.active ? 'On' : 'Off' }}
                    </button>

                    <button type="button" (click)="toggleWorkerCard(worker.id)" class="rounded-full p-1 text-text-sub-light transition hover:bg-black/5 dark:text-text-sub-dark dark:hover:bg-white/10">
                      <span class="material-icons-round text-[18px]">
                        {{ expandedWorkerId() === worker.id ? 'expand_less' : 'chevron_right' }}
                      </span>
                    </button>
                  </div>
                </div>

                @if (expandedWorkerId() === worker.id) {
                  <div class="mt-3 border-t border-border-light pt-3 dark:border-border-dark">
                    <p class="mb-2 text-center text-[11px] font-semibold uppercase tracking-[0.09em] text-text-sub-light dark:text-text-sub-dark">Module Access</p>
                    <div class="flex flex-wrap justify-center gap-2">
                      @for (module of moduleOptions; track module) {
                        <button
                          type="button"
                          (click)="toggleWorkerModule(worker, module)"
                          class="rounded-full border px-3 py-1.5 text-xs font-semibold transition"
                          [ngClass]="worker.allowedModules.includes(module)
                            ? 'border-primary bg-primary/12 text-primary'
                            : 'border-border-light text-text-sub-light hover:border-primary/50 hover:text-primary dark:border-border-dark dark:text-text-sub-dark'">
                          {{ module | titlecase }}
                        </button>
                      }
                    </div>
                  </div>
                }
              </article>
            }
          </div>
        </article>
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
  readonly showAllWorkers = signal(false);

  readonly moduleOptions: WorkerModule[] = ['inwarding', 'production', 'packing', 'dispatch'];
  readonly roleOptions: UserRole[] = [
    UserRole.InwardingStaff,
    UserRole.ProductionOperator,
    UserRole.PackingStaff,
    UserRole.DispatchStaff,
    UserRole.FactorySupervisor,
  ];

  readonly selectedModules = signal<WorkerModule[]>(['inwarding']);

  readonly activeWorkerCount = computed(() => this.workers().filter((worker) => worker.active).length);

  readonly visibleWorkers = computed(() => {
    const ordered = [...this.workers()].sort((a, b) => {
      if (a.active !== b.active) {
        return a.active ? -1 : 1;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return this.showAllWorkers() ? ordered : ordered.slice(0, 6);
  });

  readonly credentialForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    phone: ['', [Validators.required, Validators.pattern('^[0-9]{10}$')]],
    pin: ['', [Validators.required, Validators.pattern('^[0-9]{6}$')]],
    role: [UserRole.InwardingStaff, Validators.required],
  });

  onRoleChanged(): void {
    const role = this.credentialForm.controls.role.value;
    this.selectedModules.set(this.defaultModulesForRole(role));
  }

  onPhoneInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 10);
    this.credentialForm.controls.phone.setValue(digits, { emitEvent: false });
  }

  onPinInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 6);
    this.credentialForm.controls.pin.setValue(digits, { emitEvent: false });
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
    const created = this.operations.createWorkerCredential({
      name: values.name.trim(),
      phone: values.phone,
      pin: values.pin,
      role: values.role,
      allowedModules: this.selectedModules(),
    });

    const granted = created.allowedModules.map((module) => this.prettyModule(module)).join(', ');
    this.setStatus(`Credential created for ${created.name}. Access: ${granted}.`, 'success');

    this.credentialForm.reset({
      name: '',
      phone: '',
      pin: '',
      role: UserRole.InwardingStaff,
    });
    this.selectedModules.set(['inwarding']);
    this.expandedWorkerId.set(created.id);
  }

  toggleWorkerCard(workerId: string): void {
    this.expandedWorkerId.update((current) => (current === workerId ? null : workerId));
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

  toggleShowAllWorkers(): void {
    this.showAllWorkers.update((state) => !state);
  }

  workerInitials(name: string): string {
    return name
      .split(' ')
      .filter((part) => part.length > 0)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'WK';
  }

  formatRole(role: string): string {
    return role.replaceAll('_', ' ');
  }

  private setStatus(message: string, kind: 'success' | 'error'): void {
    this.statusKind.set(kind);
    this.statusMessage.set(message);
  }

  private defaultModulesForRole(role: UserRole): WorkerModule[] {
    switch (role) {
      case UserRole.InwardingStaff:
        return ['inwarding'];
      case UserRole.ProductionOperator:
        return ['production'];
      case UserRole.PackingStaff:
        return ['packing'];
      case UserRole.DispatchStaff:
        return ['dispatch'];
      case UserRole.FactorySupervisor:
      case UserRole.TenantAdmin:
      case UserRole.PlatformAdmin:
        return ['inwarding', 'production', 'packing', 'dispatch'];
      default:
        return ['inwarding'];
    }
  }

  private prettyModule(module: WorkerModule): string {
    return module.charAt(0).toUpperCase() + module.slice(1);
  }
}
