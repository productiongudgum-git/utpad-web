import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from '../supabase.service';

// Mirrors the thresholds the Ingredients page shows — a base ingredient (used
// in at least half of all recipes) is flagged earlier, since it depletes
// across every flavour.
const LOW_BATCHES_SHARED     = 40;
const LOW_BATCHES_DEFAULT    = 15;
const SHARED_RECIPE_FRACTION = 0.5;

export interface StockIngredient {
  id: string;
  name: string;
  default_unit: string;
  current_stock: number;
  avgPerBatch: number;          // mean canonical qty across recipes that use it
  batchesLeft: number | null;   // floor(current_stock / avgPerBatch); null = unused
  recipeCount: number;
  totalRecipes: number;
  shared: boolean;              // used in >= half of recipes → base ingredient
  lowThreshold: number;         // batches below which it's "low"
}

@Injectable({ providedIn: 'root' })
export class IngredientStockService {
  private readonly supabase = inject(SupabaseService);

  private readonly _ingredients = signal<StockIngredient[]>([]);
  readonly loading = signal(false);

  /** Ingredients whose batches-left has dropped below the per-ingredient threshold. */
  readonly lowStockIngredients = computed(() =>
    this._ingredients()
      .filter(i => i.batchesLeft != null && i.batchesLeft < i.lowThreshold)
      .sort((a, b) => (a.batchesLeft ?? 0) - (b.batchesLeft ?? 0))
  );

  readonly lowStockCount = computed(() => this.lowStockIngredients().length);

  /** Total deficit (sum of how many batches each low item is short of its threshold). */
  readonly totalDeficit = computed(() =>
    this.lowStockIngredients().reduce(
      (sum, i) => sum + Math.max(0, i.lowThreshold - (i.batchesLeft ?? 0)),
      0
    )
  );

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const [ingredientsRes, inventoryRes, recipeLinesRes] = await Promise.all([
        this.supabase.client.from('gg_ingredients').select('id, name, default_unit').order('name'),
        this.supabase.client.from('inventory_raw_materials').select('ingredient_id, current_qty, unit'),
        this.supabase.client.from('recipe_lines').select('recipe_id, ingredient_id, qty'),
      ]);

      const inventoryByIngredientId = new Map<string, any>();
      (inventoryRes.data ?? []).forEach((row: any) => inventoryByIngredientId.set(row.ingredient_id, row));

      // Per-ingredient avg recipe qty + total distinct recipe count.
      const usageByIng = new Map<string, { sum: number; count: number }>();
      const allRecipeIds = new Set<string>();
      (recipeLinesRes.data ?? []).forEach((l: any) => {
        if (l.recipe_id) allRecipeIds.add(l.recipe_id);
        const qty = Number(l.qty) || 0;
        if (qty <= 0) return;
        const e = usageByIng.get(l.ingredient_id) ?? { sum: 0, count: 0 };
        e.sum += qty; e.count += 1;
        usageByIng.set(l.ingredient_id, e);
      });
      const totalRecipes = allRecipeIds.size;

      this._ingredients.set(
        (ingredientsRes.data ?? []).map((i: any) => {
          const inventory    = inventoryByIngredientId.get(i.id);
          const currentStock = inventory?.current_qty ?? 0;
          const u            = usageByIng.get(i.id);
          const recipeCount  = u?.count ?? 0;
          const avgPerBatch  = u && u.count > 0 ? u.sum / u.count : 0;
          const batchesLeft  = avgPerBatch > 0 ? Math.floor(currentStock / avgPerBatch) : null;
          const shared       = totalRecipes > 0 && recipeCount / totalRecipes >= SHARED_RECIPE_FRACTION;
          const lowThreshold = shared ? LOW_BATCHES_SHARED : LOW_BATCHES_DEFAULT;
          return {
            id: i.id,
            name: i.name,
            default_unit: inventory?.unit ?? i.default_unit ?? 'g',
            current_stock: currentStock,
            avgPerBatch,
            batchesLeft,
            recipeCount,
            totalRecipes,
            shared,
            lowThreshold,
          };
        })
      );
    } finally {
      this.loading.set(false);
    }
  }
}
