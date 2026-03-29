import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../../core/supabase.service';
import { ProductionBatch, FlavorDefinition } from '../../../shared/models/manufacturing.models';
import { SearchableSelectComponent, SearchableSelectOption } from '../../../shared/components/searchable-select.component';

@Component({
  selector: 'app-production',
  standalone: true,
  imports: [CommonModule, FormsModule, SearchableSelectComponent],
  styles: [`
    .wizard-card {
      background: #fff; border-radius: 16px; border: 1px solid #E5E7EB;
      padding: 28px; margin-bottom: 24px; box-shadow: 0 4px 20px rgb(0 0 0 / 0.03);
    }
    .wizard-header {
      display: flex; align-items: center; gap: 12px; margin-bottom: 24px;
    }
    .wizard-icon {
      width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
      font-size: 22px; color: #fff;
    }
    .field-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
    }
    @media (max-width: 640px) { .field-grid { grid-template-columns: 1fr; } }
    .field-label {
      display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;
    }
    .flavor-chip {
      display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600;
    }
    .flavor-chip.mint { background: #dcfce7; color: #15803d; }
    .flavor-chip.berry { background: #fce7f3; color: #be185d; }
    .flavor-chip.citrus { background: #fef9c3; color: #a16207; }
    .flavor-chip.default { background: #dbeafe; color: #2563eb; }
    .status-badge {
      display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600;
    }
    .status-open { background: #fef3c7; color: #92400e; }
    .status-packed { background: #dcfce7; color: #15803d; }
    .table-wrapper {
      overflow-x: auto; border-radius: 12px; border: 1px solid #E5E7EB;
    }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead { background: #F9FAFB; }
    th { padding: 12px 16px; text-align: left; font-weight: 600; color: #6B7280; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }
    td { padding: 12px 16px; border-top: 1px solid #F3F4F6; color: #374151; }
    tr:hover td { background: #F9FAFB; }
  `],
  template: `
    <div style="padding:6px 0;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="font-family:'Cabin',sans-serif;font-size:22px;font-weight:700;color:#121212;margin:0 0 4px;">Production Batches</h1>
          <p style="color:#6B7280;font-size:14px;margin:0;">Manage daily production runs with flavor tracking.</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button (click)="toggleNewEntry()" class="beautiful-button" style="font-size:13px;padding:8px 18px;">
            <span class="material-icons-round" style="font-size:18px;">{{ showNewEntry() ? 'close' : 'add' }}</span>
            {{ showNewEntry() ? 'Cancel' : 'New Entry' }}
          </button>
          <button (click)="load()" style="padding:8px 14px;background:#F1F5F9;border:1px solid #E5E7EB;border-radius:12px;cursor:pointer;display:flex;align-items:center;gap:6px;font-size:13px;font-weight:500;color:#374151;">
            <span class="material-icons-round" style="font-size:16px;">refresh</span> Refresh
          </button>
        </div>
      </div>

      <!-- ═══ NEW ENTRY WIZARD ═══ -->
      @if (showNewEntry()) {
        <div class="wizard-card" style="border-left:4px solid #01AC51;">
          <div class="wizard-header">
            <div class="wizard-icon" style="background:linear-gradient(135deg,#01AC51,#059669);">
              <span class="material-icons-round">precision_manufacturing</span>
            </div>
            <div>
              <h2 style="font-family:'Cabin',sans-serif;font-size:17px;font-weight:700;color:#121212;margin:0;">New Production Entry</h2>
              <p style="font-size:13px;color:#6B7280;margin:2px 0 0;">Record a production batch with flavor.</p>
            </div>
          </div>

          <div class="field-grid" style="margin-bottom:20px;">
            <!-- Batch Code -->
            <div>
              <label class="field-label">Batch Code *</label>
              <input [(ngModel)]="newBatchCode" class="beautiful-input" placeholder="e.g. GG-20260329" style="font-size:14px;">
              <p style="font-size:11px;color:#9CA3AF;margin-top:4px;">Day-based code. Same code can have multiple flavors.</p>
            </div>

            <!-- Flavor Selection -->
            <div>
              <label class="field-label">Flavor *</label>
              <app-searchable-select
                [options]="flavorOptions()"
                [value]="newFlavorId"
                placeholder="Select a flavor"
                searchPlaceholder="Search flavors..."
                emptyText="No flavors found."
                createLabelPrefix="Add flavor"
                [allowCreate]="true"
                (valueChange)="newFlavorId = $event"
                (createRequested)="createFlavor($event)">
              </app-searchable-select>
            </div>

            <!-- SKU / Recipe -->
            <div>
              <label class="field-label">Recipe</label>
              <app-searchable-select
                [options]="recipeOptions()"
                [value]="newRecipeId"
                placeholder="Select a recipe"
                searchPlaceholder="Search recipes..."
                emptyText="No recipes found."
                createLabelPrefix="Add recipe"
                [allowCreate]="false"
                (valueChange)="newRecipeId = $event">
              </app-searchable-select>
            </div>

            <!-- Worker -->
            <div>
              <label class="field-label">Worker ID</label>
              <input [(ngModel)]="newWorkerId" class="beautiful-input" placeholder="e.g. worker-production-1" style="font-size:14px;">
            </div>

            <!-- Planned Yield -->
            <div>
              <label class="field-label">Planned Yield (kg)</label>
              <input [(ngModel)]="newPlannedYield" type="number" min="0" step="0.1" class="beautiful-input" placeholder="e.g. 100" style="font-size:14px;">
            </div>

            <!-- Actual Yield -->
            <div>
              <label class="field-label">Actual Yield (kg)</label>
              <input [(ngModel)]="newActualYield" type="number" min="0" step="0.1" class="beautiful-input" placeholder="e.g. 95" style="font-size:14px;">
            </div>
          </div>

          @if (formError()) {
            <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:10px 14px;margin-bottom:16px;display:flex;align-items:center;gap:8px;">
              <span class="material-icons-round" style="font-size:18px;color:#DC2626;">error</span>
              <span style="font-size:13px;color:#991B1B;">{{ formError() }}</span>
            </div>
          }

          <div style="display:flex;gap:10px;">
            <button (click)="submitEntry()" [disabled]="saving()" class="beautiful-button" style="font-size:13px;padding:10px 24px;">
              @if (saving()) {
                <span class="spinner" style="width:16px;height:16px;"></span> Saving...
              } @else {
                <span class="material-icons-round" style="font-size:18px;">check</span> Submit Entry
              }
            </button>
            <button (click)="toggleNewEntry()" style="padding:10px 20px;background:#F3F4F6;border:1px solid #E5E7EB;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;color:#374151;">Cancel</button>
          </div>
        </div>
      }

      <!-- ═══ TOAST ═══ -->
      @if (toast()) {
        <div class="toast" [class.toast-success]="toastKind()==='success'" [class.toast-error]="toastKind()==='error'">{{ toast() }}</div>
      }

      <!-- ═══ TABLE ═══ -->
      @if (loading()) {
        <div style="display:grid;gap:8px;">
          @for (i of [1,2,3,4]; track i) { <div class="skeleton" style="height:52px;border-radius:10px;"></div> }
        </div>
      } @else if (batches().length === 0) {
        <div style="text-align:center;padding:60px 0;color:#9CA3AF;">
          <span class="material-icons-round" style="font-size:48px;display:block;margin-bottom:12px;">precision_manufacturing</span>
          <p style="font-size:15px;margin:0;">No production batches yet.</p>
          <p style="font-size:13px;margin:6px 0 0;">Click "New Entry" to record a production run.</p>
        </div>
      } @else {
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Batch Code</th>
                <th>Flavor</th>
                <th>SKU</th>
                <th>Date</th>
                <th>Status</th>
                <th style="text-align:right;">Planned</th>
                <th style="text-align:right;">Actual</th>
              </tr>
            </thead>
            <tbody>
              @for (batch of batches(); track batch.id ?? batch.batch_code) {
                <tr>
                  <td style="font-family:monospace;font-size:12px;font-weight:600;">{{ batch.batch_code }}</td>
                  <td>
                    <span [class]="'flavor-chip ' + getFlavorChipClass(batch)">
                      {{ batch.flavor?.name ?? batch.flavor_id ?? '—' }}
                    </span>
                  </td>
                  <td>{{ batch.sku?.name ?? batch.sku_id }}</td>
                  <td>{{ batch.production_date }}</td>
                  <td>
                    <span [class]="'status-badge ' + (batch.status === 'packed' ? 'status-packed' : 'status-open')">
                      {{ batch.status }}
                    </span>
                  </td>
                  <td style="text-align:right;">{{ batch.planned_yield ?? '—' }}</td>
                  <td style="text-align:right;">{{ batch.actual_yield ?? '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class ProductionComponent implements OnInit {
  private supabase = inject(SupabaseService);
  private readonly uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  batches = signal<ProductionBatch[]>([]);
  flavors = signal<FlavorDefinition[]>([]);
  recipes = signal<{id: string; name: string; code: string}[]>([]);
  loading = signal(false);
  saving = signal(false);
  showNewEntry = signal(false);
  formError = signal('');
  toast = signal('');
  toastKind = signal<'success' | 'error'>('success');

  // New entry form fields
  newBatchCode = '';
  newFlavorId = '';
  newRecipeId = '';
  newWorkerId = '';
  newPlannedYield: number | null = null;
  newActualYield: number | null = null;

  readonly flavorOptions = computed<SearchableSelectOption[]>(() =>
    this.flavors().map((flavor) => ({
      id: flavor.id,
      label: flavor.name,
      sublabel: flavor.code ? `Code: ${flavor.code}` : undefined,
    })),
  );

  readonly recipeOptions = computed<SearchableSelectOption[]>(() =>
    this.recipes().map((recipe) => ({
      id: recipe.id,
      label: recipe.name,
      sublabel: recipe.code ? `Code: ${recipe.code}` : undefined,
    })),
  );

  ngOnInit(): void {
    this.load();
    this.loadFlavors();
    this.loadRecipes();
    this.subscribeRealtime();
  }

  toggleNewEntry(): void {
    this.showNewEntry.update(v => !v);
    if (!this.showNewEntry()) this.resetForm();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    const { data, error } = await this.supabase.client
      .from('production_batches')
      .select('*, sku:gg_flavors!production_batches_sku_id_fkey(id,name,code), flavor:gg_flavors!production_batches_flavor_id_fkey(id,name,code)')
      .order('production_date', { ascending: false })
      .limit(100);
    if (!error && data) this.batches.set(data as ProductionBatch[]);
    this.loading.set(false);
  }

  async loadFlavors(): Promise<void> {
    const { data } = await this.supabase.client
      .from('gg_flavors')
      .select('id, name, code, active')
      .eq('active', true)
      .order('name');
    if (data) this.flavors.set(data as FlavorDefinition[]);
  }

  async loadRecipes(): Promise<void> {
    const { data } = await this.supabase.client
      .from('gg_recipes')
      .select('id, name, code, is_active')
      .eq('is_active', true)
      .order('name');
    if (data) this.recipes.set(data.map((r: any) => ({ id: r.id, name: r.name, code: r.code })));
  }

  async createFlavor(name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;

    const existing = this.flavors().find((flavor) => flavor.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      this.newFlavorId = existing.id;
      return;
    }

    const code = trimmed.replace(/\s+/g, '').toUpperCase().slice(0, 6) || 'FLAVOR';
    const { data, error } = await this.supabase.client
      .from('gg_flavors')
      .insert({ name: trimmed, code, active: true })
      .select('id, name, code, active')
      .single();

    if (error || !data) {
      this.formError.set(error?.message ?? 'Failed to create flavor.');
      return;
    }

    this.flavors.update((list) => [...list, data as FlavorDefinition].sort((a, b) => a.name.localeCompare(b.name)));
    this.newFlavorId = data.id;
  }

  async submitEntry(): Promise<void> {
    this.formError.set('');

    if (!this.newBatchCode.trim()) {
      this.formError.set('Batch code is required.');
      return;
    }
    if (!this.newFlavorId) {
      this.formError.set('Please select a flavor.');
      return;
    }

    this.saving.set(true);

    const payload: any = {
      batch_code: this.newBatchCode.trim(),
      flavor_id: this.newFlavorId,
      sku_id: this.newFlavorId,  // sku_id = flavor_id for now
      recipe_id: this.newRecipeId || null,
      production_date: new Date().toISOString().split('T')[0],
      worker_id: this.toUuidOrNull(this.newWorkerId),
      status: 'open',
      planned_yield: this.newPlannedYield,
      actual_yield: this.newActualYield,
    };

    const { error } = await this.supabase.client
      .from('production_batches')
      .insert(payload);

    if (error) {
      if (error.message.includes('duplicate') || error.message.includes('unique') || error.code === '23505') {
        this.formError.set(`A production entry for batch "${this.newBatchCode}" with this flavor already exists today.`);
      } else {
        this.formError.set(error.message);
      }
      this.saving.set(false);
      return;
    }

    this.showToast('Production entry created!', 'success');
    this.showNewEntry.set(false);
    this.resetForm();
    this.saving.set(false);
    await this.load();
  }

  getFlavorChipClass(batch: ProductionBatch): string {
    const name = (batch.flavor?.name ?? '').toLowerCase();
    if (name.includes('mint') || name.includes('spear')) return 'mint';
    if (name.includes('berry') || name.includes('straw') || name.includes('bubble')) return 'berry';
    if (name.includes('lemon') || name.includes('citrus') || name.includes('watermelon')) return 'citrus';
    return 'default';
  }

  subscribeRealtime(): void {
    this.supabase.client
      .channel('production-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_batches' }, () => this.load())
      .subscribe();
  }

  private resetForm(): void {
    this.newBatchCode = '';
    this.newFlavorId = '';
    this.newRecipeId = '';
    this.newWorkerId = '';
    this.newPlannedYield = null;
    this.newActualYield = null;
    this.formError.set('');
  }

  private showToast(msg: string, kind: 'success' | 'error'): void {
    this.toast.set(msg);
    this.toastKind.set(kind);
    setTimeout(() => this.toast.set(''), 3000);
  }

  private toUuidOrNull(value: string): string | null {
    const trimmed = value.trim();
    return this.uuidPattern.test(trimmed) ? trimmed : null;
  }
}
