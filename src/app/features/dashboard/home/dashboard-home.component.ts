import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { SupabaseService } from '../../../core/supabase.service';

declare const Chart: any;

interface KpiData {
  activeBatches: number;
  totalProductionKg: number;
  dispatchedKg: number;
  lowStockCount: number;
}

interface Activity {
  type: string;
  label: string;
  detail: string;
  time: string;
  icon: string;
  color: string;
}

@Component({
  selector: 'app-dashboard-home',
  standalone: true,
  imports: [CommonModule, DatePipe],
  template: `
    <div style="padding:28px 24px;max-width:1200px;">

      <!-- Header -->
      <div style="margin-bottom:28px;">
        <h1 style="font-family:'Cabin',sans-serif;font-size:26px;font-weight:700;color:#121212;margin:0 0 4px;">Command Center</h1>
        <p style="color:#6B7280;font-size:14px;margin:0;">Overview of your production and supply chain operations.</p>
      </div>

      <!-- KPI Cards -->
      @if (loading()) {
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:28px;">
          @for (i of [1,2,3,4]; track i) {
            <div class="gg-skeleton" style="height:100px;border-radius:12px;"></div>
          }
        </div>
      } @else {
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:28px;">

          <!-- Active Batches -->
          <div style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);border:1px solid #E5E7EB;padding:20px;position:relative;overflow:hidden;">
            <div style="position:absolute;top:16px;right:16px;width:40px;height:40px;background:#dcfce7;border-radius:10px;display:flex;align-items:center;justify-content:center;">
              <span class="material-icons-round" style="color:#01AC51;font-size:22px;">precision_manufacturing</span>
            </div>
            <p style="font-size:12px;color:#6B7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Active Batches</p>
            <p style="font-size:32px;font-weight:700;color:#121212;margin:0 0 6px;font-family:'Cabin',sans-serif;">{{ kpi().activeBatches }}</p>
            <p style="font-size:12px;color:#01AC51;margin:0;display:flex;align-items:center;gap:4px;">
              <span class="material-icons-round" style="font-size:14px;">trending_up</span>
              In production now
            </p>
          </div>

          <!-- Total Production -->
          <div style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);border:1px solid #E5E7EB;padding:20px;position:relative;overflow:hidden;">
            <div style="position:absolute;top:16px;right:16px;width:40px;height:40px;background:#dbeafe;border-radius:10px;display:flex;align-items:center;justify-content:center;">
              <span class="material-icons-round" style="color:#2563eb;font-size:22px;">scale</span>
            </div>
            <p style="font-size:12px;color:#6B7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Total Production</p>
            <p style="font-size:32px;font-weight:700;color:#121212;margin:0 0 6px;font-family:'Cabin',sans-serif;">{{ kpi().totalProductionKg | number:'1.0-0' }}<span style="font-size:16px;font-weight:500;color:#6B7280;"> kg</span></p>
            <p style="font-size:12px;color:#01AC51;margin:0;display:flex;align-items:center;gap:4px;">
              <span class="material-icons-round" style="font-size:14px;">trending_up</span>
              This month
            </p>
          </div>

          <!-- Dispatched -->
          <div style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);border:1px solid #E5E7EB;padding:20px;position:relative;overflow:hidden;">
            <div style="position:absolute;top:16px;right:16px;width:40px;height:40px;background:#fef3c7;border-radius:10px;display:flex;align-items:center;justify-content:center;">
              <span class="material-icons-round" style="color:#d97706;font-size:22px;">local_shipping</span>
            </div>
            <p style="font-size:12px;color:#6B7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Dispatched</p>
            <p style="font-size:32px;font-weight:700;color:#121212;margin:0 0 6px;font-family:'Cabin',sans-serif;">{{ kpi().dispatchedKg | number:'1.0-0' }}<span style="font-size:16px;font-weight:500;color:#6B7280;"> kg</span></p>
            <p style="font-size:12px;color:#6B7280;margin:0;">Total dispatched</p>
          </div>

          <!-- Low Stock -->
          <div style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);border:1px solid #E5E7EB;padding:20px;position:relative;overflow:hidden;">
            <div style="position:absolute;top:16px;right:16px;width:40px;height:40px;background:#fee2e2;border-radius:10px;display:flex;align-items:center;justify-content:center;">
              <span class="material-icons-round" style="color:#FF2828;font-size:22px;">warning</span>
            </div>
            <p style="font-size:12px;color:#6B7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Low Stock Alerts</p>
            <p style="font-size:32px;font-weight:700;color:#121212;margin:0 0 6px;font-family:'Cabin',sans-serif;">{{ kpi().lowStockCount }}</p>
            <p style="font-size:12px;color:#FF2828;margin:0;display:flex;align-items:center;gap:4px;">
              <span class="material-icons-round" style="font-size:14px;">trending_down</span>
              Needs attention
            </p>
          </div>
        </div>
      }

      <!-- Charts + Activity row -->
      <div style="display:grid;grid-template-columns:1fr 340px;gap:20px;" class="chart-grid">

        <!-- Production Trend -->
        <div style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);border:1px solid #E5E7EB;padding:24px;">
          <h3 style="font-family:'Cabin',sans-serif;font-size:15px;font-weight:600;color:#121212;margin:0 0 20px;">Production Trend (30 Days)</h3>
          @if (loading()) {
            <div class="gg-skeleton" style="height:220px;border-radius:8px;"></div>
          } @else {
            <canvas id="productionChart" style="max-height:240px;"></canvas>
          }
        </div>

        <!-- Recent Activity -->
        <div style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);border:1px solid #E5E7EB;padding:24px;">
          <h3 style="font-family:'Cabin',sans-serif;font-size:15px;font-weight:600;color:#121212;margin:0 0 16px;">Recent Activity</h3>

          @if (activities().length === 0 && !loading()) {
            <div style="text-align:center;padding:32px 0;color:#9CA3AF;font-size:14px;">
              <span class="material-icons-round" style="font-size:36px;display:block;margin-bottom:8px;">inbox</span>
              No recent activity
            </div>
          }

          <div style="display:flex;flex-direction:column;gap:12px;">
            @for (act of activities(); track act.time + act.label) {
              <div style="display:flex;align-items:flex-start;gap:10px;">
                <div [style.background]="act.color + '22'" style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:flex-start;flex-shrink:0;align-items:center;justify-content:center;">
                  <span class="material-icons-round" [style.color]="act.color" style="font-size:16px;">{{ act.icon }}</span>
                </div>
                <div style="flex:1;min-width:0;">
                  <p style="font-size:13px;font-weight:600;color:#121212;margin:0 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ act.label }}</p>
                  <p style="font-size:12px;color:#6B7280;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ act.detail }}</p>
                </div>
                <p style="font-size:11px;color:#9CA3AF;white-space:nowrap;flex-shrink:0;margin:0;padding-top:2px;">{{ act.time }}</p>
              </div>
            }
          </div>
        </div>
      </div>
    </div>

    <style>
      @media (max-width: 900px) {
        .chart-grid { grid-template-columns: 1fr !important; }
      }
    </style>
  `,
})
export class DashboardHomeComponent implements OnInit, OnDestroy {
  private readonly supabase = inject(SupabaseService);

