import { Injectable } from '@angular/core';
// pdfjs-dist is loaded lazily so the modal can show "Loading…" while the
// (~1 MB) worker pulls in. The worker URL is built from the package's own
// exported `version` so they can never drift apart (jsDelivr mirrors every
// npm version, unlike cdnjs which can lag).
let pdfjsPromise: Promise<any> | null = null;
function getPdfjs(): Promise<any> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((pdfjs: any) => {
      pdfjs.GlobalWorkerOptions.workerSrc =
        `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

export interface PdfInvoiceItem {
  /** Raw description line from the PDF, e.g. "Gud Gum- Charcoal Mint 21g". */
  description: string;
  /** Cleaned flavour name candidate (Gud Gum prefix + size suffix stripped). */
  cleanedName: string;
  /** Quantity in boxes — Zoho's "Qty" column. */
  quantityBoxes: number;
}

export interface PdfInvoice {
  /** e.g. "INV26-27/148" for invoices, "DC-00257" for delivery challans. */
  invoiceNumber: string;
  /** ISO YYYY-MM-DD from the DD/MM/YYYY in the PDF. */
  invoiceDate: string;
  /** Customer name from "Place Of Supply" (invoice) or "Deliver To" (challan). */
  customerName: string;
  /** Customer GSTIN (present on invoices; empty on challans). */
  customerGstin: string;
  items: PdfInvoiceItem[];
  /** Distinguishes the two PDF shapes the importer can read. */
  documentType: 'invoice' | 'challan';
}

@Injectable({ providedIn: 'root' })
export class PdfImportService {

  /** Extract a flat newline-joined text dump of every page in the PDF. */
  async extractText(file: File): Promise<string> {
    const pdfjs = await getPdfjs();
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    const pageTexts: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      // pdfjs returns one item per text run. Join with newline when the y-position
      // changes so logical rows survive — but for Zoho's invoice template, plain
      // space-join works fine because the template is row-by-row.
      let lastY: number | null = null;
      const parts: string[] = [];
      for (const item of content.items as any[]) {
        const y = Math.round(item.transform?.[5] ?? 0);
        if (lastY != null && y !== lastY) parts.push('\n');
        else if (parts.length > 0) parts.push(' ');
        parts.push((item.str ?? '').trim());
        lastY = y;
      }
      pageTexts.push(parts.join('').replace(/[ \t]+/g, ' '));
    }
    return pageTexts.join('\n');
  }

  /**
   * Parse a Zoho PDF that contains one or more invoices and/or delivery challans
   * concatenated. Splits on the document TITLE (`TAX INVOICE` / `DELIVERY CHALLAN`)
   * since those are the most reliably-extracted text from pdfjs — number/date
   * labels often get mangled by line breaks and whitespace shuffling.
   */
  parseZohoInvoices(text: string): PdfInvoice[] {
    // Split on the lookahead so the title stays at the start of each chunk.
    const sections = text.split(/(?=DELIVERY\s+CHALLAN|TAX\s+INVOICE)/i);
    const invoices: PdfInvoice[] = [];
    for (const section of sections) {
      const hasChallan = /DELIVERY\s+CHALLAN/i.test(section);
      const hasInvoice = /TAX\s+INVOICE/i.test(section) && !hasChallan;
      // Single-document PDFs where the title didn't extract cleanly: fall back
      // to scanning for the number markers themselves.
      const fallbackChallan = !hasChallan && /Delivery\s*Challan\s*#?\s*:?\s*DC[\w\-]+/i.test(section);
      const fallbackInvoice = !hasInvoice && !hasChallan && /#\s*:\s*INV[\w\-\/]+/.test(section);
      const isChallan = hasChallan || fallbackChallan;
      const isInvoice = hasInvoice || fallbackInvoice;
      if (!isChallan && !isInvoice) continue;
      try {
        invoices.push(isChallan ? this.parseDeliveryChallan(section) : this.parseZohoInvoice(section));
      } catch {
        // Per-document parse failure — keep going so a malformed slice doesn't kill the rest.
      }
    }
    if (invoices.length === 0) {
      throw new Error('No invoices or delivery challans found — PDF layout unrecognized.');
    }
    return invoices;
  }

  /**
   * Parse a Zoho-formatted invoice PDF (text version) into structured fields.
   * Throws if the template doesn't look like a Zoho gum invoice.
   */
  parseZohoInvoice(text: string): PdfInvoice {
    // 1. Normalize: collapse the standalone "pcs" line into the previous one
    //    so every item row is single-line.
    const normalized = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .reduce<string[]>((acc, line) => {
        if (line.toLowerCase() === 'pcs' && acc.length > 0) {
          acc[acc.length - 1] = acc[acc.length - 1] + ' pcs';
        } else {
          acc.push(line);
        }
        return acc;
      }, [])
      .join('\n');

    // 2. Header fields — anchor on labels Zoho always prints.
    const invMatch  = normalized.match(/#\s*:\s*(INV[\w\-\/]+)/i);
    const dateMatch = normalized.match(/Invoice Date\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (!invMatch)  throw new Error('Invoice number not found — is this a Zoho invoice PDF?');
    if (!dateMatch) throw new Error('Invoice Date not found in the PDF.');

    // 3. Customer name = first non-empty line after "Place Of Supply : …"
    const posMatch = normalized.match(/Place Of Supply\s*:\s*[^\n]+\n([^\n]+)/i);
    const customerName = posMatch ? posMatch[1].trim() : '';

    // 4. Customer GSTIN = second GSTIN occurrence on the page (the first is ours).
    const gstins = Array.from(normalized.matchAll(/GSTIN\s+([0-9A-Z]{15})/g)).map((m) => m[1]);
    const customerGstin = gstins[1] ?? '';

    // 5. Line items — every item carries HSN 170410. Single-line after normalize.
    //    Inter-state shape (single IGST column):
    //      <seq> <description> 170410 <qty>(.pcs)? <rate> <gst%> <gstAmt> <amount>
    //    Intra-state shape (CGST + SGST split — e.g. Karnataka→Karnataka):
    //      <seq> <description> 170410 <qty>(.pcs)? <rate> <cgst%> <cgstAmt> <sgst%> <sgstAmt> <amount>
    //    Both percentages may be decimals (e.g. 2.5% reduced gum-discount rate).
    const itemRe = /^\s*(\d+)\s+(.+?)\s+170410\s+(\d+(?:\.\d+)?)\s*(?:pcs)?\s+\d+(?:\.\d+)?(?:\s+\d+(?:\.\d+)?%\s+[\d.,]+){1,2}\s+[\d.,]+\s*$/gm;
    const items: PdfInvoiceItem[] = [];
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(normalized)) !== null) {
      const description = m[2].trim();
      items.push({
        description,
        cleanedName: cleanFlavorName(description),
        quantityBoxes: Math.round(Number(m[3])),
      });
    }
    if (items.length === 0) {
      throw new Error('No line items found — the PDF layout may differ from the expected Zoho template.');
    }

    return {
      documentType: 'invoice',
      invoiceNumber: invMatch[1].trim(),
      invoiceDate:   toIsoDate(dateMatch[1]),
      customerName,
      customerGstin,
      items,
    };
  }

  /**
   * Parse a Zoho-formatted Delivery Challan PDF section into the same shape as
   * an invoice. Differences vs. tax invoice:
   *   - Number prefix is `Delivery Challan# : DC-…`
   *   - Date label is `Challan Date : DD/MM/YYYY`
   *   - Customer line follows `Deliver To` (not `Place Of Supply`)
   *   - HSN code is the 8-digit `17041000` (vs 6-digit `170410` on invoices)
   *   - No per-line tax columns — only rate + amount
   *   - Item descriptions use multi-dash format ("Gud Gum - Caffeine - Cola - 20g")
   */
  parseDeliveryChallan(text: string): PdfInvoice {
    // Same normalize step as invoice: collapse "pcs" continuation lines.
    const normalized = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .reduce<string[]>((acc, line) => {
        if (line.toLowerCase() === 'pcs' && acc.length > 0) {
          acc[acc.length - 1] = acc[acc.length - 1] + ' pcs';
        } else {
          acc.push(line);
        }
        return acc;
      }, [])
      .join('\n');

    // Number: first DC-… pattern anywhere in the section. Robust against any
    // label/whitespace shuffling pdfjs might introduce.
    const dcMatch = normalized.match(/(DC[-\s]?\d{3,})/i);
    if (!dcMatch) throw new Error('Delivery Challan number not found.');

    // Date: prefer the labeled date; fall back to the first DD/MM/YYYY pattern.
    const dateLabelMatch = normalized.match(/Challan\s*Date\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
    const dateAnyMatch   = normalized.match(/(\d{2}\/\d{2}\/\d{4})/);
    const dateMatch      = dateLabelMatch ?? dateAnyMatch;
    if (!dateMatch) throw new Error('Challan Date not found.');

    // Customer: the first non-empty line after "Deliver To" (case-insensitive,
    // tolerant of line-break placement). Walk forward over normalized lines.
    let customerName = '';
    const lines = normalized.split('\n').map((l) => l.trim());
    const deliverIdx = lines.findIndex((l) => /Deliver\s*To/i.test(l));
    if (deliverIdx >= 0) {
      // First non-empty line after the label that isn't the label itself.
      for (let i = deliverIdx + 1; i < lines.length; i++) {
        const candidate = lines[i].replace(/^Deliver\s*To\s*:?\s*/i, '').trim();
        if (candidate) { customerName = candidate; break; }
      }
      // If the label was inline (e.g. "Deliver To Acme Foods LLP"), use the trailing text.
      if (!customerName) {
        const inline = lines[deliverIdx].replace(/^.*Deliver\s*To\s*:?\s*/i, '').trim();
        if (inline) customerName = inline;
      }
    }

    // Line items — challans use 8-digit HSN and a simpler shape:
    //   <seq> <description> 17041000 <qty>(.pcs)? <rate> <amount>
    const itemRe = /^\s*(\d+)\s+(.+?)\s+17041000\s+(\d+(?:\.\d+)?)\s*(?:pcs)?\s+\d+(?:\.\d+)?\s+[\d.,]+\s*$/gm;
    const items: PdfInvoiceItem[] = [];
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(normalized)) !== null) {
      const description = m[2].trim();
      items.push({
        description,
        cleanedName: cleanFlavorName(description),
        quantityBoxes: Math.round(Number(m[3])),
      });
    }
    if (items.length === 0) {
      throw new Error('No line items found in delivery challan — layout may differ from the expected template.');
    }

    return {
      documentType: 'challan',
      // Normalize "DC 00257" / "DC-00257" / "DC00257" → "DC-00257"
      invoiceNumber: dcMatch[1].trim().replace(/^DC[\s\-]?/i, 'DC-'),
      invoiceDate:   toIsoDate(dateMatch[1]),
      customerName,
      customerGstin: '',  // Challans typically only show our GSTIN, not the recipient's.
      items,
    };
  }
}

