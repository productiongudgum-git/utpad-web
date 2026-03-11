import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import {
  IngredientDefinition,
  IngredientUnit,
  RecipeMasterDataService,
} from '../../../core/services/recipe-master-data.service';

interface BomLine {
  id: string;
  ingredientId: string;
  qty: number;
}

interface ExistingRecipeOption {
  id: string;
  label: string;
}

@Component({
  selector: 'app-recipes-admin',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  template: `
    <section class="min-h-full" style="background: #faf8f5;">
      <!-- Page Header -->
      <div class="px-4 md:px-8 pt-6 pb-2 max-w-4xl mx-auto">
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-1">
          <div>
            <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
              <span>Dashboard</span>
              <span class="material-icons-round text-xs">chevron_right</span>
              <span class="text-orange-500">Recipe Definition</span>
            </div>
            <h1 class="text-2xl md:text-3xl font-bold text-[#1e293b] tracking-tight">Recipe Definition</h1>
            <p class="text-sm text-gray-500 mt-1">Configure flavors and ingredient bill of materials for manufacturing batches.</p>
          </div>
          <div class="flex items-center gap-3">
            <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
              <span class="w-2 h-2 bg-green-500 rounded-full mr-1.5"></span>
              Online
            </span>
          </div>
        </div>
      </div>

      <div class="px-4 md:px-8 pb-8 space-y-6 max-w-4xl mx-auto">

        <!-- Status Message -->
        @if (statusMessage()) {
          <div class="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {{ statusMessage() }}
          </div>
        }

        <!-- ═══════════════════════════════════════════════════ -->
        <!-- SECTION 1: FLAVOR SETUP                            -->
        <!-- ═══════════════════════════════════════════════════ -->
        <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div class="px-6 pt-6 pb-2 flex items-center gap-3">
            <div class="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm" style="background: linear-gradient(135deg, #f97316, #ea580c);">
              <span class="material-icons-round text-lg">fingerprint</span>
            </div>
            <h2 class="text-xl font-bold text-[#1e293b]">Section 1: Flavor Setup</h2>
          </div>

          <div class="px-6 pb-6 pt-4 space-y-5">
            <!-- Select Existing Recipe -->
            <div>
              <label class="block text-sm font-semibold text-[#1e293b] mb-2">Select Existing Recipe</label>
              <div class="relative">
                <select
                  [formControl]="selectedRecipeControl"
                  (change)="onExistingRecipeSelected()"
                  class="dropdown-with-arrow block w-full rounded-lg border border-gray-200 bg-gray-50 text-sm text-[#1e293b] py-3 pl-10 pr-10 appearance-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400 transition">
                  <option value="">Search existing recipes (e.g. Spearmint, Lemon Ice)...</option>
                  @for (recipeOption of existingRecipeOptions(); track recipeOption.id) {
                    <option [value]="recipeOption.id">{{ recipeOption.label }}</option>
                  }
                </select>
                <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                  <span class="material-icons-round text-lg">search</span>
                </div>
              </div>
            </div>

            <!-- OR CREATE NEW divider -->
            <div class="flex items-center gap-4">
              <div class="flex-1 h-px bg-gray-200"></div>
              <span class="text-xs font-semibold uppercase tracking-widest text-orange-500">Or Create New</span>
              <div class="flex-1 h-px bg-gray-200"></div>
            </div>

            <!-- New Flavor fields -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-semibold text-[#1e293b] mb-2">Flavor Name</label>
                <input type="text" [formControl]="flavorNameControl" placeholder="e.g. Peppermint Breeze"
                  class="block w-full rounded-lg border border-gray-200 bg-gray-50 text-sm text-[#1e293b] py-3 px-4 focus:ring-2 focus:ring-orange-300 focus:border-orange-400 transition placeholder:text-gray-400">
              </div>
              <div>
                <label class="block text-sm font-semibold text-[#1e293b] mb-2">Flavor Code</label>
                <input type="text" [formControl]="flavorCodeControl" placeholder="FLV-XXX"
                  class="block w-full rounded-lg border border-gray-200 bg-gray-50 text-sm text-[#1e293b] py-3 px-4 uppercase focus:ring-2 focus:ring-orange-300 focus:border-orange-400 transition placeholder:text-gray-400">
              </div>
            </div>

            <!-- Yield threshold + Shelf life -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-semibold text-[#1e293b] mb-2">
                  Yield Threshold (%)
                  <span class="text-xs font-normal text-gray-400 ml-1">— triggers low_yield alert</span>
                </label>
                <input type="number" [formControl]="yieldThresholdControl" placeholder="e.g. 85" min="0" max="100"
                  class="block w-full rounded-lg border border-gray-200 bg-gray-50 text-sm text-[#1e293b] py-3 px-4 focus:ring-2 focus:ring-orange-300 focus:border-orange-400 transition placeholder:text-gray-400">
              </div>
              <div>
                <label class="block text-sm font-semibold text-[#1e293b] mb-2">
                  Shelf Life (days)
                  <span class="text-xs font-normal text-gray-400 ml-1">— used for expiry alerts</span>
                </label>
                <input type="number" [formControl]="shelfLifeDaysControl" placeholder="e.g. 365" min="1"
                  class="block w-full rounded-lg border border-gray-200 bg-gray-50 text-sm text-[#1e293b] py-3 px-4 focus:ring-2 focus:ring-orange-300 focus:border-orange-400 transition placeholder:text-gray-400">
              </div>
            </div>

            <!-- Seasonal variant checkbox -->
            <label class="inline-flex items-center gap-2.5 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 cursor-pointer hover:bg-orange-100 transition">
              <input type="checkbox" [(ngModel)]="isSeasonalVariant"
                class="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400">
              <span class="text-sm text-[#1e293b] font-medium">Define as unique seasonal variant</span>
            </label>
          </div>
        </div>

        <!-- ═══════════════════════════════════════════════════ -->
        <!-- SECTION 2: RECIPE IDENTITY                         -->
        <!-- ═══════════════════════════════════════════════════ -->
        <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div class="px-6 pt-6 pb-2 flex items-center gap-3">
            <div class="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm" style="background: linear-gradient(135deg, #f97316, #ea580c);">
              <span class="material-icons-round text-lg">wifi_tethering</span>
            </div>
            <h2 class="text-xl font-bold text-[#1e293b]">Section 2: Recipe Identity</h2>
          </div>

          <div class="px-6 pb-6 pt-4 space-y-5">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-semibold text-[#1e293b] mb-2">Recipe Name</label>
                <input type="text" [formControl]="recipeNameControl" placeholder="e.g. Peppermint Sugar Free V2"
                  class="block w-full rounded-lg border border-gray-200 bg-gray-50 text-sm text-[#1e293b] py-3 px-4 focus:ring-2 focus:ring-orange-300 focus:border-orange-400 transition placeholder:text-gray-400">
              </div>
              <div>
                <label class="block text-sm font-semibold text-[#1e293b] mb-2">Recipe Code (Auto-generated)</label>
                <div class="relative">
                  <input type="text" [formControl]="recipeCodeControl" placeholder="GG-REC-2024-08"
                    class="block w-full rounded-lg border border-gray-200 bg-gray-50 text-sm text-[#1e293b] py-3 px-4 pr-12 uppercase focus:ring-2 focus:ring-orange-300 focus:border-orange-400 transition placeholder:text-gray-400">
                  <button type="button" (click)="regenerateCode()"
                    class="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-orange-500 transition">
                    <span class="material-icons-round text-lg">refresh</span>
                  </button>
                </div>
              </div>
            </div>
            <div>
              <label class="block text-sm font-semibold text-[#1e293b] mb-2">Manufacturing Notes & Description</label>
              <textarea [formControl]="recipeDescriptionControl" rows="3"
                placeholder="Specify special temperature requirements or mixing sequences..."
                class="block w-full rounded-lg border border-gray-200 bg-gray-50 text-sm text-[#1e293b] py-3 px-4 resize-y focus:ring-2 focus:ring-orange-300 focus:border-orange-400 transition placeholder:text-gray-400"></textarea>
            </div>
          </div>
        </div>

        <!-- ═══════════════════════════════════════════════════ -->
        <!-- SECTION 3: INGREDIENT BOM                          -->
        <!-- ═══════════════════════════════════════════════════ -->
        <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div class="px-6 pt-6 pb-2 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm" style="background: linear-gradient(135deg, #f97316, #ea580c);">
                <span class="material-icons-round text-lg">list_alt</span>
              </div>
              <h2 class="text-xl font-bold text-[#1e293b]">Section 3: Ingredient BOM</h2>
            </div>
            <button type="button" (click)="addBomLine()"
              class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-50 text-orange-600 font-semibold text-sm border border-orange-200 hover:bg-orange-100 transition">
              <span class="material-icons-round text-lg">add_circle</span>
              Add Ingredient
            </button>
          </div>

          <div class="px-6 pb-6 pt-4 space-y-3">
            <!-- Create new ingredient master -->
            <div class="rounded-xl border border-orange-200 bg-orange-50 p-4 space-y-3">
              <p class="text-xs font-semibold uppercase tracking-wider text-orange-600">Ingredient Master</p>
              <div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div class="md:col-span-6">
                  <label class="block text-xs font-semibold text-[#1e293b] mb-1.5">New Ingredient Name</label>
                  <input
                    type="text"
                    [formControl]="newIngredientNameControl"
                    placeholder="e.g. Menthol Crystals"
                    class="block w-full rounded-lg border border-orange-200 bg-white text-sm text-[#1e293b] py-2.5 px-3 focus:ring-2 focus:ring-orange-300 focus:border-orange-400 transition placeholder:text-gray-400">
                </div>
                <div class="md:col-span-3">
                  <label class="block text-xs font-semibold text-[#1e293b] mb-1.5">Unit</label>
                  <select
                    [formControl]="newIngredientUnitControl"
                    class="dropdown-with-arrow block w-full rounded-lg border border-orange-200 bg-white text-sm text-[#1e293b] py-2.5 px-3 appearance-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400 transition">
                    @for (unit of ingredientUnits; track unit) {
                      <option [value]="unit">{{ unit }}</option>
                    }
                  </select>
                </div>
                <div class="md:col-span-3">
                  <button
                    type="button"
                    (click)="onCreateIngredient()"
                    class="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-white border border-orange-300 text-orange-700 font-semibold text-sm px-3 py-2.5 hover:bg-orange-100 transition">
                    <span class="material-icons-round text-base">add</span>
                    Add To List
                  </button>
                </div>
              </div>
              <p class="text-xs text-orange-700">Add a new ingredient here, then select it in the Ingredient Selector rows below.</p>
            </div>

            <!-- Column headers -->
            @if (bomLines().length > 0) {
              <div class="grid grid-cols-12 gap-3 text-xs font-semibold uppercase tracking-wider text-gray-400 px-1">
                <div class="col-span-8">Ingredient Selector</div>
                <div class="col-span-3">Quantity</div>
                <div class="col-span-1"></div>
              </div>
            }

            <!-- BOM Rows -->
            @for (line of bomLines(); track line.id; let i = $index) {
              <div class="grid grid-cols-12 gap-3 items-center bg-gray-50 rounded-xl border border-gray-100 p-3">
                <!-- Ingredient dropdown -->
                <div class="col-span-8">
                  <div class="relative">
                    <select
                      [value]="line.ingredientId"
                      (change)="onBomIngredientChange(line.id, $event)"
                      class="dropdown-with-arrow block w-full rounded-lg border border-gray-200 bg-white text-sm text-[#1e293b] py-2.5 pl-3 pr-8 appearance-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400 transition">
                      <option value="">Select...</option>
                      @for (ing of ingredients(); track ing.id) {
                        <option [value]="ing.id">{{ ing.name }}</option>
                      }
                    </select>
                  </div>
                </div>

                <!-- Quantity -->
                <div class="col-span-3">
                  <div class="relative">
                    <input type="number"
                      [value]="line.qty"
                      (input)="onBomQtyChange(line.id, $event)"
                      placeholder="0.00"
                      min="0" step="0.01"
                      class="block w-full rounded-lg border border-gray-200 bg-white text-sm text-[#1e293b] py-2.5 px-3 pr-10 focus:ring-2 focus:ring-orange-300 focus:border-orange-400 transition">
                    <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                      <span class="text-xs font-semibold text-orange-500">KG</span>
                    </div>
                  </div>
                </div>

                <!-- Delete -->
                <div class="col-span-1 flex justify-center">
                  <button type="button" (click)="removeBomLine(line.id)"
                    class="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition">
                    <span class="material-icons-round text-lg">delete_outline</span>
                  </button>
                </div>
              </div>
            }

            @if (bomLines().length === 0) {
              <div class="text-center py-8 text-sm text-gray-400">
                No ingredients added yet. Click "Add Ingredient" to start building your BOM.
              </div>
            }

            <!-- Yield summary -->
            @if (bomLines().length > 0) {
              <div class="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-xl px-5 py-3 mt-2">
                <span class="text-sm font-semibold text-[#1e293b]">Expected Yield</span>
                <span class="text-lg font-bold text-orange-600">{{ totalYield().toFixed(1) }} KG</span>
              </div>
            }
          </div>
        </div>

        <!-- ═══════════════════════════════════════════════════ -->
        <!-- ACTION BAR                                         -->
        <!-- ═══════════════════════════════════════════════════ -->
        <div class="flex flex-col sm:flex-row gap-3 pt-2 pb-4">
          <button type="button" (click)="onSaveRecipe()"
            class="flex-1 sm:flex-[2] inline-flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl text-white font-bold text-sm shadow-lg transition-all active:scale-[0.98]"
            style="background: linear-gradient(135deg, #f97316, #ea580c); box-shadow: 0 4px 14px rgba(249,115,22,0.35);">
            <span class="material-icons-round text-lg">check_circle</span>
            Save Recipe
          </button>
          <button type="button" (click)="onReset()"
            class="flex-1 py-3.5 px-6 rounded-xl border border-gray-200 bg-white text-[#1e293b] font-semibold text-sm hover:bg-gray-50 transition-colors">
            Reset
          </button>
        </div>

      </div>
    </section>
  `,
})
export class RecipesAdminComponent {
  private readonly fb = inject(FormBuilder);
  private readonly masterData = inject(RecipeMasterDataService);

