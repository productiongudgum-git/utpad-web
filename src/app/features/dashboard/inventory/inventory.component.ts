import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { SupabaseService } from '../../../core/supabase.service';

interface BatchDetail {
  batchCode: string;
  recipeId: string | null;
  quantityBoxes: number;
}

interface FlavorGroup {
  flavorId: string;
  flavorName: string;
  totalBoxes: number;
  batches: BatchDetail[];
}

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, DecimalPipe],
  template: `
    <div style="padding:24px;max-width:1000px;">
      <div style="margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="font-family:'Cabin',sans-serif;font-size:22px;font-weight:700;color:#121212;margin:0 0 4px;">Inventory</h1>
          <p style="color:#6B7280;font-size:14px;margin:0;">Boxes by flavor across all production batches. Click a row to expand batch details.</p>
        </div>
        <button (click)="loadData()" style="padding:8px 16px;background:#f3f4f6;border:1px solid #E5E7EB;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:6px;color:#374151;">
          <span class="material-icons-round" style="font-size:16px;">refresh</span>
          Refresh
        </button>
      </div>

      @if (loading()) {
        <div style="display:flex;flex-direction:column;gap:10px;">
          @for (i of [1,2,3,4,5]; track i) {
            <div class="gg-skeleton" style="height:56px;border-radius:10px;"></div>
          }
        </div>
      } @else if (flavors().length === 0) {
        <div style="text-align:center;padding:60px 0;color:#9CA3AF;">
          <span class="material-icons-round" style="font-size:48px;display:block;margin-bottom:12px;">inventory_2</span>
          <p style="font-size:15px;margin:0;">No production batch data found.</p>
        </div>
      } @else {
        <div style="background:#fff;border-radius:12px;border:1px solid #E5E7EB;overflow:hidden;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#f8f9fa;border-bottom:1px solid #E5E7EB;">
                <th style="text-align:left;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;width:40px;"></th>
                <th style="text-align:left;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">Flavor Name</th>
                <th style="text-align:right;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">Total Boxes</th>
              </tr>
            </thead>
            <tbody>
              @for (fg of flavors(); track fg.flavorId) {
                <!-- Flavor row -->
                <tr style="border-bottom:1px solid #f3f4f6;cursor:pointer;transition:background 0.1s;"
                    [style.background]="expandedFlavorId() === fg.flavorId ? '#f0fdf4' : '#fff'"
                    (click)="toggleExpand(fg.flavorId)">
                  <td style="padding:12px 16px;text-align:center;">
                    <span class="material-icons-round" style="font-size:16px;color:#6B7280;transition:transform 0.2s;"
                          [style.transform]="expandedFlavorId() === fg.flavorId ? 'rotate(90deg)' : 'rotate(0deg)'">
                      chevron_right
                    </span>
                  </td>
                  <td style="padding:12px 16px;">
                    <div style="display:flex;align-items:center;gap:10px;">
                      <div style="width:32px;height:32px;border-radius:8px;background:#dcfce7;display:flex;align-items:center;justify-content:center;">
                        <span class="material-icons-round" style="color:#15803d;font-size:16px;">local_dining</span>
                      </div>
                      <span style="font-size:14px;font-weight:600;color:#121212;">{{ fg.flavorName }}</span>
                    </div>
                  </td>
                  <td style="padding:12px 16px;text-align:right;">
                    <span style="font-size:14px;font-weight:700;color:#01AC51;">{{ fg.totalBoxes | number:'1.0-0' }}</span>
                  </td>
                </tr>

                <!-- Expanded batch detail rows -->
                @if (expandedFlavorId() === fg.flavorId) {
                  <tr>
                    <td colspan="3" style="padding:0;background:#f8f9fa;border-bottom:1px solid #E5E7EB;">
                      <div style="padding:0 16px 12px 60px;">
                        <table style="width:100%;border-collapse:collapse;margin-top:8px;">
                          <thead>
                            <tr style="border-bottom:1px solid #E5E7EB;">
                              <th style="text-align:left;padding:6px 12px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;">Recipe ID</th>
                              <th style="text-align:left;padding:6px 12px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;">Batch Code</th>
                              <th style="text-align:right;padding:6px 12px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;">Quantity (boxes)</th>
                            </tr>
                          </thead>
                          <tbody>
                            @for (b of fg.batches; track b.batchCode) {
                              <tr style="border-bottom:1px solid #f3f4f6;">
                                <td style="padding:8px 12px;font-size:12px;color:#6B7280;font-family:monospace;">{{ b.recipeId ?? '—' }}</td>
                                <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#374151;font-family:monospace;">{{ b.batchCode }}</td>
                                <td style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600;color:#374151;">{{ b.quantityBoxes | number:'1.0-0' }}</td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>

        <!-- Summary -->
        <div style="margin-top:16px;display:flex;align-items:center;gap:8px;font-size:13px;color:#6B7280;">
          <span class="material-icons-round" style="font-size:15px;">info_outline</span>
          {{ flavors().length }} flavor{{ flavors().length === 1 ? '' : 's' }} · {{ grandTotal() | number:'1.0-0' }} total boxes
        </div>
      }
    </div>
  `,
})
export class InventoryComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);

  loading = signal(true);
  flavors = signal<FlavorGroup[]>([]);
  expandedFlavorId = signal<string | null>(null);

  readonly grandTotal = computed(() =>
    this.flavors().reduce((s, fg) => s + fg.totalBoxes, 0)
  );

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  toggleExpand(flavorId: string): void {
    this.expandedFlavorId.update(id => (id === flavorId ? null : flavorId));
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    const { data } = await this.supabase.client
      .from('production_batches')
      .select('batch_code, recipe_id, planned_yield, flavor:gg_flavors!production_batches_flavor_id_fkey(id, name)')
      .order('batch_code', { ascending: true });

    const groupMap = new Map<string, FlavorGroup>();
    for (const row of (data ?? []) as any[]) {
      const flavor = Array.isArray(row.flavor) ? row.flavor[0] : row.flavor;
      const flavorId: string = flavor?.id ?? 'unknown';
      const flavorName: string = flavor?.name ?? 'Unknown';
      const plannedYield: number = row.planned_yield ?? 0;
      const quantityBoxes = plannedYield >= 10000 ? 667 : 500;

      if (!groupMap.has(flavorId)) {
        groupMap.set(flavorId, { flavorId, flavorName, totalBoxes: 0, batches: [] });
      }
      const group = groupMap.get(flavorId)!;
      group.totalBoxes += quantityBoxes;
      group.batches.push({
        batchCode: row.batch_code ?? '—',
        recipeId: row.recipe_id ?? null,
        quantityBoxes,
      });
    }

    // Sort by flavor name, batches by batch code desc
    const sorted = Array.from(groupMap.values()).sort((a, b) => a.flavorName.localeCompare(b.flavorName));
    sorted.forEach(fg => fg.batches.sort((a, b) => b.batchCode.localeCompare(a.batchCode)));
    this.flavors.set(sorted);
    this.loading.set(false);
  }
}
