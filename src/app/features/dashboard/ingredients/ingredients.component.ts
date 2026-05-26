import { CommonModule, DecimalPipe } from '@angular/common';
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SupabaseService } from '../../../core/supabase.service';
import { IngredientStockService } from '../../../core/services/ingredient-stock.service';
import { formatStock, formatStockString, toCanonical } from '../../../shared/utils/unit-format';

// "Batches left" tuning — how many more batches the current stock can make,
// based purely on recipe usage (no production-pace assumption).
// The low threshold depends on how broadly the ingredient is used: a base
// ingredient in most/all recipes burns down across every flavour, so it's
// flagged earlier (more lead time) than a flavour-specific one.
const LOW_BATCHES_SHARED     = 40;   // used in >= half of all recipes (base ingredient)
const LOW_BATCHES_DEFAULT    = 15;   // used in fewer recipes (flavour-specific etc.)
const SHARED_RECIPE_FRACTION = 0.5;  // "used in most recipes" cutoff

interface Ingredient {
  id: string;
  name: string;
  default_unit: string;
  reorder_point: number;
  current_stock: number;
  vendor_names: string[];
  // Batches the current stock can still make (recipe-based, pace-independent).
  avgPerBatch: number;          // avg canonical qty used per batch across recipes
  batchesLeft: number | null;   // floor(current_stock / avgPerBatch); null = unused
  recipeCount: number;          // how many recipes use this ingredient
  totalRecipes: number;         // total recipes in the system (for context)
  shared: boolean;              // used in >= half of recipes → base ingredient
  lowThreshold: number;         // batches below which it flags red
  // Packing-material mapping (consumed per box when a flavour is packed).
  packingRole: string | null;       // 'monocarton' | 'ziplock' | 'other' | null
  packingFlavorId: string | null;   // flavour it's for; null = all flavours
  packingFlavorName: string | null; // resolved flavour name for display
  qtyPerBox: number;
}