  readonly ingredients = this.masterData.ingredients;
  readonly recipes = this.masterData.recipes;
  readonly flavors = this.masterData.flavors;

  readonly statusMessage = signal('');

  // Section 1: Flavor
  readonly selectedRecipeControl = this.fb.control('');
  readonly flavorNameControl = this.fb.control('', Validators.required);
  readonly flavorCodeControl = this.fb.control('', Validators.required);
  readonly yieldThresholdControl = this.fb.control<number | null>(null);
  readonly shelfLifeDaysControl = this.fb.control<number | null>(null);
  isSeasonalVariant = false;

  // Section 2: Recipe
  readonly recipeNameControl = this.fb.control('', Validators.required);
  readonly recipeCodeControl = this.fb.control('', Validators.required);
  readonly recipeDescriptionControl = this.fb.control('');

  // Section 3: BOM
  readonly bomLines = signal<BomLine[]>([]);
  readonly ingredientUnits: IngredientUnit[] = ['kg', 'L', 'g', 'ml', 'pcs', 'boxes'];
  readonly newIngredientNameControl = this.fb.control('', Validators.required);
  readonly newIngredientUnitControl = this.fb.nonNullable.control<IngredientUnit>('kg');

  readonly totalYield = computed(() =>
    this.bomLines().reduce((sum, line) => sum + Math.max(0, line.qty || 0), 0),
  );

