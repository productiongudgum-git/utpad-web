import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../../core/supabase.service';

interface IngredientStock {
  id: string;
  name: string;
  current_stock: number;
  reorder_point: number;
  default_unit: string;
  isLow: boolean;
}

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div style="padding:24px;max-width:1000px;">
      <div style="margin-bottom:24px;">
        <h1 style="font-family:'Cabin',sans-serif;font-size:22px;font-weight:700;color:#121212;margin:0 0 4px;">Inventory</h1>
        <p style="color:#6B7280;font-size:14px;margin:0;">Current stock levels for all ingredients. Items in red are below reorder point.</p>
      </div>

      <!-- Search + filter -->
      <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
        <input [(ngModel)]="searchTerm" (ngModelChange)="onFilterChange()" placeholder="Search ingredients..." class="gg-input" style="max-width:280px;">
        <select [(ngModel)]="filter" (ngModelChange)="onFilterChange()" class="gg-input dropdown-with-arrow" style="max-width:200px;">
          <option value="all">All Items</option>
          <option value="low">Low Stock Only</option>
          <option value="ok">In Stock</option>
        </select>
        <button (click)="loadData()" style="padding:8px 16px;background:#f3f4f6;border:1px solid #E5E7EB;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:6px;color:#374151;">
          <span class="material-icons-round" style="font-size:16px;">refresh</span>
          Refresh
        </button>
      </div>

      <!-- Stats row -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;" class="inv-stats">
        <div style="background:#fff;border-radius:10px;border:1px solid #E5E7EB;padding:16px;text-align:center;">
          <p style="font-size:26px;font-weight:700;color:#121212;margin:0;font-family:'Cabin',sans-serif;">{{ items().length }}</p>
          <p style="font-size:12px;color:#6B7280;margin:4px 0 0;">Total Ingredients</p>
        </div>
        <div style="background:#fff;border-radius:10px;border:1px solid #E5E7EB;padding:16px;text-align:center;">
          <p style="font-size:26px;font-weight:700;color:#01AC51;margin:0;font-family:'Cabin',sans-serif;">{{ okCount() }}</p>
          <p style="font-size:12px;color:#6B7280;margin:4px 0 0;">In Stock</p>
        </div>
        <div style="background:#fff;border-radius:10px;border:1px solid #E5E7EB;padding:16px;text-align:center;">
          <p style="font-size:26px;font-weight:700;color:#FF2828;margin:0;font-family:'Cabin',sans-serif;">{{ lowCount() }}</p>
          <p style="font-size:12px;color:#6B7280;margin:4px 0 0;">Low / Out of Stock</p>
        </div>
      </div>

      @if (toast()) {
        <div class="toast" [class.toast-success]="toastKind()==='success'" [class.toast-error]="toastKind()==='error'">{{ toast() }}</div>
      }

      @if (loading()) {
        <div style="display:flex;flex-direction:column;gap:10px;">
          @for (i of [1,2,3,4,5]; track i) {
            <div class="gg-skeleton" style="height:56px;border-radius:10px;"></div>
          }
        </div>
      } @else if (filtered().length === 0) {
        <div style="text-align:center;padding:60px 0;color:#9CA3AF;">
          <span class="material-icons-round" style="font-size:48px;display:block;margin-bottom:12px;">inventory_2</span>
          <p style="font-size:15px;margin:0;">No items match your filter.</p>
        </div>
      } @else {
        <!-- Table -->
        <div style="background:#fff;border-radius:12px;border:1px solid #E5E7EB;overflow:hidden;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#f8f9fa;border-bottom:1px solid #E5E7EB;">
                <th style="text-align:left;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">Ingredient</th>
                <th style="text-align:right;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">Current Stock</th>
                <th style="text-align:right;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">Reorder Point</th>
                <th style="text-align:center;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">Status</th>
                <th style="text-align:center;padding:12px 16px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (item of filtered(); track item.id) {
                <tr [style.background]="item.isLow ? '#fff5f5' : '#fff'" style="border-bottom:1px solid #f3f4f6;transition:background 0.1s;">
                  <td style="padding:12px 16px;">
                    <div style="display:flex;align-items:center;gap:10px;">
                      <div [style.background]="item.isLow ? '#fee2e2' : '#dcfce7'" style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;">
                        <span class="material-icons-round" [style.color]="item.isLow ? '#dc2626' : '#15803d'" style="font-size:16px;">category</span>
                      </div>
                      <span style="font-size:14px;font-weight:600;color:#121212;">{{ item.name }}</span>
                    </div>
                  </td>
                  <td style="padding:12px 16px;text-align:right;">
                    @if (editingId() === item.id) {
                      <input [(ngModel)]="editStock" type="number" min="0" step="0.01" class="gg-input" style="width:100px;font-size:13px;padding:4px 8px;" (keyup.enter)="saveStock(item)">
                    } @else {
                      <span style="font-size:14px;font-weight:600;" [style.color]="item.isLow ? '#dc2626' : '#121212'">
                        {{ item.current_stock | number:'1.0-2' }} {{ item.default_unit }}
                      </span>
                    }
                  </td>
                  <td style="padding:12px 16px;text-align:right;">
                    @if (editingId() === item.id) {
                      <input [(ngModel)]="editReorder" type="number" min="0" step="0.01" class="gg-input" style="width:100px;font-size:13px;padding:4px 8px;">
                    } @else {
                      <span style="font-size:13px;color:#6B7280;">{{ item.reorder_point | number:'1.0-2' }} {{ item.default_unit }}</span>
                    }
                  </td>
                  <td style="padding:12px 16px;text-align:center;">
                    @if (item.isLow) {
                      <span style="display:inline-flex;align-items:center;gap:4px;background:#fee2e2;color:#dc2626;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;">
                        <span class="material-icons-round" style="font-size:12px;">warning</span> Low
                      </span>
                    } @else {
                      <span style="display:inline-flex;align-items:center;gap:4px;background:#dcfce7;color:#15803d;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;">
                        <span class="material-icons-round" style="font-size:12px;">check_circle</span> OK
                      </span>
                    }
                  </td>
                  <td style="padding:12px 16px;text-align:center;">
                    @if (editingId() === item.id) {
                      <div style="display:flex;align-items:center;justify-content:center;gap:6px;">
                        <button (click)="saveStock(item)" style="padding:4px 10px;background:#01AC51;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Save</button>
                        <button (click)="editingId.set(null)" style="padding:4px 10px;background:#f3f4f6;border:1px solid #E5E7EB;border-radius:6px;font-size:12px;cursor:pointer;color:#374151;">Cancel</button>
                      </div>
                    } @else {
                      <button (click)="startEdit(item)" style="padding:4px 10px;background:#f0fdf4;border:1px solid #01AC51;color:#01AC51;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Edit Stock</button>
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
      @media (max-width:600px) { .inv-stats { grid-template-columns: 1fr 1fr !important; } }
    </style>
  `,
})
export class InventoryComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);

  loading = signal(true);
  items = signal<IngredientStock[]>([]);
  editingId = signal<string | null>(null);
  editStock = 0;
  editReorder = 0;
  searchTerm = '';
  filter = 'all';
  toast = signal('');
  toastKind = signal<'success'|'error'>('success');
  filteredItems = signal<IngredientStock[]>([]);

  lowCount = computed(() => this.items().filter(i => i.isLow).length);
  okCount = computed(() => this.items().filter(i => !i.isLow).length);

  filtered = computed(() => this.filteredItems());

  onFilterChange(): void {
    let list = this.items();
    if (this.searchTerm) list = list.filter(i => i.name.toLowerCase().includes(this.searchTerm.toLowerCase()));
    if (this.filter === 'low') list = list.filter(i => i.isLow);
    if (this.filter === 'ok') list = list.filter(i => !i.isLow);
    this.filteredItems.set(list);
  }

  async ngOnInit(): Promise<void> { await this.loadData(); }

  async loadData(): Promise<void> {
    this.loading.set(true);
    const { data } = await this.supabase.client.from('gg_ingredients')
      .select('id, name, current_stock, reorder_point, default_unit')
      .order('name');
    const mapped = (data ?? []).map((i: any) => ({
      id: i.id, name: i.name,
      current_stock: i.current_stock ?? 0, reorder_point: i.reorder_point ?? 0,
      default_unit: i.default_unit ?? 'kg',
      isLow: (i.current_stock ?? 0) <= (i.reorder_point ?? 0),
    }));
    this.items.set(mapped);
    this.filteredItems.set(mapped);
    this.loading.set(false);
  }

  startEdit(item: IngredientStock): void {
    this.editingId.set(item.id);
    this.editStock = item.current_stock;
    this.editReorder = item.reorder_point;
  }

  async saveStock(item: IngredientStock): Promise<void> {
    const { error } = await this.supabase.client.from('gg_ingredients')
      .update({ current_stock: this.editStock, reorder_point: this.editReorder }).eq('id', item.id);
    if (!error) { this.showToast('Stock updated', 'success'); this.editingId.set(null); await this.loadData(); }
    else this.showToast(error.message, 'error');
  }

  private showToast(msg: string, kind: 'success'|'error'): void {
    this.toast.set(msg); this.toastKind.set(kind);
    setTimeout(() => this.toast.set(''), 3000);
  }
}
