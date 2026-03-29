import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { SupabaseService } from '../../../core/supabase.service';

interface KpiData {
  activeBatches: number;
  totalProductionKg: number;
  dispatchedKg: number;
  lowStockCount: number;
}

interface Activity {
  type: 'production' | 'packing' | 'dispatch';
  label: string;
  detail: string;
  time: string;
  created_at: string;
  icon: string;
  color: string;
}

interface TrendDay {
  date: string;
  label: string;
  value: number;
}

@Component({
  selector: 'app-dashboard-home',
  standalone: true,
  imports: [CommonModule, DatePipe, DecimalPipe],
  template: `
    <div style="padding:28px 24px;max-width:1200px;">

      <!-- Header -->
      <div style="margin-bottom:28px;">
        <h1 class="font-display" style="font-size:26px;font-weight:700;color:var(--foreground);margin:0 0 4px;">Command Center</h1>
        <p class="text-muted" style="font-size:14px;margin:0;">Overview of your production and supply chain operations.</p>
      </div>

      <!-- KPI Cards -->
      @if (loading()) {
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:28px;">
          @for (i of [1,2,3,4]; track i) {
            <div class="skeleton" style="height:120px;border-radius:12px;"></div>
          }
        </div>
      } @else {
        <div class="kpi-grid" style="display:grid;gap:16px;margin-bottom:28px;">

          <!-- Active Batches -->
          <div class="beautiful-card" style="padding:20px;position:relative;overflow:hidden;">
            <div style="position:absolute;top:16px;right:16px;width:44px;height:44px;background:#dbeafe;border-radius:12px;display:flex;align-items:center;justify-content:center;">
              <span class="material-icons-round" style="color:#2563eb;font-size:22px;">precision_manufacturing</span>
            </div>
            <p style="font-size:12px;color:var(--muted-fg);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Active Batches</p>
            <p class="font-display" style="font-size:36px;font-weight:700;color:var(--foreground);margin:0 0 6px;">{{ kpi().activeBatches }}</p>
            <p style="font-size:12px;color:#2563eb;margin:0;display:flex;align-items:center;gap:4px;">
              <span class="material-icons-round" style="font-size:14px;">trending_up</span>
              In production now
            </p>
          </div>

          <!-- Total Production -->
          <div class="beautiful-card" style="padding:20px;position:relative;overflow:hidden;">
            <div style="position:absolute;top:16px;right:16px;width:44px;height:44px;background:#dcfce7;border-radius:12px;display:flex;align-items:center;justify-content:center;">
              <span class="material-icons-round" style="color:var(--primary);font-size:22px;">scale</span>
            </div>
            <p style="font-size:12px;color:var(--muted-fg);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Total Production</p>
            <p class="font-display" style="font-size:36px;font-weight:700;color:var(--foreground);margin:0 0 6px;">{{ kpi().totalProductionKg | number:'1.0-0' }}<span style="font-size:16px;font-weight:500;color:var(--muted-fg);"> kg</span></p>
            <p style="font-size:12px;color:var(--primary);margin:0;display:flex;align-items:center;gap:4px;">
              <span class="material-icons-round" style="font-size:14px;">trending_up</span>
              All time
            </p>
          </div>

          <!-- Dispatched -->
          <div class="beautiful-card" style="padding:20px;position:relative;overflow:hidden;">
            <div style="position:absolute;top:16px;right:16px;width:44px;height:44px;background:#f3e8ff;border-radius:12px;display:flex;align-items:center;justify-content:center;">
              <span class="material-icons-round" style="color:#7c3aed;font-size:22px;">local_shipping</span>
            </div>
            <p style="font-size:12px;color:var(--muted-fg);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Dispatched</p>
            <p class="font-display" style="font-size:36px;font-weight:700;color:var(--foreground);margin:0 0 6px;">{{ kpi().dispatchedKg | number:'1.0-0' }}<span style="font-size:16px;font-weight:500;color:var(--muted-fg);"> kg</span></p>
            <p style="font-size:12px;color:#7c3aed;margin:0;display:flex;align-items:center;gap:4px;">
              <span class="material-icons-round" style="font-size:14px;">local_shipping</span>
              Total dispatched
            </p>
          </div>

          <!-- Low Stock Alerts -->
          <div class="beautiful-card" style="padding:20px;position:relative;overflow:hidden;">
            <div style="position:absolute;top:16px;right:16px;width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;"
                 [style.background]="kpi().lowStockCount > 0 ? '#fee2e2' : '#dcfce7'">
              <span class="material-icons-round" style="font-size:22px;"
                    [style.color]="kpi().lowStockCount > 0 ? 'var(--destructive)' : 'var(--primary)'">
                {{ kpi().lowStockCount > 0 ? 'warning' : 'check_circle' }}
              </span>
            </div>
            <p style="font-size:12px;color:var(--muted-fg);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Low Stock Alerts</p>
            <p class="font-display" style="font-size:36px;font-weight:700;color:var(--foreground);margin:0 0 6px;">{{ kpi().lowStockCount }}</p>
            <p style="font-size:12px;margin:0;display:flex;align-items:center;gap:4px;"
               [style.color]="kpi().lowStockCount > 0 ? 'var(--destructive)' : 'var(--primary)'">
              <span class="material-icons-round" style="font-size:14px;">
                {{ kpi().lowStockCount > 0 ? 'trending_down' : 'check' }}
              </span>
              {{ kpi().lowStockCount > 0 ? 'Needs attention' : 'All stocked' }}
            </p>
          </div>
        </div>
      }

      <!-- Charts + Activity row -->
      <div class="chart-grid" style="display:grid;grid-template-columns:1fr 340px;gap:20px;">

        <!-- Production Trend (CSS Bar Chart) -->
        <div class="beautiful-card" style="padding:24px;">
          <h3 class="font-display" style="font-size:15px;font-weight:600;color:var(--foreground);margin:0 0 20px;">Production Trend (30 Days)</h3>
          @if (loading()) {
            <div class="skeleton" style="height:220px;border-radius:8px;"></div>
          } @else {
            <div style="display:flex;flex-direction:column;gap:2px;">
              <!-- Y-axis max label -->
              <div style="display:flex;align-items:center;justify-content:flex-end;margin-bottom:4px;">
                <span style="font-size:11px;color:var(--muted-fg);">Max: {{ maxTrendValue() | number:'1.0-0' }} kg</span>
              </div>

              <!-- Bar chart container -->
              <div style="display:flex;align-items:flex-end;gap:2px;height:200px;border-bottom:1px solid var(--border);padding-bottom:4px;">
                @for (day of trendDays(); track day.date) {
                  <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;position:relative;"
                       class="bar-wrapper">
                    <!-- Tooltip on hover -->
                    <div class="bar-tooltip" style="position:absolute;bottom:100%;left:50%;transform:translateX(-50%);background:#1f2937;color:#fff;padding:4px 8px;border-radius:6px;font-size:11px;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity 0.15s;z-index:10;margin-bottom:4px;">
                      {{ day.label }}: {{ day.value | number:'1.1-1' }} kg
                    </div>
                    <div style="width:100%;border-radius:3px 3px 0 0;min-height:2px;transition:height 0.3s ease;"
                         [style.height.%]="maxTrendValue() > 0 ? (day.value / maxTrendValue()) * 100 : 0"
                         [style.background]="day.value > 0 ? 'rgba(1,172,81,0.75)' : 'rgba(1,172,81,0.15)'">
                    </div>
                  </div>
                }
              </div>

              <!-- X-axis labels (show every 5th day) -->
              <div style="display:flex;gap:2px;margin-top:4px;">
                @for (day of trendDays(); track day.date; let i = $index) {
                  <div style="flex:1;text-align:center;">
                    @if (i % 5 === 0 || i === trendDays().length - 1) {
                      <span style="font-size:9px;color:var(--muted-fg);">{{ day.label }}</span>
                    }
                  </div>
                }
              </div>
            </div>
          }
        </div>

        <!-- Recent Activity -->
        <div class="beautiful-card" style="padding:24px;">
          <h3 class="font-display" style="font-size:15px;font-weight:600;color:var(--foreground);margin:0 0 16px;">Recent Activity</h3>

          @if (activities().length === 0 && !loading()) {
            <div style="text-align:center;padding:32px 0;color:#9CA3AF;font-size:14px;">
              <span class="material-icons-round" style="font-size:36px;display:block;margin-bottom:8px;">inbox</span>
              No recent activity
            </div>
          }

          <div style="display:flex;flex-direction:column;gap:12px;">
            @for (act of activities(); track act.created_at + act.label) {
              <div style="display:flex;align-items:flex-start;gap:10px;">
                <div [style.background]="act.color + '22'" style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                  <span class="material-icons-round" [style.color]="act.color" style="font-size:16px;">{{ act.icon }}</span>
                </div>
                <div style="flex:1;min-width:0;">
                  <p style="font-size:13px;font-weight:600;color:var(--foreground);margin:0 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ act.label }}</p>
                  <p style="font-size:12px;color:var(--muted-fg);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ act.detail }}</p>
                </div>
                <p style="font-size:11px;color:#9CA3AF;white-space:nowrap;flex-shrink:0;margin:0;padding-top:2px;">{{ act.time }}</p>
              </div>
            }
          </div>
        </div>
      </div>
    </div>

    <style>
      .kpi-grid {
        grid-template-columns: repeat(4, 1fr);
      }
      @media (max-width: 1024px) {
        .kpi-grid { grid-template-columns: repeat(2, 1fr); }
      }
      @media (max-width: 600px) {
        .kpi-grid { grid-template-columns: 1fr; }
      }
      @media (max-width: 900px) {
        .chart-grid { grid-template-columns: 1fr !important; }
      }
      .bar-wrapper:hover .bar-tooltip {
        opacity: 1 !important;
      }
    </style>
  `,
})
export class DashboardHomeComponent implements OnInit, OnDestroy {
  private readonly supabase = inject(SupabaseService);

