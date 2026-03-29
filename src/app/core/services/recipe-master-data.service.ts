import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Observable, tap } from 'rxjs';

export type IngredientUnit = 'kg' | 'L' | 'g' | 'ml' | 'pcs' | 'boxes';

export interface IngredientDefinition {
  id: string;
  name: string;
  unit: IngredientUnit;
  active: boolean;
  createdAt: string;
}

export interface RecipeIngredientLine {
  ingredientId: string;
  qty: number;
}

export interface RecipeDefinition {
  id: string;
  name: string;
  code: string;
  description: string;
  active: boolean;
  flavorIds: string[];
  ingredientLines: RecipeIngredientLine[]; // changed from ingredients to match backend API
  updatedAt: string;
}

export interface FlavorDefinition {
  id: string;
  name: string;
  code: string;
  active: boolean;
  recipeId: string | null;
  createdAt: string;
}

interface CreateIngredientInput {
  name: string;
  unit: IngredientUnit;
}

interface CreateFlavorInput {
  name: string;
  code: string;
}

interface CreateRecipeInput {
  name: string;
  code: string;
  description: string;
}

@Injectable({ providedIn: 'root' })
export class RecipeMasterDataService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiBaseUrl}/recipes`;

  private readonly _ingredients = signal<IngredientDefinition[]>([]);
  private readonly _recipes = signal<RecipeDefinition[]>([]);
  private readonly _flavors = signal<FlavorDefinition[]>([]);

  readonly ingredients = this._ingredients.asReadonly();
  readonly recipes = this._recipes.asReadonly();
  readonly flavors = this._flavors.asReadonly();

  readonly activeIngredients = computed(() =>
    this._ingredients().filter((ingredient) => ingredient.active),
  );

  readonly activeFlavors = computed(() =>
    this._flavors().filter((flavor) => flavor.active),
  );

  readonly activeRecipes = computed(() =>
    this._recipes().filter((recipe) => recipe.active),
  );

  constructor() {
    this.refreshAll();
  }

  refreshAll(): void {
    this.http.get<{ items: IngredientDefinition[] }>(`${this.apiUrl}/ingredients`).subscribe(res => {
      this._ingredients.set(res.items || []);
    });

    this.http.get<{ items: FlavorDefinition[] }>(`${this.apiUrl}/flavors`).subscribe(res => {
      this._flavors.set(res.items || []);
      this.normalizeMappings();
    });

    this.http.get<{ items: Omit<RecipeDefinition, 'flavorIds'>[] }>(this.apiUrl).subscribe(res => {
      // Map API array to include flavorIds
      const items = (res.items || []).map(r => ({ ...r, flavorIds: [] as string[] }));
      this._recipes.set(items as any);
      this.normalizeMappings();
    });
  }

  createIngredient(input: CreateIngredientInput): Observable<IngredientDefinition> {
    const payload = {
      name: input.name.trim(),
      unit: input.unit,
      active: true,
    };
    return this.http.post<IngredientDefinition>(`${this.apiUrl}/ingredients`, payload).pipe(
      tap((ingredient) => {
        this._ingredients.update((list) => [...list, ingredient].sort((a, b) => a.name.localeCompare(b.name)));
      })
    );
  }

  updateIngredient(ingredientId: string, patch: Partial<Pick<IngredientDefinition, 'name' | 'unit' | 'active'>>): Observable<IngredientDefinition> {
    const current = this._ingredients().find(i => i.id === ingredientId);
    if (!current) throw new Error('Ingredient not found');

    // For simplicity with the existing API, we do an upsert via POST
    const payload = {
      ...current,
      name: patch.name?.trim() || current.name,
      unit: patch.unit ?? current.unit,
      active: patch.active ?? current.active,
    };

    return this.http.post<IngredientDefinition>(`${this.apiUrl}/ingredients`, payload).pipe(
      tap((ingredient) => {
        this._ingredients.update((list) => list.map(i => i.id === ingredient.id ? ingredient : i));
      })
    );
  }

  createFlavor(input: CreateFlavorInput): Observable<FlavorDefinition> {
    const payload = {
      name: input.name.trim(),
      code: input.code.trim().toUpperCase(),
      active: true,
      recipeId: null,
    };
    return this.http.post<FlavorDefinition>(`${this.apiUrl}/flavors`, payload).pipe(
      tap((flavor) => {
        this._flavors.update((list) => [...list, flavor].sort((a, b) => a.name.localeCompare(b.name)));
      })
    );
  }

  updateFlavor(flavorId: string, patch: Partial<Pick<FlavorDefinition, 'name' | 'code' | 'active'>>): Observable<FlavorDefinition> {
    const current = this._flavors().find(f => f.id === flavorId);
    if (!current) throw new Error('Flavor not found');

    const payload = {
      ...current,
      name: patch.name?.trim() || current.name,
      code: patch.code?.trim().toUpperCase() || current.code,
      active: patch.active ?? current.active,
    };

    return this.http.post<FlavorDefinition>(`${this.apiUrl}/flavors`, payload).pipe(
      tap((flavor) => {
        this._flavors.update((list) => list.map(f => f.id === flavor.id ? flavor : f));
      })
    );
  }

  createRecipe(input: CreateRecipeInput): Observable<RecipeDefinition> {
    const payload = {
      name: input.name.trim(),
      code: input.code.trim().toUpperCase(),
      description: input.description.trim(),
      active: true,
      ingredientLines: [],
    };
    return this.http.post<RecipeDefinition>(this.apiUrl, payload).pipe(
      tap((recipe) => {
        recipe.flavorIds = [];
        this._recipes.update((list) => [...list, recipe].sort((a, b) => a.name.localeCompare(b.name)));
      })
    );
  }

  updateRecipe(recipeId: string, patch: Partial<Pick<RecipeDefinition, 'name' | 'code' | 'description' | 'active'>>): Observable<RecipeDefinition> {
    const current = this._recipes().find(r => r.id === recipeId);
    if (!current) throw new Error('Recipe not found');

    const payload = {
      ...current,
      name: patch.name?.trim() || current.name,
      code: patch.code?.trim().toUpperCase() || current.code,
      description: patch.description?.trim() ?? current.description,
      active: patch.active ?? current.active,
    };

    return this.http.post<RecipeDefinition>(this.apiUrl, payload).pipe(
      tap((recipe) => {
        recipe.flavorIds = current.flavorIds || [];
        this._recipes.update((list) => list.map(r => r.id === recipe.id ? recipe : r));
      })
    );
  }

  mapFlavorToRecipe(flavorId: string, recipeId: string | null): Observable<FlavorDefinition> {
    const current = this._flavors().find(f => f.id === flavorId);
    if (!current) throw new Error('Flavor not found');

    const payload = { ...current, recipeId };
    return this.http.post<FlavorDefinition>(`${this.apiUrl}/flavors`, payload).pipe(
      tap((flavor) => {
        this._flavors.update((list) => list.map(f => f.id === flavor.id ? flavor : f));
        this.normalizeMappings();
      })
    );
  }

  upsertRecipeIngredient(recipeId: string, ingredientId: string, qty: number): Observable<RecipeDefinition> {
    const current = this._recipes().find(r => r.id === recipeId);
    if (!current) throw new Error('Recipe not found');

    const safeQty = Number.isFinite(qty) ? Math.max(0, qty) : 0;
    const hasIngredient = current.ingredientLines.some(l => l.ingredientId === ingredientId);
    const lines = hasIngredient
      ? current.ingredientLines.map(l => l.ingredientId === ingredientId ? { ...l, qty: safeQty } : l)
      : [...current.ingredientLines, { ingredientId, qty: safeQty }];

    const payload = { ...current, ingredientLines: lines };
    return this.http.post<RecipeDefinition>(this.apiUrl, payload).pipe(
      tap((recipe) => {
        recipe.flavorIds = current.flavorIds || [];
        this._recipes.update((list) => list.map(r => r.id === recipe.id ? recipe : r));
      })
    );
  }

  removeRecipeIngredient(recipeId: string, ingredientId: string): Observable<RecipeDefinition> {
    const current = this._recipes().find(r => r.id === recipeId);
    if (!current) throw new Error('Recipe not found');

    const lines = current.ingredientLines.filter(l => l.ingredientId !== ingredientId);
    const payload = { ...current, ingredientLines: lines };
    return this.http.post<RecipeDefinition>(this.apiUrl, payload).pipe(
      tap((recipe) => {
        recipe.flavorIds = current.flavorIds || [];
        this._recipes.update((list) => list.map(r => r.id === recipe.id ? recipe : r));
      })
    );
  }

  getRecipeForFlavor(flavorId: string): RecipeDefinition | null {
    const flavor = this._flavors().find((item) => item.id === flavorId);
    if (!flavor?.recipeId) {
      return null;
    }

    return this._recipes().find((recipe) => recipe.id === flavor.recipeId) ?? null;
  }

  resolveRecipeIngredients(recipe: RecipeDefinition | null): Array<{ ingredientId: string; name: string; unit: IngredientUnit; qty: number }> {
    if (!recipe) {
      return [];
    }

    const ingredientMap = new Map(this._ingredients().map((ingredient) => [ingredient.id, ingredient]));

    return (recipe.ingredientLines || [])
      .map((line) => {
        const ingredient = ingredientMap.get(line.ingredientId);
        if (!ingredient) {
          return null;
        }

        return {
          ingredientId: line.ingredientId,
          name: ingredient.name,
          unit: ingredient.unit,
          qty: line.qty,
        };
      })
      .filter((line): line is { ingredientId: string; name: string; unit: IngredientUnit; qty: number } => !!line);
  }

  recipeYield(recipe: RecipeDefinition | null): number {
    if (!recipe) {
      return 0;
    }

    return (recipe.ingredientLines || []).reduce((sum, line) => sum + Math.max(0, line.qty), 0);
  }

  private normalizeMappings(): void {
    const flavorByRecipe = new Map<string, string[]>();

    this._flavors().forEach((flavor) => {
      if (!flavor.recipeId) {
        return;
      }

      const current = flavorByRecipe.get(flavor.recipeId) ?? [];
      flavorByRecipe.set(flavor.recipeId, [...current, flavor.id]);
    });

    this._recipes.update((recipes) =>
      recipes.map((recipe) => ({
        ...recipe,
        flavorIds: flavorByRecipe.get(recipe.id) ?? [],
      })),
    );
  }
}
