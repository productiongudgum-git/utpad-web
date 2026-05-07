import { Component, EventEmitter, inject, Output, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CsvImportService } from './csv-import.service';
import {
  AggregatedInvoice,
  Catalogs,
  FlavorRow,
  ImportPreview,
  ImportProgress,
  ImportResult,
  ResolvedInvoice,
} from './csv-import-types';

type ModalState = 'idle' | 'parsing' | 'preview' | 'importing' | 'results';

@Component({
  selector: 'app-csv-import-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe],
  template: `
    <div class="csv-overlay" (click)="onBackdropClick($event)">
      <div class="csv-modal" (click)="$event.stopPropagation()">

        <!-- Header -->
        <div class="csv-header">
          <div>
            <h2 style="font-size:16px;font-weight:700;color:#121212;margin:0 0 2px;">Import invoices from Zoho CSV</h2>
            <p style="font-size:12px;color:#9CA3AF;margin:0;">{{ subtitle() }}</p>
          </div>
          <button (click)="onCancel()" style="border:none;background:none;cursor:pointer;color:#9CA3AF;display:flex;align-items:center;padding:4px;"
                  [disabled]="state() === 'importing'">
            <span class="material-icons-round" style="font-size:20px;">close</span>
          </button>
        </div>

        <!-- Body -->
        <div class="csv-body">

          <!-- ── State: idle (file picker) ─────────────────────────────────────── -->
          @if (state() === 'idle') {
            <div style="padding:32px;text-align:center;">
              <div style="margin:0 auto 16px;width:56px;height:56px;border-radius:14px;background:#f0fdf4;display:flex;align-items:center;justify-content:center;">
                <span class="material-icons-round" style="color:#01AC51;font-size:28px;">upload_file</span>
              </div>
              <p style="font-size:15px;font-weight:600;color:#121212;margin:0 0 6px;">Select a Zoho invoice export</p>
              <p style="font-size:13px;color:#6B7280;margin:0 0 18px;">A CSV exported from Zoho Books → Reports → Invoice Details.</p>
              <input #fileInput type="file" accept=".csv,text/csv"
                    (change)="onFileSelected($event)" style="display:none;">
              <button (click)="fileInput.click()"
                      style="padding:10px 24px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;">
                <span class="material-icons-round" style="font-size:16px;">folder_open</span>
                Choose CSV file
              </button>
              @if (errorMsg()) {
                <p style="margin-top:14px;font-size:13px;color:#dc2626;">{{ errorMsg() }}</p>
              }
            </div>
          }

          <!-- ── State: parsing ─────────────────────────────────────── -->
          @if (state() === 'parsing') {
            <div style="padding:48px;text-align:center;">
              <div class="csv-spinner"></div>
              <p style="font-size:14px;color:#6B7280;margin:14px 0 0;">{{ parsingMsg() }}</p>
            </div>
          }

          <!-- ── State: preview ─────────────────────────────────────── -->
          @if (state() === 'preview' && preview()) {
            <div style="padding:20px 24px;">

              <!-- Summary cards -->
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:18px;">
                <div class="csv-stat csv-stat-green">
                  <span class="csv-stat-num">{{ preview()!.newCount }}</span>
                  <span class="csv-stat-label">New invoices</span>
                </div>
                <div class="csv-stat csv-stat-blue">
                  <span class="csv-stat-num">{{ preview()!.updateCount }}</span>
                  <span class="csv-stat-label">Will update</span>
                </div>
                @if (preview()!.dispatchedWarningCount > 0) {
                  <div class="csv-stat csv-stat-amber">
                    <span class="csv-stat-num">{{ preview()!.dispatchedWarningCount }}</span>
                    <span class="csv-stat-label">Already dispatched</span>
                  </div>
                }
                @if (preview()!.skippedInvoiceCount > 0) {
                  <div class="csv-stat csv-stat-grey">
                    <span class="csv-stat-num">{{ preview()!.skippedInvoiceCount }}</span>
                    <span class="csv-stat-label">Skipped (no products)</span>
                  </div>
                }
                <div class="csv-stat csv-stat-grey">
                  <span class="csv-stat-num">{{ preview()!.newCustomerCount }}</span>
                  <span class="csv-stat-label">New customers</span>
                </div>
              </div>

              <!-- Unmapped products warning -->
              @if (preview()!.unmappedProducts.length > 0) {
                <div class="csv-warn">
                  <div style="display:flex;align-items:flex-start;gap:8px;">
                    <span class="material-icons-round" style="font-size:18px;color:#d97706;flex-shrink:0;margin-top:1px;">warning_amber</span>
                    <div style="flex:1;">
                      <p style="font-size:13px;font-weight:600;color:#92400e;margin:0 0 4px;">
                        {{ preview()!.skippedLineCount }} line items skipped — {{ preview()!.unmappedProducts.length }} product{{ preview()!.unmappedProducts.length === 1 ? '' : 's' }} not mapped to any flavor
                      </p>
                      <p style="font-size:12px;color:#78350f;margin:0 0 8px;">
                        Pick a flavor for each unmapped product below to import these lines. Mappings are saved permanently to <code style="background:#fde68a;padding:1px 4px;border-radius:3px;font-size:11px;">gg_flavors.zoho_product_id</code>.
                      </p>
                      <button (click)="toggleUnmapped()"
                              style="background:none;border:none;color:#92400e;font-size:12px;font-weight:600;cursor:pointer;padding:0;text-decoration:underline;">
                        {{ showUnmapped() ? 'Hide' : 'Show' }} unmapped products
                      </button>
                      @if (showUnmapped()) {
                        <div style="margin-top:10px;background:#fff;border:1px solid #fde68a;border-radius:6px;overflow:hidden;">
                          <div style="display:grid;grid-template-columns:1fr 110px 50px 170px;gap:8px;padding:6px 10px;background:#fef3c7;border-bottom:1px solid #fde68a;font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.4px;">
                            <span>Zoho Item</span>
                            <span style="text-align:right;">Product ID</span>
                            <span style="text-align:right;">Occ.</span>
                            <span>Map to flavor</span>
                          </div>
                          <div style="max-height:220px;overflow-y:auto;">
                            @for (p of preview()!.unmappedProducts; track p.zoho_product_id) {
                              <div style="display:grid;grid-template-columns:1fr 110px 50px 170px;gap:8px;padding:6px 10px;border-bottom:1px solid #fef3c7;font-size:12px;align-items:center;">
                                <span style="color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" [title]="p.item_name">{{ p.item_name }}</span>
                                <span style="color:#9CA3AF;font-family:monospace;font-size:10px;text-align:right;overflow:hidden;text-overflow:ellipsis;" [title]="p.zoho_product_id">{{ p.zoho_product_id }}</span>
                                <span style="color:#92400e;font-weight:600;text-align:right;">{{ p.occurrences }}×</span>
                                <select [ngModel]="p.selectedFlavorId" (ngModelChange)="p.selectedFlavorId = $event; onMappingChange()"
                                        style="padding:4px 6px;border:1px solid #fde68a;border-radius:4px;font-size:11px;background:#fff;color:#374151;cursor:pointer;width:100%;">
                                  <option [ngValue]="undefined">— pick flavor —</option>
                                  @for (f of availableFlavorsFor(p.selectedFlavorId); track f.id) {
                                    <option [ngValue]="f.id">{{ f.name }}</option>
                                  }
                                </select>
                              </div>
                            }
                          </div>
                          @if (stagedMappingCount() > 0) {
                            <div style="padding:8px 12px;background:#fef3c7;display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid #fde68a;">
                              <span style="font-size:12px;font-weight:600;color:#92400e;">
                                {{ stagedMappingCount() }} mapping{{ stagedMappingCount() === 1 ? '' : 's' }} staged
                              </span>
                              <button (click)="onSaveMappings()" [disabled]="mappingSaving()"
                                      style="padding:6px 14px;background:#92400e;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px;"
                                      [style.opacity]="mappingSaving() ? '0.7' : '1'">
                                <span class="material-icons-round" style="font-size:14px;">save</span>
                                {{ mappingSaving() ? 'Saving…' : 'Save & re-validate' }}
                              </button>
                            </div>
                          }
                          @if (mappingError()) {
                            <div style="padding:8px 12px;background:#fef2f2;color:#991b1b;font-size:12px;border-top:1px solid #fde68a;">
                              <span class="material-icons-round" style="font-size:14px;vertical-align:middle;">error_outline</span>
                              {{ mappingError() }}
                            </div>
                          }
                        </div>
                      }
                    </div>
                  </div>
                </div>
              }

              <!-- Dispatched warnings -->
              @if (dispatchedWarningInvoices().length > 0) {
                <div class="csv-danger">
                  <p style="font-size:13px;font-weight:600;color:#991b1b;margin:0 0 8px;display:flex;align-items:center;gap:6px;">
                    <span class="material-icons-round" style="font-size:16px;">local_shipping</span>
                    {{ dispatchedWarningInvoices().length }} invoice{{ dispatchedWarningInvoices().length === 1 ? '' : 's' }} already marked as dispatched
                  </p>
                  <p style="font-size:12px;color:#7f1d1d;margin:0 0 10px;">
                    These won't be changed unless you tick the box. Updating a dispatched invoice may cause inventory to drift.
                  </p>
                  <div style="background:#fff;border:1px solid #fecaca;border-radius:6px;max-height:200px;overflow-y:auto;">
                    @for (inv of dispatchedWarningInvoices(); track inv.invoice_number) {
                      <label style="display:grid;grid-template-columns:24px 1fr 1fr 80px;gap:8px;padding:8px 10px;border-bottom:1px solid #fee2e2;align-items:center;cursor:pointer;font-size:12px;">
                        <input type="checkbox" [(ngModel)]="inv.override" (ngModelChange)="onOverrideChange()">
                        <span style="font-family:monospace;font-weight:600;color:#121212;">{{ inv.invoice_number }}</span>
                        <span style="color:#374151;">{{ inv.customer.name }}</span>
                        <span style="color:#6B7280;text-align:right;">{{ totalBoxes(inv) }} boxes</span>
                      </label>
                    }
                  </div>
                </div>
              }

              <!-- Source summary footer -->
              <p style="font-size:11px;color:#9CA3AF;margin:14px 0 0;text-align:center;">
                Read {{ preview()!.totalLineItems | number }} line items across {{ preview()!.totalInvoicesInCsv | number }} invoice{{ preview()!.totalInvoicesInCsv === 1 ? '' : 's' }} from {{ filename() }}
              </p>
            </div>
          }

          <!-- ── State: importing ─────────────────────────────────────── -->
          @if (state() === 'importing') {
            <div style="padding:48px;text-align:center;">
              <div class="csv-spinner"></div>
              <p style="font-size:14px;color:#374151;margin:14px 0 0;font-weight:600;">{{ importProgressLabel() }}</p>
              @if (progress()) {
                <div style="margin:14px auto 0;max-width:280px;background:#f3f4f6;border-radius:8px;overflow:hidden;height:8px;">
                  <div style="height:100%;background:#01AC51;transition:width 0.2s;"
                       [style.width.%]="(progress()!.done / Math.max(progress()!.total, 1)) * 100"></div>
                </div>
                <p style="font-size:12px;color:#9CA3AF;margin:6px 0 0;">
                  {{ progress()!.done }} / {{ progress()!.total }}
                </p>
              }
            </div>
          }

          <!-- ── State: results ─────────────────────────────────────── -->
          @if (state() === 'results' && result()) {
            <div style="padding:20px 24px;">
              <div style="text-align:center;padding:14px 0 18px;">
                <div style="margin:0 auto 12px;width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;"
                     [style.background]="result()!.errorCount === 0 ? '#dcfce7' : '#fee2e2'">
                  <span class="material-icons-round" style="font-size:24px;"
                        [style.color]="result()!.errorCount === 0 ? '#15803d' : '#991b1b'">
                    {{ result()!.errorCount === 0 ? 'check_circle' : 'error_outline' }}
                  </span>
                </div>
                <p style="font-size:15px;font-weight:700;color:#121212;margin:0 0 4px;">Import complete</p>
                <p style="font-size:13px;color:#6B7280;margin:0;">{{ resultsHeadline() }}</p>
              </div>

              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px;">
                <div class="csv-stat csv-stat-green">
                  <span class="csv-stat-num">{{ result()!.createdCount }}</span>
                  <span class="csv-stat-label">Created</span>
                </div>
                <div class="csv-stat csv-stat-blue">
                  <span class="csv-stat-num">{{ result()!.updatedCount }}</span>
                  <span class="csv-stat-label">Updated</span>
                </div>
                <div class="csv-stat csv-stat-grey">
                  <span class="csv-stat-num">{{ result()!.skippedCount }}</span>
                  <span class="csv-stat-label">Skipped</span>
                </div>
                <div [class]="result()!.errorCount > 0 ? 'csv-stat csv-stat-red' : 'csv-stat csv-stat-grey'">
                  <span class="csv-stat-num">{{ result()!.errorCount }}</span>
                  <span class="csv-stat-label">Errors</span>
                </div>
              </div>

              @if (result()!.errorCount > 0) {
                <div class="csv-danger" style="margin-bottom:0;">
                  <p style="font-size:12px;font-weight:600;color:#991b1b;margin:0 0 8px;">Errors:</p>
                  <div style="background:#fff;border:1px solid #fecaca;border-radius:6px;max-height:160px;overflow-y:auto;">
                    @for (row of errorRows(); track row.invoice_number) {
                      <div style="padding:6px 10px;border-bottom:1px solid #fee2e2;font-size:12px;">
                        <span style="font-family:monospace;font-weight:600;color:#121212;">{{ row.invoice_number }}</span>
                        <span style="color:#7f1d1d;margin-left:8px;">{{ row.reason }}</span>
                      </div>
                    }
                  </div>
                </div>
              }
            </div>
          }
        </div>

        <!-- Footer -->
        <div class="csv-footer">
          @if (state() === 'preview') {
            <button (click)="onCancel()" class="csv-btn csv-btn-secondary">Cancel</button>
            <button (click)="onConfirm()" class="csv-btn csv-btn-primary"
                    [disabled]="(preview()!.newCount + preview()!.updateCount + overriddenCount()) === 0">
              <span class="material-icons-round" style="font-size:16px;">cloud_upload</span>
              Import {{ preview()!.newCount + preview()!.updateCount + overriddenCount() }} invoice{{ (preview()!.newCount + preview()!.updateCount + overriddenCount()) === 1 ? '' : 's' }}
            </button>
          }
          @if (state() === 'results') {
            <button (click)="downloadResults()" class="csv-btn csv-btn-secondary">
              <span class="material-icons-round" style="font-size:16px;">download</span>
              Download results CSV
            </button>
            <button (click)="onClose()" class="csv-btn csv-btn-primary">Done</button>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .csv-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:1000; display:flex; align-items:center; justify-content:center; padding:16px; }
    .csv-modal { background:#fff; border-radius:16px; width:100%; max-width:680px; max-height:90vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.2); }
    .csv-header { display:flex; align-items:center; justify-content:space-between; padding:18px 22px; border-bottom:1px solid #E5E7EB; flex-shrink:0; }
    .csv-body { flex:1; overflow-y:auto; }
    .csv-footer { display:flex; gap:10px; align-items:center; justify-content:flex-end; padding:14px 22px; border-top:1px solid #E5E7EB; flex-shrink:0; background:#f8f9fa; }
    .csv-footer:empty { display:none; }
    .csv-btn { padding:9px 18px; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:6px; border:none; }
    .csv-btn-primary { background:#01AC51; color:#fff; }
    .csv-btn-primary:disabled { opacity:0.5; cursor:not-allowed; }
    .csv-btn-secondary { background:#fff; color:#374151; border:1px solid #E5E7EB; }
    .csv-spinner { margin:0 auto; width:28px; height:28px; border:3px solid #E5E7EB; border-top-color:#01AC51; border-radius:50%; animation:spin 0.7s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
    .csv-stat { display:flex; flex-direction:column; align-items:flex-start; padding:10px 12px; border-radius:10px; border:1px solid; }
    .csv-stat-num { font-size:20px; font-weight:700; line-height:1; }
    .csv-stat-label { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; margin-top:4px; }
    .csv-stat-green { background:#f0fdf4; border-color:#bbf7d0; }
    .csv-stat-green .csv-stat-num { color:#15803d; }
    .csv-stat-green .csv-stat-label { color:#166534; }
    .csv-stat-blue { background:#eff6ff; border-color:#bfdbfe; }
    .csv-stat-blue .csv-stat-num { color:#1d4ed8; }
    .csv-stat-blue .csv-stat-label { color:#1e40af; }
    .csv-stat-amber { background:#fffbeb; border-color:#fde68a; }
    .csv-stat-amber .csv-stat-num { color:#b45309; }
    .csv-stat-amber .csv-stat-label { color:#92400e; }
    .csv-stat-red { background:#fef2f2; border-color:#fecaca; }
    .csv-stat-red .csv-stat-num { color:#991b1b; }
    .csv-stat-red .csv-stat-label { color:#7f1d1d; }
    .csv-stat-grey { background:#f8f9fa; border-color:#E5E7EB; }
    .csv-stat-grey .csv-stat-num { color:#374151; }
    .csv-stat-grey .csv-stat-label { color:#6B7280; }
    .csv-warn { background:#fffbeb; border:1px solid #fde68a; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
    .csv-danger { background:#fef2f2; border:1px solid #fecaca; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
  `],
})
export class CsvImportModalComponent {
  private readonly importer = inject(CsvImportService);

