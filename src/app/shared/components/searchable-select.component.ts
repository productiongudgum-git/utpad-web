import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, Input, Output, EventEmitter } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface SearchableSelectOption {
  id: string;
  label: string;
  sublabel?: string;
}

@Component({
  selector: 'app-searchable-select',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="searchable-select" [class.open]="open">
      <button
        type="button"
        class="searchable-trigger"
        [class.placeholder]="!selectedOption"
        [disabled]="disabled"
        (click)="toggleOpen()">
        <span class="trigger-text">
          @if (selectedOption) {
            <span>{{ selectedOption.label }}</span>
            @if (selectedOption.sublabel) {
              <span class="trigger-sublabel">{{ selectedOption.sublabel }}</span>
            }
          } @else {
            <span>{{ placeholder }}</span>
          }
        </span>
        <span class="material-icons-round trigger-icon">expand_more</span>
      </button>

      @if (open) {
        <div class="searchable-panel">
          <div class="search-box">
            <span class="material-icons-round">search</span>
            <input
              #searchInput
              [(ngModel)]="searchTerm"
              [placeholder]="searchPlaceholder"
              class="search-input"
              autocomplete="off"
              (click)="$event.stopPropagation()">
          </div>

          <div class="options-list">
            @if (filteredOptions.length > 0) {
              @for (option of filteredOptions; track option.id) {
                <button
                  type="button"
                  class="option-button"
                  [class.active]="option.id === value"
                  (click)="selectOption(option)">
                  <span class="option-copy">
                    <span>{{ option.label }}</span>
                    @if (option.sublabel) {
                      <span class="option-sublabel">{{ option.sublabel }}</span>
                    }
                  </span>
                  @if (option.id === value) {
                    <span class="material-icons-round option-check">check</span>
                  }
                </button>
              }
            } @else {
              <div class="empty-state">{{ emptyText }}</div>
            }

            @if (allowCreate && normalizedSearchTerm && !hasExactMatch) {
              <button type="button" class="create-button" (click)="handleCreate()">
                <span class="material-icons-round">add</span>
                {{ createLabelPrefix }} "{{ searchTerm.trim() }}"
              </button>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .searchable-select { position: relative; }
    .searchable-select.open { z-index: 200; }
    .searchable-trigger {
      width: 100%;
      min-height: 40px;
      border: 1px solid var(--border, #E5E7EB);
      border-radius: 10px;
      background: var(--card, #fff);
      color: var(--foreground, #111827);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 12px;
      cursor: pointer;
      text-align: left;
      font-size: 14px;
    }
    .searchable-trigger.placeholder { color: #9CA3AF; }
    .searchable-trigger:disabled { opacity: 0.6; cursor: not-allowed; }
    .trigger-text { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .trigger-sublabel, .option-sublabel { color: #6B7280; font-size: 12px; }
    .trigger-icon { font-size: 18px; color: #6B7280; flex-shrink: 0; transition: transform 0.15s ease; }
    .searchable-select.open .trigger-icon { transform: rotate(180deg); }
    .searchable-panel {
      position: absolute;
      left: 0;
      right: 0;
      top: calc(100% + 6px);
      z-index: 250;
      background: #fff;
      border: 1px solid #E5E7EB;
      border-radius: 12px;
      box-shadow: 0 16px 40px rgba(15, 23, 42, 0.14);
      overflow: hidden;
    }
    .search-box {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid #F3F4F6;
    }
    .search-box .material-icons-round { font-size: 18px; color: #9CA3AF; }
    .search-input {
      width: 100%;
      border: none;
      outline: none;
      background: transparent;
      font-size: 13px;
      color: #111827;
    }
    .options-list { max-height: 260px; overflow: auto; padding: 6px; }
    .option-button, .create-button {
      width: 100%;
      border: none;
      background: transparent;
      border-radius: 8px;
      padding: 10px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      text-align: left;
      cursor: pointer;
      color: #111827;
    }
    .option-button:hover, .create-button:hover { background: #F9FAFB; }
    .option-button.active { background: #ECFDF5; color: #047857; }
    .option-copy { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .option-check { font-size: 18px; color: #01AC51; flex-shrink: 0; }
    .create-button {
      margin-top: 4px;
      border: 1px dashed #86EFAC;
      background: #F0FDF4;
      color: #047857;
      justify-content: flex-start;
      font-weight: 600;
    }
    .create-button .material-icons-round { font-size: 18px; }
    .empty-state { padding: 12px; color: #9CA3AF; font-size: 13px; }
  `],
})
export class SearchableSelectComponent {
  @Input() options: SearchableSelectOption[] = [];
  @Input() value: string | null = null;
  @Input() placeholder = 'Select an option';
  @Input() searchPlaceholder = 'Search...';
  @Input() emptyText = 'No options found.';
  @Input() createLabelPrefix = 'Add';
  @Input() allowCreate = false;
  @Input() disabled = false;

  @Output() valueChange = new EventEmitter<string>();
  @Output() createRequested = new EventEmitter<string>();

  open = false;
  searchTerm = '';

  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

  get selectedOption(): SearchableSelectOption | undefined {
    return this.options.find((option) => option.id === this.value);
  }

  get normalizedSearchTerm(): string {
    return this.searchTerm.trim().toLowerCase();
  }

  get filteredOptions(): SearchableSelectOption[] {
    const query = this.normalizedSearchTerm;
    if (!query) return this.options;
    return this.options.filter((option) =>
      option.label.toLowerCase().includes(query) ||
      (option.sublabel ?? '').toLowerCase().includes(query),
    );
  }

  get hasExactMatch(): boolean {
    const query = this.normalizedSearchTerm;
    if (!query) return false;
    return this.options.some((option) => option.label.trim().toLowerCase() === query);
  }

  toggleOpen(): void {
    if (this.disabled) return;
    this.open = !this.open;
    if (!this.open) this.searchTerm = '';
  }

  selectOption(option: SearchableSelectOption): void {
    this.valueChange.emit(option.id);
    this.open = false;
    this.searchTerm = '';
  }

  handleCreate(): void {
    const label = this.searchTerm.trim();
    if (!label) return;
    this.createRequested.emit(label);
    this.open = false;
    this.searchTerm = '';
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (!this.open) return;
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.open = false;
      this.searchTerm = '';
    }
  }
}