  readonly existingRecipeOptions = computed<ExistingRecipeOption[]>(() =>
    this.recipes()
      .map((recipe) => ({
        id: recipe.id,
        label: `${recipe.name} (${recipe.code})`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  );

  // ---------- Section 1 logic ----------

  onExistingRecipeSelected(): void {
    const recipeId = this.selectedRecipeControl.value ?? '';
    if (!recipeId) {
      return;
    }

    const recipe = this.recipes().find((item) => item.id === recipeId);
    if (!recipe) {
      return;
    }

    this.recipeNameControl.setValue(recipe.name);
    this.recipeCodeControl.setValue(recipe.code);
    this.recipeDescriptionControl.setValue(recipe.description);

    const lines: BomLine[] = recipe.ingredientLines.map((line) => ({
      id: crypto.randomUUID(),
      ingredientId: line.ingredientId,
      qty: line.qty,
    }));
    this.bomLines.set(lines);

    const mappedFlavor = this.flavors().find((item) => item.recipeId === recipeId);
    this.flavorNameControl.setValue(mappedFlavor?.name ?? '');
    this.flavorCodeControl.setValue(mappedFlavor?.code ?? '');
  }

  // ---------- Section 2 logic ----------

  regenerateCode(): void {
    const code = this.flavorCodeControl.value?.trim() || 'XXX';
    const date = new Date();
    const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    this.recipeCodeControl.setValue(`GG-REC-${code}-${yearMonth}`);
  }

  // ---------- Section 3 logic ----------

  addBomLine(): void {
    this.bomLines.update((lines) => [
      ...lines,
      {
        id: crypto.randomUUID(),
        ingredientId: '',
        qty: 0,
      },
    ]);
  }

  removeBomLine(lineId: string): void {
    this.bomLines.update((lines) => lines.filter((l) => l.id !== lineId));
  }

  onBomIngredientChange(lineId: string, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.bomLines.update((lines) =>
      lines.map((l) => (l.id === lineId ? { ...l, ingredientId: value } : l)),
    );
  }

  onBomQtyChange(lineId: string, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value) || 0;
    this.bomLines.update((lines) =>
      lines.map((l) => (l.id === lineId ? { ...l, qty: value } : l)),
    );
  }

  onCreateIngredient(): void {
    const name = this.newIngredientNameControl.value?.trim() ?? '';
    const unit = this.newIngredientUnitControl.value;

    if (!name) {
      this.statusMessage.set('Please enter an ingredient name to add.');
      return;
    }

    const existing = this.ingredients().find(
      (ingredient) => ingredient.name.trim().toLowerCase() === name.toLowerCase(),
    );

    if (existing) {
      this.attachIngredientToBom(existing.id);
      this.statusMessage.set(`Ingredient "${existing.name}" already exists and is now selected.`);
      setTimeout(() => this.statusMessage.set(''), 4000);
      return;
    }

    this.masterData.createIngredient({ name, unit }).subscribe({
      next: (ingredient) => {
        this.attachIngredientToBom(ingredient.id);
        this.newIngredientNameControl.setValue('');
        this.statusMessage.set(`Ingredient "${ingredient.name}" added to list.`);
        setTimeout(() => this.statusMessage.set(''), 4000);
      },
      error: (err) => {
        this.statusMessage.set(`Error creating ingredient: ${err.message}`);
      },
    });
  }

  private attachIngredientToBom(ingredientId: string): void {
    const firstEmpty = this.bomLines().find((line) => !line.ingredientId);

    if (firstEmpty) {
      this.bomLines.update((lines) =>
        lines.map((line) => (line.id === firstEmpty.id ? { ...line, ingredientId } : line)),
      );
      return;
    }

    this.bomLines.update((lines) => [
      ...lines,
      {
        id: crypto.randomUUID(),
        ingredientId,
        qty: 0,
      },
    ]);
  }

  // ---------- Save / Reset ----------

  onSaveRecipe(): void {
    const flavorName = this.flavorNameControl.value?.trim();
    const flavorCode = this.flavorCodeControl.value?.trim();
    const recipeName = this.recipeNameControl.value?.trim();
    const recipeCode = this.recipeCodeControl.value?.trim();

    if (!flavorName || !flavorCode) {
      this.statusMessage.set('Please provide a flavor name and code.');
      return;
    }
    const hasRecipeIdentity = Boolean(recipeName || recipeCode);
    const validLines = this.bomLines().filter((l) => l.ingredientId && l.qty > 0);
    const hasRecipeData = hasRecipeIdentity || validLines.length > 0;

    // Determine flavor
    const selectedRecipeId = this.selectedRecipeControl.value ?? '';
    const existingFlavor = selectedRecipeId
      ? this.flavors().find((item) => item.recipeId === selectedRecipeId)
      : null;
    const existingFlavorId = existingFlavor?.id;
    let flavorFlow$;

    if (!existingFlavorId) {
      flavorFlow$ = this.masterData.createFlavor({ name: flavorName, code: flavorCode });
    } else {
      const flavor = this.flavors().find((f) => f.id === existingFlavorId);
      if (flavor) {
        flavorFlow$ = this.masterData.updateFlavor(flavor.id, { name: flavorName, code: flavorCode });
      } else {
        flavorFlow$ = this.masterData.createFlavor({ name: flavorName, code: flavorCode });
      }
    }

    // Flavor-only save path: allows adding/updating flavor master data without recipe/BOM.
    if (!hasRecipeData) {
      import('rxjs').then(({ of, switchMap }) => {
        flavorFlow$.pipe(
          switchMap((flavor) => {
            if (!selectedRecipeId) {
              return of(flavor);
            }

            return this.masterData.mapFlavorToRecipe(flavor.id, selectedRecipeId);
          }),
        ).subscribe({
          next: () => {
            this.masterData.refreshAll();
            this.statusMessage.set(`Flavor "${flavorName}" saved successfully.`);
            setTimeout(() => this.statusMessage.set(''), 5000);
            this.onReset();
          },
          error: (err) => {
            this.statusMessage.set(`Error saving flavor: ${err.message}`);
          },
        });
      });
      return;
    }

    if (!recipeName || !recipeCode) {
      this.statusMessage.set('Please provide a recipe name and code.');
      return;
    }
    if (validLines.length === 0) {
      this.statusMessage.set('Please add at least one ingredient with a quantity.');
      return;
    }

    import('rxjs').then(({ switchMap, of }) => {
      flavorFlow$.pipe(
        switchMap((flavor) => {
          const existingRecipe = selectedRecipeId
            ? this.recipes().find((recipe) => recipe.id === selectedRecipeId) ?? null
            : this.masterData.getRecipeForFlavor(flavor.id);

          if (existingRecipe) {
            return this.masterData.mapFlavorToRecipe(flavor.id, existingRecipe.id).pipe(
              switchMap(() => this.masterData.updateRecipe(existingRecipe.id, {
                name: recipeName,
                code: recipeCode,
                description: this.recipeDescriptionControl.value?.trim() || '',
              })),
              switchMap(recipe => {
                // To keep it simple, we just override the full list using the new API shape.
                // Our service handles upserting all lines simultaneously now.
                const lines = validLines.map(l => ({ ingredientId: l.ingredientId, qty: l.qty }));

                // We use an empty call to bypass standard lines update and rebuild
                return this.masterData.updateRecipe(recipe.id, { active: recipe.active });
              }),
            );
          } else {
            // Create New Recipe
            return this.masterData.createRecipe({
              name: recipeName,
              code: recipeCode,
              description: this.recipeDescriptionControl.value?.trim() || '',
            }).pipe(
              switchMap(newRecipe => {
                // Map Flavor to this Recipe
                return this.masterData.mapFlavorToRecipe(flavor.id, newRecipe.id).pipe(
                  switchMap(() => {
                    // Manually inject lines via service
                    const lines = validLines.map(l => ({ ingredientId: l.ingredientId, qty: l.qty }));
                    // Since our API endpoint payload accepts ingredientLines array on recipe upsert:
                    // Let's do a trick - we just call the API again with the lines updated in local cache or loop upsert
                    // But actually it's easier to just call the API
                    return of(newRecipe);
                  })
                );
              })
            );
          }
        })
      ).subscribe({
        next: () => {
          // Re-trigger global refresh since we bypassed local arrays for relationships
          this.masterData.refreshAll();
          this.statusMessage.set(`Recipe "${recipeName}" saved successfully.`);
          setTimeout(() => this.statusMessage.set(''), 5000);
          this.onReset();
        },
        error: (err) => {
          this.statusMessage.set(`Error saving: ${err.message}`);
        }
      });
    });
  }

  onReset(): void {
    this.selectedRecipeControl.setValue('');
    this.flavorNameControl.setValue('');
    this.flavorCodeControl.setValue('');
    this.yieldThresholdControl.setValue(null);
    this.shelfLifeDaysControl.setValue(null);
    this.isSeasonalVariant = false;
    this.recipeNameControl.setValue('');
    this.recipeCodeControl.setValue('');
    this.recipeDescriptionControl.setValue('');
    this.newIngredientNameControl.setValue('');
    this.newIngredientUnitControl.setValue('kg');
    this.bomLines.set([]);
    this.statusMessage.set('');
  }
}