  /** Emitted when the modal closes (after success or cancel). Parent should refresh invoices. */
  @Output() closed = new EventEmitter<{ imported: boolean }>();

  state = signal<ModalState>('idle');
  errorMsg = signal('');
  filename = signal('');
  parsingMsg = signal('Parsing CSV…');

  preview = signal<ImportPreview | null>(null);
  result = signal<ImportResult | null>(null);
  progress = signal<ImportProgress | null>(null);

  // Phase 2 — inline mapping state
  aggregated = signal<AggregatedInvoice[] | null>(null);
  catalogs = signal<Catalogs | null>(null);
  mappingSaving = signal(false);
  mappingError = signal('');

  showUnmapped = signal(false);

  // Used in template for percentage math
  Math = Math;

  readonly subtitle = computed(() => {
    switch (this.state()) {
      case 'idle': return 'Upload Zoho Books invoice CSV';
      case 'parsing': return this.filename();
      case 'preview': return `Preview · ${this.filename()}`;
      case 'importing': return 'Writing to database…';
      case 'results': return 'Import complete';
    }
  });

  readonly dispatchedWarningInvoices = computed(() =>
    this.preview()?.invoices.filter((i) => i.status === 'dispatched_warning') ?? []
  );

  readonly overriddenCount = computed(() =>
    this.dispatchedWarningInvoices().filter((i) => i.override).length
  );

