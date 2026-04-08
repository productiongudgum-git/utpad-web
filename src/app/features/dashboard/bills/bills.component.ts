import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../../core/supabase.service';

interface InwardBill {
  id: string;
  ingredient_name: string;
  vendor_name: string;
  qty: number;
  unit: string;
  inward_date: string;
  bill_number: string | null;
  bill_photo_url: string | null;
}

@Component({
  selector: 'app-bills',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div style="padding:24px;max-width:1100px;">
      <div style="margin-bottom:24px;">
        <h1 style="font-family:'Cabin',sans-serif;font-size:22px;font-weight:700;color:#121212;margin:0 0 4px;">Inventory Bills</h1>
        <p style="color:#6B7280;font-size:14px;margin:0;">Bills and photos captured during inwarding.</p>
      </div>

      <!-- Search + Refresh -->
      <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
        <input [(ngModel)]="searchTerm" (ngModelChange)="applyFilter()"
               placeholder="Search by ingredient, vendor, or bill #..." class="gg-input" style="max-width:320px;">
        <button (click)="loadData()" style="padding:8px 16px;background:#f3f4f6;border:1px solid #E5E7EB;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:6px;color:#374151;">
          <span class="material-icons-round" style="font-size:16px;">refresh</span>
          Refresh
        </button>
      </div>

      <!-- Stats row -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;" class="bill-stats">
        <div style="background:#fff;border-radius:10px;border:1px solid #E5E7EB;padding:16px;text-align:center;">
          <p style="font-size:26px;font-weight:700;color:#121212;margin:0;font-family:'Cabin',sans-serif;">{{ bills().length }}</p>
          <p style="font-size:12px;color:#6B7280;margin:4px 0 0;">Total Entries</p>
        </div>
        <div style="background:#fff;border-radius:10px;border:1px solid #E5E7EB;padding:16px;text-align:center;">
          <p style="font-size:26px;font-weight:700;color:#01AC51;margin:0;font-family:'Cabin',sans-serif;">{{ withBillCount() }}</p>
          <p style="font-size:12px;color:#6B7280;margin:4px 0 0;">With Bill #</p>
        </div>
        <div style="background:#fff;border-radius:10px;border:1px solid #E5E7EB;padding:16px;text-align:center;">
          <p style="font-size:26px;font-weight:700;color:#2563eb;margin:0;font-family:'Cabin',sans-serif;">{{ withPhotoCount() }}</p>
          <p style="font-size:12px;color:#6B7280;margin:4px 0 0;">With Photo</p>
        </div>
      </div>

      @if (loading()) {
        <div style="display:flex;flex-direction:column;gap:10px;">
          @for (i of [1,2,3,4,5]; track i) {
            <div class="gg-skeleton" style="height:56px;border-radius:10px;"></div>
          }
        </div>
      } @else if (filtered().length === 0) {
        <div style="text-align:center;padding:60px 0;color:#9CA3AF;">
          <span class="material-icons-round" style="font-size:48px;display:block;margin-bottom:12px;">receipt_long</span>
          <p style="font-size:15px;margin:0;">No bills found.</p>
        </div>
      } @else {
        <div style="background:#fff;border-radius:12px;border:1px solid #E5E7EB;overflow:hidden;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#f8f9fa;border-bottom:1px solid #E5E7EB;">
                <th style="text-align:left;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">Date</th>
                <th style="text-align:left;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">Ingredient</th>
                <th style="text-align:left;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">Vendor</th>
                <th style="text-align:right;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">Qty</th>
                <th style="text-align:left;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">Bill #</th>
                <th style="text-align:center;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">Photo</th>
              </tr>
            </thead>
            <tbody>
              @for (bill of filtered(); track bill.id) {
                <tr style="border-bottom:1px solid #f3f4f6;transition:background 0.1s;"
                    onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='#fff'">
                  <td style="padding:12px 16px;font-size:13px;color:#374151;white-space:nowrap;">{{ bill.inward_date }}</td>
                  <td style="padding:12px 16px;">
                    <span style="font-size:14px;font-weight:600;color:#121212;">{{ bill.ingredient_name }}</span>
                  </td>
                  <td style="padding:12px 16px;font-size:13px;color:#6B7280;">{{ bill.vendor_name || '—' }}</td>
                  <td style="padding:12px 16px;text-align:right;font-size:14px;font-weight:600;color:#121212;">{{ bill.qty }} {{ bill.unit }}</td>
                  <td style="padding:12px 16px;">
                    @if (bill.bill_number) {
                      <span style="font-size:13px;font-weight:600;color:#2563eb;font-family:monospace;">{{ bill.bill_number }}</span>
                    } @else {
                      <span style="font-size:12px;color:#9CA3AF;">—</span>
                    }
                  </td>
                  <td style="padding:12px 16px;text-align:center;">
                    @if (bill.bill_photo_url) {
                      <a [href]="bill.bill_photo_url" target="_blank" rel="noopener"
                         style="display:inline-flex;align-items:center;gap:4px;background:#eff6ff;color:#2563eb;padding:4px 10px;border-radius:8px;font-size:12px;font-weight:600;text-decoration:none;transition:background 0.15s;"
                         onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#eff6ff'">
                        <span class="material-icons-round" style="font-size:14px;">photo</span>
                        View
                      </a>
                    } @else {
                      <span style="font-size:12px;color:#9CA3AF;">—</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <style>
      @media (max-width:600px) { .bill-stats { grid-template-columns: 1fr 1fr !important; } }
    </style>
  `,
})
export class BillsComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);

  loading = signal(true);
  bills = signal<InwardBill[]>([]);
  filteredBills = signal<InwardBill[]>([]);
  searchTerm = '';

  withBillCount = computed(() => this.bills().filter(b => b.bill_number).length);
  withPhotoCount = computed(() => this.bills().filter(b => b.bill_photo_url).length);
  filtered = computed(() => this.filteredBills());

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    // Query gg_inwarding with joins to gg_ingredients and gg_vendors
    const { data, error } = await this.supabase.client
      .from('gg_inwarding')
      .select(`
        id, qty, unit, inward_date, lot_ref, expiry_date,
        gg_ingredients!ingredient_id ( name ),
        gg_vendors!vendor_id ( name )
      `)
      .order('inward_date', { ascending: false });

    const mapped: InwardBill[] = (data ?? []).map((row: any) => ({
      id: row.id,
      ingredient_name: row.gg_ingredients?.name ?? 'Unknown',
      vendor_name: row.gg_vendors?.name ?? '',
      qty: row.qty,
      unit: row.unit,
      inward_date: row.inward_date,
      bill_number: row.lot_ref ?? null,   // lot_ref used as bill/lot reference
      bill_photo_url: null,               // no photo URL column in gg_inwarding
    }));

    this.bills.set(mapped);
    this.filteredBills.set(mapped);
    this.loading.set(false);
  }

  applyFilter(): void {
    const q = this.searchTerm.toLowerCase();
    if (!q) {
      this.filteredBills.set(this.bills());
      return;
    }
    this.filteredBills.set(
      this.bills().filter(b =>
        b.ingredient_name.toLowerCase().includes(q) ||
        b.vendor_name.toLowerCase().includes(q) ||
        (b.bill_number ?? '').toLowerCase().includes(q)
      )
    );
  }
}
