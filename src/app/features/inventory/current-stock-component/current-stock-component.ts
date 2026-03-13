import { Component, OnInit, ViewChild, AfterViewInit, ChangeDetectorRef, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { LocationTrackerDialogComponent } from '../purchase-return/location-tracker-dialog/location-tracker-dialog.component';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { CommonModule } from '@angular/common';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { InventoryService } from '../service/inventory.service';
import { Router } from '@angular/router';
import { merge, of } from 'rxjs';
import { startWith, switchMap, map, catchError } from 'rxjs/operators';
import { SelectionModel } from '@angular/cdk/collections';
// Animation imports for smooth expansion
import { animate, state, style, transition, trigger } from '@angular/animations';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { LoadingService } from '../../../core/services/loading.service';
import { LocationService } from '../../master/locations/services/locations.service';

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
export class CurrentStockComponent implements OnInit, AfterViewInit {
  private loadingService = inject(LoadingService);
  private dialog = inject(MatDialog);

  // ✅ Updated: Added warehouse and rack in correct sequence for the table
  displayedColumns: string[] = ['select', 'productName', 'warehouseName', 'rackName', 'manufacturingDate', 'expiryDate', 'totalReceived', 'totalRejected', 'totalSold', 'availableStock', 'unitRate', 'actions'];
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
  expiryAlertCount: number = 0;  // Expired + Near-expiry items count
  searchValue: string = '';
  lastpurchaseOrderId!: number;

  // Inner pagination for expanded history
  innerPageIndex: number = 0;
  innerPageSize: number = 5;

  searchTerm: string = '';
  startDate: Date | null = null;
  endDate: Date | null = null;

  // 🆕 New Filters
  private locationService = inject(LocationService);
  warehouses: any[] = [];
  racks: any[] = [];
  filteredRacks: any[] = [];
  selectedWarehouseId: string | null = null;
  selectedRackId: string | null = null;

  viewLiveLocation(item: any) {
    if (!item) return;

    // Fetch full warehouse info to get description if possible
    this.locationService.getWarehouses().subscribe((warehouses: any[]) => {
      const warehouse = warehouses.find((w: any) => w.name === item.warehouseName);

      this.dialog.open(LocationTrackerDialogComponent, {
        width: '500px',
        data: {
          warehouseName: item.warehouseName,
          rackName: item.rackName,
          description: warehouse?.description || 'Daily audit required for this zone. Ensure stock is organized by SKU.',
          productId: item.productId
        },
        panelClass: 'live-location-dialog'
      });
    });
  }

  constructor(private inventoryService: InventoryService, private router: Router,
    private cdr: ChangeDetectorRef) { }

  selection = new SelectionModel<any>(true, []);

  ngOnInit() {
    this.loadLocations();
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
    if (this.selectedWarehouseId) {
      this.filteredRacks = this.racks.filter(r => r.warehouseId === this.selectedWarehouseId);
    } else {
      this.filteredRacks = [];
    }
    this.selectedRackId = null;
    this.applyDateFilter(); // Re-fetch
  }

  ngAfterViewInit() {
    this.sort.sortChange.subscribe(() => (this.paginator.pageIndex = 0));

    // Global loader ON - same as dashboard/po-list pattern
    this.isDashboardLoading = true;
    this.isFirstLoad = true;
    this.loadingService.setLoading(true);
    this.cdr.detectChanges();

    // Initializing data stream with filters
    setTimeout(() => {
      merge(this.sort.sortChange, this.paginator.page)
        .pipe(
          startWith({}),
          switchMap(() => {
            return this.fetchDataStream();
          }),
          map(data => {
            this.isLoadingResults = false;

            // Pehli baar load hone ke baad global loader OFF
            if (this.isFirstLoad) {
              this.isFirstLoad = false;
              this.isDashboardLoading = false;
              this.loadingService.setLoading(false);
            }

            if (!data) return [];
            this.resultsLength = data.totalCount;
            return data.items;
          })
        ).subscribe(items => {
          this.handleDataUpdate(items);
        });
    }, 0);

    // Safety timeout - force stop loader after 10 seconds
    setTimeout(() => {
      if (this.isDashboardLoading) {
        console.warn('[CurrentStock] Force stopping loader after 10s timeout');
        this.isDashboardLoading = false;
        this.isFirstLoad = false;
        this.loadingService.setLoading(false);
        this.cdr.detectChanges();
      }
    }, 10000);
  }

  // Helper to fetch data using all current filters
  private fetchDataStream() {
    this.isLoadingResults = true;
    this.cdr.detectChanges();
    return this.inventoryService.getCurrentStock(
      this.sort.active,
      this.sort.direction,
      this.paginator.pageIndex,
      this.paginator.pageSize,
      this.searchValue, // Current Global Search
      this.startDate,   // New Date Filter
      this.endDate,     // New Date Filter
      this.selectedWarehouseId,
      this.selectedRackId
    ).pipe(
      catchError(() => {
        this.isLoadingResults = false;

        // Pehli baar error pe bhi global loader OFF
        if (this.isFirstLoad) {
          this.isFirstLoad = false;
          this.isDashboardLoading = false;
          this.loadingService.setLoading(false);
        }
        return of(null);
      })
    );
  }

  // Unified data handler to keep code clean
  private handleDataUpdate(items: any) {
    if (items) {
      if (items.length > 0) {
        this.lastpurchaseOrderId = items[0].lastPurchaseOrderId;
      }
      const mappedData = items.map((item: any) => {
        // Note: ReceivedDate is now returned as IST from backend (UTC+5:30 conversion done server-side)
        // No manual timezone adjustment needed here anymore

        // Check if dates exist (not NA) to determine if expiry is required
        const hasMfgDate = item.manufacturingDate && item.manufacturingDate !== 'NA' && item.manufacturingDate !== null;
        const hasExpDate = item.expiryDate && item.expiryDate !== 'NA' && item.expiryDate !== null;
        const hasAnyDate = hasMfgDate || hasExpDate;

        return {
          productId: item.productId,
          productName: item.productName,
          warehouseName: item.warehouseName,
          rackName: item.rackName,
          totalReceived: item.totalReceived,
          totalRejected: item.totalRejected,
          totalSold: item.totalSold || 0,
          availableStock: item.availableStock,
          currentStock: item.availableStock || item.currentStock,
          unit: item.unit,
          lastRate: item.lastRate,
          minStockLevel: item.minStockLevel,
          manufacturingDate: item.manufacturingDate,
          expiryDate: item.expiryDate,
          // If dates exist, set isExpiryRequired to true; otherwise use backend value
          isExpiryRequired: hasAnyDate || item.isExpiryRequired || item.requiresExpiry || false,
          history: item.history
        };
      });
      this.stockDataSource.data = mappedData;
      this.updateSummary(mappedData);
    }
    this.cdr.detectChanges();
  }

  // Triggered from HTML Apply Button
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

  toggleRow(element: any) {
    if (this.expandedElement === element) {
      this.expandedElement = null;
    } else {
      this.expandedElement = element;
      this.innerPageIndex = 0; // Reset paging when expanding new row
    }
    this.cdr.detectChanges();
  }

  onInnerPageChange(event: any) {
    this.innerPageIndex = event.pageIndex;
    this.innerPageSize = event.pageSize;
    this.cdr.detectChanges();
  }

  updateSummary(data: any[]) {
    this.lowStockCount = data.filter(item => item.availableStock <= (item.minStockLevel || 10)).length;
    // Count items where expiry date is today/past OR within 15 days
    this.expiryAlertCount = data.filter(item =>
      this.isExpired(item.expiryDate) || this.isNearExpiry(item.expiryDate)
    ).length;
    this.totalInventoryValue = data.reduce((acc, curr) => acc + (curr.availableStock * curr.lastRate), 0);
    this.totalStockQty = data.reduce((acc, curr) => acc + (curr.availableStock || 0), 0);
    this.cdr.detectChanges();
  }

  applyFilter(event: Event) {
    this.searchValue = (event.target as HTMLInputElement).value.trim().toLowerCase();
    this.paginator.pageIndex = 0;
    this.sort.sortChange.emit();
    this.cdr.detectChanges();
  }

  navigateToPO() {
    this.router.navigate(['/app/inventory/polist/add']).then(success => {
      if (!success) console.error("Navigation failed!");
    });
  }

  onRefillNow(item: any) {
    console.log('🔄 Refill Data from Current Stock:', {
      productName: item.productName,
      mfgDate: item.manufacturingDate,
      expDate: item.expiryDate,
      isExpiryRequired: item.isExpiryRequired
    });

    const refillData = {
      productId: item.productId,
      productName: item.productName,
      unit: item.unit || 'PCS',
      rate: item.lastRate || 0,
      suggestedQty: 10,
      currentStock: item.currentStock || item.availableStock || 0,
      availableStock: item.currentStock || item.availableStock || 0,
      isExpiryRequired: item.isExpiryRequired || false,
      manufacturingDate: item.manufacturingDate || null,
      expiryDate: item.expiryDate || null,
      lastpurchaseOrderId: this.lastpurchaseOrderId
    };

    console.log('✅ Sending refillData to Quick Purchase:', refillData);

    // Check if coming from Quick Inventory or Standard Inventory
    const currentUrl = this.router.url;
    const isQuickInventory = currentUrl.includes('/quick-inventory/');
    
    if (isQuickInventory) {
      this.router.navigate(['/app/quick-inventory/purchase/add'], {
        state: { refillData }
      });
    } else {
      this.router.navigate(['/app/inventory/polist/add'], {
        state: { refillData }
      });
    }
  }

  isAllSelected() {
    const numSelected = this.selection.selected.length;
    const numRows = this.stockDataSource.data.length;
    return numSelected === numRows;
  }

  masterToggle() {
    this.isAllSelected() ?
      this.selection.clear() :
      this.stockDataSource.data.forEach(row => this.selection.select(row));
    this.cdr.detectChanges();
  }

  onBulkRefill() {
    if (!this.selection.hasValue()) return;
    const refillItems = this.selection.selected.map(item => ({
      productId: item.productId,
      productName: item.productName,
      unit: item.unit || 'PCS',
      rate: item.lastRate || 0,
      suggestedQty: 10,
      currentStock: item.currentStock || item.availableStock || 0,
      availableStock: item.currentStock || item.availableStock || 0,
      isExpiryRequired: item.isExpiryRequired || false,
      manufacturingDate: item.manufacturingDate || null,
      expiryDate: item.expiryDate || null
    }));
    this.cdr.detectChanges();

    // Check if coming from Quick Inventory or Standard Inventory
    const currentUrl = this.router.url;
    const isQuickInventory = currentUrl.includes('/quick-inventory/');
    
    if (isQuickInventory) {
      this.router.navigate(['/app/quick-inventory/purchase/add'], {
        state: { refillItems: refillItems }
      });
    } else {
      this.router.navigate(['/app/inventory/polist/add'], {
        state: { refillItems: refillItems }
      });
    }
  }

  onCheckboxChange(productId: number, event: any) {
    if (event.checked) {
      this.selectedProductIds.push(productId);
    } else {
      this.selectedProductIds = this.selectedProductIds.filter(id => id !== productId);
    }
  }

  exportSelected() {
    const selectedIds = this.selection.selected.map(row => row.productId);
    if (selectedIds.length === 0) {
      console.warn("No items selected for export");
      return;
    }
    this.inventoryService.downloadStockReport(selectedIds).subscribe({
      next: (blob) => {
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        const dateStr = new Date().toISOString().split('T')[0];
        a.download = `Stock_Report_${dateStr}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(objectUrl);
      },
      error: (err) => {
        console.error("Download failed:", err);
      }
    });
  }

  isLowStock(element: any): boolean {
    // Agar backend value 0 hai ya null, toh default 5 pics par alert trigger hoga
    const threshold = element.minStockLevel > 0 ? element.minStockLevel : 5;
    return element.availableStock <= threshold;
  }

  isExpired(date: any): boolean {
    if (!date) return false;
    const expDate = new Date(date);
    expDate.setHours(0, 0, 0, 0); // normalize to start of day
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // <= means: agar aaj ka din bhi expiry date hai toh RED (expired)
    return expDate <= today;
  }

  isNearExpiry(date: any): boolean {
    if (!date) return false;
    const expDate = new Date(date);
    expDate.setHours(0, 0, 0, 0); // normalize
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    // > 0: aaj ka din expired hai (red), sirf future dates orange hongi (1-15 days)
    return diffDays > 0 && diffDays <= 15;
  }
}