/**
 * Strip "Gud Gum" prefix, trailing "<n>g" size, and any leading category prefix
 * (e.g. "Caffeine -" on delivery challans where the product line precedes the
 * actual flavour). Multi-dash formats like "Gud Gum - Caffeine - Cola - 20g"
 * collapse to the trailing flavour token ("Cola"), which the fuzzy matcher then
 * resolves to the actual flavour ("Cola Charge").
 */
function cleanFlavorName(description: string): string {
  // 1. Strip "Gud Gum" prefix (with optional trailing dash and whitespace).
  let s = description.replace(/^\s*Gud\s*Gum\s*[-–]?\s*/i, '').trim();
  // 2. Strip trailing size suffix like "20g", "21 g", "10 ml".
  s = s.replace(/\s+\d+\s*(g|ml|kg|l)\s*$/i, '').trim();
  // 3. If the remaining string is dash-separated (challan format),
  //    take the last non-empty part — typically the actual flavour name.
  if (s.includes(' - ') || s.includes(' – ')) {
    const parts = s.split(/\s*[-–]\s*/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) s = parts[parts.length - 1];
  }
  return s.trim();
}

/** "01/06/2026" → "2026-06-01" */
function toIsoDate(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split('/');
  return `${y}-${m}-${d}`;
}
