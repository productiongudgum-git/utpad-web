import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from '../supabase.service';

// Mirrors the thresholds the Ingredients page shows — a base ingredient (used
// in at least half of all recipes) is flagged earlier, since it depletes
// across every flavour.
const LOW_BATCHES_SHARED     = 40;
const LOW_BATCHES_DEFAULT    = 15;
const SHARED_RECIPE_FRACTION = 0.5;

/** Box count assumed for a flavour with no explicit units_per_box. Matches the
 *  column default in migration 0008, and the constant this code used before
 *  packing variants existed. */
const DEFAULT_UNITS_PER_BOX = 15;

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
      const [ingredientsRes, inventoryRes, recipeLinesRes, recipesRes, pmfRes, flavorsRes] = await Promise.all([
        this.supabase.client.from('gg_ingredients').select('id, name, default_unit, packing_role, packing_flavor_id, qty_per_box').order('name'),
        this.supabase.client.from('inventory_raw_materials').select('ingredient_id, current_qty, unit'),
        this.supabase.client.from('recipe_lines').select('recipe_id, ingredient_id, qty'),
        this.supabase.client.from('gg_recipes').select('id, flavor_id, units_per_batch'),
        this.supabase.client.from('packing_material_flavors').select('ingredient_id, flavor_id'),
        this.supabase.client.from('gg_flavors').select('id, units_per_box, parent_flavor_id'),
      ]);

      // Box format per flavour. A packing variant has its own units_per_box but
      // no recipe of its own — production runs against the parent — so batch
      // size is looked up through parent_flavor_id.
      const unitsPerBoxByFlavorId = new Map<string, number>();
      const parentByFlavorId      = new Map<string, string | null>();
      ((flavorsRes.data ?? []) as any[]).forEach(f => {
        unitsPerBoxByFlavorId.set(f.id, Number(f.units_per_box ?? DEFAULT_UNITS_PER_BOX));
        parentByFlavorId.set(f.id, f.parent_flavor_id ?? null);
      });

      // Per-flavour units_per_batch + overall average (drives packing-material math).
      const recipes = (recipesRes.data ?? []) as Array<{ id: string; flavor_id: string; units_per_batch: number }>;
      const unitsByFlavorId = new Map<string, number>();
      for (const r of recipes) {
        if (r.flavor_id) unitsByFlavorId.set(r.flavor_id, r.units_per_batch ?? 7500);
      }
      const avgUnitsPerBatch = recipes.length > 0
        ? recipes.reduce((s, r) => s + (r.units_per_batch ?? 7500), 0) / recipes.length
        : 7500;

      // packing_material_flavors → per-ingredient flavour subset (e.g. GG Ziplock → 9 flavours).
      const flavorsByPackingIng = new Map<string, string[]>();
      ((pmfRes.data ?? []) as Array<{ ingredient_id: string; flavor_id: string }>).forEach(r => {
        const arr = flavorsByPackingIng.get(r.ingredient_id) ?? [];
        arr.push(r.flavor_id);
        flavorsByPackingIng.set(r.ingredient_id, arr);
      });

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

          let avgPerBatch = 0;
          let recipeCount = 0;
          let shared      = false;

          if (i.packing_role) {
            // Packing material — consumed per box, not via recipe_lines.
            // boxes per batch = units_per_batch / units_per_box.
            // Linked flavours come from three places, in priority order:
            //   1. packing_flavor_id (single — monocartons, incl. a variant's own)
            //   2. packing_material_flavors join table (subset — GG / GG+ ziplocks)
            //   3. neither set → truly generic, applies to every recipe
            const qtyPerBox       = Number(i.qty_per_box) || 1;
            const linkedFlavorIds = i.packing_flavor_id
              ? [i.packing_flavor_id]
              : (flavorsByPackingIng.get(i.id) ?? []);

            let boxesPerBatch: number;
            if (linkedFlavorIds.length === 0) {
              boxesPerBatch = avgUnitsPerBatch / DEFAULT_UNITS_PER_BOX;
              recipeCount   = recipes.length;
            } else {
              // Per linked flavour, because box counts now differ between them:
              // a variant's monocarton fills a 10-gum box out of the parent's
              // batch, so it is consumed faster than the parent's 15-gum box.
              const perFlavorBoxes = linkedFlavorIds.map((fid: string) => {
                const parentId = parentByFlavorId.get(fid) ?? null;
                const batchUnits =
                  unitsByFlavorId.get(fid)
                  ?? (parentId ? unitsByFlavorId.get(parentId) : undefined)
                  ?? avgUnitsPerBatch;
                const perBox = unitsPerBoxByFlavorId.get(fid) ?? DEFAULT_UNITS_PER_BOX;
                return batchUnits / perBox;
              });
              boxesPerBatch = perFlavorBoxes.reduce((s, v) => s + v, 0) / perFlavorBoxes.length;
              recipeCount   = linkedFlavorIds.length;
            }

            avgPerBatch = qtyPerBox * boxesPerBatch;
            // Base-vs-flavour-specific tier — uses the same "covers ≥50% of recipes" rule
            // as raw ingredients, so GG Ziplock (9/15 flavours) trips the higher 40-batch
            // threshold while GG+ Ziplock (4/15) and monocartons (1/15) sit at 15.
            shared = totalRecipes > 0 && recipeCount / totalRecipes >= SHARED_RECIPE_FRACTION;
          } else {
            // Recipe ingredient — mean qty across the recipes that use it.
            const u     = usageByIng.get(i.id);
            recipeCount = u?.count ?? 0;
            avgPerBatch = u && u.count > 0 ? u.sum / u.count : 0;
            shared      = totalRecipes > 0 && recipeCount / totalRecipes >= SHARED_RECIPE_FRACTION;
          }

          const batchesLeft  = avgPerBatch > 0 ? Math.floor(currentStock / avgPerBatch) : null;
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
