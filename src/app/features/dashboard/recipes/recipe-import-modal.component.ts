import { Component, EventEmitter, Output, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { RecipeImportService, RecipePreview, ImportResult } from './recipe-import.service';

type State = 'idle' | 'parsing' | 'preview' | 'committing' | 'results';

@Component({
  selector: 'app-recipe-import-modal',
  standalone: true,
  imports: [CommonModule, DecimalPipe],
  template: `
    <div class="ri-overlay" (click)="onBackdrop()">
      <div class="ri-modal" (click)="$event.stopPropagation()">

        <div class="ri-header">
          <div>
            <h2 style="font-size:16px;font-weight:700;color:#121212;margin:0 0 2px;">Import recipes</h2>
            <p style="font-size:12px;color:#9CA3AF;margin:0;">{{ subtitle() }}</p>
          </div>
          <button (click)="onCancel()" [disabled]="state() === 'committing'"
                  style="border:none;background:none;cursor:pointer;color:#9CA3AF;padding:4px;">
            <span class="material-icons-round" style="font-size:20px;">close</span>
          </button>
        </div>

        <div class="ri-body">

          @if (state() === 'idle') {
            <div style="padding:28px;text-align:center;">
              <div style="margin:0 auto 14px;width:52px;height:52px;border-radius:13px;background:#f0fdf4;display:flex;align-items:center;justify-content:center;">
                <span class="material-icons-round" style="color:#01AC51;font-size:26px;">upload_file</span>
              </div>
              <p style="font-size:14px;font-weight:600;color:#121212;margin:0 0 4px;">Upload your recipe sheet (CSV)</p>
              <p style="font-size:12px;color:#6B7280;margin:0 0 16px;line-height:1.5;">
                Export your master recipe Excel as CSV. Format: ingredients down the rows,
                flavors across the columns, gram quantities in the cells.
                Your recipe values stay in this browser — nothing is uploaded externally.
              </p>
              <input #fileInput type="file" accept=".csv,text/csv" (change)="onFile($event)" style="display:none;">
              <button (click)="fileInput.click()"
                      style="padding:10px 22px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
                Choose CSV file
              </button>
              @if (errorMsg()) { <p style="margin-top:12px;font-size:13px;color:#dc2626;">{{ errorMsg() }}</p> }
            </div>
          }

          @if (state() === 'parsing' || state() === 'committing') {
            <div style="padding:44px;text-align:center;">
              <div class="ri-spinner"></div>
              <p style="font-size:14px;color:#6B7280;margin:14px 0 0;">
                {{ state() === 'parsing' ? 'Reading file…' : 'Writing recipes to database…' }}
              </p>
            </div>
          }

          @if (state() === 'preview' && preview()) {
            <div style="padding:18px 22px;">
              <!-- Summary cards -->
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:16px;">
                <div class="ri-stat"><span class="ri-num">{{ preview()!.recipeCount }}</span><span class="ri-lbl">Recipes</span></div>
                <div class="ri-stat"><span class="ri-num">{{ preview()!.newFlavors.length }}</span><span class="ri-lbl">New flavors</span></div>
                <div class="ri-stat"><span class="ri-num">{{ preview()!.newIngredients.length }}</span><span class="ri-lbl">New ingredients</span></div>
                <div class="ri-stat"><span class="ri-num">{{ preview()!.lineCount }}</span><span class="ri-lbl">Recipe lines</span></div>
              </div>

              @if (preview()!.warnings.length > 0) {
                <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;margin-bottom:14px;">
                  @for (w of preview()!.warnings; track w) {
                    <p style="font-size:12px;color:#92400e;margin:0;">⚠ {{ w }}</p>
                  }
                </div>
              }

              <!-- Per-recipe breakdown -->
              <p style="font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Recipes to create</p>
              <div style="border:1px solid #E5E7EB;border-radius:8px;max-height:280px;overflow-y:auto;">
                <div style="display:grid;grid-template-columns:1fr 90px 90px;gap:8px;padding:6px 12px;background:#f8f9fa;border-bottom:1px solid #E5E7EB;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;">
                  <span>Flavor</span><span style="text-align:right;">Ingredients</span><span style="text-align:right;">Batch (kg)</span>
                </div>
                @for (f of preview()!.flavorNames; track f) {
                  <div style="display:grid;grid-template-columns:1fr 90px 90px;gap:8px;padding:7px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;align-items:center;">
                    <span style="color:#374151;font-weight:600;">
                      {{ f }}
                      @if (preview()!.newFlavors.includes(f)) {
                        <span style="margin-left:6px;font-size:9px;font-weight:700;background:#dbeafe;color:#1d4ed8;padding:1px 5px;border-radius:4px;">NEW</span>
                      }
                    </span>
                    <span style="color:#6B7280;text-align:right;">{{ lineCountFor(f) }}</span>
                    <span style="color:#15803d;font-weight:600;text-align:right;">{{ preview()!.batchKgByFlavor[f] | number:'1.0-3' }}</span>
                  </div>
                }
              </div>

              @if (preview()!.newIngredients.length > 0) {
                <p style="font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.5px;margin:14px 0 6px;">
                  New ingredients ({{ preview()!.newIngredients.length }}) — created as grams
                </p>
                <p style="font-size:12px;color:#374151;line-height:1.6;">{{ preview()!.newIngredients.join(', ') }}</p>
              }
            </div>
          }

          @if (state() === 'results' && result()) {
            <div style="padding:22px;text-align:center;">
              <div style="margin:0 auto 12px;width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;"
                   [style.background]="result()!.errors.length === 0 ? '#dcfce7' : '#fee2e2'">
                <span class="material-icons-round" style="font-size:24px;"
                      [style.color]="result()!.errors.length === 0 ? '#15803d' : '#991b1b'">
                  {{ result()!.errors.length === 0 ? 'check_circle' : 'error_outline' }}
                </span>
              </div>
              <p style="font-size:15px;font-weight:700;color:#121212;margin:0 0 10px;">Import complete</p>
              <div style="display:inline-flex;flex-direction:column;gap:4px;text-align:left;font-size:13px;color:#374151;">
                <span>Flavors created: <strong>{{ result()!.flavorsCreated }}</strong></span>
                <span>Ingredients created: <strong>{{ result()!.ingredientsCreated }}</strong></span>
                <span>Recipes created: <strong>{{ result()!.recipesCreated }}</strong></span>
                <span>Recipes updated: <strong>{{ result()!.recipesUpdated }}</strong></span>
                <span>Recipe lines created: <strong>{{ result()!.linesCreated }}</strong></span>
              </div>
              @if (result()!.errors.length > 0) {
                <div style="margin-top:14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 12px;text-align:left;">
                  @for (e of result()!.errors; track e) {
                    <p style="font-size:12px;color:#991b1b;margin:0 0 4px;">{{ e }}</p>
                  }
                </div>
              }
            </div>
          }
        </div>

        <div class="ri-footer">
          @if (state() === 'preview') {
            <button (click)="onCancel()" class="ri-btn ri-btn-sec">Cancel</button>
            <button (click)="onConfirm()" class="ri-btn ri-btn-pri" [disabled]="preview()!.lineCount === 0">
              <span class="material-icons-round" style="font-size:16px;">cloud_upload</span>
              Create {{ preview()!.recipeCount }} recipes
            </button>
          }
          @if (state() === 'results') {
            <button (click)="onClose()" class="ri-btn ri-btn-pri">Done</button>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .ri-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:1000; display:flex; align-items:center; justify-content:center; padding:16px; }
    .ri-modal { background:#fff; border-radius:16px; width:100%; max-width:640px; max-height:90vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.2); }
    .ri-header { display:flex; align-items:center; justify-content:space-between; padding:18px 22px; border-bottom:1px solid #E5E7EB; }
    .ri-body { flex:1; overflow-y:auto; }
    .ri-footer { display:flex; gap:10px; justify-content:flex-end; padding:14px 22px; border-top:1px solid #E5E7EB; background:#f8f9fa; }
    .ri-footer:empty { display:none; }
    .ri-btn { padding:9px 18px; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:6px; border:none; }
    .ri-btn-pri { background:#01AC51; color:#fff; }
    .ri-btn-pri:disabled { opacity:0.5; cursor:not-allowed; }
    .ri-btn-sec { background:#fff; color:#374151; border:1px solid #E5E7EB; }
    .ri-spinner { margin:0 auto; width:28px; height:28px; border:3px solid #E5E7EB; border-top-color:#01AC51; border-radius:50%; animation:rispin 0.7s linear infinite; }
    @keyframes rispin { to { transform:rotate(360deg); } }
    .ri-stat { display:flex; flex-direction:column; align-items:flex-start; padding:10px 12px; border-radius:10px; border:1px solid #E5E7EB; background:#f8f9fa; }
    .ri-num { font-size:20px; font-weight:700; color:#121212; line-height:1; }
    .ri-lbl { font-size:11px; font-weight:600; color:#6B7280; text-transform:uppercase; letter-spacing:0.4px; margin-top:4px; }
  `],
})
export class RecipeImportModalComponent {
  private readonly importer = inject(RecipeImportService);

