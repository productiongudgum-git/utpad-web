import { Injectable, signal } from '@angular/core';
import { SupabaseService } from '../supabase.service';

interface WorkerRow {
  id: string;
  name: string | null;
  role?: string | null;
  mobile_number?: string | null;
  active?: boolean | null;
}

export interface WorkerDirectoryEntry {
  id: string;
  name: string;
  role: string | null;
  mobileNumber: string | null;
}

@Injectable({ providedIn: 'root' })
export class WorkerDirectoryService {
  private readonly _workers = signal<Record<string, WorkerDirectoryEntry>>({});
  readonly workers = this._workers.asReadonly();

  private refreshPromise: Promise<void> | null = null;

  constructor(private readonly supabase: SupabaseService) {}

  async refresh(force = false): Promise<void> {
    if (this.refreshPromise && !force) {
      return this.refreshPromise;
    }

    const request = (async () => {
      const { data, error } = await this.supabase.client
        .from('gg_users')
        .select('id, name, role, mobile_number, active')
        .eq('active', true)
        .order('name');

      if (error || !data) {
        return;
      }

      const nextMap = (data as WorkerRow[]).reduce<Record<string, WorkerDirectoryEntry>>((acc, row) => {
        if (!row.id) return acc;
        acc[row.id] = {
          id: row.id,
          name: row.name?.trim() || row.id,
          role: row.role ?? null,
          mobileNumber: row.mobile_number ?? null,
        };
        return acc;
      }, {});

      this._workers.set(nextMap);
    })();

    this.refreshPromise = request.finally(() => {
      if (this.refreshPromise === request) {
        this.refreshPromise = null;
      }
    });

    return this.refreshPromise;
  }
}
