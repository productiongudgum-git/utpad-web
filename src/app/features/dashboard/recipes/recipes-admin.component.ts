import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { SupabaseService } from '../../../core/supabase.service';

interface Flavor { id: string; name: string; code: string; }
interface Ingredient { id: string; name: string; default_unit: string; }
interface RecipeRow {
  id: string; name: string; flavor_id: string; flavor_name: string;
  version: number; batch_size_kg: number; is_active: boolean;
  ingredients: Array<{ ingredient_id: string; name: string; quantity: number; unit: string; }>;
}

@Component({
  selector: 'app-recipes-admin',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  template: `
    <div style="padding:24px;max-width:1100px;">
      <div style="margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="font-family:'Cabin',sans-serif;font-size:22px;font-weight:700;color:#121212;margin:0 0 4px;">Recipes</h1>
          <p style="color:#6B7280;font-size:14px;margin:0;">Manage production recipes and ingredient bills of materials.</p>
        </div>
        <button (click)="showForm.set(!showForm())" style="padding:9px 18px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">
          <span class="material-icons-round" style="font-size:18px;">{{ showForm() ? 'close' : 'add' }}</span>
          {{ showForm() ? 'Cancel' : 'New Recipe' }}
        </button>
      </div>

      <!-- Create form -->
      @if (showForm()) {
        <div style="background:#fff;border-radius:12px;border:1px solid #E5E7EB;padding:24px;margin-bottom:24px;">
          <h2 style="font-family:'Cabin',sans-serif;font-size:16px;font-weight:600;color:#121212;margin:0 0 20px;">{{ editId() ? 'Edit Recipe' : 'New Recipe' }}</h2>
          <form [formGroup]="form" (ngSubmit)="save()">
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:16px;" class="recipe-grid">
              <div>
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Recipe Name *</label>
                <input formControlName="name" class="gg-input" placeholder="e.g. Spearmint Base v2">
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Flavor *</label>
                <select formControlName="flavor_id" class="gg-input dropdown-with-arrow">
                  <option value="">Select flavor...</option>
                  @for (f of flavors(); track f.id) {
                    <option [value]="f.id">{{ f.name }}</option>
                  }
                </select>
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Version</label>
                <input formControlName="version" type="number" min="1" class="gg-input" placeholder="1">
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Batch Size (kg) *</label>
                <input formControlName="batch_size_kg" type="number" min="0.1" step="0.1" class="gg-input" placeholder="100">
              </div>
            </div>

            <!-- Ingredients -->
            <div style="margin-bottom:16px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                <label style="font-size:12px;font-weight:600;color:#374151;">Ingredients</label>
                <button type="button" (click)="addIngLine()" style="padding:4px 10px;background:#f0fdf4;border:1px solid #01AC51;color:#01AC51;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">+ Add</button>
              </div>
              @for (line of ingLines(); track $index) {
                <div style="display:grid;grid-template-columns:1fr 120px 100px 36px;gap:8px;margin-bottom:8px;align-items:center;">
                  <select [(ngModel)]="line.ingredient_id" [ngModelOptions]="{standalone:true}" class="gg-input dropdown-with-arrow" style="font-size:13px;">
                    <option value="">Select ingredient...</option>
                    @for (i of ingredients(); track i.id) {
                      <option [value]="i.id">{{ i.name }}</option>
                    }
                  </select>
                  <input [(ngModel)]="line.quantity" [ngModelOptions]="{standalone:true}" type="number" min="0" step="0.01" class="gg-input" placeholder="Qty" style="font-size:13px;">
                  <input [(ngModel)]="line.unit" [ngModelOptions]="{standalone:true}" class="gg-input" placeholder="kg/L/g" style="font-size:13px;">
                  <button type="button" (click)="removeIngLine($index)" style="width:32px;height:32px;background:#fee2e2;border:none;border-radius:6px;color:#dc2626;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                    <span class="material-icons-round" style="font-size:16px;">close</span>
                  </button>
                </div>
              }
            </div>

            @if (formError()) {
              <p style="color:#FF2828;font-size:13px;margin-bottom:12px;">{{ formError() }}</p>
            }

            <div style="display:flex;gap:10px;">
              <button type="submit" [disabled]="saving()" class="gg-btn-primary">
                {{ saving() ? 'Saving...' : (editId() ? 'Update Recipe' : 'Create Recipe') }}
              </button>
              @if (editId()) {
                <button type="button" (click)="cancelEdit()" style="padding:8px 16px;background:#f3f4f6;border:1px solid #E5E7EB;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;color:#374151;">Cancel</button>
              }
            </div>
          </form>
        </div>
      }

      @if (toast()) {
        <div class="toast" [class.toast-success]="toastKind()==='success'" [class.toast-error]="toastKind()==='error'">{{ toast() }}</div>
      }

      <!-- Recipe List -->
      @if (loading()) {
        <div style="display:flex;flex-direction:column;gap:12px;">
          @for (i of [1,2,3]; track i) {
            <div class="gg-skeleton" style="height:80px;border-radius:12px;"></div>
          }
        </div>
      } @else if (recipes().length === 0) {
        <div style="text-align:center;padding:60px 0;color:#9CA3AF;">
          <span class="material-icons-round" style="font-size:48px;display:block;margin-bottom:12px;">science</span>
          <p style="font-size:15px;margin:0;">No recipes yet. Create your first one!</p>
        </div>
      } @else {
        <div style="display:flex;flex-direction:column;gap:12px;">
          @for (r of recipes(); track r.id) {
            <div style="background:#fff;border-radius:12px;border:1px solid #E5E7EB;padding:16px 20px;">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                <div>
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                    <span style="font-size:15px;font-weight:700;color:#121212;font-family:'Cabin',sans-serif;">{{ r.name }}</span>
                    <span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;">v{{ r.version }}</span>
                    @if (!r.is_active) {
                      <span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;">Inactive</span>
                    }
                  </div>
                  <p style="font-size:13px;color:#6B7280;margin:0;">
                    Flavor: <strong style="color:#121212;">{{ r.flavor_name }}</strong> ·
                    Batch: <strong style="color:#121212;">{{ r.batch_size_kg }} kg</strong> ·
                    {{ r.ingredients.length }} ingredient(s)
                  </p>
                  @if (r.ingredients.length > 0) {
                    <p style="font-size:12px;color:#9CA3AF;margin:4px 0 0;">
                      {{ formatIngredients(r.ingredients) }}
                    </p>
                  }
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                  <button (click)="startEdit(r)" style="padding:6px 12px;background:#f0fdf4;border:1px solid #01AC51;color:#01AC51;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Edit</button>
                  <button (click)="deleteRecipe(r.id)" style="padding:6px 12px;background:#fff5f5;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Delete</button>
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>

    <style>
      @media (max-width:700px) { .recipe-grid { grid-template-columns: 1fr 1fr !important; } }
      @media (max-width:480px) { .recipe-grid { grid-template-columns: 1fr !important; } }
    </style>
  `,
})
export class RecipesAdminComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly fb = inject(FormBuilder);

  loading = signal(true);
  saving = signal(false);
  showForm = signal(false);
  editId = signal<string | null>(null);
  recipes = signal<RecipeRow[]>([]);
  flavors = signal<Flavor[]>([]);
  ingredients = signal<Ingredient[]>([]);
  ingLines = signal<Array<{ingredient_id:string;quantity:number;unit:string}>>([]);
  formError = signal('');
  toast = signal('');
  toastKind = signal<'success'|'error'>('success');

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    flavor_id: ['', Validators.required],
    version: [1, [Validators.required, Validators.min(1)]],
    batch_size_kg: [100, [Validators.required, Validators.min(0.1)]],
  });

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadRecipes(), this.loadFlavors(), this.loadIngredients()]);
  }

  addIngLine(): void {
    this.ingLines.update(l => [...l, { ingredient_id: '', quantity: 0, unit: 'kg' }]);
  }

  removeIngLine(i: number): void {
    this.ingLines.update(l => l.filter((_, idx) => idx !== i));
  }

  formatIngredients(ingredients: { name: string; quantity: number; unit: string }[]): string {
    return ingredients.map(i => i.name + ' ' + i.quantity + ' ' + i.unit).join(' · ');
  }

  startEdit(r: RecipeRow): void {
    this.editId.set(r.id);
    this.form.setValue({ name: r.name, flavor_id: r.flavor_id, version: r.version, batch_size_kg: r.batch_size_kg });
    this.ingLines.set(r.ingredients.map(i => ({ ingredient_id: i.ingredient_id, quantity: i.quantity, unit: i.unit })));
    this.showForm.set(true);
    this.formError.set('');
  }

  cancelEdit(): void {
    this.editId.set(null);
    this.form.reset({ name: '', flavor_id: '', version: 1, batch_size_kg: 100 });
    this.ingLines.set([]);
    this.showForm.set(false);
  }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.formError.set('');
    const v = this.form.getRawValue();
    const ings = this.ingLines().filter(l => l.ingredient_id);
    const payload = { name: v.name, flavor_id: v.flavor_id, version: v.version, batch_size_kg: v.batch_size_kg, ingredients: ings, is_active: true };

    let recipeId = this.editId();
    if (recipeId) {
      const { error } = await this.supabase.client.from('gg_recipes').update(payload).eq('id', recipeId);
      if (error) { this.formError.set(error.message); this.saving.set(false); return; }
    } else {
      const { data, error } = await this.supabase.client.from('gg_recipes').insert(payload).select('id').single();
      if (error || !data) { this.formError.set(error?.message ?? 'Failed'); this.saving.set(false); return; }
      recipeId = data.id;
    }

    this.showToast(this.editId() ? 'Recipe updated' : 'Recipe created', 'success');
    this.cancelEdit();
    await this.loadRecipes();
    this.saving.set(false);
  }

  async deleteRecipe(id: string): Promise<void> {
    if (!confirm('Delete this recipe?')) return;
    const { error } = await this.supabase.client.from('gg_recipes').delete().eq('id', id);
    if (!error) { this.showToast('Recipe deleted', 'success'); await this.loadRecipes(); }
    else this.showToast(error.message, 'error');
  }

  private async loadRecipes(): Promise<void> {
    this.loading.set(true);
    const { data } = await this.supabase.client.from('gg_recipes')
      .select('id, name, flavor_id, version, batch_size_kg, is_active, ingredients, gg_flavors(name)')
      .order('created_at', { ascending: false });
    const ingMap = new Map((this.ingredients()).map(i => [i.id, i]));
    this.recipes.set((data ?? []).map((r: any) => ({
      id: r.id, name: r.name, flavor_id: r.flavor_id, flavor_name: r.gg_flavors?.name ?? 'Unknown',
      version: r.version, batch_size_kg: r.batch_size_kg, is_active: r.is_active,
      ingredients: (r.ingredients ?? []).map((i: any) => ({
        ingredient_id: i.ingredient_id, quantity: i.quantity, unit: i.unit,
        name: ingMap.get(i.ingredient_id)?.name ?? i.ingredient_id,
      })),
    })));
    this.loading.set(false);
  }

  private async loadFlavors(): Promise<void> {
    const { data } = await this.supabase.client.from('gg_flavors').select('id, name, code').eq('active', true).order('name');
    this.flavors.set(data ?? []);
  }

  private async loadIngredients(): Promise<void> {
    const { data } = await this.supabase.client.from('gg_ingredients').select('id, name, default_unit').order('name');
    this.ingredients.set(data ?? []);
  }

  private showToast(msg: string, kind: 'success'|'error'): void {
    this.toast.set(msg); this.toastKind.set(kind);
    setTimeout(() => this.toast.set(''), 3000);
  }
}
