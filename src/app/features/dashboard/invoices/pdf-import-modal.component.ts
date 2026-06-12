import { Component, EventEmitter, Output, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../../core/supabase.service';
import { PdfImportService, PdfInvoice } from './pdf-import.service';

type State = 'idle' | 'parsing' | 'preview' | 'committing' | 'done' | 'error';

interface ItemRow {
  description: string;
  cleanedName: string;
  quantityBoxes: number;
  flavorId: string;        // '' when unmapped
}

/** Per-invoice editable state in the preview. One per parsed invoice section. */
interface InvoiceForm {
  invoice:           PdfInvoice;
  customerId:        string;            // '' means create new with parsed name
  items:             ItemRow[];
  existingInvoiceId: string | null;     // set if the invoice_number already exists
  existsWarning:     string;
  include:           boolean;           // user can uncheck to skip
  // Result after commit
  status:            'pending' | 'created' | 'updated' | 'skipped' | 'failed';
  errorMsg:          string;
}

@Component({
  selector: 'app-pdf-import-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;"
         (click)="onCancel()">
      <div style="background:#fff;border-radius:14px;width:100%;max-width:820px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.2);"
           (click)="$event.stopPropagation()">

        <!-- Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid #E5E7EB;">
          <div>
            <h2 style="font-size:16px;font-weight:700;color:#121212;margin:0 0 2px;">Import invoice or delivery challan from PDF</h2>
            <p style="font-size:12px;color:#6B7280;margin:0;">Upload a Zoho-generated PDF — invoices and/or delivery challans, one or many per file. Auto-detected.</p>
          </div>
          <button (click)="onCancel()" [disabled]="state() === 'committing'"
                  style="border:none;background:none;cursor:pointer;color:#9CA3AF;display:flex;">
            <span class="material-icons-round" style="font-size:20px;">close</span>
          </button>
        </div>

        <!-- Body -->
        <div style="padding:18px 22px;">

          @if (state() === 'idle') {
            <label style="display:block;border:2px dashed #d1d5db;border-radius:10px;padding:36px;text-align:center;cursor:pointer;background:#f9fafb;">
              <input type="file" accept="application/pdf,.pdf" (change)="onFile($event)" style="display:none;">
              <span class="material-icons-round" style="font-size:34px;color:#9CA3AF;display:block;margin-bottom:8px;">picture_as_pdf</span>
              <p style="font-size:14px;font-weight:600;color:#374151;margin:0 0 4px;">Choose a PDF file</p>
              <p style="font-size:12px;color:#9CA3AF;margin:0;">Zoho invoice or delivery challan — single or multi-document PDFs supported</p>
            </label>
          }

          @if (state() === 'parsing') {
            <div style="padding:36px;text-align:center;color:#6B7280;">
              <span class="material-icons-round rcp-spin" style="font-size:30px;">autorenew</span>
              <p style="font-size:13px;margin:10px 0 0;">Reading the PDF…</p>
            </div>
          }

          @if (state() === 'error') {
            <div style="background:#fff5f5;border:1px solid #fca5a5;border-radius:8px;padding:12px 14px;color:#dc2626;font-size:13px;display:flex;align-items:flex-start;gap:8px;">
              <span class="material-icons-round" style="font-size:18px;">error_outline</span>
              <div>
                <p style="font-weight:700;margin:0 0 4px;">Couldn't read this PDF</p>
                <p style="margin:0;">{{ errorMsg() }}</p>
              </div>
            </div>
            <button (click)="reset()" style="margin-top:14px;padding:8px 14px;background:#f3f4f6;border:1px solid #E5E7EB;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;color:#374151;">Try another file</button>
          }

          @if (state() === 'preview' || state() === 'committing') {
            <!-- Summary header -->
            <div style="background:#f8f9fa;border-radius:10px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
              <p style="font-size:13px;color:#374151;margin:0;">
                Found <strong>{{ forms().length }}</strong> invoice{{ forms().length === 1 ? '' : 's' }} in this PDF.
                <span style="color:#6B7280;">Uncheck any you don't want to import.</span>
              </p>
              <p style="font-size:13px;color:#374151;margin:0;">
                <strong>{{ includedCount() }}</strong> selected · <strong>{{ totalBoxesAcross() }}</strong> total boxes
              </p>
            </div>

            <!-- Per-invoice cards -->
            @for (form of forms(); track form.invoice.invoiceNumber; let idx = $index) {
              <div style="border:1px solid #E5E7EB;border-radius:12px;padding:14px;margin-bottom:14px;"
                   [style.opacity]="form.include ? '1' : '0.55'"
                   [style.background]="form.include ? '#fff' : '#f9fafb'">

                <!-- Card header w/ include checkbox -->
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:8px;">
                  <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:#121212;cursor:pointer;">
                    <input type="checkbox"
                           [checked]="form.include"
                           (change)="toggleInclude(idx)"
                           [disabled]="state() === 'committing'" />
                    <span style="font-size:10px;font-weight:700;text-transform:uppercase;padding:2px 7px;border-radius:5px;letter-spacing:0.4px;"
                          [style.background]="form.invoice.documentType === 'challan' ? '#fef3c7' : '#dbeafe'"
                          [style.color]="form.invoice.documentType === 'challan' ? '#92400e' : '#1e40af'">
                      {{ form.invoice.documentType === 'challan' ? 'Challan' : 'Invoice' }}
                    </span>
                    <span style="font-family:monospace;">{{ form.invoice.invoiceNumber }}</span>
                    <span style="color:#6B7280;font-weight:500;">· {{ form.invoice.invoiceDate }}</span>
                    <span style="color:#6B7280;font-weight:500;">· {{ form.items.length }} items, {{ boxesFor(form) }} boxes</span>
                  </label>
                  @if (form.status !== 'pending') {
                    <span style="font-size:11px;padding:2px 8px;border-radius:5px;font-weight:700;text-transform:uppercase;"
                          [style.background]="statusBg(form.status)"
                          [style.color]="statusColor(form.status)">
                      {{ form.status }}
                    </span>
                  }
                </div>

                @if (form.include && form.status === 'pending') {
                  <!-- Customer -->
                  <div style="margin-bottom:10px;">
                    <label style="display:block;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin:0 0 4px;">Customer</label>
                    <select [(ngModel)]="form.customerId" class="gg-input" style="width:100%;">
                      <option value="">+ Create new: "{{ form.invoice.customerName }}"</option>
                      @for (c of customers(); track c.id) {
                        <option [value]="c.id">{{ c.name }}</option>
                      }
                    </select>
                  </div>

                  <!-- Items -->
                  <div style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;">
                    <div style="display:grid;grid-template-columns:1fr 60px 1.2fr;gap:8px;padding:8px 12px;background:#f3f4f6;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;">
                      <span>Description (from PDF)</span>
                      <span style="text-align:right;">Boxes</span>
                      <span>Map to flavour</span>
                    </div>
                    @for (row of form.items; track $index) {
                      <div style="display:grid;grid-template-columns:1fr 60px 1.2fr;gap:8px;padding:8px 12px;border-top:1px solid #f3f4f6;align-items:center;"
                           [style.background]="row.flavorId ? 'transparent' : '#fff5f5'">
                        <div>
                          <p style="font-size:13px;color:#374151;margin:0;">{{ row.description }}</p>
                          <p style="font-size:11px;color:#9CA3AF;margin:2px 0 0;font-style:italic;">→ {{ row.cleanedName }}</p>
                        </div>
                        <span style="font-size:13px;font-weight:700;color:#121212;text-align:right;">{{ row.quantityBoxes }}</span>
                        <select [(ngModel)]="row.flavorId" class="gg-input" style="font-size:13px;">
                          <option value="">Unmapped</option>
                          @for (f of flavors(); track f.id) {
                            <option [value]="f.id">{{ f.name }}</option>
                          }
                        </select>
                      </div>
                    }
                  </div>

                  @if (unmappedFor(form) > 0) {
                    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 12px;color:#92400e;font-size:12px;margin-top:8px;">
                      <strong>{{ unmappedFor(form) }}</strong> item{{ unmappedFor(form) === 1 ? '' : 's' }} not mapped — will be skipped on import.
                    </div>
                  }

                  @if (form.existsWarning) {
                    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:8px 12px;color:#1e40af;font-size:12px;margin-top:8px;">
                      {{ form.existsWarning }}
                    </div>
                  }
                }

                @if (form.status === 'failed' && form.errorMsg) {
                  <div style="background:#fff5f5;border:1px solid #fca5a5;border-radius:8px;padding:8px 12px;color:#dc2626;font-size:12px;margin-top:8px;">
                    {{ form.errorMsg }}
                  </div>
                }
              </div>
            }

            <!-- Bottom actions -->
            <div style="display:flex;gap:8px;justify-content:flex-end;">
              <button (click)="onCancel()" [disabled]="state() === 'committing'"
                      style="padding:9px 16px;background:#f3f4f6;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;color:#374151;">Cancel</button>
              <button (click)="onCommit()" [disabled]="state() === 'committing' || !anyImportable()"
                      style="padding:9px 18px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;"
                      [style.opacity]="(state() === 'committing' || !anyImportable()) ? '0.7' : '1'">
                {{ state() === 'committing'
                    ? 'Saving…'
                    : 'Import ' + importableCount() + ' invoice' + (importableCount() === 1 ? '' : 's') }}
              </button>
            </div>
          }

          @if (state() === 'done') {
            <div style="text-align:center;padding:18px 0 6px;">
              <span class="material-icons-round" style="font-size:46px;color:#15803d;">check_circle</span>
              <p style="font-size:15px;font-weight:700;color:#121212;margin:8px 0 4px;">
                {{ summaryLine() }}
              </p>
              @if (failedCount() > 0) {
                <p style="font-size:13px;color:#dc2626;margin:0;">{{ failedCount() }} failed — see details above</p>
              }
            </div>
            <!-- Per-invoice statuses for review -->
            <div style="margin-top:8px;">
              @for (form of forms(); track form.invoice.invoiceNumber) {
                <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-top:1px solid #f3f4f6;font-size:13px;">
                  <span style="font-family:monospace;color:#374151;">{{ form.invoice.invoiceNumber }}</span>
                  <span style="font-size:11px;padding:2px 8px;border-radius:5px;font-weight:700;text-transform:uppercase;"
                        [style.background]="statusBg(form.status)"
                        [style.color]="statusColor(form.status)">
                    {{ form.status }}
                  </span>
                </div>
              }
            </div>
            <div style="text-align:center;margin-top:14px;">
              <button (click)="onCancel()" style="padding:9px 18px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Done</button>
            </div>
          }
        </div>
      </div>
    </div>

    <style>
      @keyframes spin { to { transform:rotate(360deg); } }
      .rcp-spin { animation: spin 0.8s linear infinite; display:inline-block; }
    </style>
  `,
})
export class PdfImportModalComponent {
  @Output() closed = new EventEmitter<{ imported: boolean }>();

  private readonly importer = inject(PdfImportService);
  private readonly supabase = inject(SupabaseService);

  state    = signal<State>('idle');
  errorMsg = signal('');

  flavors   = signal<Array<{ id: string; name: string }>>([]);
  customers = signal<Array<{ id: string; name: string }>>([]);

  /** One form per parsed invoice. */
  forms = signal<InvoiceForm[]>([]);

  // ── computed helpers ─────────────────────────────────────────────────────
  readonly includedCount    = computed(() => this.forms().filter(f => f.include).length);
  readonly importableCount  = computed(() => this.forms().filter(f => f.include && f.items.some(i => !!i.flavorId)).length);
  readonly totalBoxesAcross = computed(() =>
    this.forms().filter(f => f.include).reduce((s, f) => s + this.boxesFor(f), 0)
  );
  readonly failedCount      = computed(() => this.forms().filter(f => f.status === 'failed').length);

  anyImportable(): boolean { return this.importableCount() > 0; }
  boxesFor(form: InvoiceForm):   number { return form.items.reduce((s, r) => s + r.quantityBoxes, 0); }
  unmappedFor(form: InvoiceForm): number { return form.items.filter(r => !r.flavorId).length; }

  // ── parse ────────────────────────────────────────────────────────────────
  async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.state.set('parsing');
    this.errorMsg.set('');
    try {
      const text = await this.importer.extractText(file);
      const invoices = this.importer.parseZohoInvoices(text);

      // Fetch flavours, customers, and existing invoices (by number) for the whole batch.
      const numbers = invoices.map(i => i.invoiceNumber);
      const [flavorsRes, customersRes, existingRes] = await Promise.all([
        this.supabase.client.from('gg_flavors').select('id, name').order('name'),
        this.supabase.client.from('gg_customers').select('id, name').order('name'),
        this.supabase.client.from('gg_invoices').select('id, invoice_number, is_dispatched').in('invoice_number', numbers),
      ]);
      const flavors   = (flavorsRes.data   ?? []) as Array<{ id: string; name: string }>;
      const customers = (customersRes.data ?? []) as Array<{ id: string; name: string }>;
      const existing  = (existingRes.data  ?? []) as Array<{ id: string; invoice_number: string; is_dispatched: boolean }>;
      const existingByNumber = new Map(existing.map(e => [e.invoice_number, e]));

      this.flavors.set(flavors);
      this.customers.set(customers);

      const norm = (s: string) => s.trim().toLowerCase();
      const forms: InvoiceForm[] = invoices.map((inv) => {
        const existRow = existingByNumber.get(inv.invoiceNumber);
        return {
          invoice: inv,
          customerId: customers.find(c => norm(c.name) === norm(inv.customerName))?.id ?? '',
          items: inv.items.map(it => ({
            description: it.description,
            cleanedName: it.cleanedName,
            quantityBoxes: it.quantityBoxes,
            flavorId: pickFlavor(it.cleanedName, flavors),
          })),
          existingInvoiceId: existRow?.id ?? null,
          existsWarning: existRow
            ? (existRow.is_dispatched
                ? `Invoice ${inv.invoiceNumber} already exists and is marked DISPATCHED. Importing will overwrite its items.`
                : `Invoice ${inv.invoiceNumber} already exists. Importing will overwrite its items.`)
            : '',
          include: true,   // default checked
          status: 'pending',
          errorMsg: '',
        };
      });
      this.forms.set(forms);
      this.state.set('preview');
    } catch (err) {
      this.errorMsg.set(err instanceof Error ? err.message : 'Failed to read PDF.');
      this.state.set('error');
    } finally {
      input.value = '';
    }
  }

  toggleInclude(index: number): void {
    this.forms.update(list => {
      const next = [...list];
      next[index] = { ...next[index], include: !next[index].include };
      return next;
    });
  }

  // ── commit ───────────────────────────────────────────────────────────────
  async onCommit(): Promise<void> {
    this.state.set('committing');
    const forms = this.forms();
    for (let i = 0; i < forms.length; i++) {
      const form = forms[i];
      if (!form.include) { this.updateForm(i, { status: 'skipped' }); continue; }
      if (!form.items.some(r => r.flavorId)) {
        this.updateForm(i, { status: 'failed', errorMsg: 'No mappable items.' });
        continue;
      }
      try {
        // Resolve customer
        let customerId = form.customerId;
        if (!customerId && form.invoice.customerName) {
          const { data, error } = await this.supabase.client
            .from('gg_customers')
            .insert({ name: form.invoice.customerName })
            .select('id')
            .single();
          if (error || !data) throw new Error(error?.message ?? 'Failed to create customer.');
          customerId = data.id as string;
        }

        // Aggregate items: collapse duplicates (same flavour twice → sum).
        const byFlavor = new Map<string, { flavor_id: string; flavor_name: string; quantity_boxes: number }>();
        for (const row of form.items) {
          if (!row.flavorId) continue;
          const fname = this.flavors().find(f => f.id === row.flavorId)?.name ?? '';
          const ex = byFlavor.get(row.flavorId);
          if (ex) ex.quantity_boxes += row.quantityBoxes;
          else byFlavor.set(row.flavorId, { flavor_id: row.flavorId, flavor_name: fname, quantity_boxes: row.quantityBoxes });
        }
        const items = Array.from(byFlavor.values());

        const payload = {
          invoice_number: form.invoice.invoiceNumber,
          customer_id: customerId || null,
          customer_name: form.invoice.customerName,
          items,
          expected_dispatch_date: null,
          is_packed: false,
          is_dispatched: false,
          document_type: form.invoice.documentType,   // 'invoice' or 'challan'
        };

        if (form.existingInvoiceId) {
          const { error } = await this.supabase.client
            .from('gg_invoices')
            .update({ customer_id: payload.customer_id, customer_name: payload.customer_name, items: payload.items })
            .eq('id', form.existingInvoiceId);
          if (error) throw new Error(error.message);
          this.updateForm(i, { status: 'updated' });
        } else {
          const { data: inserted, error } = await this.supabase.client
            .from('gg_invoices')
            .insert(payload)
            .select('id')
            .single();
          if (error) throw new Error(error.message);
          // Fire-and-forget push to dispatch workers
          if (inserted?.id) {
            const totalBoxes = items.reduce((s, it) => s + (it.quantity_boxes || 0), 0);
            this.supabase.client.functions.invoke('notify-invoice-created', {
              body: {
                invoice_id:     inserted.id,
                invoice_number: payload.invoice_number,
                customer_name:  payload.customer_name,
                total_boxes:    totalBoxes,
              },
            }).catch((e) => console.warn('notify-invoice-created failed:', e));
          }
          this.updateForm(i, { status: 'created' });
        }
      } catch (err) {
        this.updateForm(i, { status: 'failed', errorMsg: err instanceof Error ? err.message : 'Save failed.' });
      }
    }
    this.state.set('done');
  }

  /** Patch one form by index, preserving array reference identity for change detection. */
  private updateForm(index: number, patch: Partial<InvoiceForm>): void {
    this.forms.update(list => {
      const next = [...list];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  // ── done-state helpers ───────────────────────────────────────────────────
  summaryLine(): string {
    const forms = this.forms();
    const created = forms.filter(f => f.status === 'created').length;
    const updated = forms.filter(f => f.status === 'updated').length;
    const skipped = forms.filter(f => f.status === 'skipped').length;
    const parts: string[] = [];
    if (created > 0) parts.push(`${created} created`);
    if (updated > 0) parts.push(`${updated} updated`);
    if (skipped > 0) parts.push(`${skipped} skipped`);
    return parts.length > 0 ? parts.join(' · ') : 'Nothing was imported';
  }

  statusBg(status: InvoiceForm['status']): string {
    switch (status) {
      case 'created':  return '#d1fae5';
      case 'updated':  return '#dbeafe';
      case 'skipped':  return '#f3f4f6';
      case 'failed':   return '#fee2e2';
      default:         return '#f3f4f6';
    }
  }
  statusColor(status: InvoiceForm['status']): string {
    switch (status) {
      case 'created':  return '#065f46';
      case 'updated':  return '#1e40af';
      case 'skipped':  return '#6B7280';
      case 'failed':   return '#991b1b';
      default:         return '#6B7280';
    }
  }

  // ── lifecycle ────────────────────────────────────────────────────────────
  reset(): void {
    this.forms.set([]);
    this.state.set('idle');
    this.errorMsg.set('');
  }

  onCancel(): void {
    if (this.state() === 'committing') return;
    const importedAny = this.forms().some(f => f.status === 'created' || f.status === 'updated');
    this.closed.emit({ imported: importedAny || this.state() === 'done' });
  }
}

/** Pick the best flavour for a PDF-cleaned name: exact match first, then longest substring. */
function pickFlavor(cleanedName: string, flavors: Array<{ id: string; name: string }>): string {
  const n = cleanedName.trim().toLowerCase();
  if (!n) return '';
  const exact = flavors.find((f) => f.name.trim().toLowerCase() === n);
  if (exact) return exact.id;
  let best = { id: '', score: 0 };
  for (const f of flavors) {
    const fname = f.name.trim().toLowerCase();
    if (!fname) continue;
    let score = 0;
    if (n.includes(fname)) score = fname.length;
    else if (fname.includes(n)) score = n.length;
    if (score > best.score) best = { id: f.id, score };
  }
  return best.id;
}
