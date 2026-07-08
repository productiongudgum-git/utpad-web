import { CommonModule, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CourierAnalysisResult,
  CourierAnalysisService,
  CourierFileType,
} from './courier-analysis.service';

interface SelectedCourierFile {
  file: File;
  type: CourierFileType;
}

@Component({
  selector: 'app-courier-analysis',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe],
  template: `
    <div style="display:flex;flex-direction:column;gap:18px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;">
        <div>
          <h1 style="font-size:22px;font-weight:700;margin:0 0 4px;">Courier Analysis</h1>
          <p style="font-size:14px;color:#64748B;margin:0;">Upload DTDC or BlueDart files and generate dispute-ready courier reports.</p>
        </div>
        @if (result()) {
          <a [href]="downloadUrl(result()!.courierSummaryFile)"
             style="display:inline-flex;align-items:center;gap:7px;padding:10px 16px;background:#01AC51;color:#fff;border-radius:10px;text-decoration:none;font-weight:700;font-size:13px;">
            <span class="material-icons-round" style="font-size:17px;">download</span>
            Courier summary
          </a>
        }
      </div>

      <section style="background:#fff;border:1px solid #E5E7EB;border-radius:14px;padding:18px;">
        <div style="display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:18px;align-items:start;">
          <div>
            <label for="courier-files"
                   style="border:1.5px dashed #CBD5E1;border-radius:12px;padding:26px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:#F8FAFC;cursor:pointer;">
              <span class="material-icons-round" style="font-size:34px;color:#01AC51;margin-bottom:8px;">upload_file</span>
              <span style="font-size:15px;font-weight:700;color:#121212;">Choose courier and common files</span>
              <span style="font-size:13px;color:#64748B;margin-top:4px;">PDF, CSV, XLSX and XLS files are accepted.</span>
            </label>
            <input id="courier-files" type="file" multiple accept=".pdf,.csv,.xlsx,.xls" style="display:none" (change)="onFilesSelected($event)">
          </div>

          <div style="background:#F8FAFC;border:1px solid #E5E7EB;border-radius:12px;padding:14px;">
            <p style="font-size:12px;font-weight:800;color:#334155;text-transform:uppercase;letter-spacing:.04em;margin:0 0 10px;">Ready check</p>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:13px;color:#475569;">
              <div style="display:flex;justify-content:space-between;gap:10px;">
                <span>Courier file</span>
                <strong [style.color]="hasCourier() ? '#047857' : '#DC2626'">{{ hasCourier() ? courierLabel() : 'Missing' }}</strong>
              </div>
              <div style="display:flex;justify-content:space-between;gap:10px;">
                <span>Common files</span>
                <strong [style.color]="missingCommon().length === 0 ? '#047857' : '#DC2626'">{{ missingCommon().length === 0 ? 'Ready' : missingCommon().length + ' missing' }}</strong>
              </div>
            </div>
            @if (missingCommon().length > 0) {
              <p style="font-size:12px;color:#DC2626;margin:10px 0 0;">{{ missingCommon().join(', ') }}</p>
            }
          </div>
        </div>

        @if (selectedFiles().length > 0) {
          <div style="margin-top:18px;overflow:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="border-bottom:1px solid #E5E7EB;">
                  <th style="text-align:left;padding:9px;color:#64748B;font-size:11px;text-transform:uppercase;">File</th>
                  <th style="text-align:left;padding:9px;color:#64748B;font-size:11px;text-transform:uppercase;width:280px;">File type</th>
                  <th style="text-align:right;padding:9px;color:#64748B;font-size:11px;text-transform:uppercase;width:90px;">Size</th>
                </tr>
              </thead>
              <tbody>
                @for (item of selectedFiles(); track item.file.name; let i = $index) {
                  <tr style="border-bottom:1px solid #F1F5F9;">
                    <td style="padding:9px;color:#121212;font-weight:600;">{{ item.file.name }}</td>
                    <td style="padding:9px;">
                      <select class="beautiful-input" style="padding:8px 34px 8px 10px;border-width:1px;border-radius:8px;font-size:13px;"
                              [ngModel]="item.type" (ngModelChange)="setFileType(i, $event)">
                        @for (option of service.fileTypeOptions; track option) {
                          <option [ngValue]="option">{{ option }}</option>
                        }
                      </select>
                    </td>
                    <td style="padding:9px;text-align:right;color:#64748B;">{{ item.file.size / 1024 / 1024 | number:'1.1-1' }} MB</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px;flex-wrap:wrap;">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            @for (step of steps; track step) {
              <span style="font-size:12px;font-weight:700;padding:6px 10px;border-radius:999px;"
                    [style.background]="activeStep() === step ? '#DCFCE7' : '#F1F5F9'"
                    [style.color]="activeStep() === step ? '#047857' : '#64748B'">{{ step }}</span>
            }
          </div>
          <button (click)="process()" [disabled]="!canProcess() || processing()"
                  style="display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border:none;border-radius:10px;background:#01AC51;color:#fff;font-weight:800;cursor:pointer;"
                  [style.opacity]="!canProcess() || processing() ? '.55' : '1'">
            @if (processing()) { <span class="spinner"></span> } @else { <span class="material-icons-round" style="font-size:17px;">play_arrow</span> }
            {{ processing() ? 'Processing' : 'Process courier analysis' }}
          </button>
        </div>

        @if (error()) {
          <div style="margin-top:14px;background:#FEF2F2;border:1px solid #FECACA;color:#991B1B;border-radius:10px;padding:10px 12px;font-size:13px;">{{ error() }}</div>
        }
      </section>

      @if (result()) {
        <section style="display:flex;flex-direction:column;gap:12px;">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">
            <div class="metric-card">
              <span>Total overcharge</span>
              <strong>{{ money(result()!.combined.totalOvercharge) }}</strong>
            </div>
            <div class="metric-card">
              <span>Total unmatched</span>
              <strong>{{ result()!.combined.totalUnmatched }}</strong>
            </div>
            <div class="metric-card">
              <span>Reference issues</span>
              <strong>{{ result()!.combined.totalReferenceIssues }}</strong>
            </div>
            <div class="metric-card">
              <span>Delivery % of sales</span>
              <strong>{{ result()!.combined.deliveryPctAgainstSales | number:'1.1-1' }}%</strong>
            </div>
            <div class="metric-card">
              <span>Total shipments</span>
              <strong>{{ result()!.combined.dtdcShipments + result()!.combined.blueDartShipments }}</strong>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;">
            @for (report of result()!.reports; track report.courier) {
              <article style="background:#fff;border:1px solid #E5E7EB;border-radius:14px;padding:16px;">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px;">
                  <div>
                    <h2 style="font-size:16px;margin:0 0 2px;">{{ report.courier }} · {{ report.month }}</h2>
                    <p style="font-size:12px;color:#64748B;margin:0;">{{ report.shipments }} shipments</p>
                  </div>
                  <strong style="font-size:18px;color:#121212;">{{ money(report.totalOvercharge) }}</strong>
                </div>
                <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px;">
                  <tr><th>Type B disputes</th><td>{{ report.typeB }}</td></tr>
                  <tr><th>Type A / C</th><td>{{ report.typeA }} / {{ report.typeC }}</td></tr>
                  <tr><th>D2C delivery %</th><td>{{ report.d2cDeliveryPct | number:'1.1-1' }}%</td></tr>
                  <tr><th>Retail delivery %</th><td>{{ report.retailDeliveryPct | number:'1.1-1' }}%</td></tr>
                  <tr><th>Unmatched</th><td>{{ report.unmatched }}</td></tr>
                  <tr><th>Reference issues</th><td>{{ report.referenceIssues }}</td></tr>
                </table>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                  <a class="download-link" [href]="downloadUrl(report.disputeFile)">Dispute file</a>
                  <a class="download-link" [href]="downloadUrl(report.summaryFile)">Summary file</a>
                </div>
              </article>
            }
          </div>
        </section>
      }
    </div>
  `,
  styles: [`
    .metric-card { background:#fff; border:1px solid #E5E7EB; border-radius:14px; padding:14px; display:flex; flex-direction:column; gap:4px; }
    .metric-card span { color:#64748B; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
    .metric-card strong { color:#121212; font-size:22px; font-weight:800; }
    th { text-align:left; color:#64748B; font-weight:700; padding:7px 0; border-bottom:1px solid #F1F5F9; }
    td { text-align:right; color:#121212; font-weight:700; padding:7px 0; border-bottom:1px solid #F1F5F9; }
    .download-link { display:inline-flex; align-items:center; padding:8px 12px; border-radius:9px; background:#F1F5F9; color:#047857; font-size:13px; font-weight:800; text-decoration:none; }
    @media (max-width: 820px) { section > div:first-child { grid-template-columns:1fr !important; } }
  `],
})
export class CourierAnalysisComponent {
  readonly service = inject(CourierAnalysisService);
  readonly steps = ['Upload', 'Match', 'Calculate', 'Generate', 'Save'];