  loading = signal(true);
  kpi = signal<KpiData>({ activeBatches: 0, totalProductionKg: 0, dispatchedKg: 0, lowStockCount: 0 });
  activities = signal<Activity[]>([]);
  trendDays = signal<TrendDay[]>([]);

  maxTrendValue = computed(() => {
    const days = this.trendDays();
    if (days.length === 0) return 0;
    return Math.max(...days.map(d => d.value), 1);
  });

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  ngOnDestroy(): void {
    // No external resources to clean up (CSS chart, no canvas)
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);
    try {
      const thirtyDaysAgo = this.daysAgo(30);

      const [batchRes, prodRes, dispRes, stockRes, prodActivityRes, packActivityRes, dispActivityRes, trendRes] = await Promise.all([
        // Active batches (status != 'completed')
        this.supabase.client.from('production_batches').select('id', { count: 'exact', head: true })
          .in('status', ['production', 'packing', 'dispatch']),
        // Total production kg
        this.supabase.client.from('production_batches').select('actual_yield'),
        // Total dispatched boxes (we'll estimate kg)
        this.supabase.client.from('dispatch_events').select('boxes_dispatched'),
        // Low stock ingredients
        this.supabase.client.from('gg_ingredients').select('id, current_stock, reorder_point'),
        // Recent production activity
        this.supabase.client.from('production_batches')
          .select('id, actual_yield, production_date, created_at, batch_code')
          .order('created_at', { ascending: false }).limit(5),
        // Recent packing activity
        this.supabase.client.from('packing_sessions')
          .select('id, boxes_packed, session_date, created_at, batch_code')
          .order('created_at', { ascending: false }).limit(5),
        // Recent dispatch activity
        this.supabase.client.from('dispatch_events')
          .select('id, boxes_dispatched, dispatch_date, created_at, batch_code')
          .order('created_at', { ascending: false }).limit(5),
        // 30-day production trend
        this.supabase.client.from('production_batches')
          .select('production_date, actual_yield')
          .gte('production_date', thirtyDaysAgo)
          .order('production_date', { ascending: true }),
      ]);

      // KPI calculations
      const totalProd = (prodRes.data ?? []).reduce((s: number, r: any) => s + (r.actual_yield ?? 0), 0);
      const totalDispBoxes = (dispRes.data ?? []).reduce((s: number, r: any) => s + (r.boxes_dispatched ?? 0), 0);
      const totalDispKg = totalDispBoxes * 1.5; // Dummy conversion: 1 box = 1.5kg
      const lowStock = (stockRes.data ?? []).filter((i: any) => (i.current_stock ?? 0) <= (i.reorder_point ?? 0)).length;

      this.kpi.set({
        activeBatches: batchRes.count ?? 0,
        totalProductionKg: totalProd,
        dispatchedKg: totalDispKg,
        lowStockCount: lowStock,
      });

      // Build combined activity feed from production, packing, dispatch - sorted by created_at desc, take 5
      const allActivities: Activity[] = [];

      (prodActivityRes.data ?? []).forEach((r: any) => {
        allActivities.push({
          type: 'production',
          label: `Production logged`,
          detail: `${r.batch_code ?? 'Batch'} — ${r.actual_yield ?? 0} kg output`,
          time: this.relTime(r.created_at),
          created_at: r.created_at,
          icon: 'precision_manufacturing',
          color: '#2563eb',
        });
      });

      (packActivityRes.data ?? []).forEach((r: any) => {
        allActivities.push({
          type: 'packing',
          label: `Packing completed`,
          detail: `${r.batch_code ?? 'Batch'} — ${r.boxes_packed ?? 0} boxes`,
          time: this.relTime(r.created_at),
          created_at: r.created_at,
          icon: 'inventory_2',
          color: '#d97706',
        });
      });

      (dispActivityRes.data ?? []).forEach((r: any) => {
        allActivities.push({
          type: 'dispatch',
          label: `Dispatch sent`,
          detail: `${r.batch_code ?? 'Batch'} — ${r.boxes_dispatched ?? 0} boxes dispatched`,
          time: this.relTime(r.created_at),
          created_at: r.created_at,
          icon: 'local_shipping',
          color: '#7c3aed',
        });
      });

      // Sort by created_at descending and take top 5
      allActivities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      this.activities.set(allActivities.slice(0, 5));

      // Build 30-day trend data
      const byDay: Record<string, number> = {};
      for (let i = 29; i >= 0; i--) {
        const d = this.daysAgoDate(i);
        byDay[d] = 0;
      }
      (trendRes.data ?? []).forEach((r: any) => {
        if (!r.production_date) return;
        const d = r.production_date.substring(0, 10);
        if (d in byDay) byDay[d] += r.actual_yield ?? 0;
      });

      const days: TrendDay[] = Object.entries(byDay).map(([date, value]) => {
        const dt = new Date(date);
        return {
          date,
          label: `${dt.getDate()}/${dt.getMonth() + 1}`,
          value,
        };
      });
      this.trendDays.set(days);
    } finally {
      this.loading.set(false);
    }
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
}
