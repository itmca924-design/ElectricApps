import { Component, OnInit, ViewChild, AfterViewInit, ChangeDetectorRef, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { CommonModule } from '@angular/common';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { InventoryService } from '../service/inventory.service';
import { Router } from '@angular/router';
import { merge, of } from 'rxjs';
import { startWith, switchMap, map, catchError } from 'rxjs/operators';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { LoadingService } from '../../../core/services/loading.service';
import { LocationService } from '../../master/locations/services/locations.service';
import { NotificationService } from '../../shared/notification.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog-component/confirm-dialog-component';

@Component({
  selector: 'app-disposed-stock-component',
  standalone: true,
  imports: [MaterialModule, CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './disposed-stock-component.html',
  styleUrl: './disposed-stock-component.scss',
  animations: [
    trigger('detailExpand', [
      state('collapsed', style({ height: '0px', minHeight: '0' })),
      state('expanded', style({ height: '*' })),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),
  ],
})
export class DisposedStockComponent implements OnInit, AfterViewInit {
  private loadingService = inject(LoadingService);
  private notification = inject(NotificationService);
  private locationService = inject(LocationService);
  private dialog = inject(MatDialog);
  private cdr = inject(ChangeDetectorRef);
  private inventoryService = inject(InventoryService);
  private router = inject(Router);

  displayedColumns: string[] = ['productName', 'warehouseName', 'rackName', 'disposedQty', 'disposedValue', 'lastPurchase'];
  stockDataSource = new MatTableDataSource<any>([]);
  expiryAlertCount: number = 0;
  nearExpiryCount: number = 0;
  totalExpiredQty: number = 0;
  totalExpiredLoss: number = 0;

  expandedElement: any | null;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  resultsLength = 0;
  isLoadingResults = true;
  totalDisposedValue: number = 0;
  totalDisposedQty: number = 0;
  searchValue: string = '';

  startDate: Date | null = null;
  endDate: Date | null = null;

  warehouses: any[] = [];
  racks: any[] = [];
  filteredRacks: any[] = [];
  selectedWarehouseId: string | null = null;
  selectedRackId: string | null = null;

  constructor() { }

  ngOnInit() {
    this.loadLocations();
    this.checkExpiredStock();
  }

  checkExpiredStock() {
    this.inventoryService.getCurrentStock().subscribe(data => {
      if (data && data.items) {
        const stockItems = data.items.filter((item: any) => (item.availableStock > 0 || item.totalExpired > 0));
        const expiredItems = stockItems.filter((item: any) => 
          this.isExpired(item.expiryDate) && (item.rackName?.includes('Expired') || item.rackName?.includes('E1'))
        );
        this.expiryAlertCount = expiredItems.length;
        
        // Summing all possible expired quantity fields
        this.totalExpiredQty = expiredItems.reduce((acc: number, item: any) => 
          acc + (item.availableStock || 0) + (item.totalExpired || 0) + (item.expiredQty || 0), 0);
          
        this.totalExpiredLoss = expiredItems.reduce((acc: number, item: any) => 
          acc + (((item.availableStock || 0) + (item.totalExpired || 0) + (item.expiredQty || 0)) * (item.lastRate || 0)), 0);
        
        this.nearExpiryCount = stockItems.filter((item: any) => this.isNearExpiry(item.expiryDate)).length;
        this.cdr.detectChanges();
      }
    });
  }

  isExpired(date: any): boolean {
    if (!date || date === 'NA') return false;
    const expDate = new Date(date);
    if (isNaN(expDate.getTime())) return false; // Invalid date check
    
    const today = new Date();
    today.setHours(23, 59, 59, 999); // Inclusion check for current day expiry
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

  loadLocations() {
    this.locationService.getWarehouses().subscribe(data => {
      this.warehouses = data.filter(w => w.isActive);
    });
    this.locationService.getRacks().subscribe(data => {
      this.racks = data.filter(r => r.isActive);
    });
  }

  onWarehouseChange() {
    this.filteredRacks = this.selectedWarehouseId ? this.racks.filter(r => r.warehouseId === this.selectedWarehouseId) : [];
    this.selectedRackId = null;
    this.applyDateFilter();
  }

  ngAfterViewInit() {
    this.sort.sortChange.subscribe(() => (this.paginator.pageIndex = 0));
    this.loadingService.setLoading(true);

    setTimeout(() => {
      merge(this.sort.sortChange, this.paginator.page)
        .pipe(
          startWith({}),
          switchMap(() => this.fetchDataStream()),
          map(data => {
            this.isLoadingResults = false;
            this.loadingService.setLoading(false);
            if (data === null) return [];
            this.resultsLength = data.totalCount;
            this.handleDataUpdate(data.items);
            return data.items;
          }),
          catchError(() => {
            this.isLoadingResults = false;
            this.loadingService.setLoading(false);
            return of([]);
          })
        ).subscribe();
    }, 500);
  }

  private fetchDataStream() {
    this.isLoadingResults = true;
    return this.inventoryService.getDisposedStock(
      this.sort.active,
      this.sort.direction,
      this.paginator.pageIndex,
      this.paginator.pageSize,
      this.searchValue,
      this.startDate,
      this.endDate,
      this.selectedWarehouseId,
      this.selectedRackId
    );
  }

  private handleDataUpdate(items: any) {
    if (items) {
      // Filter out items that have been purged (where both rejected and expired quantity are 0)
      const mappedData = (items || []).filter((item: any) => 
        ((item.totalRejected || 0) + (item.totalExpired || 0)) > 0
      );
      this.stockDataSource.data = mappedData;
      this.updateSummary(mappedData);
    }
    this.cdr.detectChanges();
  }

  getSourceRack(history: any[]): string {
    if (!history || history.length === 0) return 'NA';
    
    // Reverse the history to find the oldest record that might have the original rack info
    const reversedHistory = [...history].reverse();
    const original = reversedHistory.find((h: any) => h.rackName && !h.rackName.includes('Expired') && !h.rackName.includes('E1'));
    
    // Fallback: If everything says E1, try to get the very last record's rack (assumed original GRN)
    return original ? original.rackName : (history[history.length - 1]?.rackName || 'NA');
  }

  updateSummary(data: any[]) {
    this.totalDisposedValue = data.reduce((acc, curr) => acc + ((curr.totalRejected + (curr.totalExpired || 0)) * curr.lastRate), 0);
    this.totalDisposedQty = data.reduce((acc, curr) => acc + ((curr.totalRejected || 0) + (curr.totalExpired || 0)), 0);
    this.cdr.detectChanges();
  }

  applyDateFilter() {
    this.paginator.pageIndex = 0;
    this.fetchDataStream().subscribe(data => {
      this.isLoadingResults = false;
      if (data) {
        this.resultsLength = data.totalCount;
        this.handleDataUpdate(data.items);
      }
    });
  }

  applyFilter(event: Event) {
    this.searchValue = (event.target as HTMLInputElement).value.trim().toLowerCase();
    this.paginator.pageIndex = 0;
    this.applyDateFilter();
  }

  toggleRow(element: any) {
    this.expandedElement = this.expandedElement === element ? null : element;
    this.cdr.detectChanges();
  }

  onPurgeAllExpired() {
    const expiredItems = this.stockDataSource.data.filter(item => {
      // If it's already in the Expired/E1 rack, we trust the staging intent for purging
      return (item.rackName && (item.rackName.toLowerCase().includes('expired') || item.rackName.includes('E1'))) ||
             item.rackId === 'E1';
    });

    if (expiredItems.length === 0) {
      this.notification.showStatus(false, 'Please move items to Expired/E1 rack first.');
      return;
    }

        this.dialog.open(ConfirmDialogComponent, {
          width: '400px',
          data: {
            title: 'Purge All Expired',
            message: `Are you sure you want to <b>permanently delete</b> all ${expiredItems.length} expired product batches? This action cannot be undone.`
          }
        }).afterClosed().subscribe(result => {
          if (result) {
            this.loadingService.setLoading(true);
            // Process each expired item for adjustment
            let completed = 0;
            const total = expiredItems.length;

            expiredItems.forEach((item: any) => {
              const purgeQty = (item.availableStock || 0) + (item.totalExpired || 0) + (item.expiredQty || 0);
              const payload = { 
                productId: item.productId, 
                warehouseId: item.warehouseId, 
                rackId: item.rackId, 
                quantity: purgeQty, 
                expiryDate: item.expiryDate || item.history?.[0]?.expiryDate
              };
              
              this.inventoryService.adjustStock(payload).subscribe({
                next: () => {
                  completed++;
                  if (completed === total) {
                    this.loadingService.setLoading(false);
                    this.notification.showStatus(true, 'All expired batches purged successfully.');
                    this.checkExpiredStock();
                    this.applyDateFilter();
                  }
                },
                error: () => {
                  completed++;
                  if (completed === total) {
                    this.loadingService.setLoading(false);
                    this.checkExpiredStock();
                    this.applyDateFilter();
                  }
                }
              });
            });
          }
        });
  }
}