@Component({
  selector: 'app-ingredients',
  standalone: true,
  imports: [CommonModule, DecimalPipe, ReactiveFormsModule, FormsModule, RouterLink],
  template: `
    <!-- ── Toast ─────────────────────────────────────────────────────────── -->
    @if (toast()) {
      <div style="position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 18px;border-radius:10px;display:flex;align-items:center;gap:8px;font-size:14px;font-weight:500;box-shadow:0 4px 20px rgba(0,0,0,0.2);animation:slideUp 0.2s ease;"
           [style.background]="toastKind() === 'error' ? '#dc2626' : '#1a1a1a'" style="color:#fff">
        <span class="material-icons-round" style="font-size:16px;">{{ toastKind() === 'error' ? 'error_outline' : 'check_circle' }}</span>
        {{ toast() }}
      </div>
    }

    <div style="padding:24px;max-width:1080px;">

      <!-- ── Low-stock alert banner ──────────────────────────────────────── -->
      @if (stockSvc.lowStockCount() > 0) {
        <div style="display:flex;align-items:flex-start;gap:12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px 18px;margin-bottom:20px;">
          <span class="material-icons-round" style="font-size:22px;color:#ea580c;flex-shrink:0;margin-top:1px;">warning_amber</span>
          <div style="flex:1;min-width:0;">
            <p style="font-size:14px;font-weight:700;color:#9a3412;margin:0 0 4px;">
              {{ stockSvc.lowStockCount() }} ingredient{{ stockSvc.lowStockCount() === 1 ? '' : 's' }} below reorder threshold
            </p>
            <p style="font-size:13px;color:#c2410c;margin:0;line-height:1.5;">
              {{ alertSummary() }}
            </p>
          </div>
          <button (click)="toggleLowStockFilter()"
                  style="flex-shrink:0;padding:5px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid #fed7aa;"
                  [style.background]="showLowStockOnly() ? '#ea580c' : '#fff7ed'"
                  [style.color]="showLowStockOnly() ? '#fff' : '#ea580c'">
            {{ showLowStockOnly() ? 'Show all' : 'Show low-stock only' }}
          </button>
        </div>
      }

      <!-- ── Page header ─────────────────────────────────────────────────── -->
      <div style="margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="font-family:'Cabin',sans-serif;font-size:22px;font-weight:700;color:var(--foreground);margin:0 0 4px;">Ingredients</h1>
          <p style="color:#6B7280;font-size:14px;margin:0;">Master list of all raw ingredients and reorder thresholds.</p>
        </div>
        <button (click)="openNewForm()"
                style="padding:9px 18px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">
          <span class="material-icons-round" style="font-size:18px;">add</span>
          Add Ingredient
        </button>
      </div>

      <!-- ── Add / Edit form ────────────────────────────────────────────── -->
      @if (showForm()) {
        <div style="background:var(--card);border-radius:12px;border:1px solid var(--border);padding:24px;margin-bottom:20px;animation:slideDown 0.15s ease;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
            <h2 style="font-size:16px;font-weight:700;color:var(--foreground);margin:0;">{{ editId() ? 'Edit Ingredient' : 'Add Ingredient' }}</h2>
            <button (click)="closeForm()" style="border:none;background:none;cursor:pointer;color:#9CA3AF;">
              <span class="material-icons-round" style="font-size:20px;">close</span>
            </button>
          </div>
          <form [formGroup]="form" (ngSubmit)="save()">
            <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:14px;margin-bottom:14px;" class="ing-form-grid">
              <div>
                <label class="ing-label">Name *</label>
                <input formControlName="name" class="gg-input" placeholder="e.g. Gum Base"
                       [style.border-color]="form.get('name')!.invalid && form.get('name')!.touched ? '#dc2626' : ''">
              </div>
              <div>
                <label class="ing-label">Default Unit *</label>
                <select formControlName="default_unit" class="gg-input dropdown-with-arrow">
                  <option value="kg">kg</option><option value="g">g</option>
                  <option value="L">L</option><option value="ml">ml</option>
                  <option value="pcs">pcs</option><option value="boxes">boxes</option>
                </select>
              </div>
              <div>
                <label class="ing-label">
                  Reorder Point
                  <span style="font-weight:400;color:#9CA3AF;">(alert when stock falls below)</span>
                </label>
                <div style="position:relative;">
                  <input formControlName="reorder_point" type="number" min="0" step="0.01" class="gg-input" placeholder="e.g. 5">
                  <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:12px;color:#9CA3AF;pointer-events:none;">
                    {{ form.get('default_unit')?.value }}
                  </span>
                </div>
              </div>
              <div>
                <label class="ing-label">Current Stock</label>
                <input formControlName="current_stock" type="number" min="0" step="0.01" class="gg-input" placeholder="0">
              </div>
            </div>

            <!-- Packing material (optional) -->
            <div style="border-top:1px solid var(--border);margin-bottom:14px;padding-top:14px;">
              <label class="ing-label">
                Packing material
                <span style="font-weight:400;color:#9CA3AF;">(deducted automatically per box when a flavour is packed)</span>
              </label>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;" class="ing-form-grid">
                <div>
                  <label class="ing-label" style="font-size:11px;">Role</label>
                  <select formControlName="packing_role" class="gg-input dropdown-with-arrow">
                    <option value="">Not a packing material</option>
                    <option value="monocarton">Monocarton (per flavour)</option>
                    <option value="ziplock">Ziplock (all flavours)</option>
                    <option value="other">Other (all flavours)</option>
                  </select>
                </div>
                @if (form.get('packing_role')?.value === 'monocarton') {
                  <div>
                    <label class="ing-label" style="font-size:11px;">For flavour</label>
                    <select formControlName="packing_flavor_id" class="gg-input dropdown-with-arrow">
                      <option value="">Select flavour…</option>
                      @for (f of flavors(); track f.id) {
                        <option [value]="f.id">{{ f.name }}</option>
                      }
                    </select>
                  </div>
                }
                @if (form.get('packing_role')?.value) {
                  <div>
                    <label class="ing-label" style="font-size:11px;">Qty per box</label>
                    <input formControlName="qty_per_box" type="number" min="0" step="0.01" class="gg-input" placeholder="1">
                  </div>
                }
              </div>
            </div>

            @if (formError()) {
              <div style="display:flex;align-items:center;gap:6px;color:#dc2626;font-size:13px;margin-bottom:12px;padding:10px 14px;background:#fff5f5;border:1px solid #fca5a5;border-radius:8px;">
                <span class="material-icons-round" style="font-size:15px;">error_outline</span>
                {{ formError() }}
              </div>
            }
            <div style="display:flex;gap:10px;">
              <button type="submit" [disabled]="saving()"
                      style="padding:9px 20px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;"
                      [style.opacity]="saving() ? '0.7' : '1'">
                <span class="material-icons-round" style="font-size:16px;">{{ saving() ? 'autorenew' : 'save' }}</span>
                {{ saving() ? 'Saving…' : (editId() ? 'Update Ingredient' : 'Add Ingredient') }}
              </button>
              <button type="button" (click)="closeForm()"
                      style="padding:9px 16px;background:var(--secondary);border:1px solid var(--border);border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;color:var(--foreground);">
                Cancel
              </button>
            </div>
          </form>
        </div>
      }

      <!-- ── Filter & search bar ────────────────────────────────────────── -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
        <!-- Search -->
        <div style="flex:1;min-width:180px;position:relative;">
          <span class="material-icons-round" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:16px;color:#9CA3AF;pointer-events:none;">search</span>
          <input [(ngModel)]="rawSearch" (ngModelChange)="searchSig.set($event)"
                 placeholder="Search ingredients…"
                 style="width:100%;padding:8px 12px 8px 32px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:var(--card);color:var(--foreground);outline:none;box-sizing:border-box;">
        </div>

        <!-- Low-stock toggle pill -->
        <button (click)="toggleLowStockFilter()"
                style="display:flex;align-items:center;gap:6px;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid;white-space:nowrap;transition:all 0.15s;"
                [style.background]="showLowStockOnly() ? '#fff7ed' : 'var(--card)'"
                [style.border-color]="showLowStockOnly() ? '#fed7aa' : 'var(--border)'"
                [style.color]="showLowStockOnly() ? '#ea580c' : '#6B7280'">
          <span class="material-icons-round" style="font-size:15px;">warning_amber</span>
          Low stock only
          @if (stockSvc.lowStockCount() > 0) {
            <span style="background:#ea580c;color:#fff;border-radius:999px;font-size:10px;font-weight:700;padding:1px 6px;min-width:16px;text-align:center;">
              {{ stockSvc.lowStockCount() }}
            </span>
          }
        </button>

        <span style="font-size:13px;color:#6B7280;white-space:nowrap;">
          {{ filteredIngredients().length }} of {{ ingredients().length }}
        </span>
      </div>

      <!-- ── Ingredient table ───────────────────────────────────────────── -->
      @if (loading()) {
        <div style="display:flex;flex-direction:column;gap:10px;">
          @for (i of [1,2,3,4]; track i) {
            <div class="gg-skeleton" style="height:68px;border-radius:10px;"></div>
          }
        </div>
      } @else if (filteredIngredients().length === 0) {
        <div style="text-align:center;padding:64px 0;color:#9CA3AF;">
          <span class="material-icons-round" style="font-size:48px;display:block;margin-bottom:12px;">category</span>
          <p style="font-size:15px;font-weight:600;color:#374151;margin:0 0 6px;">
            {{ ingredients().length === 0 ? 'No ingredients yet' : 'No ingredients match your search' }}
          </p>
          <p style="font-size:13px;margin:0;">
            {{ showLowStockOnly() ? 'All ingredients are above their reorder threshold.' : 'Try adjusting your search or filters.' }}
          </p>
        </div>
      } @else {
        <div style="background:var(--card);border-radius:12px;border:1px solid var(--border);overflow:hidden;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#f8f9fa;border-bottom:1px solid var(--border);">
                <th style="text-align:left;padding:11px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Ingredient</th>
                <th style="text-align:left;padding:11px 12px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;min-width:160px;">
                  <span (click)="cycleSort('stock')" title="Sort by current stock"
                        style="display:inline-flex;align-items:center;gap:3px;cursor:pointer;user-select:none;">
                    Current Stock
                    <span class="material-icons-round" style="font-size:14px;"
                          [style.color]="sortActive('stock') ? '#01AC51' : '#9CA3AF'">{{ sortIcon('stock') }}</span>
                  </span>
                </th>
                <th style="text-align:left;padding:11px 12px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">
                  <span (click)="cycleSort('batches')" title="Sort by batches left"
                        style="display:inline-flex;align-items:center;gap:3px;cursor:pointer;user-select:none;">
                    Batches Left
                    <span class="material-icons-round" style="font-size:14px;"
                          [style.color]="sortActive('batches') ? '#01AC51' : '#9CA3AF'">{{ sortIcon('batches') }}</span>
                  </span>
                </th>
                <th style="text-align:left;padding:11px 12px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Reorder Point</th>
                <th style="text-align:left;padding:11px 12px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Vendors</th>
                <th style="text-align:center;padding:11px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (ing of filteredIngredients(); track ing.id) {
                <tr style="border-bottom:1px solid #f3f4f6;transition:background 0.1s;"
                    [style.background]="(isLow(ing) || isLowBatches(ing)) ? '#fff7ed' : 'transparent'">

                  <!-- Name -->
                  <td style="padding:12px 16px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                      @if (isLow(ing)) {
                        <span class="material-icons-round" style="font-size:16px;"
                              [style.color]="ing.current_stock === 0 ? '#dc2626' : '#ea580c'">
                          {{ ing.current_stock === 0 ? 'dangerous' : 'warning_amber' }}
                        </span>
                      }
                      <div>
                        <span style="font-size:14px;font-weight:600;color:var(--foreground);">{{ ing.name }}</span>
                        <span style="margin-left:6px;background:#f3f4f6;color:#6B7280;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:500;">{{ ing.default_unit }}</span>
                        @if (ing.packingRole) {
                          <div style="margin-top:3px;">
                            <span style="font-size:10px;font-weight:600;background:#eef2ff;color:#4338ca;border:1px solid #c7d2fe;border-radius:4px;padding:1px 6px;display:inline-flex;align-items:center;gap:3px;">
                              <span class="material-icons-round" style="font-size:11px;">inventory_2</span>{{ packingLabel(ing) }}
                            </span>
                          </div>
                        }
                      </div>
                    </div>
                  </td>

                  <!-- Current stock + bar -->
                  <td style="padding:12px 12px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                      <span style="font-size:13px;font-weight:700;min-width:64px;"
                            [style.color]="stockColor(ing)">
                        {{ fmtStock(ing.current_stock, ing.default_unit) }}
                      </span>
                      @if (ing.reorder_point > 0) {
                        <div style="flex:1;height:6px;border-radius:3px;background:#f3f4f6;min-width:60px;max-width:120px;overflow:hidden;">
                          <div style="height:100%;border-radius:3px;transition:width 0.3s;"
                               [style.width]="stockBarWidth(ing) + '%'"
                               [style.background]="stockColor(ing)">
                          </div>
                        </div>
                      }
                    </div>
                    @if (isLow(ing) && ing.reorder_point > 0) {
                      <p style="font-size:11px;color:#ea580c;margin:3px 0 0;">
                        needs {{ fmtStock(ing.reorder_point - ing.current_stock, ing.default_unit) }} more
                      </p>
                    }
                  </td>

                  <!-- Batches left (recipe-based) -->
                  <td style="padding:12px 12px;">
                    <div style="display:flex;align-items:center;gap:6px;">
                      <span style="font-size:13px;font-weight:700;" [style.color]="batchesColor(ing)" [title]="usageTooltip(ing)">
                        {{ batchesLabel(ing) }}
                      </span>
                      @if (ing.shared) {
                        <span style="font-size:10px;font-weight:600;background:#f3f4f6;color:#6B7280;border-radius:4px;padding:1px 5px;"
                              [title]="'Base ingredient — used in ' + ing.recipeCount + ' of ' + ing.totalRecipes + ' recipes; flags red below ' + ing.lowThreshold + ' batches'">base</span>
                      }
                    </div>
                    @if (ing.avgPerBatch > 0) {
                      <p style="font-size:11px;color:#9CA3AF;margin:3px 0 0;">
                        ≈ {{ fmtStock(ing.avgPerBatch, ing.default_unit) }}/batch{{ ing.recipeCount > 1 ? ' avg' : '' }}
                      </p>
                    }
                  </td>

                  <!-- Reorder point (inline editable) -->
                  <td style="padding:12px 12px;">
                    @if (editingThresholdId() === ing.id) {
                      <div style="display:flex;align-items:center;gap:6px;">
                        <input [(ngModel)]="pendingThreshold" type="number" min="0" step="0.01"
                               (keydown.enter)="saveThreshold(ing)"
                               (keydown.escape)="editingThresholdId.set(null)"
                               style="width:80px;padding:4px 8px;border:1px solid #01AC51;border-radius:6px;font-size:13px;outline:none;"
                               #threshInput>
                        <span style="font-size:12px;color:#6B7280;">{{ pendingThresholdUnit }}</span>
                        <button (click)="saveThreshold(ing)"
                                style="border:none;background:#01AC51;color:#fff;border-radius:5px;padding:3px 8px;font-size:12px;font-weight:600;cursor:pointer;">✓</button>
                        <button (click)="editingThresholdId.set(null)"
                                style="border:none;background:#f3f4f6;color:#6B7280;border-radius:5px;padding:3px 6px;font-size:12px;cursor:pointer;">✕</button>
                      </div>
                    } @else {
                      <div style="display:flex;align-items:center;gap:6px;">
                        @if (ing.reorder_point > 0) {
                          <span style="font-size:13px;font-weight:600;"
                                [style.color]="isLow(ing) ? '#ea580c' : '#6B7280'">
                            {{ fmtStock(ing.reorder_point, ing.default_unit) }}
                          </span>
                        } @else {
                          <span style="font-size:13px;color:#d1d5db;font-style:italic;">Not set</span>
                        }
                        <button (click)="startThresholdEdit(ing)" title="Edit reorder point"
                                style="border:none;background:none;cursor:pointer;color:#9CA3AF;display:flex;align-items:center;padding:2px;">
                          <span class="material-icons-round" style="font-size:14px;">edit</span>
                        </button>
                      </div>
                    }
                  </td>

                  <!-- Vendors -->
                  <td style="padding:12px 12px;font-size:12px;color:#6B7280;">
                    {{ ing.vendor_names.length ? ing.vendor_names.join(', ') : '—' }}
                  </td>

                  <!-- Actions -->
                  <td style="padding:12px 16px;text-align:center;">
                    <div style="display:flex;align-items:center;justify-content:center;gap:6px;">
                      <button (click)="startEdit(ing)"
                              style="padding:4px 10px;background:#f0fdf4;border:1px solid #01AC51;color:#01AC51;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">
                        Edit
                      </button>
                      <button (click)="deleteIngredient(ing.id)"
                              style="padding:4px 10px;background:#fff5f5;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <style>
      .ing-label { display:block; font-size:12px; font-weight:600; color:#374151; margin-bottom:6px; }
      @keyframes slideUp   { from { transform:translateY(16px); opacity:0; } to { transform:translateY(0); opacity:1; } }
      @keyframes slideDown { from { transform:translateY(-8px); opacity:0; } to { transform:translateY(0); opacity:1; } }
      @media (max-width:700px) { .ing-form-grid { grid-template-columns: 1fr 1fr !important; } }
      @media (max-width:480px) { .ing-form-grid { grid-template-columns: 1fr !important; } }
    </style>
  `,
})
export class IngredientsComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  readonly stockSvc = inject(IngredientStockService);

  loading = signal(true);
  saving = signal(false);
  showForm = signal(false);
  editId = signal<string | null>(null);
  ingredients = signal<Ingredient[]>([]);
  flavors = signal<{ id: string; name: string }[]>([]);
  formError = signal('');
  toast = signal('');
  toastKind = signal<'success' | 'error'>('success');

  // Inline threshold editor
  editingThresholdId = signal<string | null>(null);
  pendingThreshold = 0;
  pendingThresholdUnit = '';

  // Filters
  showLowStockOnly = signal(false);
  rawSearch = '';
  searchSig = signal('');

  // Sorting for Current Stock / Batches Left. null key = normal (name) order.
  sortKey = signal<'stock' | 'batches' | null>(null);
  sortDir = signal<'asc' | 'desc'>('asc');

  readonly filteredIngredients = computed(() => {
    let list = this.ingredients();
    const q = this.searchSig().toLowerCase().trim();
    if (q) list = list.filter(i => i.name.toLowerCase().includes(q));
    if (this.showLowStockOnly()) list = list.filter(i => this.isLow(i));

    const key = this.sortKey();
    if (key) {
      const dir = this.sortDir() === 'asc' ? 1 : -1;
      // Unused ingredients (no batches figure) always sort to the bottom.
      const val = (i: Ingredient) =>
        key === 'stock' ? i.current_stock : (i.batchesLeft == null ? Infinity : i.batchesLeft);
      list = [...list].sort((a, b) => (val(a) - val(b)) * dir);
    }
    return list;
  });

  readonly alertSummary = computed(() => {
    const items = this.stockSvc.lowStockIngredients();
    if (items.length === 0) return '';
    const names = items.slice(0, 3).map(i => `${i.name} (${i.current_stock} ${i.default_unit})`);
    const rest = items.length > 3 ? ` and ${items.length - 3} more` : '';
    return names.join(', ') + rest;
  });

  form = this.fb.nonNullable.group({
    name:          ['', Validators.required],
    default_unit:  ['kg', Validators.required],
    reorder_point: [0],
    current_stock: [0],
    packing_role:      [''],   // '' | 'monocarton' | 'ziplock' | 'other'
    packing_flavor_id: [''],   // required only when role = monocarton
    qty_per_box:       [1],
  });

  async ngOnInit(): Promise<void> {
    // Pre-apply filter from query params (e.g. from Command Center link)
    const filter = this.route.snapshot.queryParamMap.get('filter');
    if (filter === 'low-stock') {
      this.showLowStockOnly.set(true);
    }
    await this.loadData();
  }

  // ── Filters ───────────────────────────────────────────────────────────

  toggleLowStockFilter(): void {
    this.showLowStockOnly.update(v => !v);
  }

  // ── Sorting ───────────────────────────────────────────────────────────
  // Each click cycles a column: ascending → descending → normal (name order).

  cycleSort(key: 'stock' | 'batches'): void {
    if (this.sortKey() !== key) {
      this.sortKey.set(key);
      this.sortDir.set('asc');
    } else if (this.sortDir() === 'asc') {
      this.sortDir.set('desc');
    } else {
      this.sortKey.set(null);
      this.sortDir.set('asc');
    }
  }

  sortIcon(key: 'stock' | 'batches'): string {
    if (this.sortKey() !== key) return 'unfold_more';
    return this.sortDir() === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  sortActive(key: 'stock' | 'batches'): boolean {
    return this.sortKey() === key;
  }

  // ── Stock helpers ─────────────────────────────────────────────────────

  isLow(ing: Ingredient): boolean {
    return ing.reorder_point > 0 && ing.current_stock <= ing.reorder_point;
  }

  stockColor(ing: Ingredient): string {
    if (ing.reorder_point <= 0) return '#6B7280';
    if (ing.current_stock === 0) return '#dc2626';
    if (ing.current_stock <= ing.reorder_point * 0.5) return '#dc2626';
    if (ing.current_stock <= ing.reorder_point) return '#ea580c';
    return '#16a34a';
  }

  stockBarWidth(ing: Ingredient): number {
    if (ing.reorder_point <= 0 || ing.current_stock <= 0) return 0;
    // Bar = % of (reorder_point × 2) so 100% means 2× safe stock
    return Math.min(100, (ing.current_stock / (ing.reorder_point * 2)) * 100);
  }

  // ── Batches left ──────────────────────────────────────────────────────

  isLowBatches(ing: Ingredient): boolean {
    return ing.batchesLeft != null && ing.batchesLeft < ing.lowThreshold;
  }

  batchesColor(ing: Ingredient): string {
    if (ing.batchesLeft == null) return '#9CA3AF';
    return ing.batchesLeft < ing.lowThreshold ? '#dc2626' : '#16a34a';
  }

  batchesLabel(ing: Ingredient): string {
    if (ing.batchesLeft == null) return '—';
    if (ing.batchesLeft >= 999) return '999+ batches';
    return `${ing.batchesLeft} batch${ing.batchesLeft === 1 ? '' : 'es'}`;
  }

  packingLabel(ing: Ingredient): string {
    if (!ing.packingRole) return '';
    const role = ing.packingRole.charAt(0).toUpperCase() + ing.packingRole.slice(1);
    const scope = ing.packingFlavorName ?? 'all flavours';
    return `${role} · ${scope} · ${ing.qtyPerBox}/box`;
  }

  usageTooltip(ing: Ingredient): string {
    if (ing.batchesLeft == null) return 'Not used in any recipe yet';
    const across = ing.recipeCount > 1 ? ` (avg across ${ing.recipeCount} recipes)` : '';
    const tier = ing.shared
      ? `base ingredient — used in ${ing.recipeCount} of ${ing.totalRecipes} recipes; flags red below ${ing.lowThreshold} batches`
      : `flags red below ${ing.lowThreshold} batches`;
    return `${this.fmtStock(ing.avgPerBatch, ing.default_unit)} per batch${across}. ${tier}.`;
  }

  // ── Inline threshold editor ───────────────────────────────────────────

  startThresholdEdit(ing: Ingredient): void {
    this.editingThresholdId.set(ing.id);
    // Show the editor in the same auto-scaled unit as the display
    // (e.g. 2000 g of reorder_point opens as "2" with label "kg").
    const f = formatStock(ing.reorder_point, ing.default_unit);
    this.pendingThreshold = f.qty;
    this.pendingThresholdUnit = f.unit || ing.default_unit;
  }

  async saveThreshold(ing: Ingredient): Promise<void> {
    const entered = Math.max(0, Number(this.pendingThreshold) || 0);
    // Convert whatever unit the editor is showing back to canonical (g/ml/pcs).
    const canonical = toCanonical(entered, this.pendingThresholdUnit);
    const { error } = await this.supabase.client
      .from('inventory_raw_materials')
      .upsert({
        ingredient_id: ing.id,
        current_qty: ing.current_stock,
        unit: ing.default_unit,
        low_stock_threshold: canonical.qty,
      }, { onConflict: 'ingredient_id' });
    if (error) { this.showToast(error.message, 'error'); return; }
    this.editingThresholdId.set(null);
    this.showToast(`Reorder point updated to ${entered} ${this.pendingThresholdUnit}`, 'success');
    await this.loadData();
    void this.stockSvc.refresh();
  }

  // ── Form ──────────────────────────────────────────────────────────────

  openNewForm(): void {
    this.editId.set(null);
    this.form.reset({ name: '', default_unit: 'kg', reorder_point: 0, current_stock: 0, packing_role: '', packing_flavor_id: '', qty_per_box: 1 });
    this.formError.set('');
    this.showForm.set(true);
  }

  startEdit(ing: Ingredient): void {
    this.editId.set(ing.id);
    this.form.setValue({
      name: ing.name,
      default_unit: ing.default_unit,
      reorder_point: ing.reorder_point,
      current_stock: ing.current_stock,
      packing_role: ing.packingRole ?? '',
      packing_flavor_id: ing.packingFlavorId ?? '',
      qty_per_box: ing.qtyPerBox ?? 1,
    });
    this.formError.set('');
    this.showForm.set(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editId.set(null);
    this.formError.set('');
    this.form.reset();
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.saving.set(true);
    this.formError.set('');
    const v = this.form.getRawValue();
    const isEdit = this.editId();
    const normalizedName = v.name.trim();
    const formUnit = v.default_unit.trim();

    // Phase 10 — convert to canonical units before persisting. The form
    // accepts kg/L/g/ml/pcs/boxes but the DB stores only g/ml/pcs (boxes
    // pass through). 5 kg input becomes 5000 g in the database.
    const enteredStock  = Math.max(0, Number(v.current_stock) || 0);
    const enteredReorder = Math.max(0, Number(v.reorder_point) || 0);
    const canonicalStock  = toCanonical(enteredStock,  formUnit);
    const canonicalReorder = toCanonical(enteredReorder, formUnit);
    const normalizedUnit = canonicalStock.unit;
    const normalizedCurrentStock = canonicalStock.qty;
    const normalizedReorderPoint = canonicalReorder.qty;

    // Packing-material mapping. Flavour link only applies to monocartons;
    // ziplock/other are generic (consumed for every flavour).
    const packingRole = (v.packing_role || '').trim() || null;
    const packingFlavorId = packingRole === 'monocarton' ? (v.packing_flavor_id || null) : null;
    const qtyPerBox = packingRole ? Math.max(0, Number(v.qty_per_box) || 1) : 1;
    if (packingRole === 'monocarton' && !packingFlavorId) {
      this.formError.set('Select the flavour this monocarton belongs to.');
      this.saving.set(false);
      return;
    }
    const packingFields = {
      packing_role: packingRole,
      packing_flavor_id: packingFlavorId,
      qty_per_box: qtyPerBox,
    };

    let ingredientId = isEdit;
    const duplicateError = await this.validateDuplicateIngredient(normalizedName, isEdit);
    if (duplicateError) {
      this.formError.set(duplicateError);
      this.saving.set(false);
      return;
    }

    if (isEdit) {
      const { error } = await this.supabase.client
        .from('gg_ingredients')
        .update({ name: normalizedName, default_unit: normalizedUnit, active: true, ...packingFields })
        .eq('id', isEdit);
      if (error) { this.formError.set(error.message); this.saving.set(false); return; }
    } else {
      const { data, error } = await this.supabase.client
        .from('gg_ingredients')
        .insert({ name: normalizedName, default_unit: normalizedUnit, active: true, ...packingFields })
        .select('id')
        .single();
      if (error || !data) { this.formError.set(error?.message ?? 'Failed to create ingredient.'); this.saving.set(false); return; }
      ingredientId = data.id as string;
    }

    const { error: inventoryError } = await this.supabase.client
      .from('inventory_raw_materials')
      .upsert({
        ingredient_id: ingredientId,
        current_qty: normalizedCurrentStock,
        unit: normalizedUnit,
        low_stock_threshold: normalizedReorderPoint,
      }, { onConflict: 'ingredient_id' });
    if (inventoryError) {
      this.formError.set(inventoryError.message);
      this.saving.set(false);
      return;
    }
    this.showToast(isEdit ? 'Ingredient updated' : 'Ingredient added', 'success');
    this.closeForm();
    await this.loadData();
    void this.stockSvc.refresh();
    this.saving.set(false);
  }

  /** Format canonical (qty, unit) for display. Switches g→kg, ml→L above 1000. */
  fmtStock(qty: number, unit: string | null | undefined): string {
    return formatStockString(qty, unit);
  }

  async deleteIngredient(id: string): Promise<void> {
    if (!confirm('Delete this ingredient?')) return;
    await this.supabase.client.from('inventory_raw_materials').delete().eq('ingredient_id', id);
    const { error } = await this.supabase.client.from('gg_ingredients').delete().eq('id', id);
    if (error) { this.showToast(error.message, 'error'); return; }
    this.showToast('Ingredient deleted', 'success');
    await this.loadData();
    void this.stockSvc.refresh();
  }

  // ── Data ──────────────────────────────────────────────────────────────

  private async loadData(): Promise<void> {
    this.loading.set(true);

    const [
      { data: ings },
      { data: inventory },
      { data: vi },
      { data: recipeLines },
      { data: flavorsData },
    ] = await Promise.all([
      this.supabase.client
        .from('gg_ingredients')
        .select('id, name, default_unit, packing_role, packing_flavor_id, qty_per_box')
        .order('name'),
      this.supabase.client
        .from('inventory_raw_materials')
        .select('ingredient_id, current_qty, unit, low_stock_threshold'),
      this.supabase.client
        .from('gg_vendor_ingredients')
        .select('ingredient_id, gg_vendors(name)'),
      this.supabase.client
        .from('recipe_lines')
        .select('recipe_id, ingredient_id, qty'),
      this.supabase.client
        .from('gg_flavors')
        .select('id, name')
        .eq('active', true)
        .order('name'),
    ]);

    this.flavors.set((flavorsData ?? []) as { id: string; name: string }[]);
    const flavorNameById = new Map<string, string>(
      (flavorsData ?? []).map((f: any) => [f.id, f.name]),
    );

    const inventoryMap = new Map<string, any>();
    (inventory ?? []).forEach((row: any) => inventoryMap.set(row.ingredient_id, row));

    const vendorMap = new Map<string, string[]>();
    (vi ?? []).forEach((row: any) => {
      if (!vendorMap.has(row.ingredient_id)) vendorMap.set(row.ingredient_id, []);
      if (row.gg_vendors?.name) vendorMap.get(row.ingredient_id)!.push(row.gg_vendors.name);
    });

    // Average per-batch usage of each ingredient across the recipes that use
    // it. A flavour-specific ingredient (one recipe) is exact; a shared base
    // ingredient is the mean across its recipes.
    const usageByIng = new Map<string, { sum: number; count: number }>();
    const allRecipeIds = new Set<string>();
    (recipeLines ?? []).forEach((l: any) => {
      if (l.recipe_id) allRecipeIds.add(l.recipe_id);
      const qty = Number(l.qty) || 0;
      if (qty <= 0) return;
      const e = usageByIng.get(l.ingredient_id) ?? { sum: 0, count: 0 };
      e.sum += qty; e.count += 1;
      usageByIng.set(l.ingredient_id, e);
    });
    const totalRecipes = allRecipeIds.size;

    this.ingredients.set((ings ?? []).map((i: any) => {
      const currentStock = inventoryMap.get(i.id)?.current_qty ?? 0;
      const u = usageByIng.get(i.id);
      const recipeCount = u?.count ?? 0;
      const avgPerBatch = u && u.count > 0 ? u.sum / u.count : 0;
      const batchesLeft = avgPerBatch > 0 ? Math.floor(currentStock / avgPerBatch) : null;

      // A base ingredient (used in most/all recipes) gets the higher low
      // threshold so it's flagged with more lead time.
      const shared = totalRecipes > 0 && recipeCount / totalRecipes >= SHARED_RECIPE_FRACTION;
      const lowThreshold = shared ? LOW_BATCHES_SHARED : LOW_BATCHES_DEFAULT;

      return {
        id: i.id, name: i.name,
        default_unit: inventoryMap.get(i.id)?.unit ?? i.default_unit ?? 'kg',
        reorder_point: inventoryMap.get(i.id)?.low_stock_threshold ?? 0,
        current_stock: currentStock,
        vendor_names: vendorMap.get(i.id) ?? [],
        avgPerBatch,
        batchesLeft,
        recipeCount,
        totalRecipes,
        shared,
        lowThreshold,
        packingRole: i.packing_role ?? null,
        packingFlavorId: i.packing_flavor_id ?? null,
        packingFlavorName: i.packing_flavor_id ? (flavorNameById.get(i.packing_flavor_id) ?? null) : null,
        qtyPerBox: Number(i.qty_per_box ?? 1),
      };
    }));
    this.loading.set(false);
  }

  private async validateDuplicateIngredient(name: string, currentId: string | null): Promise<string | null> {
    let query = this.supabase.client
      .from('gg_ingredients')
      .select('id, name')
      .ilike('name', name)
      .limit(1);

    if (currentId) {
      query = query.neq('id', currentId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      return `Unable to validate ingredient name: ${error.message}`;
    }
    if (data) {
      return `Ingredient "${name}" already exists.`;
    }
    return null;
  }

  private showToast(msg: string, kind: 'success' | 'error'): void {
    this.toast.set(msg);
    this.toastKind.set(kind);
    setTimeout(() => this.toast.set(''), 3500);
  }
}