  selectedFiles = signal<SelectedCourierFile[]>([]);
  result = signal<CourierAnalysisResult | null>(null);
  processing = signal(false);
  activeStep = signal('Upload');
  error = signal('');

  missingCommon = computed(() => {
    const types = this.selectedFiles().map((item) => item.type);
    return ['Shopify D2C export', 'Zoho invoice export', 'Delivery Challan export', 'Pincode master']
      .filter((type) => !types.includes(type as CourierFileType));
  });

  hasCourier = computed(() => {
    const types = this.selectedFiles().map((item) => item.type);
    return types.includes('DTDC invoice PDF') || types.includes('BlueDart invoice');
  });

  canProcess = computed(() => this.selectedFiles().length > 0 && this.hasCourier() && this.missingCommon().length === 0);

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.selectedFiles.set(files.map((file) => ({ file, type: this.service.detectType(file.name) })));
    this.result.set(null);
    this.error.set('');
    this.activeStep.set('Upload');
  }

  setFileType(index: number, type: CourierFileType): void {
    this.selectedFiles.update((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, type } : item));
  }

  courierLabel(): string {
    const types = this.selectedFiles().map((item) => item.type);
    const labels = [];
    if (types.includes('DTDC invoice PDF')) labels.push('DTDC');
    if (types.includes('BlueDart invoice')) labels.push('BlueDart');
    return labels.join(' + ');
  }

  async process(): Promise<void> {
    if (!this.canProcess() || this.processing()) return;
    this.processing.set(true);
    this.error.set('');
    this.result.set(null);
    const timer = window.setInterval(() => {
      const current = this.steps.indexOf(this.activeStep());
      this.activeStep.set(this.steps[Math.min(current + 1, this.steps.length - 1)]);
    }, 900);
    try {
      const items = this.selectedFiles();
      const response = await this.service.process(items.map((item) => item.file), items.map((item) => item.type));
      this.activeStep.set('Save');
      this.result.set(response);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Courier analysis failed.');
    } finally {
      window.clearInterval(timer);
      this.processing.set(false);
    }
  }

  downloadUrl(path: string): string {
    return this.service.absoluteDownloadUrl(path);
  }

  money(value: number): string {
    return `₹${Math.round(value || 0).toLocaleString('en-IN')}`;
  }
}
