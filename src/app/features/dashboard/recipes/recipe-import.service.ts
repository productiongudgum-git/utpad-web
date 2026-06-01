import { Injectable, inject } from '@angular/core';
import * as Papa from 'papaparse';
import { SupabaseService } from '../../../core/supabase.service';

/**
 * Recipe importer for the transposed wide-format master sheet.
 *
 *   Row 0  : ["Ingredients / Flavor", <Flavor A>, <Flavor B>, ...]
 *   Row 1+ : [<Ingredient name>,       <qty A>,    <qty B>,    ...]
 *   Footer : a row like "ALL QTY AS PER 7500 PCS" (ignored)
 *
 * Cell values are grams, calibrated for a 7500-piece batch. Empty cell =
 * that ingredient isn't used in that flavor.
 *
 * Rules (confirmed with the user):
 *   - Missing flavors are created in gg_flavors.
 *   - Missing ingredients are created in gg_ingredients (default_unit 'g').
 *   - The ingredient row literally named "Flavour" becomes a per-flavor
 *     ingredient: "<Flavor> Flavour" (e.g. "Strawberry Flavour").
 *   - Each flavor gets one recipe; batch_size_kg = sum of its grams / 1000.
 *
 * All values stay in the browser — only resolved IDs + numbers are written
 * to Supabase. The raw file never leaves the device.
 */

const BATCH_PCS = 7500;
const FLAVOUR_ROW = 'flavour';      // the generic row that expands per flavor
const UNITS_ROW   = 'no of units';  // per-flavor expected unit count (not an ingredient)

