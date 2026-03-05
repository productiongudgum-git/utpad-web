import { Injectable } from '@angular/core';

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
}

export interface Vendor {
  id: string;
  name: string;
}

export interface Batch {
  id: string;
  code: string;
  flavorName: string;
  status: 'in_progress' | 'completed';
}

export interface SKU {
  id: string;
  name: string;
  code: string;
}

@Injectable({ providedIn: 'root' })
export class MockDataService {
  getIngredients(): Ingredient[] {
    return [
      { id: '1', name: 'Gum Base A', unit: 'kg' },
      { id: '2', name: 'Sweetener X', unit: 'kg' },
      { id: '3', name: 'Flavor Mint', unit: 'L' },
      { id: '4', name: 'Coloring Blue', unit: 'L' },
      { id: '5', name: 'Preservative', unit: 'kg' },
    ];
  }

  getVendors(): Vendor[] {
    return [
      { id: '1', name: 'Vendor Alpha' },
      { id: '2', name: 'Beta Corp' },
      { id: '3', name: 'Gamma Supplies' },
    ];
  }

  getBatches(): Batch[] {
    return [
      { id: '1', code: 'SF-2023-001', flavorName: 'Mint Gum Base', status: 'completed' },
      { id: '2', code: 'SF-2023-002', flavorName: 'Strawberry Blast', status: 'completed' },
      { id: '3', code: 'SF-2023-003', flavorName: 'Spearmint', status: 'in_progress' },
      { id: '4', code: 'SF-2023-004', flavorName: 'Watermelon Wave', status: 'completed' },
    ];
  }

  getSKUs(): SKU[] {
    return [
      { id: '1', name: 'Box of 12 Packs', code: 'SKU-BOX-12' },
      { id: '2', name: 'Box of 24 Packs', code: 'SKU-BOX-24' },
      { id: '3', name: 'Jar of 50 Pieces', code: 'SKU-JAR-50' },
      { id: '4', name: 'Blister Pack 5s', code: 'SKU-BLS-05' },
    ];
  }

  getCurrentStock(): Map<string, number> {
    return new Map([
      ['SKU-BOX-12', 340],
      ['SKU-BOX-24', 520],
      ['SKU-JAR-50', 180],
      ['SKU-BLS-05', 200],
    ]);
  }

  getFlavorProfiles(): { id: string; name: string; code: string }[] {
    return [
      { id: '1', name: 'Spearmint Blast', code: 'MNT' },
      { id: '2', name: 'Bubblegum Classic', code: 'BBG' },
      { id: '3', name: 'Strawberry Fusion', code: 'STR' },
      { id: '4', name: 'Watermelon Wave', code: 'WTR' },
    ];
  }

  getRecipeIngredients(): { name: string; qty: number }[] {
    return [
      { name: 'Gum Base Base-A', qty: 50.0 },
      { name: 'Glucose Syrup', qty: 25.5 },
      { name: 'Spearmint Oil', qty: 1.2 },
      { name: 'Sugar (Fine)', qty: 23.3 },
    ];
  }
}
