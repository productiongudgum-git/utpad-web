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

@Component({
  selector: 'app-pdf-import-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;"
         (click)="onCancel()">
      <div style="background:#fff;border-radius:14px;width:100%;max-width:760px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.2);"
           (click)="$event.stopPropagation()">

        <!-- Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid #E5E7EB;">
          <div>
            <h2 style="font-size:16px;font-weight:700;color:#121212;margin:0 0 2px;">Import invoice from PDF</h2>
            <p style="font-size:12px;color:#6B7280;margin:0;">Upload a Zoho-generated invoice PDF.</p>
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
              <p style="font-size:12px;color:#9CA3AF;margin:0;">Zoho invoice format — INV…/… number + standard items table</p>
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
            @if (parsed(); as inv) {

              <!-- Invoice meta -->
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;background:#f8f9fa;border-radius:10px;padding:12px;margin-bottom:14px;">
                <div>
                  <p style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin:0;">Invoice #</p>
                  <p style="font-size:13px;font-weight:700;color:#121212;margin:2px 0 0;font-family:monospace;">{{ inv.invoiceNumber }}</p>
                </div>
                <div>
                  <p style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin:0;">Date</p>
                  <p style="font-size:13px;font-weight:600;color:#374151;margin:2px 0 0;">{{ inv.invoiceDate }}</p>
                </div>
                <div>
                  <p style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin:0;">Items</p>
                  <p style="font-size:13px;font-weight:600;color:#374151;margin:2px 0 0;">{{ items().length }} ({{ totalBoxes() }} boxes)</p>
                </div>
              </div>

              <!-- Customer -->
              <div style="margin-bottom:14px;">
                <label style="display:block;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin:0 0 4px;">Customer</label>
                <select [(ngModel)]="customerId" class="gg-input" style="width:100%;">
                  <option value="">+ Create new: "{{ inv.customerName }}"</option>
                  @for (c of customers(); track c.id) {
                    <option [value]="c.id">{{ c.name }}</option>
                  }
                </select>
              </div>

              <!-- Items -->
              <div style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;margin-bottom:14px;">
                <div style="display:grid;grid-template-columns:1fr 60px 1.2fr;gap:8px;padding:8px 12px;background:#f3f4f6;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;">
                  <span>Description (from PDF)</span>
                  <span style="text-align:right;">Boxes</span>
                  <span>Map to flavour</span>
                </div>
                @for (row of items(); track $index) {
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

              @if (unmappedCount() > 0) {
                <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;color:#92400e;font-size:13px;margin-bottom:14px;">
                  <strong>{{ unmappedCount() }}</strong> item{{ unmappedCount() === 1 ? '' : 's' }} not yet mapped to a flavour — they'll be skipped on import.
                </div>
              }

              @if (existsWarning(); as w) {
                <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 12px;color:#1e40af;font-size:13px;margin-bottom:14px;">
                  {{ w }}
                </div>
              }

              <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button (click)="onCancel()" [disabled]="state() === 'committing'"
                        style="padding:9px 16px;background:#f3f4f6;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;color:#374151;">Cancel</button>
                <button (click)="onCommit()" [disabled]="state() === 'committing' || mappedCount() === 0"
                        style="padding:9px 18px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;"
                        [style.opacity]="(state() === 'committing' || mappedCount() === 0) ? '0.7' : '1'">
                  {{ state() === 'committing' ? 'Saving…' : (existingInvoiceId ? 'Update invoice' : 'Create invoice') }}
                </button>
              </div>
            }
          }

          @if (state() === 'done') {
            <div style="text-align:center;padding:24px 0;">
              <span class="material-icons-round" style="font-size:46px;color:#15803d;">check_circle</span>
              <p style="font-size:15px;font-weight:700;color:#121212;margin:8px 0 4px;">Invoice {{ existingInvoiceId ? 'updated' : 'created' }}</p>
              <p style="font-size:13px;color:#6B7280;margin:0;">{{ parsed()?.invoiceNumber }} — {{ mappedCount() }} items, {{ totalBoxes() }} boxes</p>
              <button (click)="onCancel()" style="margin-top:14px;padding:9px 18px;background:#01AC51;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Done</button>
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

  state         = signal<State>('idle');
  errorMsg      = signal('');
  parsed        = signal<PdfInvoice | null>(null);
  items         = signal<ItemRow[]>([]);
  flavors       = signal<Array<{ id: string; name: string }>>([]);
  customers     = signal<Array<{ id: string; name: string }>>([]);
  customerId    = '';
  existingInvoiceId: string | null = null;
  existsWarning = signal<string>('');

  readonly mappedCount   = computed(() => this.items().filter((r) => !!r.flavorId).length);
  readonly unmappedCount = computed(() => this.items().filter((r) => !r.flavorId).length);
  readonly totalBoxes    = computed(() => this.items().reduce((s, r) => s + r.quantityBoxes, 0));

  async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.state.set('parsing');
    this.errorMsg.set('');
    try {
      const text = await this.importer.extractText(file);
      const inv  = this.importer.parseZohoInvoice(text);
      const [flavorsRes, customersRes, existingRes] = await Promise.all([
        this.supabase.client.from('gg_flavors').select('id, name').order('name'),
        this.supabase.client.from('gg_customers').select('id, name').order('name'),
        this.supabase.client.from('gg_invoices').select('id, is_dispatched').eq('invoice_number', inv.invoiceNumber).limit(1),
      ]);
      const flavors   = (flavorsRes.data   ?? []) as Array<{ id: string; name: string }>;
      const customers = (customersRes.data ?? []) as Array<{ id: string; name: string }>;
      const existing  = (existingRes.data  ?? []) as Array<{ id: string; is_dispatched: boolean }>;

      this.flavors.set(flavors);
      this.customers.set(customers);
      this.parsed.set(inv);

      // Auto-match customer by exact name (case-insensitive).
      const norm = (s: string) => s.trim().toLowerCase();
      this.customerId = customers.find((c) => norm(c.name) === norm(inv.customerName))?.id ?? '';

      // Auto-pick flavour per item: exact match on cleaned name, else longest substring match.
      const rows: ItemRow[] = inv.items.map((it) => ({
        description: it.description,
        cleanedName: it.cleanedName,
        quantityBoxes: it.quantityBoxes,
        flavorId: pickFlavor(it.cleanedName, flavors),
      }));
      this.items.set(rows);

      // Existing-invoice notice.
      if (existing.length > 0) {
        this.existingInvoiceId = existing[0].id;
        this.existsWarning.set(
          existing[0].is_dispatched
            ? `Invoice ${inv.invoiceNumber} already exists and is marked DISPATCHED. Saving will overwrite its items.`
            : `Invoice ${inv.invoiceNumber} already exists. Saving will overwrite its items.`
        );
      } else {
        this.existingInvoiceId = null;
        this.existsWarning.set('');
      }
      this.state.set('preview');
    } catch (err) {
      this.errorMsg.set(err instanceof Error ? err.message : 'Failed to read PDF.');
      this.state.set('error');
    } finally {
      input.value = '';
    }
  }

  async onCommit(): Promise<void> {
    const inv = this.parsed();
    if (!inv) return;
    this.state.set('committing');
    try {
      // Resolve customer: pick existing or create new with the parsed name.
      let customerId = this.customerId;
      if (!customerId && inv.customerName) {
        const { data, error } = await this.supabase.client
          .from('gg_customers')
          .insert({ name: inv.customerName })
          .select('id')
          .single();
        if (error || !data) throw new Error(error?.message ?? 'Failed to create customer.');
        customerId = data.id as string;
      }

      // Aggregate items: collapse duplicates (same flavour appearing more than once).
      const itemsByFlavor = new Map<string, { flavor_id: string; flavor_name: string; quantity_boxes: number }>();
      for (const row of this.items()) {
        if (!row.flavorId) continue;
        const flavor = this.flavors().find((f) => f.id === row.flavorId);
        const ex = itemsByFlavor.get(row.flavorId);
        if (ex) ex.quantity_boxes += row.quantityBoxes;
        else itemsByFlavor.set(row.flavorId, {
          flavor_id: row.flavorId,
          flavor_name: flavor?.name ?? '',
          quantity_boxes: row.quantityBoxes,
        });
      }
      const items = Array.from(itemsByFlavor.values());

      const payload = {
        invoice_number: inv.invoiceNumber,
        customer_id: customerId || null,
        customer_name: inv.customerName,
        items,
        expected_dispatch_date: null,
        is_packed: false,
        is_dispatched: false,
      };

      if (this.existingInvoiceId) {
        const { error } = await this.supabase.client
          .from('gg_invoices')
          .update({ customer_id: payload.customer_id, customer_name: payload.customer_name, items: payload.items })
          .eq('id', this.existingInvoiceId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await this.supabase.client.from('gg_invoices').insert(payload);
        if (error) throw new Error(error.message);
      }
      this.state.set('done');
    } catch (err) {
      this.errorMsg.set(err instanceof Error ? err.message : 'Failed to save.');
      this.state.set('error');
    }
  }

  reset(): void {
    this.parsed.set(null);
    this.items.set([]);
    this.customerId = '';
    this.existingInvoiceId = null;
    this.existsWarning.set('');
    this.state.set('idle');
  }

  onCancel(): void {
    if (this.state() === 'committing') return;
    this.closed.emit({ imported: this.state() === 'done' });
  }
}

/** Pick the best flavour for a PDF-cleaned name: exact match first, then longest substring. */
function pickFlavor(cleanedName: string, flavors: Array<{ id: string; name: string }>): string {
  const n = cleanedName.trim().toLowerCase();
  if (!n) return '';
  const exact = flavors.find((f) => f.name.trim().toLowerCase() === n);
  if (exact) return exact.id;
  // Longest flavour name that is contained in the cleaned name (or vice versa).
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
