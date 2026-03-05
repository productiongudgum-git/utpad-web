import { Injectable, computed, signal } from '@angular/core';

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
  ingredients: RecipeIngredientLine[];
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

interface PersistedMasterData {
  ingredients: IngredientDefinition[];
  recipes: RecipeDefinition[];
  flavors: FlavorDefinition[];
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

const STORAGE_KEY = 'utpad_recipe_master_data_v1';
const CHANNEL_KEY = 'utpad_recipe_master_data_channel';

const seededIngredients: IngredientDefinition[] = [
  { id: 'ing-gum-base-a', name: 'Gum Base A', unit: 'kg', active: true, createdAt: new Date().toISOString() },
  { id: 'ing-glucose-syrup', name: 'Glucose Syrup', unit: 'kg', active: true, createdAt: new Date().toISOString() },
  { id: 'ing-spearmint-oil', name: 'Spearmint Oil', unit: 'kg', active: true, createdAt: new Date().toISOString() },
  { id: 'ing-sugar-fine', name: 'Sugar (Fine)', unit: 'kg', active: true, createdAt: new Date().toISOString() },
  { id: 'ing-sweetener-x', name: 'Sweetener X', unit: 'kg', active: true, createdAt: new Date().toISOString() },
  { id: 'ing-coloring-blue', name: 'Coloring Blue', unit: 'L', active: true, createdAt: new Date().toISOString() },
  { id: 'ing-preservative', name: 'Preservative', unit: 'kg', active: true, createdAt: new Date().toISOString() },
];

const seededRecipes: RecipeDefinition[] = [
  {
    id: 'rcp-spearmint',
    name: 'Spearmint Base Recipe',
    code: 'RCP-MNT',
    description: 'Primary mint profile used for standard production runs.',
    active: true,
    flavorIds: ['flv-mnt'],
    ingredients: [
      { ingredientId: 'ing-gum-base-a', qty: 50 },
      { ingredientId: 'ing-glucose-syrup', qty: 25.5 },
      { ingredientId: 'ing-spearmint-oil', qty: 1.2 },
      { ingredientId: 'ing-sugar-fine', qty: 23.3 },
    ],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'rcp-bubblegum',
    name: 'Bubblegum Core Recipe',
    code: 'RCP-BBG',
    description: 'Sweet bubblegum profile tuned for high-volume output.',
    active: true,
    flavorIds: ['flv-bbg'],
    ingredients: [
      { ingredientId: 'ing-gum-base-a', qty: 49.5 },
      { ingredientId: 'ing-glucose-syrup', qty: 27 },
      { ingredientId: 'ing-sweetener-x', qty: 2.5 },
      { ingredientId: 'ing-sugar-fine', qty: 21 },
    ],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'rcp-fruit',
    name: 'Fruit Fusion Recipe',
    code: 'RCP-FRT',
    description: 'Base profile for strawberry and watermelon flavors.',
    active: true,
    flavorIds: ['flv-str', 'flv-wtr'],
    ingredients: [
      { ingredientId: 'ing-gum-base-a', qty: 48 },
      { ingredientId: 'ing-glucose-syrup', qty: 26 },
      { ingredientId: 'ing-sweetener-x', qty: 3 },
      { ingredientId: 'ing-coloring-blue', qty: 1 },
      { ingredientId: 'ing-sugar-fine', qty: 22 },
    ],
    updatedAt: new Date().toISOString(),
  },
];

const seededFlavors: FlavorDefinition[] = [
  { id: 'flv-mnt', name: 'Spearmint Blast', code: 'MNT', active: true, recipeId: 'rcp-spearmint', createdAt: new Date().toISOString() },
  { id: 'flv-bbg', name: 'Bubblegum Classic', code: 'BBG', active: true, recipeId: 'rcp-bubblegum', createdAt: new Date().toISOString() },
  { id: 'flv-str', name: 'Strawberry Fusion', code: 'STR', active: true, recipeId: 'rcp-fruit', createdAt: new Date().toISOString() },
  { id: 'flv-wtr', name: 'Watermelon Wave', code: 'WTR', active: true, recipeId: 'rcp-fruit', createdAt: new Date().toISOString() },
];

@Injectable({ providedIn: 'root' })
export class RecipeMasterDataService {
  private readonly _ingredients = signal<IngredientDefinition[]>(seededIngredients);
  private readonly _recipes = signal<RecipeDefinition[]>(seededRecipes);
  private readonly _flavors = signal<FlavorDefinition[]>(seededFlavors);

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

  private readonly channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_KEY) : null;
  private syncingFromChannel = false;

  constructor() {
    this.restore();
    this.normalizeMappings(false);

    this.channel?.addEventListener('message', (event: MessageEvent<PersistedMasterData>) => {
      this.syncingFromChannel = true;
      this.applyState(event.data, false);
      this.syncingFromChannel = false;
    });
  }