  loading = signal(true);
  kpi = signal<KpiData>({ activeBatches: 0, totalProductionKg: 0, dispatchedKg: 0, lowStockCount: 0 });
  activities = signal<Activity[]>([]);
  chartDays: string[] = [];
  chartData: number[] = [];

  private chartInstance: any = null;

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  ngOnDestroy(): void {
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);
    try {
      const [batchRes, prodRes, dispRes, stockRes, actRes, trendRes] = await Promise.all([
        // Active batches
        this.supabase.client.from('gg_batches').select('id', { count: 'exact', head: true })
          .in('status', ['production', 'packing', 'dispatch']),
        // Total production kg
        this.supabase.client.from('gg_production').select('actual_output_kg'),
        // Total dispatched kg
        this.supabase.client.from('gg_dispatch').select('quantity_dispatched'),
        // Low stock
        this.supabase.client.from('gg_ingredients').select('id, current_stock, reorder_point'),
        // Recent activity (batches, production, dispatch)
        this.supabase.client.from('gg_batches')
          .select('batch_code, status, created_at, gg_flavors(name)')
          .order('created_at', { ascending: false }).limit(10),
        // 30-day trend
        this.supabase.client.from('gg_production')
          .select('manufacturing_date, actual_output_kg')
          .gte('manufacturing_date', this.daysAgo(30))
          .order('manufacturing_date', { ascending: true }),
      ]);

      const totalProd = (prodRes.data ?? []).reduce((s: number, r: any) => s + (r.actual_output_kg ?? 0), 0);
      const totalDisp = (dispRes.data ?? []).reduce((s: number, r: any) => s + (r.quantity_dispatched ?? 0), 0);
      const lowStock = (stockRes.data ?? []).filter((i: any) => (i.current_stock ?? 0) <= (i.reorder_point ?? 0)).length;

      this.kpi.set({
        activeBatches: batchRes.count ?? 0,
        totalProductionKg: totalProd,
        dispatchedKg: totalDisp,
        lowStockCount: lowStock,
      });

      const acts: Activity[] = (actRes.data ?? []).map((b: any) => ({
        type: 'batch',
        label: `Batch ${b.batch_code}`,
        detail: `${(b.gg_flavors as any)?.name ?? 'Unknown'} — ${b.status}`,
        time: this.relTime(b.created_at),
        icon: 'inventory_2',
        color: this.statusColor(b.status),
      }));
      this.activities.set(acts);

      // Build 30-day chart
      const byDay: Record<string, number> = {};
      for (let i = 29; i >= 0; i--) {
        const d = this.daysAgoDate(i);
        byDay[d] = 0;
      }
      (trendRes.data ?? []).forEach((r: any) => {
        const d = (r.manufacturing_date ?? '').substring(0, 10);
        if (d in byDay) byDay[d] += r.actual_output_kg ?? 0;
      });
      this.chartDays = Object.keys(byDay);
      this.chartData = Object.values(byDay);
    } finally {
      this.loading.set(false);
      setTimeout(() => this.renderChart(), 50);
    }
  }

  private renderChart(): void {
    const canvas = document.getElementById('productionChart') as HTMLCanvasElement | null;
    if (!canvas || typeof Chart === 'undefined') return;

    if (this.chartInstance) this.chartInstance.destroy();

    this.chartInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: this.chartDays.map(d => {
          const dt = new Date(d);
          return `${dt.getDate()}/${dt.getMonth() + 1}`;
        }),
        datasets: [{
          label: 'Production (kg)',
          data: this.chartData,
          backgroundColor: 'rgba(1,172,81,0.7)',
          borderColor: '#01AC51',
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx: any) => `${ctx.parsed.y.toFixed(1)} kg`,
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, maxTicksLimit: 10 } },
          y: { grid: { color: '#f0f0f0' }, ticks: { font: { size: 11 } } },
        },
      },
    });
  }

  private daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().substring(0, 10);
  }

  private daysAgoDate(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().substring(0, 10);
  }

  private relTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  private statusColor(status: string): string {
    const map: Record<string, string> = {
      production: '#2563eb', packing: '#d97706',
      dispatch: '#01AC51', completed: '#6B7280',
    };
    return map[status] ?? '#6B7280';
  }
}
