import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  IngredientDefinition,
  IngredientUnit,
  RecipeMasterDataService,
} from '../../../core/services/recipe-master-data.service';

@Component({
  selector: 'app-recipes-admin',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <section class="p-4 md:p-6 space-y-6">
      <header class="bg-surface-light dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark p-5 md:p-6">
        <h1 class="text-2xl md:text-3xl font-bold text-text-main-light dark:text-text-main-dark">Recipes & Formula Mapping</h1>
        <p class="mt-1 text-sm text-text-sub-light dark:text-text-sub-dark">
          Create and configure ingredients, create recipes, and map each flavor profile to the correct recipe.
        </p>
      </header>

      @if (statusMessage()) {
        <div class="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300">
          {{ statusMessage() }}
        </div>
      }

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <article class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-4 md:p-5 space-y-4">
          <h2 class="text-lg font-semibold text-text-main-light dark:text-text-main-dark">Ingredient Master</h2>

          <form [formGroup]="ingredientCreateForm" (ngSubmit)="createIngredient()" class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              formControlName="name"
              type="text"
              placeholder="Ingredient name"
              class="md:col-span-2 rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-800 text-sm text-text-main-light dark:text-text-main-dark">
            <select
              formControlName="unit"
              class="rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-800 text-sm text-text-main-light dark:text-text-main-dark">
              @for (unit of units; track unit) {
                <option [value]="unit">{{ unit }}</option>
              }
            </select>
            <button
              type="submit"
              class="md:col-span-3 rounded-lg bg-primary text-white py-2.5 font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50"
              [disabled]="ingredientCreateForm.invalid">
              Add Ingredient
            </button>
          </form>

          <div class="border-t border-border-light dark:border-border-dark pt-4 space-y-3">
            <label class="text-xs uppercase tracking-wider text-text-sub-light dark:text-text-sub-dark">Configure Ingredient</label>
            <select
              [value]="selectedIngredientId()"
              (change)="onIngredientSelection($event)"
              class="w-full rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-800 text-sm text-text-main-light dark:text-text-main-dark">
              <option value="">Select ingredient...</option>
              @for (ingredient of ingredients(); track ingredient.id) {
                <option [value]="ingredient.id">{{ ingredient.name }} ({{ ingredient.unit }})</option>
              }
            </select>

            <form [formGroup]="ingredientConfigForm" (ngSubmit)="saveIngredientConfig()" class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input formControlName="name" type="text" placeholder="Ingredient name"
                     class="md:col-span-2 rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-800 text-sm text-text-main-light dark:text-text-main-dark">
              <select formControlName="unit" class="rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-800 text-sm text-text-main-light dark:text-text-main-dark">
                @for (unit of units; track unit) {
                  <option [value]="unit">{{ unit }}</option>
                }
              </select>
              <label class="md:col-span-2 inline-flex items-center gap-2 text-sm text-text-main-light dark:text-text-main-dark">
                <input type="checkbox" formControlName="active">
                Active in worker app
              </label>
              <button
                type="submit"
                class="rounded-lg border border-border-light dark:border-border-dark py-2.5 text-sm font-semibold text-text-main-light dark:text-text-main-dark hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                [disabled]="!selectedIngredientId() || ingredientConfigForm.invalid">
                Save Ingredient
              </button>
            </form>
          </div>
        </article>

        <article class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-4 md:p-5 space-y-4">
          <h2 class="text-lg font-semibold text-text-main-light dark:text-text-main-dark">Flavor Master</h2>

          <form [formGroup]="flavorCreateForm" (ngSubmit)="createFlavor()" class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input formControlName="name" type="text" placeholder="Flavor name"
                   class="md:col-span-2 rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-800 text-sm text-text-main-light dark:text-text-main-dark">
            <input formControlName="code" type="text" placeholder="Code"
                   class="rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-800 text-sm text-text-main-light dark:text-text-main-dark uppercase">
            <button type="submit"
                    class="md:col-span-3 rounded-lg bg-primary text-white py-2.5 font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50"
                    [disabled]="flavorCreateForm.invalid">
              Add Flavor
            </button>
          </form>

          <div class="border-t border-border-light dark:border-border-dark pt-4 space-y-3">
            <p class="text-xs uppercase tracking-wider text-text-sub-light dark:text-text-sub-dark">Map Flavor ? Recipe</p>
            <div class="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              @for (flavor of flavors(); track flavor.id) {
                <div class="grid grid-cols-12 gap-2 items-center rounded-lg border border-border-light dark:border-border-dark p-2.5">
                  <div class="col-span-5">
                    <p class="text-sm font-medium text-text-main-light dark:text-text-main-dark">{{ flavor.name }}</p>
                    <p class="text-xs text-text-sub-light dark:text-text-sub-dark">{{ flavor.code }}</p>
                  </div>
                  <select
                    class="col-span-6 rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-800 text-sm text-text-main-light dark:text-text-main-dark"
                    [value]="flavor.recipeId ?? ''"
                    (change)="mapFlavorToRecipe(flavor.id, $event)">
                    <option value="">Unmapped</option>
                    @for (recipe of recipes(); track recipe.id) {
                      <option [value]="recipe.id">{{ recipe.name }}</option>
                    }
                  </select>
                  <label class="col-span-1 inline-flex justify-center">
                    <input type="checkbox" [checked]="flavor.active" (change)="toggleFlavor(flavor.id, $event)">
                  </label>
                </div>
              }
            </div>
          </div>
        </article>
      </div>

      <article class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-4 md:p-5 space-y-4">
        <h2 class="text-lg font-semibold text-text-main-light dark:text-text-main-dark">Recipe Builder</h2>

        <form [formGroup]="recipeCreateForm" (ngSubmit)="createRecipe()" class="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input formControlName="name" type="text" placeholder="Recipe name"
                 class="md:col-span-2 rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-800 text-sm text-text-main-light dark:text-text-main-dark">
          <input formControlName="code" type="text" placeholder="Recipe code"
                 class="rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-800 text-sm text-text-main-light dark:text-text-main-dark uppercase">
          <input formControlName="description" type="text" placeholder="Description"
                 class="rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-800 text-sm text-text-main-light dark:text-text-main-dark">
          <button type="submit"
                  class="md:col-span-4 rounded-lg bg-primary text-white py-2.5 font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50"
                  [disabled]="recipeCreateForm.invalid">
            Create Recipe
          </button>
        </form>

        <div class="border-t border-border-light dark:border-border-dark pt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div class="space-y-3">
            <label class="text-xs uppercase tracking-wider text-text-sub-light dark:text-text-sub-dark">Configure Recipe</label>
            <select [value]="selectedRecipeId()" (change)="onRecipeSelection($event)"
                    class="w-full rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-800 text-sm text-text-main-light dark:text-text-main-dark">
              <option value="">Select recipe...</option>
              @for (recipe of recipes(); track recipe.id) {
                <option [value]="recipe.id">{{ recipe.name }} ({{ recipe.code }})</option>
              }
            </select>

            <form [formGroup]="recipeConfigForm" (ngSubmit)="saveRecipeConfig()" class="grid grid-cols-1 gap-3">
              <input formControlName="name" type="text" placeholder="Recipe name"
                     class="rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-800 text-sm text-text-main-light dark:text-text-main-dark">
              <input formControlName="code" type="text" placeholder="Recipe code"
                     class="rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-800 text-sm text-text-main-light dark:text-text-main-dark uppercase">
              <input formControlName="description" type="text" placeholder="Description"
                     class="rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-800 text-sm text-text-main-light dark:text-text-main-dark">
              <label class="inline-flex items-center gap-2 text-sm text-text-main-light dark:text-text-main-dark">
                <input type="checkbox" formControlName="active">
                Active recipe
              </label>
              <button type="submit"
                      class="rounded-lg border border-border-light dark:border-border-dark py-2.5 text-sm font-semibold text-text-main-light dark:text-text-main-dark hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                      [disabled]="!selectedRecipeId() || recipeConfigForm.invalid">
                Save Recipe Config
              </button>
            </form>
          </div>

          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <label class="text-xs uppercase tracking-wider text-text-sub-light dark:text-text-sub-dark">Recipe Ingredients</label>
              <span class="text-xs px-2 py-1 rounded bg-primary/10 text-primary font-semibold">Yield: {{ selectedRecipeYield().toFixed(1) }} kg</span>
            </div>

            <form [formGroup]="recipeLineForm" (ngSubmit)="upsertRecipeLine()" class="grid grid-cols-1 md:grid-cols-3 gap-2">
              <select formControlName="ingredientId"
                      class="md:col-span-2 rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-800 text-sm text-text-main-light dark:text-text-main-dark">
                <option value="">Select ingredient...</option>
                @for (ingredient of ingredients(); track ingredient.id) {
                  <option [value]="ingredient.id">{{ ingredient.name }} ({{ ingredient.unit }})</option>
                }
              </select>
              <input formControlName="qty" type="number" min="0" step="0.1" placeholder="Qty"
                     class="rounded-lg border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-800 text-sm text-text-main-light dark:text-text-main-dark">
              <button type="submit"
                      class="md:col-span-3 rounded-lg bg-primary text-white py-2.5 text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50"
                      [disabled]="!selectedRecipeId() || recipeLineForm.invalid">
                Add / Update Ingredient Line
              </button>
            </form>

            <div class="rounded-xl border border-border-light dark:border-border-dark overflow-hidden">
              <div class="divide-y divide-border-light dark:divide-border-dark max-h-[240px] overflow-y-auto">
                @if (selectedRecipeLines().length === 0) {
                  <div class="px-4 py-6 text-sm text-text-sub-light dark:text-text-sub-dark text-center">
                    No ingredients mapped yet.
                  </div>
                }

                @for (line of selectedRecipeLines(); track line.ingredientId) {
                  <div class="px-4 py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <p class="text-sm font-medium text-text-main-light dark:text-text-main-dark">{{ line.name }}</p>
                      <p class="text-xs text-text-sub-light dark:text-text-sub-dark">{{ line.qty }} {{ line.unit }}</p>
                    </div>
                    <button
                      type="button"
                      (click)="removeRecipeLine(line.ingredientId)"
                      class="px-2.5 py-1.5 rounded border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50 dark:border-red-900/30 dark:hover:bg-red-900/20">
                      Remove
                    </button>
                  </div>
                }
              </div>
            </div>

            <div class="text-xs text-text-sub-light dark:text-text-sub-dark">
              Mapped flavors:
              <span class="font-semibold text-text-main-light dark:text-text-main-dark">{{ selectedRecipeFlavorNames() || 'None' }}</span>
            </div>
          </div>
        </div>
      </article>
    </section>
  `,
})
export class RecipesAdminComponent {
  private readonly fb = inject(FormBuilder);
  private readonly masterData = inject(RecipeMasterDataService);

  readonly ingredients = this.masterData.ingredients;
  readonly recipes = this.masterData.recipes;
  readonly flavors = this.masterData.flavors;

  readonly units: IngredientUnit[] = ['kg', 'L', 'g', 'ml', 'pcs', 'boxes'];
  readonly statusMessage = signal('');

  readonly selectedIngredientId = signal('');
  readonly selectedRecipeId = signal('');

  readonly selectedRecipe = computed(() =>
    this.recipes().find((recipe) => recipe.id === this.selectedRecipeId()) ?? null,
  );

  readonly selectedRecipeLines = computed(() =>
    this.masterData.resolveRecipeIngredients(this.selectedRecipe()),
  );

  readonly selectedRecipeYield = computed(() => this.masterData.recipeYield(this.selectedRecipe()));

  readonly selectedRecipeFlavorNames = computed(() => {
    const recipeId = this.selectedRecipeId();
    if (!recipeId) {
      return '';
    }

    const names = this.flavors()
      .filter((flavor) => flavor.recipeId === recipeId)
      .map((flavor) => flavor.name);

    return names.join(', ');
  });

  readonly ingredientCreateForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    unit: ['kg' as IngredientUnit, Validators.required],
  });

  readonly ingredientConfigForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    unit: ['kg' as IngredientUnit, Validators.required],
    active: [true],
  });

  readonly flavorCreateForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    code: ['', Validators.required],
  });

  readonly recipeCreateForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    code: ['', Validators.required],
    description: [''],
  });

  readonly recipeConfigForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    code: ['', Validators.required],
    description: [''],
    active: [true],
  });

  readonly recipeLineForm = this.fb.nonNullable.group({
    ingredientId: ['', Validators.required],
    qty: [0, [Validators.required, Validators.min(0.001)]],
  });

  createIngredient(): void {
    if (this.ingredientCreateForm.invalid) {
      return;
    }

    const values = this.ingredientCreateForm.getRawValue();
    const created = this.masterData.createIngredient({
      name: values.name,
      unit: values.unit,
    });

    this.statusMessage.set(`Ingredient ${created.name} created.`);
    this.ingredientCreateForm.reset({ name: '', unit: 'kg' });
  }

  onIngredientSelection(event: Event): void {
    const ingredientId = (event.target as HTMLSelectElement).value;
    this.selectedIngredientId.set(ingredientId);

    const ingredient = this.ingredients().find((item) => item.id === ingredientId);
    if (!ingredient) {
      this.ingredientConfigForm.reset({ name: '', unit: 'kg', active: true });
      return;
    }

    this.ingredientConfigForm.reset({
      name: ingredient.name,
      unit: ingredient.unit,
      active: ingredient.active,
    });
  }

  saveIngredientConfig(): void {
    const ingredientId = this.selectedIngredientId();
    if (!ingredientId || this.ingredientConfigForm.invalid) {
      return;
    }

    const values = this.ingredientConfigForm.getRawValue();
    this.masterData.updateIngredient(ingredientId, {
      name: values.name,
      unit: values.unit,
      active: values.active,
    });

    this.statusMessage.set(`Ingredient configuration saved.`);
  }

  createFlavor(): void {
    if (this.flavorCreateForm.invalid) {
      return;
    }

    const values = this.flavorCreateForm.getRawValue();
    const created = this.masterData.createFlavor({
      name: values.name,
      code: values.code,
    });

    this.statusMessage.set(`Flavor ${created.name} created.`);
    this.flavorCreateForm.reset({ name: '', code: '' });
  }

  mapFlavorToRecipe(flavorId: string, event: Event): void {
    const recipeIdValue = (event.target as HTMLSelectElement).value;
    this.masterData.mapFlavorToRecipe(flavorId, recipeIdValue || null);
    this.statusMessage.set('Flavor mapped to recipe.');
  }

  toggleFlavor(flavorId: string, event: Event): void {
    const active = (event.target as HTMLInputElement).checked;
    this.masterData.updateFlavor(flavorId, { active });
    this.statusMessage.set(`Flavor status updated.`);
  }

  createRecipe(): void {
    if (this.recipeCreateForm.invalid) {
      return;
    }

    const values = this.recipeCreateForm.getRawValue();
    const created = this.masterData.createRecipe({
      name: values.name,
      code: values.code,
      description: values.description,
    });

    this.statusMessage.set(`Recipe ${created.name} created.`);
    this.recipeCreateForm.reset({ name: '', code: '', description: '' });

    this.selectedRecipeId.set(created.id);
    this.recipeConfigForm.reset({
      name: created.name,
      code: created.code,
      description: created.description,
      active: created.active,
    });
  }

  onRecipeSelection(event: Event): void {
    const recipeId = (event.target as HTMLSelectElement).value;
    this.selectedRecipeId.set(recipeId);

    const recipe = this.recipes().find((item) => item.id === recipeId);
    if (!recipe) {
      this.recipeConfigForm.reset({ name: '', code: '', description: '', active: true });
      return;
    }

    this.recipeConfigForm.reset({
      name: recipe.name,
      code: recipe.code,
      description: recipe.description,
      active: recipe.active,
    });
  }

  saveRecipeConfig(): void {
    const recipeId = this.selectedRecipeId();
    if (!recipeId || this.recipeConfigForm.invalid) {
      return;
    }

    const values = this.recipeConfigForm.getRawValue();
    this.masterData.updateRecipe(recipeId, {
      name: values.name,
      code: values.code,
      description: values.description,
      active: values.active,
    });

    this.statusMessage.set('Recipe configuration saved.');
  }

  upsertRecipeLine(): void {
    const recipeId = this.selectedRecipeId();
    if (!recipeId || this.recipeLineForm.invalid) {
      return;
    }

    const values = this.recipeLineForm.getRawValue();
    this.masterData.upsertRecipeIngredient(recipeId, values.ingredientId, Number(values.qty));
    this.statusMessage.set('Recipe ingredient line updated.');
    this.recipeLineForm.reset({ ingredientId: '', qty: 0 });
  }

  removeRecipeLine(ingredientId: string): void {
    const recipeId = this.selectedRecipeId();
    if (!recipeId) {
      return;
    }

    this.masterData.removeRecipeIngredient(recipeId, ingredientId);
    this.statusMessage.set('Ingredient removed from recipe.');
  }

  trackByIngredient(_: number, ingredient: IngredientDefinition): string {
    return ingredient.id;
  }
}
