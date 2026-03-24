import { Component, OnInit, ViewChild, AfterViewInit, ChangeDetectorRef, inject, OnDestroy } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { LocationTrackerDialogComponent } from '../purchase-return/location-tracker-dialog/location-tracker-dialog.component';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { CommonModule } from '@angular/common';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { InventoryService } from '../service/inventory.service';
import { Router } from '@angular/router';
import { merge, of, Subject } from 'rxjs';
import { startWith, switchMap, map, catchError, takeUntil } from 'rxjs/operators';
import { SelectionModel } from '@angular/cdk/collections';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { LoadingService } from '../../../core/services/loading.service';
import { LocationService } from '../../master/locations/services/locations.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { NotificationService } from '../../shared/notification.service';
import { BatchHistoryDialogComponent } from '../batch-history-dialog/batch-history-dialog.component';

@Component({
  selector: 'app-current-stock-component',
  standalone: true,
  imports: [MaterialModule, CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './current-stock-component.html',
  styleUrl: './current-stock-component.scss',
  animations: [
    trigger('detailExpand', [
      state('collapsed', style({ height: '0px', minHeight: '0' })),
      state('expanded', style({ height: '*' })),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),
  ],
})
export class CurrentStockComponent implements OnInit, AfterViewInit, OnDestroy {
  private loadingService = inject(LoadingService);
  private dialog = inject(MatDialog);
  private notification = inject(NotificationService);
  private locationService = inject(LocationService);
  private destroy$ = new Subject<void>();

  displayedColumns: string[] = ['select', 'productName', 'warehouseName', 'rackName', 'manufacturingDate', 'expiryDate', 'totalReceived', 'totalRejected', 'totalExpired', 'totalSold', 'availableStock', 'unitRate', 'actions'];
  stockDataSource = new MatTableDataSource<any>([]);

  selectedProductIds: number[] = [];
  expandedElement: any | null;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  resultsLength = 0;
  isLoadingResults = true;
  isDashboardLoading: boolean = true;
  private isFirstLoad: boolean = true;
  lowStockCount: number = 0;
  totalInventoryValue: number = 0;
  totalStockQty: number = 0;
  expiryAlertCount: number = 0;
  nearExpiryCount: number = 0;
  showPurgedHistory: boolean = false;
  searchValue: string = '';
  lastpurchaseOrderId!: number;

  innerPageIndex: number = 0;
  innerPageSize: number = 10;

  searchTerm: string = '';
  startDate: Date | null = null;
  endDate: Date | null = null;

  warehouses: any[] = [];
  racks: any[] = [];
  filteredRacks: any[] = [];
  selectedWarehouseId: string | null = null;
  selectedRackId: string | null = null;

  constructor(private inventoryService: InventoryService, private router: Router,
    public cdr: ChangeDetectorRef) { }

  selection = new SelectionModel<any>(true, []);

  ngOnInit() {
    this.loadLocations();

    // Re-fetch stock data when another component broadcasts an inventory change
    this.inventoryService.inventoryUpdate$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        console.log('🔄 Inventory updated elsewhere. Refreshing current stock...');
        this.applyDateFilter();
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadLocations() {
    this.locationService.getWarehouses().subscribe(data => {
      this.warehouses = data.filter(w => w.isActive);
      this.cdr.detectChanges();
    });
    this.locationService.getRacks().subscribe(data => {
      this.racks = data.filter(r => r.isActive);
      this.cdr.detectChanges();
    });
  }

  onWarehouseChange() {
    this.filteredRacks = this.selectedWarehouseId ? this.racks.filter(r => r.warehouseId === this.selectedWarehouseId) : [];
    this.selectedRackId = null;
    this.applyDateFilter();
  }

  ngAfterViewInit() {
    if (this.paginator) {
      this.sort.sortChange.subscribe(() => (this.paginator.pageIndex = 0));
    }
    this.isDashboardLoading = true;
    this.isFirstLoad = true;
    this.loadingService.setLoading(true);
    this.cdr.detectChanges();

    setTimeout(() => {
      // Dynamically create observable list based on whether paginator exists
      const eventStreams: any[] = [this.sort.sortChange];
      if (this.paginator) {
        eventStreams.push(this.paginator.page);
      }
      
      merge(...eventStreams)
        .pipe(
          startWith({}),
          switchMap(() => this.fetchDataStream()),
          map(data => {
            this.isLoadingResults = false;
            if (this.isFirstLoad) {
              this.isFirstLoad = false;
              this.isDashboardLoading = false;
              this.loadingService.setLoading(false);
            }
            if (data === null) return [];
            this.resultsLength = data.totalCount;
            this.handleDataUpdate(data.items);
            return data.items;
          }),
          catchError(() => {
            this.isLoadingResults = false;
            this.isDashboardLoading = false;
            this.loadingService.setLoading(false);
            return of([]);
          })
        ).subscribe();
    }, 500);
  }

  /** Selection Logic **/
  isAllSelected() {
    const numSelected = this.selection.selected.length;
    const numRows = this.stockDataSource.data.length;
    return numSelected === numRows;
  }

  masterToggle() {
    this.isAllSelected() ?
      this.selection.clear() :
      this.stockDataSource.data.forEach(row => this.selection.select(row));
  }

  private fetchDataStream() {
    this.isLoadingResults = true;
    return this.inventoryService.getCurrentStock(
      this.sort.active,
      this.sort.direction,
      this.paginator ? this.paginator.pageIndex : 0,
      this.paginator ? this.paginator.pageSize : 10, // Back to 10 as default if paginator was somehow missing
      this.searchValue,
      this.startDate,
      this.endDate,
      this.selectedWarehouseId,
      this.selectedRackId
    );
  }

  private handleDataUpdate(items: any) {
    if (items) {
      if (items.length > 0) this.lastpurchaseOrderId = items[0].lastPurchaseOrderId;
      const mappedData = (items || []).map((item: any) => {
        const hasMfgDate = item.manufacturingDate && item.manufacturingDate !== 'NA';
        const hasExpDate = item.expiryDate && item.expiryDate !== 'NA';
        return {
          ...item,
          currentStock: item.availableStock || item.currentStock || 0,
          isExpiryRequired: hasMfgDate || hasExpDate || item.isExpiryRequired || false,
        };
      });
      this.stockDataSource.data = mappedData;
      this.selection.clear(); // Clear selection on new data
      this.updateSummary(mappedData);
    }
    this.cdr.detectChanges();
  }

  updateSummary(data: any[]) {
    const stockItems = data.filter(item => item.availableStock > 0);
    this.lowStockCount = stockItems.filter(item => item.availableStock <= (item.minStockLevel || 10)).length;
    this.expiryAlertCount = stockItems.filter(item => this.isExpired(item.expiryDate)).length;
    this.nearExpiryCount = stockItems.filter(item => this.isNearExpiry(item.expiryDate)).length;
    this.totalInventoryValue = stockItems.reduce((acc, curr) => acc + (curr.availableStock * curr.lastRate), 0);
    this.totalStockQty = stockItems.reduce((acc, curr) => acc + (curr.availableStock || 0), 0);
    this.cdr.detectChanges();
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
    this.innerPageIndex = 0;
    this.cdr.detectChanges();
  }

  getPaginatedHistory(element: any): any[] {
    if (!element || !element.history) return [];
    
    // Filter history based on toggle
    let filteredHistory = element.history;
    if (!this.showPurgedHistory) {
      filteredHistory = element.history.filter((h: any) => 
        (h.receivedQty || 0) + (h.rejectedQty || 0) + (h.expiredQty || 0) > 0
      );
    }

    const start = this.innerPageIndex * this.innerPageSize;
    const end = start + this.innerPageSize;
    return filteredHistory.slice(start, end);
  }

  onInnerPageChange(event: any) {
    this.innerPageIndex = event.pageIndex;
    this.innerPageSize = event.pageSize;
    this.cdr.detectChanges();
  }

  onRemoveStock(historyItem: any, event: MouseEvent) {
    if (event) event.stopPropagation();
    const targetQty = historyItem.expiredQty > 0 ? historyItem.expiredQty : 
                 (historyItem.availableQty > 0 ? historyItem.availableQty : 
                 (historyItem.receivedQty - historyItem.rejectedQty));
    const productName = historyItem.productName || 'this item';
    
    this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Permanent Stock Removal',
        message: `Are you sure you want to <b>permanently delete</b> ${targetQty} units of ${productName}? <br><br> This will reduce your actual physical stock counts.`
      }
    }).afterClosed().subscribe(result => {
      if (result) {
        if (!targetQty || targetQty <= 0) {
          this.notification.showStatus(false, 'No stock available to remove.');
          return;
        }
        const payload = { productId: historyItem.productId, warehouseId: historyItem.warehouseId, rackId: historyItem.rackId, quantity: targetQty, expiryDate: historyItem.expiryDate };
        this.inventoryService.adjustStock(payload).subscribe({
          next: () => {
            this.inventoryService.notifyInventoryChange();
            this.notification.showStatus(true, 'Stock removed and history updated.');
            this.applyDateFilter();
          },
          error: (err) => this.notification.showStatus(false, err.error?.message || 'Error removing stock batch')
        });
      }
    });
  }

  onMoveToExpired(historyItem: any, event: MouseEvent) {
    if (event) event.stopPropagation();
    const targetQty = historyItem.expiredQty > 0 ? historyItem.expiredQty : 
                 (historyItem.availableQty > 0 ? historyItem.availableQty : 
                 (historyItem.receivedQty - historyItem.rejectedQty));
    const productName = historyItem.productName || 'this item';
    const sourceRack = historyItem.rackName || 'Current Rack';

    this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Smart Stock Move',
        message: `Do you want to move <b>${targetQty} units</b> of ${productName} from <b>${sourceRack}</b> to the <b>Expired Rack (Rack E1)</b>?`
      }
    }).afterClosed().subscribe(result => {
      if (result) {
        if (!targetQty || targetQty <= 0) {
          this.notification.showStatus(false, 'No stock available to move.');
          return;
        }
        const payload = { productId: historyItem.productId, sourceWarehouseId: historyItem.warehouseId, sourceRackId: historyItem.rackId, sourceRackName: historyItem.rackName, quantity: targetQty, expiryDate: historyItem.expiryDate };
        this.inventoryService.moveStockToExpiredRack(payload).subscribe({
          next: () => {
            this.inventoryService.notifyInventoryChange();
            this.notification.showStatus(true, 'Batch moved to Expired Products rack successfully.');
            this.applyDateFilter();
          },
          error: (err) => this.notification.showStatus(false, err.error?.message || 'Failed to move batch to expired rack.')
        });
      }
    });
  }

  onPurgeAllExpired() {
    const expiredItems = this.stockDataSource.data.filter(item => this.isExpired(item.expiryDate));
    if (expiredItems.length === 0) {
      this.notification.showStatus(false, 'No expired items found to purge.');
      return;
    }

    this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Purge All Expired',
        message: `Are you sure you want to <b>purge ALL ${expiredItems.length}</b> expired product batches?`
      }
    }).afterClosed().subscribe(result => {
      if (result) {
        this.notification.showStatus(true, 'Consolidated purge in progress...');
        // Logic for bulk purge can be added here
      }
    });
  }

  exportSelected() { 
    if (this.selection.selected.length === 0) {
      this.notification.showStatus(false, 'Please select items to export.');
      return;
    }
    const ids = this.selection.selected.map(s => s.productId);
    this.inventoryService.downloadStockReport(ids).subscribe(blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'StockReport.xlsx';
      a.click();
    });
  }
  navigateToPO() { this.router.navigate(['/app/inventory/polist/add']); }
  onRefillNow(item: any) {
    if (!item) return;
    
    // Mapping CurrentStock item format to what PO Form addRefillRow expects
    const refillPayload = {
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      unit: item.unit,
      rate: item.lastRate || 0,
      gstPercent: item.gstPercent ?? item.defaultGst ?? 18,
      currentStock: item.availableStock || item.currentStock || 0,
      isExpiryRequired: item.isExpiryRequired || false,
      suggestedQty: item.minStockLevel ? Math.max(item.minStockLevel * 2, 10) : 10
    };

    console.log('🔄 Refilling Item:', refillPayload);
    this.router.navigate(['/app/inventory/polist/add'], { 
      state: { refillData: refillPayload } 
    });
  }
  viewLiveLocation(item: any) {
    const qty = item.availableStock ?? (item.receivedQty - item.rejectedQty);
    this.dialog.open(LocationTrackerDialogComponent, {
      width: '450px',
      data: {
        warehouseName: item.warehouseName,
        rackName: item.rackName,
        productId: item.productId,
        description: `Current quantity at this location: ${qty}`
      }
    });
  }

  openBatchHistory(h: any) {
    this.dialog.open(BatchHistoryDialogComponent, {
      width: '800px',
      data: h
    });
  }
}