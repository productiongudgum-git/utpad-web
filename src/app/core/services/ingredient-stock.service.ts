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
      const { data } = await this.supabase.client
        .from('gg_ingredients')
        .select('id, name, default_unit, current_stock, reorder_point')
        .order('name');

      this._ingredients.set(
        (data ?? []).map((i: any) => ({
          id: i.id,
          name: i.name,
          default_unit: i.default_unit ?? 'kg',
          current_stock: i.current_stock ?? 0,
          reorder_point: i.reorder_point ?? 0,
        }))
      );
    } finally {
      this.loading.set(false);
    }
  }
}