  createIngredient(input: CreateIngredientInput): IngredientDefinition {
    const ingredient: IngredientDefinition = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      unit: input.unit,
      active: true,
      createdAt: new Date().toISOString(),
    };
    this._ingredients.update((list) => [ingredient, ...list]);
    this.persist();
    return ingredient;
  }

  updateIngredient(ingredientId: string, patch: Partial<Pick<IngredientDefinition, 'name' | 'unit' | 'active'>>): void {
    this._ingredients.update((list) =>
      list.map((ingredient) =>
        ingredient.id === ingredientId
          ? {
              ...ingredient,
              name: patch.name?.trim() || ingredient.name,
              unit: patch.unit ?? ingredient.unit,
              active: patch.active ?? ingredient.active,
            }
          : ingredient,
      ),
    );
    this.persist();
  }

  createFlavor(input: CreateFlavorInput): FlavorDefinition {
    const flavor: FlavorDefinition = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      code: input.code.trim().toUpperCase(),
      active: true,
      recipeId: null,
      createdAt: new Date().toISOString(),
    };
    this._flavors.update((list) => [flavor, ...list]);
    this.persist();
    return flavor;
  }

  updateFlavor(flavorId: string, patch: Partial<Pick<FlavorDefinition, 'name' | 'code' | 'active'>>): void {
    this._flavors.update((list) =>
      list.map((flavor) =>
        flavor.id === flavorId
          ? {
              ...flavor,
              name: patch.name?.trim() || flavor.name,
              code: patch.code?.trim().toUpperCase() || flavor.code,
              active: patch.active ?? flavor.active,
            }
          : flavor,
      ),
    );
    this.persist();
  }

  createRecipe(input: CreateRecipeInput): RecipeDefinition {
    const recipe: RecipeDefinition = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      code: input.code.trim().toUpperCase(),
      description: input.description.trim(),
      active: true,
      flavorIds: [],
      ingredients: [],
      updatedAt: new Date().toISOString(),
    };
    this._recipes.update((list) => [recipe, ...list]);
    this.persist();
    return recipe;
  }

  updateRecipe(recipeId: string, patch: Partial<Pick<RecipeDefinition, 'name' | 'code' | 'description' | 'active'>>): void {
    this._recipes.update((list) =>
      list.map((recipe) =>
        recipe.id === recipeId
          ? {
              ...recipe,
              name: patch.name?.trim() || recipe.name,
              code: patch.code?.trim().toUpperCase() || recipe.code,
              description: patch.description?.trim() ?? recipe.description,
              active: patch.active ?? recipe.active,
              updatedAt: new Date().toISOString(),
            }
          : recipe,
      ),
    );
    this.persist();
  }

  mapFlavorToRecipe(flavorId: string, recipeId: string | null): void {
    this._flavors.update((list) =>
      list.map((flavor) => (flavor.id === flavorId ? { ...flavor, recipeId } : flavor)),
    );

    this._recipes.update((list) =>
      list.map((recipe) => {
        const mappedIds = this._flavors()
          .filter((flavor) => flavor.recipeId === recipe.id)
          .map((flavor) => flavor.id);

        if (recipe.id === recipeId) {
          const next = new Set([...mappedIds, flavorId]);
          return { ...recipe, flavorIds: Array.from(next), updatedAt: new Date().toISOString() };
        }

        if (recipe.flavorIds.includes(flavorId)) {
          return {
            ...recipe,
            flavorIds: recipe.flavorIds.filter((id) => id !== flavorId),
            updatedAt: new Date().toISOString(),
          };
        }

        return { ...recipe, flavorIds: mappedIds };
      }),
    );

    this.persist();
  }

  upsertRecipeIngredient(recipeId: string, ingredientId: string, qty: number): void {
    const safeQty = Number.isFinite(qty) ? Math.max(0, qty) : 0;

    this._recipes.update((recipes) =>
      recipes.map((recipe) => {
        if (recipe.id !== recipeId) {
          return recipe;
        }

        const hasIngredient = recipe.ingredients.some((item) => item.ingredientId === ingredientId);
        const ingredients = hasIngredient
          ? recipe.ingredients.map((item) =>
              item.ingredientId === ingredientId ? { ...item, qty: safeQty } : item,
            )
          : [...recipe.ingredients, { ingredientId, qty: safeQty }];

        return {
          ...recipe,
          ingredients,
          updatedAt: new Date().toISOString(),
        };
      }),
    );

    this.persist();
  }

  removeRecipeIngredient(recipeId: string, ingredientId: string): void {
    this._recipes.update((recipes) =>
      recipes.map((recipe) =>
        recipe.id === recipeId
          ? {
              ...recipe,
              ingredients: recipe.ingredients.filter((line) => line.ingredientId !== ingredientId),
              updatedAt: new Date().toISOString(),
            }
          : recipe,
      ),
    );

    this.persist();
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

    return recipe.ingredients
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

    return recipe.ingredients.reduce((sum, line) => sum + Math.max(0, line.qty), 0);
  }

  private normalizeMappings(persistAfter: boolean): void {
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

    if (persistAfter) {
      this.persist();
    }
  }

  private persist(): void {
    this.normalizeMappings(false);

    const payload: PersistedMasterData = {
      ingredients: this._ingredients(),
      recipes: this._recipes(),
      flavors: this._flavors(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

    if (!this.syncingFromChannel) {
      this.channel?.postMessage(payload);
    }
  }

  private restore(): void {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as PersistedMasterData;
      this.applyState(parsed, true);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  private applyState(state: PersistedMasterData, normalizeAfter: boolean): void {
    if (!state || !Array.isArray(state.ingredients) || !Array.isArray(state.recipes) || !Array.isArray(state.flavors)) {
      return;
    }

    this._ingredients.set(state.ingredients);
    this._recipes.set(state.recipes);
    this._flavors.set(state.flavors);

    if (normalizeAfter) {
      this.normalizeMappings(false);
    }
  }
}
