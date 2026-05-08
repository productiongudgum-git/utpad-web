import { TestBed } from '@angular/core/testing';
import { CsvImportService, normalizeName } from './csv-import.service';
import { SupabaseService } from '../../../core/supabase.service';
import { AggregatedInvoice, Catalogs, ZohoCsvRow } from './csv-import-types';

// ── Helpers ─────────────────────────────────────────────────────────────

function row(overrides: Partial<ZohoCsvRow> = {}): ZohoCsvRow {
  return {
    'Invoice Date':   '2026-04-15',
    'Invoice ID':     '1469229000002143003',
    'Invoice Number': 'INV-001',
    'Invoice Status': 'Closed',
    'Customer ID':    'C1',
    'Customer Name':  'Acme',
    'Due Date':       '2026-04-15',
    'Item Name':      'Strawberry',
    'Quantity':       '10',
    'Product ID':     'P1',
    ...overrides,
  } as ZohoCsvRow;
}

function aggInvoice(overrides: Partial<AggregatedInvoice> = {}): AggregatedInvoice {
  return {
    invoice_number:    'INV-1',
    zoho_invoice_id:   'ZID',
    zoho_customer_id:  'ZC1',
    customer_name:     'Acme Foods',
    invoice_date:      '2026-04-15',
    line_items:        [],
    ...overrides,
  };
}

const baseCatalogs: Catalogs = {
  flavors: [
    { id: 'flav1', name: 'Strawberry', zoho_product_id: 'ZP1' },
    { id: 'flav2', name: 'Lemon',      zoho_product_id: 'ZP2' },
  ],
  customers: [
    { id: 'cust1', name: 'Acme Foods', zoho_customer_id: 'ZC1' },
  ],
  existingInvoices: [],
};

// ── Tests ───────────────────────────────────────────────────────────────

describe('CsvImportService.aggregateInvoices', () => {
  let service: CsvImportService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: {} } }],
    });
    service = TestBed.inject(CsvImportService);
  });

  it('returns empty for empty input', () => {
    expect(service.aggregateInvoices([])).toEqual([]);
  });

  it('groups multiple rows of the same invoice by Invoice Number', () => {
    const rows = [
      row({ 'Item Name': 'Strawberry', 'Product ID': 'P1', 'Quantity': '10' }),
      row({ 'Item Name': 'Lemon',      'Product ID': 'P2', 'Quantity': '5'  }),
    ];
    const result = service.aggregateInvoices(rows);

    expect(result.length).toBe(1);
    expect(result[0].invoice_number).toBe('INV-001');
    expect(result[0].line_items.length).toBe(2);
  });

  it('skips rows with empty Invoice Number (Zoho continuation rows)', () => {
    const rows = [row({ 'Invoice Number': '' })];
    expect(service.aggregateInvoices(rows)).toEqual([]);
  });

  it('keeps the invoice but skips line items missing Product ID', () => {
    const rows = [row({ 'Product ID': '' })];
    const result = service.aggregateInvoices(rows);

    expect(result.length).toBe(1);
    expect(result[0].line_items.length).toBe(0);
  });

  it('skips line items with zero or negative quantity', () => {
    const rows = [
      row({ 'Item Name': 'A', 'Product ID': 'PA', 'Quantity': '0' }),
      row({ 'Item Name': 'B', 'Product ID': 'PB', 'Quantity': '-5' }),
      row({ 'Item Name': 'C', 'Product ID': 'PC', 'Quantity': '3' }),
    ];
    const result = service.aggregateInvoices(rows);

    expect(result[0].line_items.length).toBe(1);
    expect(result[0].line_items[0].zoho_product_id).toBe('PC');
    expect(result[0].line_items[0].quantity_boxes).toBe(3);
  });

  it('handles two distinct invoices in the same input', () => {
    const rows = [
      row({ 'Invoice Number': 'INV-A', 'Product ID': 'P1' }),
      row({ 'Invoice Number': 'INV-B', 'Product ID': 'P2' }),
    ];
    const result = service.aggregateInvoices(rows);

    expect(result.length).toBe(2);
    expect(result.map((i) => i.invoice_number).sort()).toEqual(['INV-A', 'INV-B']);
  });

  it('preserves header fields from the first row (customer, invoice ID, dates)', () => {
    const rows = [
      row({ 'Customer Name': 'Acme', 'Invoice ID': '999', 'Item Name': 'X', 'Product ID': 'PX' }),
      // Subsequent row's customer name shouldn't overwrite
      row({ 'Customer Name': 'Different', 'Item Name': 'Y', 'Product ID': 'PY' }),
    ];
    const result = service.aggregateInvoices(rows);

    expect(result[0].customer_name).toBe('Acme');
    expect(result[0].zoho_invoice_id).toBe('999');
  });
});