  readonly importProgressLabel = computed(() => {
    const p = this.progress();
    if (!p) return 'Importing…';
    return p.phase === 'customers' ? 'Creating new customers…' : 'Writing invoices…';
  });

  readonly resultsHeadline = computed(() => {
    const r = this.result();
    if (!r) return '';
    const total = r.createdCount + r.updatedCount;
    if (r.errorCount > 0) {
      return `${total} invoice${total === 1 ? '' : 's'} processed, ${r.errorCount} error${r.errorCount === 1 ? '' : 's'}`;
    }
    return `${total} invoice${total === 1 ? '' : 's'} processed`;
  });

  readonly errorRows = computed(() =>
    this.result()?.rows.filter((r) => r.status === 'error') ?? []
  );

  readonly stagedMappingCount = computed(() =>
    (this.preview()?.unmappedProducts ?? []).filter((p) => !!p.selectedFlavorId).length
  );

  totalBoxes(inv: ResolvedInvoice): number {
    return inv.items.reduce((s, it) => s + it.quantity_boxes, 0);
  }

  toggleUnmapped(): void {
    this.showUnmapped.update((v) => !v);
  }

  /**
   * Returns the flavors a given dropdown row may pick from:
   * excludes flavors that already have a zoho_product_id set, and
   * flavors already chosen by another row (but keeps the current row's
   * own selection visible).
   */
  availableFlavorsFor(currentSelectedId: string | undefined): FlavorRow[] {
    const cats = this.catalogs();
    if (!cats) return [];

    const alreadyMappedIds = new Set(
      cats.flavors.filter((f) => f.zoho_product_id).map((f) => f.id)
    );
    const claimedByOthers = new Set(
      (this.preview()?.unmappedProducts ?? [])
        .filter((p) => p.selectedFlavorId && p.selectedFlavorId !== currentSelectedId)
        .map((p) => p.selectedFlavorId!)
    );

    return cats.flavors.filter(
      (f) => !alreadyMappedIds.has(f.id) && !claimedByOthers.has(f.id)
    );
  }

