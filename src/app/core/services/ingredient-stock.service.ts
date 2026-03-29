import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from '../supabase.service';

export interface StockIngredient {
  id: string;
  name: string;
  default_unit: string;
  current_stock: number;
  reorder_point: number;
}

@Injectable({ providedIn: 'root' })
export class IngredientStockService {
  private readonly supabase = inject(SupabaseService);

  private readonly _ingredients = signal<StockIngredient[]>([]);
  readonly loading = signal(false);

  /** All ingredients that have a reorder threshold set AND are at or below it */
  readonly lowStockIngredients = computed(() =>
    this._ingredients()
      .filter(i => i.reorder_point > 0 && i.current_stock <= i.reorder_point)
      .sort((a, b) => {
        // Sort by severity: 0-stock first, then by % of threshold ascending
        const pctA = a.current_stock / a.reorder_point;
        const pctB = b.current_stock / b.reorder_point;
        return pctA - pctB;
      })
  );

  readonly lowStockCount = computed(() => this.lowStockIngredients().length);

  /** Total deficit units across all low-stock ingredients (same unit) */
  readonly totalDeficit = computed(() =>
    this.lowStockIngredients().reduce(
      (sum, i) => sum + Math.max(0, i.reorder_point - i.current_stock),
      0
    )
  );

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const [ingredientsRes, inventoryRes] = await Promise.all([
        this.supabase.client
          .from('gg_ingredients')
          .select('id, name, default_unit')
          .order('name'),
        this.supabase.client
          .from('inventory_raw_materials')
          .select('ingredient_id, current_qty, unit, low_stock_threshold'),
      ]);

      const inventoryByIngredientId = new Map<string, any>();
      (inventoryRes.data ?? []).forEach((item: any) => {
        inventoryByIngredientId.set(item.ingredient_id, item);
      });

      this._ingredients.set(
        (ingredientsRes.data ?? []).map((i: any) => {
          const inventory = inventoryByIngredientId.get(i.id);
          return {
            id: i.id,
            name: i.name,
            default_unit: inventory?.unit ?? i.default_unit ?? 'kg',
            current_stock: inventory?.current_qty ?? 0,
            reorder_point: inventory?.low_stock_threshold ?? 0,
          };
        })
      );
    } finally {
      this.loading.set(false);
    }
  }
}
