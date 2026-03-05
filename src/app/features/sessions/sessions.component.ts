import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OperationsLiveService } from '../../core/services/operations-live.service';

@Component({
  selector: 'app-sessions',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="p-4 md:p-6 space-y-6">
      <header class="bg-surface-light dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark p-5">
        <h1 class="text-2xl font-bold text-text-main-light dark:text-text-main-dark">Worker Session Monitor</h1>
        <p class="text-sm text-text-sub-light dark:text-text-sub-dark mt-1">
          Live session posture for all workers based on latest activity and access status.
        </p>
      </header>

      <article class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden">
        <div class="px-4 py-3 border-b border-border-light dark:border-border-dark">
          <h2 class="text-lg font-semibold text-text-main-light dark:text-text-main-dark">Active Session Table</h2>
        </div>

        <div class="divide-y divide-border-light dark:divide-border-dark">
          @if (sessions().length === 0) {
            <div class="px-4 py-8 text-center text-sm text-text-sub-light dark:text-text-sub-dark">No worker activity has been recorded yet.</div>
          }
          @for (session of sessions(); track session.workerId) {
            <div class="px-4 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <p class="font-semibold text-text-main-light dark:text-text-main-dark">{{ session.workerName }}</p>
                <p class="text-xs text-text-sub-light dark:text-text-sub-dark">
                  {{ session.role.replaceAll('_', ' ') }} · Last module: {{ session.lastModule === 'none' ? 'No activity' : (session.lastModule | titlecase) }}
                </p>
                <p class="text-xs text-text-sub-light dark:text-text-sub-dark">Last active: {{ relativeTime(session.lastActiveAt) }}</p>
              </div>

              <div class="flex items-center gap-3">
                <span
                  class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
                  [ngClass]="session.online ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'">
                  <span class="w-1.5 h-1.5 rounded-full mr-1.5" [ngClass]="session.online ? 'bg-green-500' : 'bg-gray-400'"></span>
                  {{ session.online ? 'Online' : 'Offline' }}
                </span>

                <button
                  type="button"
                  class="px-3 py-1.5 rounded-lg border border-border-light dark:border-border-dark text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
                  (click)="toggleAccess(session.workerId, !session.online)">
                  {{ session.online ? 'Revoke' : 'Enable' }} Access
                </button>
              </div>
            </div>
          }
        </div>
      </article>
    </section>
  `,
})
export class SessionsComponent {
  private readonly operations = inject(OperationsLiveService);

  readonly sessions = this.operations.sessions;

  toggleAccess(workerId: string, enable: boolean): void {
    this.operations.setWorkerActive(workerId, enable);
  }

  relativeTime(timestamp: string): string {
    const eventTime = new Date(timestamp).getTime();
    const diffMs = Date.now() - eventTime;
    if (diffMs < 60_000) {
      return 'just now';
    }
    if (diffMs < 3_600_000) {
      return `${Math.floor(diffMs / 60_000)} min ago`;
    }
    if (diffMs < 86_400_000) {
      return `${Math.floor(diffMs / 3_600_000)} h ago`;
    }
    return new Date(timestamp).toLocaleDateString();
  }
}