describe('CsvImportService.resolveAndValidate', () => {
  let service: CsvImportService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: {} } }],
    });
    service = TestBed.inject(CsvImportService);
  });

  it('marks a brand-new invoice as "new"', () => {
    const aggregated = [aggInvoice({
      line_items: [{ zoho_product_id: 'ZP1', item_name: 'Strawberry', quantity_boxes: 10 }],
    })];
    const result = service.resolveAndValidate(aggregated, baseCatalogs);

    expect(result.invoices[0].status).toBe('new');
    expect(result.newCount).toBe(1);
  });

  it('marks an existing un-dispatched invoice as "update"', () => {
    const cats: Catalogs = {
      ...baseCatalogs,
      existingInvoices: [{ id: 'inv1', invoice_number: 'INV-1', is_dispatched: false }],
    };
    const aggregated = [aggInvoice({
      line_items: [{ zoho_product_id: 'ZP1', item_name: 'Strawberry', quantity_boxes: 10 }],
    })];
    const result = service.resolveAndValidate(aggregated, cats);

    expect(result.invoices[0].status).toBe('update');
    expect(result.invoices[0].existingInvoiceId).toBe('inv1');
  });

  it('marks an existing dispatched invoice as "dispatched_warning"', () => {
    const cats: Catalogs = {
      ...baseCatalogs,
      existingInvoices: [{ id: 'inv1', invoice_number: 'INV-1', is_dispatched: true }],
    };
    const aggregated = [aggInvoice({
      line_items: [{ zoho_product_id: 'ZP1', item_name: 'Strawberry', quantity_boxes: 10 }],
    })];
    const result = service.resolveAndValidate(aggregated, cats);

    expect(result.invoices[0].status).toBe('dispatched_warning');
    expect(result.dispatchedWarningCount).toBe(1);
  });

  it('marks an invoice with all unmapped products as "skipped_no_items"', () => {
    const aggregated = [aggInvoice({
      line_items: [{ zoho_product_id: 'UNKNOWN', item_name: 'Mystery', quantity_boxes: 10 }],
    })];
    const result = service.resolveAndValidate(aggregated, baseCatalogs);

    expect(result.invoices[0].status).toBe('skipped_no_items');
    expect(result.skippedInvoiceCount).toBe(1);
    expect(result.unmappedProducts.length).toBe(1);
  });

  it('flags willCreate=true for a customer not in the catalog', () => {
    const aggregated = [aggInvoice({
      zoho_customer_id: 'NEW',
      customer_name:    'Brand New Customer',
      line_items: [{ zoho_product_id: 'ZP1', item_name: 'Strawberry', quantity_boxes: 10 }],
    })];
    const result = service.resolveAndValidate(aggregated, baseCatalogs);

    expect(result.invoices[0].customer.willCreate).toBe(true);
    expect(result.newCustomerCount).toBe(1);
  });

  it('matches customer by zoho_customer_id even if name differs', () => {
    const aggregated = [aggInvoice({
      zoho_customer_id: 'ZC1',
      customer_name:    'Different Name',
      line_items: [{ zoho_product_id: 'ZP1', item_name: 'Strawberry', quantity_boxes: 10 }],
    })];
    const result = service.resolveAndValidate(aggregated, baseCatalogs);

    expect(result.invoices[0].customer.willCreate).toBe(false);
    expect(result.invoices[0].customer.existing_id).toBe('cust1');
  });

  it('falls back to case-insensitive name match when zoho_customer_id is empty', () => {
    const aggregated = [aggInvoice({
      zoho_customer_id: '',
      customer_name:    'ACME FOODS',  // different casing
      line_items: [{ zoho_product_id: 'ZP1', item_name: 'Strawberry', quantity_boxes: 10 }],
    })];
    const result = service.resolveAndValidate(aggregated, baseCatalogs);

    expect(result.invoices[0].customer.willCreate).toBe(false);
    expect(result.invoices[0].customer.existing_id).toBe('cust1');
  });

  it('aggregates duplicate flavor lines on the same invoice', () => {
    const aggregated = [aggInvoice({
      line_items: [
        { zoho_product_id: 'ZP1', item_name: 'Strawberry', quantity_boxes: 10 },
        { zoho_product_id: 'ZP1', item_name: 'Strawberry', quantity_boxes: 5  },
      ],
    })];
    const result = service.resolveAndValidate(aggregated, baseCatalogs);

    expect(result.invoices[0].items.length).toBe(1);
    expect(result.invoices[0].items[0].quantity_boxes).toBe(15);
  });

  it('counts skipped lines and aggregates unmapped products by occurrence', () => {
    const aggregated = [aggInvoice({
      line_items: [
        { zoho_product_id: 'ZP1',      item_name: 'Strawberry',  quantity_boxes: 10 },
        { zoho_product_id: 'UNKNOWN1', item_name: 'Acrylic Tray', quantity_boxes: 1  },
        { zoho_product_id: 'UNKNOWN1', item_name: 'Acrylic Tray', quantity_boxes: 2  },
        { zoho_product_id: 'UNKNOWN2', item_name: 'Display',     quantity_boxes: 3  },
      ],
    })];
    const result = service.resolveAndValidate(aggregated, baseCatalogs);

    expect(result.invoices[0].skippedLines).toBe(3);
    expect(result.unmappedProducts.length).toBe(2);

    const acrylic = result.unmappedProducts.find((p) => p.zoho_product_id === 'UNKNOWN1');
    expect(acrylic?.occurrences).toBe(2);

    const display = result.unmappedProducts.find((p) => p.zoho_product_id === 'UNKNOWN2');
    expect(display?.occurrences).toBe(1);
  });

  it('reports correct summary counts across a mixed batch', () => {
    const cats: Catalogs = {
      ...baseCatalogs,
      existingInvoices: [
        { id: 'inv2', invoice_number: 'INV-2', is_dispatched: false },
        { id: 'inv3', invoice_number: 'INV-3', is_dispatched: true  },
      ],
    };
    const items = [{ zoho_product_id: 'ZP1', item_name: 'Strawberry', quantity_boxes: 5 }];
    const aggregated = [
      aggInvoice({ invoice_number: 'INV-1', line_items: items }),                                     // new
      aggInvoice({ invoice_number: 'INV-2', line_items: items }),                                     // update
      aggInvoice({ invoice_number: 'INV-3', line_items: items }),                                     // dispatched_warning
      aggInvoice({ invoice_number: 'INV-4', line_items: [{ zoho_product_id: 'X', item_name: '?', quantity_boxes: 1 }] }), // skipped
    ];
    const result = service.resolveAndValidate(aggregated, cats);

    expect(result.newCount).toBe(1);
    expect(result.updateCount).toBe(1);
    expect(result.dispatchedWarningCount).toBe(1);
    expect(result.skippedInvoiceCount).toBe(1);
  });
});

describe('normalizeName', () => {
  it('lowercases', () => {
    expect(normalizeName('FOO')).toBe('foo');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeName('  foo  ')).toBe('foo');
  });

  it('collapses internal whitespace runs to a single space', () => {
    expect(normalizeName('a   b\tc')).toBe('a b c');
  });

  it('handles empty input', () => {
    expect(normalizeName('')).toBe('');
  });

  it('treats null/undefined safely', () => {
    expect(normalizeName(undefined as unknown as string)).toBe('');
    expect(normalizeName(null as unknown as string)).toBe('');
  });
});
