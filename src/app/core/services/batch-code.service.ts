import { Injectable, signal } from '@angular/core';

interface BatchCodeResponse {
  batchCode: string;
  date: string;
}

@Injectable({ providedIn: 'root' })
export class BatchCodeService {
  private readonly apiUrl = 'https://utpad-ops-api-seven.vercel.app/api/v1/ops/batch-code/today';

  readonly batchCode = signal<string | null>(null);
  readonly batchDate = signal<string | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    void this.fetchTodaysBatchCode();
  }

  async fetchTodaysBatchCode(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await fetch(this.apiUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: BatchCodeResponse = await res.json();
      this.batchCode.set(data.batchCode);
      this.batchDate.set(data.date);
    } catch {
      this.error.set('Failed to load batch code');
    } finally {
      this.loading.set(false);
    }
  }
}
