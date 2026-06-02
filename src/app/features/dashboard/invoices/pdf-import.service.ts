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
  /** e.g. "INV26-27/148" */
  invoiceNumber: string;
  /** ISO YYYY-MM-DD from the DD/MM/YYYY in the PDF. */
  invoiceDate: string;
  /** First line after "Place Of Supply : …", e.g. "Confetti Exports Private Limited". */
  customerName: string;
  /** Customer GSTIN (the second GSTIN on the page, ours is excluded). */
  customerGstin: string;
  items: PdfInvoiceItem[];
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
    //    Pattern: <seq> <description> 170410 <qty>(.pcs)? <rate> <gst%> <gstAmt> <amount>
    const itemRe = /^\s*(\d+)\s+(.+?)\s+170410\s+(\d+(?:\.\d+)?)\s*(?:pcs)?\s+\d+(?:\.\d+)?\s+\d+%\s+[\d.,]+\s+[\d.,]+\s*$/gm;
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
      invoiceNumber: invMatch[1].trim(),
      invoiceDate:   toIsoDate(dateMatch[1]),
      customerName,
      customerGstin,
      items,
    };
  }
}

/** Strip "Gud Gum-" prefix and any trailing "<n>g" size so name-matching has a chance. */
function cleanFlavorName(description: string): string {
  return description
    .replace(/^\s*Gud\s*Gum\s*-?\s*/i, '')
    .replace(/\s+\d+\s*g\s*$/i, '')
    .trim();
}

/** "01/06/2026" → "2026-06-01" */
function toIsoDate(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split('/');
  return `${y}-${m}-${d}`;
}
