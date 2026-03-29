import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { SupabaseService } from '../../../core/supabase.service';
import { SearchableSelectComponent, SearchableSelectOption } from '../../../shared/components/searchable-select.component';

const UNITS = ['kg', 'g', 'L', 'ml', 'pcs'] as const;

interface Flavor     { id: string; name: string; code: string; }
interface Ingredient { id: string; name: string; default_unit: string; }

interface RecipeIngredient {
  ingredient_id: string;
  name: string;
  quantity: number;
  unit: string;
}

interface RecipeRow {
  id: string;
  name: string;
  flavor_id: string;
  flavor_name: string;
  batch_size_kg: number;
  is_active: boolean;
  ingredients: RecipeIngredient[];
}

interface IngLine {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
}

@Component({
  selector: 'app-recipes-admin',
  standalone: true,
  imports: [CommonModule, DecimalPipe, ReactiveFormsModule, FormsModule, SearchableSelectComponent],
  template: `
    <!-- ── toast ──────────────────────────────────────────────────────────── -->
    @if (toast()) {
      <div class="rcp-toast" [class.rcp-toast-err]="toastKind() === 'error'">
        <span class="material-icons-round" style="font-size:16px;">{{ toastKind() === 'error' ? 'error_outline' : 'check_circle' }}</span>
        {{ toast() }}
      </div>
    }

    <div style="padding:24px;max-width:1140px;">

      <!-- ── Page header ─────────────────────────────────────────────────── -->
      <div style="margin-bottom:24px;display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="font-size:22px;font-weight:700;color:var(--foreground);margin:0 0 4px;font-family:'Cabin',sans-serif;">Recipes</h1>
          <p style="color:#6B7280;font-size:14px;margin:0;">Build bills of materials for each flavor variant.</p>
        </div>
        <button (click)="openNewForm()" [disabled]="showForm() && !editId()"
                style="padding:9px 18px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;opacity:1;"
                [style.opacity]="showForm() && !editId() ? '0.6' : '1'">
          <span class="material-icons-round" style="font-size:18px;">add</span>
          New Recipe
        </button>
      </div>

      <!-- ── Recipe form ─────────────────────────────────────────────────── -->
      @if (showForm()) {
        <div class="recipe-form-card" style="background:var(--card);border-radius:14px;border:1px solid var(--border);padding:24px 24px 28px;margin-bottom:24px;animation:slideDown 0.15s ease;min-height:720px;">

          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
            <h2 style="font-size:16px;font-weight:700;color:var(--foreground);margin:0;">
              {{ editId() ? 'Edit Recipe' : 'New Recipe' }}
            </h2>
            <button (click)="closeForm()" style="border:none;background:none;cursor:pointer;color:#9CA3AF;display:flex;align-items:center;">
              <span class="material-icons-round" style="font-size:20px;">close</span>
            </button>
          </div>

          <form [formGroup]="form" (ngSubmit)="save()">

            <!-- Meta fields -->
            <div class="rcp-meta-grid" style="display:grid;grid-template-columns:2fr 2fr 1.2fr;gap:14px;margin-bottom:20px;">
              <div>
                <label class="rcp-label">Recipe Name *</label>
                <input formControlName="name" class="gg-input" placeholder="e.g. Spearmint Base v2"
                       [style.border-color]="form.get('name')!.invalid && form.get('name')!.touched ? '#dc2626' : ''">
                @if (form.get('name')!.invalid && form.get('name')!.touched) {
                  <p style="color:#dc2626;font-size:11px;margin:3px 0 0;">Required</p>
                }
              </div>

              <div>
                <label class="rcp-label">Flavor *
                  <span style="font-weight:400;color:#9CA3AF;">(search existing or add new)</span>
                </label>
                <app-searchable-select
                  [options]="flavorOptions()"
                  [value]="selectedFlavorId()"
                  placeholder="Select or add a flavor"
                  searchPlaceholder="Search flavors..."
                  emptyText="No matching flavors."
                  createLabelPrefix="Add flavor"
                  [allowCreate]="true"
                  (valueChange)="onFlavorSelected($event)"
                  (createRequested)="createFlavorFromPicker($event)">
                </app-searchable-select>
              </div>

              <div>
                <label class="rcp-label">Batch Size (kg) *</label>
                <input formControlName="batch_size_kg" type="number" min="0.1" step="0.1" class="gg-input" placeholder="100"
                       [style.border-color]="form.get('batch_size_kg')!.invalid && form.get('batch_size_kg')!.touched ? '#dc2626' : ''">
              </div>
            </div>

            <!-- Ingredients table -->
            <div style="margin-bottom:20px;display:flex;flex-direction:column;min-height:440px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                <label class="rcp-label" style="margin:0;">Ingredients
                  <span style="font-weight:400;color:#9CA3AF;font-size:11px;"> — search existing ingredients or add them inline</span>
                </label>
                <button type="button" (click)="addIngLine()"
                        style="padding:5px 12px;background:#f0fdf4;border:1px solid #01AC51;color:#01AC51;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;">
                  <span class="material-icons-round" style="font-size:14px;">add</span> Add ingredient
                </button>
              </div>

              @if (ingLines().length === 0) {
                <div style="padding:20px;border:2px dashed #E5E7EB;border-radius:10px;text-align:center;color:#9CA3AF;font-size:13px;">
                  No ingredients yet — click "Add ingredient" to start building the bill of materials.
                </div>
              }

              @if (ingLines().length > 0) {
                <div class="recipe-ingredients-shell" style="border:1px solid var(--border);border-radius:10px;overflow:visible;background:var(--card);flex:1;display:flex;flex-direction:column;min-height:380px;">
                  <!-- Header -->
                  <div style="display:grid;grid-template-columns:1fr 110px 100px 36px;gap:8px;padding:8px 12px;background:#f8f9fa;border-bottom:1px solid var(--border);">
                    <span style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Ingredient</span>
                    <span style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Quantity</span>
                    <span style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Unit</span>
                    <span></span>
                  </div>
                  <div class="recipe-ingredients-scroll">
                    <!-- Rows -->
                    @for (line of ingLines(); track $index) {
                      <div class="recipe-ingredient-row" style="display:grid;grid-template-columns:1fr 110px 100px 36px;gap:8px;padding:8px 12px;border-bottom:1px solid #f3f4f6;align-items:center;">
                        <app-searchable-select
                          [options]="ingredientOptions()"
                          [value]="line.ingredientId"
                          placeholder="Select ingredient"
                          searchPlaceholder="Search ingredients..."
                          emptyText="No matching ingredients."
                          createLabelPrefix="Add ingredient"
                          [allowCreate]="true"
                          (valueChange)="onIngredientSelected($index, $event)"
                          (createRequested)="createIngredientFromPicker($index, $event)">
                        </app-searchable-select>
                        <input [(ngModel)]="line.quantity" [ngModelOptions]="{standalone:true}"
                               type="number" min="0" step="0.001" class="gg-input"
                               placeholder="0" style="font-size:13px;">
                        <select [(ngModel)]="line.unit" [ngModelOptions]="{standalone:true}"
                                class="gg-input dropdown-with-arrow" style="font-size:13px;">
                          @for (u of UNITS; track u) { <option [value]="u">{{ u }}</option> }
                        </select>
                        <button type="button" (click)="removeIngLine($index)"
                                style="width:32px;height:32px;background:#fff5f5;border:1px solid #fca5a5;border-radius:6px;color:#dc2626;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                          <span class="material-icons-round" style="font-size:15px;">delete_outline</span>
                        </button>
                      </div>
                    }
                  </div>
                  <!-- Totals row -->
                  @if (ingLines().length > 0) {
                    <div style="display:grid;grid-template-columns:1fr 110px 100px 36px;gap:8px;padding:8px 12px;background:#f8f9fa;align-items:center;">
                      <span style="font-size:12px;font-weight:600;color:#374151;">Total (kg-equivalent)</span>
                      <span style="font-size:13px;font-weight:700;color:#01AC51;">{{ kgTotal() | number:'1.0-2' }}</span>
                      <span style="font-size:12px;color:#9CA3AF;">kg</span>
                      <span></span>
                    </div>
                  }
                </div>
              }
            </div>

            @if (formError()) {
              <div style="display:flex;align-items:center;gap:6px;color:#dc2626;font-size:13px;margin-bottom:14px;padding:10px 14px;background:#fff5f5;border:1px solid #fca5a5;border-radius:8px;">
                <span class="material-icons-round" style="font-size:16px;">error_outline</span>
                {{ formError() }}
              </div>
            }

            <div style="display:flex;gap:10px;align-items:center;">
              <button type="submit" [disabled]="saving()"
                      style="padding:9px 20px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;"
                      [style.opacity]="saving() ? '0.7' : '1'">
                @if (saving()) {
                  <span class="material-icons-round rcp-spin" style="font-size:16px;">autorenew</span>
                } @else {
                  <span class="material-icons-round" style="font-size:16px;">save</span>
                }
                {{ saving() ? 'Saving…' : (editId() ? 'Update Recipe' : 'Create Recipe') }}
              </button>
              <button type="button" (click)="closeForm()"
                      style="padding:9px 16px;background:var(--secondary);border:1px solid var(--border);border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;color:var(--foreground);">
                Cancel
              </button>
            </div>
          </form>
        </div>
      }

      <!-- ── Search & stats bar ──────────────────────────────────────────── -->
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
        <div style="flex:1;min-width:200px;position:relative;">
          <span class="material-icons-round" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:17px;color:#9CA3AF;pointer-events:none;">search</span>
          <input [(ngModel)]="rawSearch" (ngModelChange)="searchSig.set($event)"
                 placeholder="Search recipes or flavors…"
                 style="width:100%;padding:9px 12px 9px 34px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:var(--card);color:var(--foreground);outline:none;box-sizing:border-box;">
        </div>
        <span style="font-size:13px;color:#6B7280;white-space:nowrap;">
          {{ filtered().length }} recipe{{ filtered().length === 1 ? '' : 's' }}
        </span>
      </div>

      <!-- ── Recipe list ─────────────────────────────────────────────────── -->
      @if (loading()) {
        <div style="display:flex;flex-direction:column;gap:12px;">
          @for (i of [1,2,3]; track i) {
            <div class="gg-skeleton" style="height:88px;border-radius:12px;"></div>
          }
        </div>
      } @else if (filtered().length === 0) {
        <div style="text-align:center;padding:72px 0;color:#9CA3AF;">
          <span class="material-icons-round" style="font-size:52px;display:block;margin-bottom:14px;">science</span>
          <p style="font-size:15px;font-weight:600;margin:0 0 6px;color:#374151;">
            {{ recipes().length === 0 ? 'No recipes yet' : 'No recipes match your search' }}
          </p>
          <p style="font-size:13px;margin:0;">
            {{ recipes().length === 0 ? 'Create your first recipe using the button above.' : 'Try a different search term.' }}
          </p>
        </div>
      } @else {
        <div style="display:flex;flex-direction:column;gap:10px;">
          @for (r of filtered(); track r.id) {
            <div style="background:var(--card);border-radius:12px;border:1px solid var(--border);overflow:hidden;transition:box-shadow 0.15s;"
                 class="rcp-card">

              <!-- Card top row -->
              <div style="padding:16px 20px;cursor:pointer;" (click)="toggleExpand(r.id)">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">

                  <!-- Left: recipe info -->
                  <div style="min-width:0;flex:1;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;flex-wrap:wrap;">
                      <span style="font-size:15px;font-weight:700;color:var(--foreground);font-family:'Cabin',sans-serif;">{{ r.name }}</span>
                      @if (!r.is_active) {
                        <span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;">Inactive</span>
                      }
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                      <span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#374151;background:#f0fdf4;border:1px solid #bbf7d0;padding:2px 8px;border-radius:6px;font-weight:500;">
                        <span class="material-icons-round" style="font-size:13px;color:#16a34a;">local_dining</span>
                        {{ r.flavor_name }}
                      </span>
                      <span style="font-size:12px;color:#6B7280;">·</span>
                      <span style="font-size:12px;color:#6B7280;">
                        <strong style="color:#374151;">{{ r.batch_size_kg }} kg</strong> batch
                      </span>
                      <span style="font-size:12px;color:#6B7280;">·</span>
                      <span style="font-size:12px;color:#6B7280;">{{ r.ingredients.length }} ingredient{{ r.ingredients.length === 1 ? '' : 's' }}</span>
                    </div>
                  </div>

                  <!-- Right: actions + chevron -->
                  <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;" (click)="$event.stopPropagation()">
                    <button (click)="startEdit(r)"
                            style="padding:6px 12px;background:#f0fdf4;border:1px solid #01AC51;color:#01AC51;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;">
                      <span class="material-icons-round" style="font-size:14px;">edit</span> Edit
                    </button>
                    <button (click)="cloneRecipe(r)" title="Duplicate recipe"
                            style="padding:6px 12px;background:#eff6ff;border:1px solid #93c5fd;color:#1d4ed8;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;">
                      <span class="material-icons-round" style="font-size:14px;">content_copy</span> Clone
                    </button>
                    <button (click)="toggleActive(r)"
                            [style.background]="r.is_active ? '#fffbeb' : '#f0fdf4'"
                            [style.border-color]="r.is_active ? '#fde68a' : '#bbf7d0'"
                            [style.color]="r.is_active ? '#b45309' : '#15803d'"
                            style="padding:6px 12px;border-style:solid;border-width:1px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;">
                      <span class="material-icons-round" style="font-size:14px;">{{ r.is_active ? 'pause_circle' : 'play_circle' }}</span>
                      {{ r.is_active ? 'Deactivate' : 'Activate' }}
                    </button>
                    <button (click)="deleteRecipe(r.id)"
                            style="padding:6px 10px;background:#fff5f5;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:12px;cursor:pointer;display:flex;align-items:center;">
                      <span class="material-icons-round" style="font-size:16px;">delete_outline</span>
                    </button>
                    <span class="material-icons-round" style="font-size:20px;color:#9CA3AF;transition:transform 0.2s;"
                          [style.transform]="expanded().has(r.id) ? 'rotate(180deg)' : 'none'">expand_more</span>
                  </div>
                </div>
              </div>

              <!-- Expanded ingredient table -->
              @if (expanded().has(r.id)) {
                <div style="border-top:1px solid var(--border);background:#fafafa;">
                  @if (r.ingredients.length === 0) {
                    <div style="padding:20px 24px;color:#9CA3AF;font-size:13px;text-align:center;">No ingredients added to this recipe.</div>
                  } @else {
                    <table style="width:100%;border-collapse:collapse;">
                      <thead>
                        <tr style="background:#f3f4f6;">
                          <th style="text-align:left;padding:8px 20px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">#</th>
                          <th style="text-align:left;padding:8px 12px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Ingredient</th>
                          <th style="text-align:right;padding:8px 12px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Quantity</th>
                          <th style="text-align:left;padding:8px 12px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Unit</th>
                          <th style="text-align:right;padding:8px 20px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">% of batch</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (ing of r.ingredients; track ing.ingredient_id; let idx = $index) {
                          <tr style="border-top:1px solid #f0f0f0;">
                            <td style="padding:9px 20px;font-size:12px;color:#9CA3AF;">{{ idx + 1 }}</td>
                            <td style="padding:9px 12px;font-size:13px;font-weight:600;color:var(--foreground);">{{ ing.name }}</td>
                            <td style="padding:9px 12px;font-size:13px;font-weight:700;color:#374151;text-align:right;">{{ ing.quantity | number:'1.0-3' }}</td>
                            <td style="padding:9px 12px;">
                              <span style="font-size:11px;font-weight:600;background:#f3f4f6;padding:2px 7px;border-radius:4px;color:#374151;">{{ ing.unit }}</span>
                            </td>
                            <td style="padding:9px 20px;text-align:right;">
                              @if (ing.unit === 'kg' && r.batch_size_kg > 0) {
                                <span style="font-size:12px;color:#6B7280;">
                                  {{ (ing.quantity / r.batch_size_kg * 100) | number:'1.0-1' }}%
                                </span>
                              } @else {
                                <span style="font-size:12px;color:#d1d5db;">—</span>
                              }
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  }
                </div>
              }
            </div>
          }
        </div>
      }
    </div>

    <style>
      .rcp-label { display:block; font-size:12px; font-weight:600; color:#374151; margin-bottom:6px; }
      .rcp-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.07); }
      .rcp-toast {
        position:fixed; bottom:24px; right:24px; z-index:9999;
        padding:12px 18px; border-radius:10px;
        background:#1a1a1a; color:#fff;
        font-size:14px; font-weight:500;
        display:flex; align-items:center; gap:8px;
        box-shadow:0 4px 20px rgba(0,0,0,0.25);
        animation:slideUp 0.2s ease;
      }
      .rcp-toast-err { background:#dc2626; }
      .recipe-ingredients-scroll {
        min-height: 320px;
        max-height: 520px;
        flex: 1 1 auto;
        overflow-y: auto;
        overflow-x: visible;
      }
      .recipe-ingredient-row {
        position: relative;
        overflow: visible;
      }
      @keyframes slideUp { from { transform:translateY(16px); opacity:0; } to { transform:translateY(0); opacity:1; } }
      @keyframes slideDown { from { transform:translateY(-8px); opacity:0; } to { transform:translateY(0); opacity:1; } }
      @keyframes spin { to { transform:rotate(360deg); } }
      .rcp-spin { animation: spin 0.8s linear infinite; }
      @media (max-width:760px) { .rcp-meta-grid { grid-template-columns: 1fr 1fr !important; } }
      @media (max-width:480px) { .rcp-meta-grid { grid-template-columns: 1fr !important; } }
    </style>
  `,
})
export class RecipesAdminComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly fb = inject(FormBuilder);

  readonly UNITS = UNITS;

  loading    = signal(true);
  saving     = signal(false);
  showForm   = signal(false);
  editId     = signal<string | null>(null);
  recipes    = signal<RecipeRow[]>([]);
  flavors    = signal<Flavor[]>([]);
  ingredients = signal<Ingredient[]>([]);
  ingLines   = signal<IngLine[]>([]);
  expanded   = signal<Set<string>>(new Set());
  formError  = signal('');
  toast      = signal('');
  toastKind  = signal<'success' | 'error'>('success');

  selectedFlavorId = signal('');

  // Search
  rawSearch = '';
  searchSig = signal('');

  readonly flavorOptions = computed<SearchableSelectOption[]>(() =>
    this.flavors().map((flavor) => ({
      id: flavor.id,
      label: flavor.name,
      sublabel: flavor.code ? `Code: ${flavor.code}` : undefined,
    })),
  );

  readonly ingredientOptions = computed<SearchableSelectOption[]>(() =>
    this.ingredients().map((ingredient) => ({
      id: ingredient.id,
      label: ingredient.name,
      sublabel: ingredient.default_unit ? `Default unit: ${ingredient.default_unit}` : undefined,
    })),
  );

  readonly filtered = computed(() => {
    const q = this.searchSig().toLowerCase().trim();
    if (!q) return this.recipes();
    return this.recipes().filter(r =>
      r.name.toLowerCase().includes(q) || r.flavor_name.toLowerCase().includes(q)
    );
  });

  readonly kgTotal = computed(() =>
    this.ingLines()
      .filter(l => l.unit === 'kg')
      .reduce((s, l) => s + (Number(l.quantity) || 0), 0)
  );

  form = this.fb.nonNullable.group({
    name:          ['', Validators.required],
    batch_size_kg: [100, [Validators.required, Validators.min(0.1)]],
  });

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadIngredients(), this.loadFlavors()]);
    await this.loadRecipes();
  }

  // ── Ingredient lines ──────────────────────────────────────────────────

  addIngLine(): void {
    this.ingLines.update(l => [...l, { ingredientId: '', ingredientName: '', quantity: 0, unit: 'kg' }]);
  }

  removeIngLine(i: number): void {
    this.ingLines.update(l => l.filter((_, idx) => idx !== i));
  }

  onIngredientSelected(index: number, ingredientId: string): void {
    const match = this.ingredients().find(i => i.id === ingredientId);
    if (!match) return;
    this.ingLines.update(lines => lines.map((line, currentIndex) =>
      currentIndex === index
        ? {
            ...line,
            ingredientId: match.id,
            ingredientName: match.name,
            unit: match.default_unit || line.unit,
          }
        : line,
    ));
  }

  onFlavorSelected(flavorId: string): void {
    this.selectedFlavorId.set(flavorId);
  }

  // ── Form open/close ───────────────────────────────────────────────────

  openNewForm(): void {
    this.editId.set(null);
    this.form.reset({ name: '', batch_size_kg: 100 });
    this.selectedFlavorId.set('');
    this.ingLines.set([{ ingredientId: '', ingredientName: '', quantity: 0, unit: 'kg' }]);
    this.formError.set('');
    this.showForm.set(true);
    setTimeout(() => document.querySelector('.recipe-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  startEdit(r: RecipeRow): void {
    this.editId.set(r.id);
    this.form.setValue({ name: r.name, batch_size_kg: r.batch_size_kg });
    this.selectedFlavorId.set(r.flavor_id);
    this.ingLines.set(
      r.ingredients.length > 0
        ? r.ingredients.map(i => ({ ingredientId: i.ingredient_id, ingredientName: i.name, quantity: i.quantity, unit: i.unit }))
        : [{ ingredientId: '', ingredientName: '', quantity: 0, unit: 'kg' }]
    );
    this.formError.set('');
    this.showForm.set(true);
    setTimeout(() => document.querySelector('.recipe-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editId.set(null);
    this.formError.set('');
    this.form.reset();
    this.selectedFlavorId.set('');
    this.ingLines.set([]);
  }

  cloneRecipe(r: RecipeRow): void {
    this.editId.set(null);
    this.form.setValue({ name: `${r.name} Copy`, batch_size_kg: r.batch_size_kg });
    this.selectedFlavorId.set(r.flavor_id);
    this.ingLines.set(
      r.ingredients.map(i => ({ ingredientId: i.ingredient_id, ingredientName: i.name, quantity: i.quantity, unit: i.unit }))
    );
    this.formError.set('');
    this.showForm.set(true);
    setTimeout(() => document.querySelector('.recipe-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  // ── Save ──────────────────────────────────────────────────────────────

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const flavorId = this.selectedFlavorId();
    if (!flavorId) {
      this.formError.set('Please select a flavor.');
      return;
    }

    this.saving.set(true);
    this.formError.set('');

    try {
      const validLines = this.ingLines().filter(l => l.ingredientId && l.quantity > 0);
      const ingredients: Array<{ ingredient_id: string; quantity: number; unit: string }> = [];
      for (const line of validLines) {
        ingredients.push({ ingredient_id: line.ingredientId, quantity: line.quantity, unit: line.unit });
      }

      // 3. Upsert recipe
      const v = this.form.getRawValue();
      const payload = {
        title: v.name,
        flavor_id: flavorId,
        yield_factor: v.batch_size_kg,
        is_active: true,
      };

      const isEdit = this.editId();
      let recipeId = isEdit;
      if (isEdit) {
        const { error } = await this.supabase.client.from('gg_recipes').update(payload).eq('id', isEdit);
        if (error) { this.formError.set(error.message); return; }
        const syncError = await this.replaceRecipeLines(isEdit, ingredients);
        if (syncError) { this.formError.set(syncError); return; }
        this.showToast('Recipe updated', 'success');
      } else {
        const { data, error } = await this.supabase.client
          .from('gg_recipes')
          .insert(payload)
          .select('id')
          .single();
        if (error || !data) { this.formError.set(error?.message ?? 'Failed to create recipe.'); return; }
        recipeId = data.id;
        const syncError = await this.replaceRecipeLines(recipeId, ingredients);
        if (syncError) { this.formError.set(syncError); return; }
        this.showToast('Recipe created', 'success');
      }

      this.closeForm();
      await this.loadRecipes();
    } finally {
      this.saving.set(false);
    }
  }

  // ── Delete / toggle active ────────────────────────────────────────────

  async deleteRecipe(id: string): Promise<void> {
    if (!confirm('Delete this recipe? This cannot be undone.')) return;
    await this.supabase.client.from('recipe_lines').delete().eq('recipe_id', id);
    const { error } = await this.supabase.client.from('gg_recipes').delete().eq('id', id);
    if (error) { this.showToast(error.message, 'error'); return; }
    this.showToast('Recipe deleted', 'success');
    await this.loadRecipes();
  }

  async toggleActive(r: RecipeRow): Promise<void> {
    const { error } = await this.supabase.client
      .from('gg_recipes')
      .update({ is_active: !r.is_active })
      .eq('id', r.id);
    if (error) { this.showToast(error.message, 'error'); return; }
    await this.loadRecipes();
  }

  // ── Expand/collapse ───────────────────────────────────────────────────

  toggleExpand(id: string): void {
    this.expanded.update(s => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Data loading ──────────────────────────────────────────────────────

  private async loadRecipes(): Promise<void> {
    this.loading.set(true);
    const [{ data: recipesData }, { data: recipeLines }] = await Promise.all([
      this.supabase.client
      .from('gg_recipes')
      .select('id, name:title, flavor_id, batch_size_kg:yield_factor, is_active, gg_flavors(name)')
      .order('created_at', { ascending: false }),
      this.supabase.client
        .from('recipe_lines')
        .select('recipe_id, ingredient_id, qty'),
    ]);

    const ingMap = new Map(this.ingredients().map(i => [i.id, i]));
    const linesByRecipeId = new Map<string, Array<{ ingredient_id: string; quantity: number; unit: string }>>();

    (recipeLines ?? []).forEach((line: any) => {
      const existing = linesByRecipeId.get(line.recipe_id) ?? [];
      const ingredient = ingMap.get(line.ingredient_id);
      existing.push({
        ingredient_id: line.ingredient_id,
        quantity: Number(line.qty) || 0,
        unit: ingredient?.default_unit ?? 'kg',
      });
      linesByRecipeId.set(line.recipe_id, existing);
    });

    this.recipes.set((recipesData ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      flavor_id: r.flavor_id,
      flavor_name: r.gg_flavors?.name ?? 'Unknown',
      batch_size_kg: r.batch_size_kg,
      is_active: r.is_active,
      ingredients: (linesByRecipeId.get(r.id) ?? []).map((i: any) => ({
        ingredient_id: i.ingredient_id,
        quantity: i.quantity,
        unit: i.unit,
        name: ingMap.get(i.ingredient_id)?.name ?? i.ingredient_id,
      })),
    })));
    this.loading.set(false);
  }

  private async loadFlavors(): Promise<void> {
    const { data } = await this.supabase.client
      .from('gg_flavors')
      .select('id, name, code')
      .eq('active', true)
      .order('name');
    this.flavors.set(data ?? []);
  }

  private async loadIngredients(): Promise<void> {
    const { data } = await this.supabase.client
      .from('gg_ingredients')
      .select('id, name, default_unit')
      .order('name');
    this.ingredients.set(data ?? []);
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  async createFlavorFromPicker(name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = this.flavors().find(f => f.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      this.selectedFlavorId.set(existing.id);
      return;
    }

    const code = trimmed.replace(/\s+/g, '').toUpperCase().slice(0, 6) || 'FLAVOR';
    const { data, error } = await this.supabase.client
      .from('gg_flavors')
      .insert({ name: trimmed, code, active: true })
      .select('id, name, code')
      .single();

    if (error || !data) {
      this.formError.set(error?.message ?? 'Failed to add flavor.');
      return;
    }

    this.flavors.update(list => [...list, data].sort((a, b) => a.name.localeCompare(b.name)));
    this.selectedFlavorId.set(data.id);
  }

  async createIngredientFromPicker(index: number, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    const currentLine = this.ingLines()[index];
    if (!currentLine) return;

    const existing = this.ingredients().find(i => i.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      this.onIngredientSelected(index, existing.id);
      return;
    }

    const { data, error } = await this.supabase.client
      .from('gg_ingredients')
      .insert({ name: trimmed, default_unit: currentLine.unit, active: true })
      .select('id, name, default_unit')
      .single();

    if (error || !data) {
      this.formError.set(error?.message ?? `Failed to add ingredient "${trimmed}".`);
      return;
    }

    this.ingredients.update(list => [...list, data].sort((a, b) => a.name.localeCompare(b.name)));
    this.onIngredientSelected(index, data.id);
  }

  private async replaceRecipeLines(
    recipeId: string,
    ingredients: Array<{ ingredient_id: string; quantity: number; unit: string }>,
  ): Promise<string | null> {
    const { error: deleteError } = await this.supabase.client
      .from('recipe_lines')
      .delete()
      .eq('recipe_id', recipeId);

    if (deleteError) {
      return deleteError.message;
    }

    if (ingredients.length === 0) {
      return null;
    }

    const { error: insertError } = await this.supabase.client
      .from('recipe_lines')
      .insert(
        ingredients.map((line) => ({
          recipe_id: recipeId,
          ingredient_id: line.ingredient_id,
          qty: line.quantity,
        })),
      );

    return insertError?.message ?? null;
  }

  private showToast(msg: string, kind: 'success' | 'error'): void {
    this.toast.set(msg);
    this.toastKind.set(kind);
    setTimeout(() => this.toast.set(''), 3500);
  }
}
