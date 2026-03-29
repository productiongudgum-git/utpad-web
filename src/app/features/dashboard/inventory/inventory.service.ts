import { Injectable, inject, signal, computed } from '@angular/core';
import { InventoryRawMaterial, InventoryFinishedGoods, InventorySkuSummary } from '../../../shared/models/manufacturing.models';
import { SupabaseService } from '../../../core/supabase.service';

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private supabase = inject(SupabaseService);

  private readonly _rawMaterials = signal<InventoryRawMaterial[]>([]);
  private readonly _finishedGoods = signal<InventoryFinishedGoods[]>([]);
  private readonly _loading = signal(false);

  readonly rawMaterials = this._rawMaterials.asReadonly();
  readonly finishedGoods = this._finishedGoods.asReadonly();
  readonly loading = this._loading.asReadonly();

  readonly rawMaterialsWithStatus = computed(() =>
    this._rawMaterials().map(rm => ({
      ...rm,
      status: (rm.low_stock_threshold != null && rm.current_qty < rm.low_stock_threshold)
        ? 'low' as const
        : 'ok' as const,
    }))
  );

  readonly skuSummaries = computed<InventorySkuSummary[]>(() => {
    const groups = new Map<string, InventoryFinishedGoods[]>();
    for (const fg of this._finishedGoods()) {
      const existing = groups.get(fg.sku_id) ?? [];
      existing.push(fg);
      groups.set(fg.sku_id, existing);
    }
    return Array.from(groups.entries()).map(([skuId, batches]) => {
      const sku = batches[0]?.sku;
      const netAvailable = batches.reduce((s, b) => s + b.boxes_available, 0);
      return {
        sku_id: skuId,
        sku_name: sku?.name ?? skuId,
        sku_code: sku?.code ?? '',
        total_produced: 0, // enriched via production report if needed
        total_packed: batches.reduce((s, b) => s + b.boxes_available + (b.boxes_returned ?? 0), 0),
        total_dispatched: 0,
        total_returned: batches.reduce((s, b) => s + (b.boxes_returned ?? 0), 0),
        net_available: netAvailable,
        batches,
      };
    });
  });

  async loadRawMaterials(): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('inventory_raw_materials')
      .select('*, ingredient:gg_ingredients(id,name,default_unit,active)')
      .order('ingredient_id');
    if (!error && data) this._rawMaterials.set(data as InventoryRawMaterial[]);
  }

  async loadFinishedGoods(): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('inventory_finished_goods')
      .select('*, sku:gg_flavors(id,name,code)')
      .gt('boxes_available', 0)
      .order('sku_id');
    if (!error && data) this._finishedGoods.set(data as InventoryFinishedGoods[]);
  }

  async load(): Promise<void> {
    this._loading.set(true);
    await Promise.all([this.loadRawMaterials(), this.loadFinishedGoods()]);
    this._loading.set(false);
  }

  subscribeRealtime(): void {
    this.supabase.client
      .channel('inventory-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_raw_materials' }, () => this.loadRawMaterials())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_finished_goods' }, () => this.loadFinishedGoods())
      .subscribe();
  }

  async updateLowStockThreshold(ingredientId: string, threshold: number | null): Promise<void> {
    await this.supabase.client
      .from('inventory_raw_materials')
      .update({ low_stock_threshold: threshold })
      .eq('ingredient_id', ingredientId);
    await this.loadRawMaterials();
  }
}
