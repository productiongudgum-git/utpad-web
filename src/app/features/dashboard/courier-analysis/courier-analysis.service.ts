import { Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';

export type CourierFileType =
  | 'Unknown'
  | 'DTDC invoice PDF'
  | 'DTDC tracking/reference'
  | 'BlueDart invoice'
  | 'Shopify D2C export'
  | 'Zoho invoice export'
  | 'Delivery Challan export'
  | 'Pincode master';

export interface CourierReport {
  courier: 'DTDC' | 'BlueDart';
  month: string;
  shipments: number;
  d2cDeliveryPct: number;
  retailDeliveryPct: number;
  totalOvercharge: number;
  unmatched: number;
  referenceIssues: number;
  typeA: number;
  typeB: number;
  typeC: number;
  disputeFile: string;
  summaryFile: string;
}

export interface CourierAnalysisResult {
  runId: string;
  createdAt: string;
  reports: CourierReport[];
  combined: {
    dtdcShipments: number;
    blueDartShipments: number;
    totalOvercharge: number;
    totalUnmatched: number;
    totalReferenceIssues: number;
    totalSales: number;
    totalDeliveryCharge: number;
    deliveryPctAgainstSales: number;
  };
  courierSummaryFile: string;
}

@Injectable({ providedIn: 'root' })
export class CourierAnalysisService {
  private readonly apiUrl = `${environment.apiBaseUrl}/ops/courier-analysis`;
  readonly fileTypeOptions: CourierFileType[] = [
    'Unknown',
    'DTDC invoice PDF',
    'DTDC tracking/reference',
    'BlueDart invoice',
    'Shopify D2C export',
    'Zoho invoice export',
    'Delivery Challan export',
    'Pincode master',
  ];

  detectType(filename: string): CourierFileType {
    const name = filename.toLowerCase();
    if (name.endsWith('.pdf')) return 'DTDC invoice PDF';
    if (name.includes('bluedart') || name.includes('blue') || /^blr.*\.csv$/.test(name)) return 'BlueDart invoice';
    if (name.includes('pincode')) return 'Pincode master';
    if (name.includes('delivery_challan') || name.includes('challan')) return 'Delivery Challan export';
    if (name.includes('invoice')) return 'Zoho invoice export';
    if (name.includes('d2c') || name.includes('shopify')) return 'Shopify D2C export';
    if (name.includes('dtdc') || name.includes('tracking') || /^bl.*\.xlsx$/.test(name)) return 'DTDC tracking/reference';
    return 'Unknown';
  }

  async process(files: File[], fileTypes: CourierFileType[]): Promise<CourierAnalysisResult> {
    const form = new FormData();
    files.forEach((file) => form.append('files', file, file.name));
    form.append('fileTypes', JSON.stringify(files.map((file, index) => ({
      filename: file.name,
      type: fileTypes[index] ?? this.detectType(file.name),
    }))));

    const response = await fetch(`${this.apiUrl}/process`, { method: 'POST', body: form });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.message || body.error || 'Courier analysis failed.');
    }
    return body as CourierAnalysisResult;
  }

  absoluteDownloadUrl(path: string): string {
    if (!path) return '#';
    if (/^https?:\/\//i.test(path)) return path;
    return `${environment.apiBaseUrl.replace(/\/api\/v1$/, '')}${path}`;
  }
}