  /** Trigger reactivity when a select inside the unmapped list changes. */
  onMappingChange(): void {
    this.preview.set({ ...this.preview()! });
  }

  /**
   * Persist staged mappings, reload the catalogs, and re-run validation
   * against the existing parsed CSV. Previously-skipped lines may now
   * resolve and the preview will reflect that.
   */
  async onSaveMappings(): Promise<void> {
    const preview = this.preview();
    const aggregated = this.aggregated();
    if (!preview || !aggregated) return;

    const mappings = preview.unmappedProducts
      .filter((p) => p.selectedFlavorId)
      .map((p) => ({
        flavorId: p.selectedFlavorId!,
        zohoProductId: p.zoho_product_id,
      }));

    if (mappings.length === 0) return;

    this.mappingSaving.set(true);
    this.mappingError.set('');

    try {
      const { saved, errors } = await this.importer.applyFlavorMappings(mappings);

      if (errors.length > 0) {
        this.mappingError.set(`${errors.length} mapping${errors.length === 1 ? '' : 's'} failed: ${errors[0]}`);
        // Don't bail — saved ones are persisted, surface the error and reload anyway
      }

      // Reload catalogs and re-validate
      const freshCatalogs = await this.importer.loadCatalogs();
      this.catalogs.set(freshCatalogs);

      const newPreview = this.importer.resolveAndValidate(aggregated, freshCatalogs);
      this.preview.set(newPreview);

      if (errors.length === 0) {
        // Auto-collapse the unmapped panel if everything resolved
        if (newPreview.unmappedProducts.length === 0) {
          this.showUnmapped.set(false);
        }
      }

      void saved;
    } catch (err) {
      console.error('[csv-import] save mappings failed', err);
      this.mappingError.set(err instanceof Error ? err.message : 'Failed to save mappings.');
    } finally {
      this.mappingSaving.set(false);
    }
  }

