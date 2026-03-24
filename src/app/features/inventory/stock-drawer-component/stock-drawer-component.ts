import { Component, OnInit, inject, Input, Output, EventEmitter, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { InventoryService } from '../service/inventory.service';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';

@Component({
  selector: 'app-stock-drawer',
  standalone: true,
  imports: [CommonModule, RouterModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './stock-drawer-component.html',
  styleUrl: './stock-drawer-component.scss',
  animations: [
    trigger('drawerSlide', [
      state('closed', style({ transform: 'translateX(100%)' })),
      state('open', style({ transform: 'translateX(0)' })),
      transition('closed <=> open', animate('300ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),
    trigger('detailExpand', [
      state('collapsed', style({ height: '0px', minHeight: '0', opacity: 0 })),
      state('expanded', style({ height: '*', opacity: 1 })),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),
  ],
})
export class StockDrawerComponent implements OnInit, OnDestroy {
  private inventoryService = inject(InventoryService);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();

  @Input() isOpen = false;
  @Output() close = new EventEmitter<void>();

  stockItems: any[] = [];
  isLoading = false;
  searchSubject = new Subject<string>();
  searchTerm = '';
  expandedProductId: number | null = null;

  totalStockItems = 0;
  totalAvailableQty = 0;

  ngOnInit() {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(term => {
      this.searchTerm = term;
      this.loadStock();
    });

    this.inventoryService.inventoryUpdate$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        console.log('🔄 Inventory updated elsewhere. Refreshing stock drawer...');
        this.loadStock();
      });

    this.loadStock();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadStock() {
    this.isLoading = true;
    this.inventoryService.getCurrentStock(
      'productName',
      'asc',
      0,
      50, // Load first 50 items for quick view
      this.searchTerm
    ).subscribe({
      next: (data) => {
        this.stockItems = data.items.map((item: any) => ({
          ...item,
          currentStock: item.availableStock || 0
        }));
        this.updateSummary();
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  updateSummary() {
    this.totalStockItems = this.stockItems.length;
    this.totalAvailableQty = this.stockItems.reduce((acc, curr) => acc + (curr.availableStock || 0), 0);
  }

  onSearch(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.searchSubject.next(value);
  }

  toggleExpand(productId: number) {
    this.expandedProductId = this.expandedProductId === productId ? null : productId;
  }

  closeDrawer() {
    this.close.emit();
  }

  isExpired(date: any): boolean {
    if (!date || date === 'NA') return false;
    const expDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return expDate <= today;
  }

  isNearExpiry(date: any): boolean {
    if (!date || date === 'NA') return false;
    const expDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fifteenDaysFromNow = new Date();
    fifteenDaysFromNow.setDate(today.getDate() + 15);
    return expDate > today && expDate <= fifteenDaysFromNow;
  }

  isLowStock(element: any): boolean {
    if (!element) return false;
    return element.availableStock <= (element.minStockLevel || 10);
  }
}
