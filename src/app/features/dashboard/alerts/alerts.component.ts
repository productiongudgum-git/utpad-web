import { Component, OnInit, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AlertsService } from './alerts.service';
import { Alert } from '../../../shared/models/manufacturing.models';

@Component({
  selector: 'app-alerts',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="p-6">
      <!-- Header with badge counts -->
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <h2 class="text-2xl font-bold text-gray-900">Alerts</h2>
          @if (alertsService.criticalCount() > 0) {
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
              {{ alertsService.criticalCount() }} Critical
            </span>
          }
          @if (alertsService.warningCount() > 0) {
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
              {{ alertsService.warningCount() }} Warning
            </span>
          }
        </div>
        <span class="text-sm text-gray-500">{{ alertsService.totalUnresolved() }} unresolved</span>
      </div>

      @if (alertsService.alerts().length === 0) {
        <div class="text-center py-12 text-gray-500">
          <p class="text-lg font-medium">No active alerts</p>
          <p class="text-sm mt-1 text-gray-400">All systems normal</p>
        </div>
      }

      <!-- Critical group -->
      @if (criticalAlerts().length > 0) {
        <div class="mb-6">
          <h3 class="text-sm font-bold uppercase tracking-widest text-red-600 mb-3 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
            Critical
          </h3>
          <div class="space-y-3">
            @for (alert of criticalAlerts(); track alert.id) {
              <div [class]="alertCardClass(alert)" class="rounded-lg p-4 border flex items-start justify-between gap-4">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <span [class]="severityBadgeClass(alert.severity)"
                          class="text-xs font-semibold px-2 py-0.5 rounded-full uppercase">
                      {{ alert.severity }}
                    </span>
                    <span class="text-xs text-gray-500 font-mono">{{ alert.type }}</span>
                  </div>
                  <p class="text-sm font-medium text-gray-900">{{ alert.message }}</p>
                  <p class="text-xs text-gray-400 mt-1">{{ alert.created_at | date:'medium' }}</p>
                </div>
                <button (click)="resolve(alert.id)"
                  class="shrink-0 text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-200 hover:border-blue-400 px-3 py-1.5 rounded-md transition-colors">
                  Resolve
                </button>
              </div>
            }
          </div>
        </div>
      }

      <!-- Warning group -->
      @if (warningAlerts().length > 0) {
        <div class="mb-6">
          <h3 class="text-sm font-bold uppercase tracking-widest text-amber-600 mb-3 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
            Warning
          </h3>
          <div class="space-y-3">
            @for (alert of warningAlerts(); track alert.id) {
              <div [class]="alertCardClass(alert)" class="rounded-lg p-4 border flex items-start justify-between gap-4">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <span [class]="severityBadgeClass(alert.severity)"
                          class="text-xs font-semibold px-2 py-0.5 rounded-full uppercase">
                      {{ alert.severity }}
                    </span>
                    <span class="text-xs text-gray-500 font-mono">{{ alert.type }}</span>
                  </div>
                  <p class="text-sm font-medium text-gray-900">{{ alert.message }}</p>
                  <p class="text-xs text-gray-400 mt-1">{{ alert.created_at | date:'medium' }}</p>
                </div>
                <button (click)="resolve(alert.id)"
                  class="shrink-0 text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-200 hover:border-blue-400 px-3 py-1.5 rounded-md transition-colors">
                  Resolve
                </button>
              </div>
            }
          </div>
        </div>
      }

      <!-- Info group -->
      @if (infoAlerts().length > 0) {
        <div class="mb-6">
          <h3 class="text-sm font-bold uppercase tracking-widest text-blue-600 mb-3 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
            Info
          </h3>
          <div class="space-y-3">
            @for (alert of infoAlerts(); track alert.id) {
              <div [class]="alertCardClass(alert)" class="rounded-lg p-4 border flex items-start justify-between gap-4">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <span [class]="severityBadgeClass(alert.severity)"
                          class="text-xs font-semibold px-2 py-0.5 rounded-full uppercase">
                      {{ alert.severity }}
                    </span>
                    <span class="text-xs text-gray-500 font-mono">{{ alert.type }}</span>
                  </div>
                  <p class="text-sm font-medium text-gray-900">{{ alert.message }}</p>
                  <p class="text-xs text-gray-400 mt-1">{{ alert.created_at | date:'medium' }}</p>
                </div>
                <button (click)="resolve(alert.id)"
                  class="shrink-0 text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-200 hover:border-blue-400 px-3 py-1.5 rounded-md transition-colors">
                  Resolve
                </button>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class AlertsComponent implements OnInit {
  alertsService = inject(AlertsService);

  readonly criticalAlerts = computed(() =>
    this.alertsService.alerts().filter(a => a.severity === 'critical')
  );
  readonly warningAlerts = computed(() =>
    this.alertsService.alerts().filter(a => a.severity === 'warning')
  );
  readonly infoAlerts = computed(() =>
    this.alertsService.alerts().filter(a => a.severity === 'info')
  );

  ngOnInit(): void {
    this.alertsService.loadUnresolved();
    this.alertsService.subscribeRealtime();
  }

  async resolve(id: string): Promise<void> {
    await this.alertsService.resolveAlert(id);
  }

  alertCardClass(alert: Alert): string {
    switch (alert.severity) {
      case 'critical': return 'bg-red-50 border-red-200';
      case 'warning':  return 'bg-amber-50 border-amber-200';
      default:         return 'bg-blue-50 border-blue-200';
    }
  }

  severityBadgeClass(severity: string): string {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-700';
      case 'warning':  return 'bg-amber-100 text-amber-700';
      default:         return 'bg-blue-100 text-blue-700';
    }
  }
}
