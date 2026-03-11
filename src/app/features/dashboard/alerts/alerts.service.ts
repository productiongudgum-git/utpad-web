import { Injectable, inject, signal, computed } from '@angular/core';
import { Alert } from '../../../shared/models/manufacturing.models';
import { SupabaseService } from '../../../core/supabase.service';

@Injectable({ providedIn: 'root' })
export class AlertsService {
  private supabase = inject(SupabaseService);

  private readonly _alerts = signal<Alert[]>([]);
  readonly alerts = this._alerts.asReadonly();

  readonly criticalCount = computed(() =>
    this._alerts().filter(a => a.severity === 'critical').length
  );
  readonly warningCount = computed(() =>
    this._alerts().filter(a => a.severity === 'warning').length
  );
  readonly totalUnresolved = computed(() => this._alerts().length);

  async loadUnresolved(): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('alerts')
      .select('*')
      .eq('resolved', false)
      .order('severity', { ascending: false })
      .order('created_at', { ascending: false });
    if (!error && data) this._alerts.set(data as Alert[]);
  }

  async resolveAlert(id: string): Promise<void> {
    await this.supabase.client
      .from('alerts')
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq('id', id);
    this._alerts.update(alerts => alerts.filter(a => a.id !== id));
  }

  subscribeRealtime(): void {
    this.supabase.client
      .channel('alerts-realtime')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alerts' },
        (payload: any) => {
          const newAlert = payload.new as Alert;
          this._alerts.update(alerts => [newAlert, ...alerts]);
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'alerts' },
        () => this.loadUnresolved()
      )
      .subscribe();
  }
}