  @Output() closed = new EventEmitter<{ imported: boolean }>();

  state = signal<State>('idle');
  errorMsg = signal('');
  filename = signal('');
  preview = signal<RecipePreview | null>(null);
  result = signal<ImportResult | null>(null);

  readonly subtitle = computed(() => {
    switch (this.state()) {
      case 'idle': return 'Wipe-and-reload from your master recipe sheet';
      case 'parsing': return this.filename();
      case 'preview': return `Preview · ${this.filename()}`;
      case 'committing': return 'Writing…';
      case 'results': return 'Done';
    }
  });

  lineCountFor(flavor: string): number {
    return this.preview()?.cells.filter((c) => c.flavorName === flavor).length ?? 0;
  }

  async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.filename.set(file.name);
    this.errorMsg.set('');
    this.state.set('parsing');
    try {
      const rows = await this.importer.parseCsv(file);
      const cells = this.importer.parseGrid(rows);
      const catalogs = await this.importer.loadCatalogs();
      const preview = this.importer.buildPreview(cells, catalogs);
      this.preview.set(preview);
      this.state.set('preview');
    } catch (err) {
      this.errorMsg.set(err instanceof Error ? err.message : 'Failed to read file.');
      this.state.set('idle');
    } finally {
      input.value = '';
    }
  }

  async onConfirm(): Promise<void> {
    const preview = this.preview();
    if (!preview) return;
    this.state.set('committing');
    try {
      const result = await this.importer.commit(preview);
      this.result.set(result);
      this.state.set('results');
    } catch (err) {
      this.errorMsg.set(err instanceof Error ? err.message : 'Import failed.');
      this.state.set('preview');
    }
  }

  onBackdrop(): void { if (this.state() !== 'committing') this.onCancel(); }
  onCancel(): void { if (this.state() !== 'committing') this.closed.emit({ imported: false }); }
  onClose(): void {
    const r = this.result();
    this.closed.emit({ imported: !!r && (r.recipesCreated + r.recipesUpdated) > 0 });
  }
}
