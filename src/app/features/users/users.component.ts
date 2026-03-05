import { Component, inject, signal } from '@angular/core';
import { CommonModule, TitleCasePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { UserRole } from '../../shared/models/auth.models';
import { OperationsLiveService, WorkerModule } from '../../core/services/operations-live.service';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TitleCasePipe],
  template: `
    <section class="p-4 md:p-6 space-y-6">
      <header class="bg-surface-light dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark p-5">
        <h1 class="text-2xl font-bold text-text-main-light dark:text-text-main-dark">Worker Credential & Access Management</h1>
        <p class="text-sm text-text-sub-light dark:text-text-sub-dark mt-1">
          Create worker credentials and grant module-level access controls from this admin panel.
        </p>
      </header>

      <article class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-4 md:p-5">
        <h2 class="text-lg font-semibold text-text-main-light dark:text-text-main-dark">Create Worker Credential</h2>
        <form [formGroup]="credentialForm" (ngSubmit)="createCredential()" class="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <input formControlName="name" type="text" placeholder="Worker name"
                 class="rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-800 text-sm text-text-main-light dark:text-text-main-dark">
          <input formControlName="phone" type="text" placeholder="Phone (10 digits)"
                 class="rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-800 text-sm text-text-main-light dark:text-text-main-dark">
          <input formControlName="pin" type="text" placeholder="PIN (6 digits)"
                 class="rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-800 text-sm text-text-main-light dark:text-text-main-dark">
          <select formControlName="role" (change)="onRoleChanged()"
                  class="rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-800 text-sm text-text-main-light dark:text-text-main-dark">
            @for (role of roleOptions; track role) {
              <option [value]="role">{{ formatRole(role) }}</option>
            }
          </select>

          <div class="md:col-span-2 xl:col-span-3">
            <p class="text-xs uppercase tracking-wider text-text-sub-light dark:text-text-sub-dark mb-2">Feature Access</p>
            <div class="flex flex-wrap gap-2">
              @for (module of moduleOptions; track module) {
                <label class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border-light dark:border-border-dark text-sm">
                  <input
                    type="checkbox"
                    [checked]="selectedModules().includes(module)"
                    (change)="onCreateAccessToggle(module, $event)">
                  <span>{{ module | titlecase }}</span>
                </label>
              }
            </div>
          </div>

          <div class="xl:col-span-1 flex items-end">
            <button type="submit"
                    class="w-full rounded-lg bg-primary text-white py-2.5 font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50"
                    [disabled]="credentialForm.invalid || selectedModules().length === 0">
              Create Credential
            </button>
          </div>
        </form>

        @if (statusMessage()) {
          <div class="mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300">
            {{ statusMessage() }}
          </div>
        }
      </article>

      <article class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden">
        <div class="px-4 py-3 border-b border-border-light dark:border-border-dark">
          <h2 class="text-lg font-semibold text-text-main-light dark:text-text-main-dark">Workers</h2>
        </div>

        <div class="divide-y divide-border-light dark:divide-border-dark">
          @for (worker of workers(); track worker.id) {
            <div class="p-4 space-y-3">
              <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <p class="font-semibold text-text-main-light dark:text-text-main-dark">{{ worker.name }}</p>
                  <p class="text-xs text-text-sub-light dark:text-text-sub-dark">
                    {{ formatRole(worker.role) }} | {{ worker.phone }} | PIN {{ worker.pin }}
                  </p>
                </div>

                <label class="inline-flex items-center gap-2 text-sm text-text-main-light dark:text-text-main-dark">
                  <input type="checkbox" [checked]="worker.active" (change)="onActiveToggle(worker.id, $event)">
                  Active
                </label>
              </div>

              <div>
                <p class="text-xs uppercase tracking-wider text-text-sub-light dark:text-text-sub-dark mb-2">Granted Modules</p>
                <div class="flex flex-wrap gap-2">
                  @for (module of moduleOptions; track module) {
                    <label
                      class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm"
                      [ngClass]="worker.allowedModules.includes(module) ? 'border-primary text-primary bg-primary/10' : 'border-border-light dark:border-border-dark'">
                      <input
                        type="checkbox"
                        [checked]="worker.allowedModules.includes(module)"
                        (change)="onWorkerAccessToggle(worker.id, module, $event)">
                      {{ module | titlecase }}
                    </label>
                  }
                </div>
              </div>
            </div>
          }
        </div>
      </article>
    </section>
  `,
})
export class UsersComponent {
  private readonly fb = inject(FormBuilder);
  private readonly operations = inject(OperationsLiveService);

  readonly workers = this.operations.workers;
  readonly statusMessage = signal('');
  readonly moduleOptions: WorkerModule[] = ['inwarding', 'production', 'packing', 'dispatch'];
  readonly roleOptions: UserRole[] = [
    UserRole.InwardingStaff,
    UserRole.ProductionOperator,
    UserRole.PackingStaff,
    UserRole.DispatchStaff,
    UserRole.FactorySupervisor,
  ];

  readonly selectedModules = signal<WorkerModule[]>(['inwarding']);

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

  onCreateAccessToggle(module: WorkerModule, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedModules.update((modules) =>
      checked
        ? Array.from(new Set([...modules, module]))
        : modules.filter((item) => item !== module),
    );
  }

  createCredential(): void {
    if (this.credentialForm.invalid || this.selectedModules().length === 0) {
      return;
    }

    const values = this.credentialForm.getRawValue();
    const created = this.operations.createWorkerCredential({
      name: values.name,
      phone: values.phone,
      pin: values.pin,
      role: values.role,
      allowedModules: this.selectedModules(),
    });

    const granted = created.allowedModules.map((module) => this.prettyModule(module)).join(', ');
    this.statusMessage.set(`Credential created for ${created.name}. Access granted to ${granted}.`);

    this.credentialForm.reset({
      name: '',
      phone: '',
      pin: '',
      role: UserRole.InwardingStaff,
    });
    this.selectedModules.set(['inwarding']);
  }

  onWorkerAccessToggle(workerId: string, module: WorkerModule, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const worker = this.workers().find((item) => item.id === workerId);
    if (!worker) {
      return;
    }

    const nextModules = checked
      ? Array.from(new Set([...worker.allowedModules, module]))
      : worker.allowedModules.filter((item) => item !== module);

    this.operations.updateWorkerAccess(workerId, nextModules);
  }

  onActiveToggle(workerId: string, event: Event): void {
    const active = (event.target as HTMLInputElement).checked;
    this.operations.setWorkerActive(workerId, active);
  }

  formatRole(role: UserRole): string {
    return role.replaceAll('_', ' ');
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