  onOverrideChange(): void {
    // Force computed recompute by re-setting the signal
    this.preview.set({ ...this.preview()! });
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      this.errorMsg.set('File is over 100 MB. Please contact support if you need to import this many invoices at once.');
      return;
    }

    this.filename.set(file.name);
    this.errorMsg.set('');
    this.state.set('parsing');
    this.parsingMsg.set('Parsing CSV…');

    try {
      const rows = await this.importer.parseCsv(file);
      const aggregated = this.importer.aggregateInvoices(rows);
      this.parsingMsg.set('Loading flavors and customers…');
      const catalogs = await this.importer.loadCatalogs();
      const preview = this.importer.resolveAndValidate(aggregated, catalogs);
      // Stash for Phase 2 inline mapping (re-validation after saving)
      this.aggregated.set(aggregated);
      this.catalogs.set(catalogs);
      this.preview.set(preview);
      this.state.set('preview');
    } catch (err) {
      console.error('[csv-import] preview failed', err);
      this.errorMsg.set(err instanceof Error ? err.message : 'Failed to parse CSV.');
      this.state.set('idle');
    } finally {
      // reset the file input so the same file can be re-selected
      input.value = '';
    }
  }

  async onConfirm(): Promise<void> {
    const preview = this.preview();
    if (!preview) return;

    this.state.set('importing');
    this.progress.set(null);

    try {
      const result = await this.importer.commit(preview, (p) => this.progress.set(p));
      this.result.set(result);
      this.state.set('results');
    } catch (err) {
      console.error('[csv-import] commit failed', err);
      this.errorMsg.set(err instanceof Error ? err.message : 'Import failed.');
      this.state.set('preview');
    }
  }

  onBackdropClick(_e: MouseEvent): void {
    if (this.state() === 'importing') return;
    this.onCancel();
  }

  onCancel(): void {
    if (this.state() === 'importing') return;
    this.closed.emit({ imported: false });
  }

  onClose(): void {
    this.closed.emit({ imported: !!this.result() });
  }

  downloadResults(): void {
    const r = this.result();
    if (!r) return;
    const lines = ['invoice_number,status,reason'];
    for (const row of r.rows) {
      const reason = (row.reason ?? '').replace(/"/g, '""');
      lines.push(`${row.invoice_number},${row.status},"${reason}"`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-results-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