/** Derive a gg_flavors.code from a flavor name. "Mellow Mint" → "MELLOW-MINT". */
function makeCode(name: string): string {
  return (name || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'FLAVOR';
}

export interface ParsedCell {
  flavorName: string;
  ingredientName: string;   // already expanded ("Strawberry Flavour")
  qty: number;              // grams
}

export interface RecipePreview {
  flavorNames: string[];
  ingredientNames: string[];          // distinct, expanded
  cells: ParsedCell[];
  newFlavors: string[];
  newIngredients: string[];
  recipeCount: number;
  lineCount: number;
  /** per-flavor total grams → batch_size_kg */
  batchKgByFlavor: Record<string, number>;
  /** per-flavor expected unit count from the "No of units" row */
  unitsByFlavor: Record<string, number>;
  /** flavors whose units cell was blank/0 — these block the import */
  missingUnits: string[];
  warnings: string[];
}

export interface ImportResult {
  flavorsCreated: number;
  ingredientsCreated: number;
  recipesCreated: number;
  recipesUpdated: number;
  linesCreated: number;
  errors: string[];
}

interface Catalogs {
  flavors: { id: string; name: string }[];
  ingredients: { id: string; name: string }[];
}

@Injectable({ providedIn: 'root' })
export class RecipeImportService {
  private readonly supabase = inject(SupabaseService);

  // ── Parse ───────────────────────────────────────────────────────────

  parseCsv(file: File): Promise<string[][]> {
    return new Promise((resolve, reject) => {
      Papa.parse<string[]>(file, {
        header: false,
        skipEmptyLines: 'greedy',
        complete: (res) => resolve(res.data as string[][]),
        error: (err) => reject(err),
      });
    });
  }

  /**
   * Turn the raw grid into a flat list of (flavor, ingredient, qty) cells.
   * Applies the "Flavour" → per-flavor expansion.
   */
  parseGrid(rows: string[][]): ParsedCell[] {
    if (rows.length === 0) return [];
    const header = rows[0].map((c) => (c ?? '').trim());
    const flavorNames = header.slice(1).map((c) => c.trim());

    const cells: ParsedCell[] = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const rawName = (row[0] ?? '').trim();
      if (!rawName) continue;
      // Skip footer-style rows ("ALL QTY AS PER 7500 PCS")
      if (/qty\s+as\s+per/i.test(rawName)) continue;
      // The "No of units" row is not an ingredient — handled by parseUnitsByFlavor.
      if (rawName.toLowerCase() === UNITS_ROW) continue;

      for (let c = 1; c < header.length; c++) {
        const flavorName = flavorNames[c - 1];
        if (!flavorName) continue;
        const qty = Number((row[c] ?? '').toString().replace(/,/g, '').trim());
        if (!Number.isFinite(qty) || qty <= 0) continue;

        const ingredientName =
          rawName.toLowerCase() === FLAVOUR_ROW ? `${flavorName} Flavour` : rawName;

        cells.push({ flavorName, ingredientName, qty });
      }
    }
    return cells;
  }

  /** Pulls the per-flavor "No of units" value from the sheet. Returns 0 when blank. */
  parseUnitsByFlavor(rows: string[][]): Record<string, number> {
    const out: Record<string, number> = {};
    if (rows.length === 0) return out;
    const header = rows[0].map((c) => (c ?? '').trim());
    const flavorNames = header.slice(1).map((c) => c.trim());
    const unitsRow = rows.find((row) => (row[0] ?? '').trim().toLowerCase() === UNITS_ROW);
    if (!unitsRow) return out;
    for (let c = 1; c < header.length; c++) {
      const flavorName = flavorNames[c - 1];
      if (!flavorName) continue;
      const n = Number((unitsRow[c] ?? '').toString().replace(/,/g, '').trim());
      out[flavorName] = Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
    }
    return out;
  }

  // ── Resolve + preview ───────────────────────────────────────────────

  async loadCatalogs(): Promise<Catalogs> {
    const [flavorsRes, ingredientsRes] = await Promise.all([
      this.supabase.client.from('gg_flavors').select('id, name'),
      this.supabase.client.from('gg_ingredients').select('id, name'),
    ]);
    return {
      flavors: (flavorsRes.data ?? []) as Catalogs['flavors'],
      ingredients: (ingredientsRes.data ?? []) as Catalogs['ingredients'],
    };
  }

  buildPreview(
    cells: ParsedCell[],
    catalogs: Catalogs,
    unitsByFlavor: Record<string, number> = {},
  ): RecipePreview {
    const norm = (s: string) => s.trim().toLowerCase();
    const existingFlavors = new Set(catalogs.flavors.map((f) => norm(f.name)));
    const existingIngredients = new Set(catalogs.ingredients.map((i) => norm(i.name)));

    const flavorNames = Array.from(new Set(cells.map((c) => c.flavorName)));
    const ingredientNames = Array.from(new Set(cells.map((c) => c.ingredientName)));

    const newFlavors = flavorNames.filter((f) => !existingFlavors.has(norm(f)));
    const newIngredients = ingredientNames.filter((i) => !existingIngredients.has(norm(i)));

    const batchKgByFlavor: Record<string, number> = {};
    for (const c of cells) {
      batchKgByFlavor[c.flavorName] = (batchKgByFlavor[c.flavorName] ?? 0) + c.qty;
    }
    for (const f of Object.keys(batchKgByFlavor)) {
      batchKgByFlavor[f] = Math.round((batchKgByFlavor[f] / 1000) * 1000) / 1000; // g → kg
    }

    // Any flavor with cells but no positive units value is blocking — the user
    // must fix the sheet and re-upload before we can commit.
    const missingUnits = flavorNames.filter((f) => !(unitsByFlavor[f] > 0));

    const warnings: string[] = [];
    if (cells.length === 0) warnings.push('No quantity cells found — is the file empty or wrong shape?');
    if (flavorNames.length === 0) warnings.push('No flavor columns detected in the header row.');
    if (missingUnits.length > 0) {
      warnings.push(
        `"No of units" is missing for ${missingUnits.length} flavor${missingUnits.length === 1 ? '' : 's'}: ${missingUnits.join(', ')}. Fill them in and re-upload.`
      );
    }

    return {
      flavorNames,
      ingredientNames,
      cells,
      newFlavors,
      newIngredients,
      recipeCount: flavorNames.length,
      lineCount: cells.length,
      batchKgByFlavor,
      unitsByFlavor,
      missingUnits,
      warnings,
    };
  }

  // ── Commit ──────────────────────────────────────────────────────────

  /**
   * Writes everything: creates missing flavors + ingredients, then one
   * recipe per flavor, then all recipe_lines. Returns counts + errors.
   *
   * Assumes the DB has already been wiped (recipes/ingredients empty) but
   * is safe either way — it matches existing flavors/ingredients by name.
   */
  async commit(preview: RecipePreview): Promise<ImportResult> {
    const result: ImportResult = {
      flavorsCreated: 0, ingredientsCreated: 0, recipesCreated: 0, recipesUpdated: 0, linesCreated: 0, errors: [],
    };
    const norm = (s: string) => s.trim().toLowerCase();

    // Reload catalogs fresh so we have current IDs.
    const catalogs = await this.loadCatalogs();
    const flavorIdByName = new Map(catalogs.flavors.map((f) => [norm(f.name), f.id]));
    const ingredientIdByName = new Map(catalogs.ingredients.map((i) => [norm(i.name), i.id]));

    // 1. Create missing flavors. gg_flavors.code is NOT NULL, so derive a
    //    code from the name (e.g. "Mellow Mint" → "MELLOW-MINT"). Existing
    //    flavors are matched by name and never recreated.
    const flavorsToCreate = preview.flavorNames.filter((f) => !flavorIdByName.has(norm(f)));
    if (flavorsToCreate.length > 0) {
      const { data, error } = await this.supabase.client
        .from('gg_flavors')
        .insert(flavorsToCreate.map((name) => ({ name, code: makeCode(name), active: true })))
        .select('id, name');
      if (error) { result.errors.push(`Create flavors: ${error.message}`); return result; }
      for (const f of data ?? []) { flavorIdByName.set(norm(f.name), f.id); result.flavorsCreated++; }
    }

    // 2. Create missing ingredients (default_unit g)
    const ingredientsToCreate = preview.ingredientNames.filter((i) => !ingredientIdByName.has(norm(i)));
    if (ingredientsToCreate.length > 0) {
      const { data, error } = await this.supabase.client
        .from('gg_ingredients')
        .insert(ingredientsToCreate.map((name) => ({ name, default_unit: 'g', active: true })))
        .select('id, name');
      if (error) { result.errors.push(`Create ingredients: ${error.message}`); return result; }
      for (const i of data ?? []) { ingredientIdByName.set(norm(i.name), i.id); result.ingredientsCreated++; }
    }

    // 3. Upsert one recipe per flavor. If a recipe already exists for the
    //    flavor, update it in place (so re-importing the sheet edits the
    //    recipe instead of creating a duplicate); otherwise insert a new one.
    const existingRecipesRes = await this.supabase.client
      .from('gg_recipes')
      .select('id, flavor_id');
    const recipeIdByFlavorId = new Map<string, string>();
    for (const r of (existingRecipesRes.data ?? []) as Array<{ id: string; flavor_id: string }>) {
      if (r.flavor_id && !recipeIdByFlavorId.has(r.flavor_id)) {
        recipeIdByFlavorId.set(r.flavor_id, r.id);
      }
    }

    const recipeIdByFlavor = new Map<string, string>();
    for (const flavorName of preview.flavorNames) {
      const flavorId = flavorIdByName.get(norm(flavorName));
      if (!flavorId) { result.errors.push(`No flavor id for ${flavorName}`); continue; }

      const recipePayload = {
        name: `${flavorName} Recipe`,
        flavor_id: flavorId,
        batch_size_kg: preview.batchKgByFlavor[flavorName] ?? 0,
        units_per_batch: preview.unitsByFlavor[flavorName] || 7500,
        is_active: true,
      };

      const existingId = recipeIdByFlavorId.get(flavorId);
      if (existingId) {
        const { error } = await this.supabase.client
          .from('gg_recipes')
          .update(recipePayload)
          .eq('id', existingId);
        if (error) { result.errors.push(`Update recipe ${flavorName}: ${error.message}`); continue; }
        recipeIdByFlavor.set(flavorName, existingId);
        result.recipesUpdated++;
      } else {
        const { data, error } = await this.supabase.client
          .from('gg_recipes')
          .insert(recipePayload)
          .select('id')
          .single();
        if (error || !data) { result.errors.push(`Create recipe ${flavorName}: ${error?.message}`); continue; }
        recipeIdByFlavor.set(flavorName, data.id);
        result.recipesCreated++;
      }
    }

    // 4. Replace recipe_lines. Clear any existing lines for the recipes we're
    //    writing, then insert the fresh set — keeps re-imports idempotent and
    //    avoids primary-key clashes on (recipe_id, ingredient_id).
    const recipeIds = Array.from(new Set(recipeIdByFlavor.values()));
    if (recipeIds.length > 0) {
      const { error: delErr } = await this.supabase.client
        .from('recipe_lines')
        .delete()
        .in('recipe_id', recipeIds);
      if (delErr) { result.errors.push(`Clear old recipe lines: ${delErr.message}`); }
    }

    const lineRows: Array<{ recipe_id: string; ingredient_id: string; qty: number }> = [];
    for (const cell of preview.cells) {
      const recipeId = recipeIdByFlavor.get(cell.flavorName);
      const ingredientId = ingredientIdByName.get(norm(cell.ingredientName));
      if (!recipeId || !ingredientId) continue;
      lineRows.push({ recipe_id: recipeId, ingredient_id: ingredientId, qty: cell.qty });
    }

    // Insert in chunks of 200
    for (let i = 0; i < lineRows.length; i += 200) {
      const chunk = lineRows.slice(i, i + 200);
      const { error } = await this.supabase.client.from('recipe_lines').insert(chunk);
      if (error) { result.errors.push(`Recipe lines chunk ${i / 200}: ${error.message}`); continue; }
      result.linesCreated += chunk.length;
    }

    return result;
  }
}
