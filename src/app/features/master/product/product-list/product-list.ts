import { ChangeDetectorRef, Component, OnInit, ViewChild, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { MaterialModule } from '../../../../shared/material/material/material-module';
import { Product } from '../model/product.model';
import { ProductService } from '../service/product.service';
import { ServerDatagridComponent } from '../../../../shared/components/server-datagrid-component/server-datagrid-component';
import { MatDialog } from '@angular/material/dialog';
import { GridRequest } from '../../../../shared/models/grid-request.model';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { StatusDialogComponent } from '../../../../shared/components/status-dialog-component/status-dialog-component';
import { LoadingService } from '../../../../core/services/loading.service';
import { SummaryStat, SummaryStatsComponent } from '../../../../shared/components/summary-stats-component/summary-stats-component';
import { PermissionService } from '../../../../core/services/permission.service';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, MaterialModule, ServerDatagridComponent, SummaryStatsComponent],
  providers: [DatePipe],
  templateUrl: './product-list.html',
  styleUrl: './product-list.scss',
})
export class ProductList implements OnInit {
  summaryStats: SummaryStat[] = [];
  private route = inject(ActivatedRoute);
  private permissionService = inject(PermissionService);

  loading = false;
  isDashboardLoading = true;
  private isFirstLoad = true;
  private loadingService = inject(LoadingService);
  totalCount = 0;
  selectedRows: any[] = [];
  lastRequest!: GridRequest;
  isLowStockFilterActive = false;

  canAdd: boolean = true;
  canDelete: boolean = true;

  @ViewChild(ServerDatagridComponent)
  grid!: ServerDatagridComponent<any>;

  data: Product[] = [];

  constructor(
    private service: ProductService,
    private router: Router,
    private dialog: MatDialog,
    private datePipe: DatePipe,
    private cdr: ChangeDetectorRef) { }

  columns = [
    { field: 'categoryName', header: 'Category', sortable: true, width: 150, visible: true },
    { field: 'subcategoryName', header: 'Subcategory', sortable: true, width: 140, visible: true },
    { field: 'productName', header: 'Product', sortable: true, width: 150, visible: true },
    { field: 'sku', header: 'SKU', sortable: true, width: 75, visible: true },
    { field: 'unit', header: 'Unit', sortable: true, width: 75, visible: true },

    // UPDATED: Quick Order Column Add kiya hai
    {
      field: 'reorder',
      header: 'Order',
      width: 100,
      visible: true,
      cell: (row: any) => row.currentStock <= row.minStock ? '🛒 Reorder' : '-',
      action: (row: any) => this.navigateToCreatePO(row)
    },

    { field: 'defaultGst', header: 'GST %', sortable: true, width: 75, visible: true },
    { field: 'hsnCode', header: 'HSN Code', sortable: true, width: 80, visible: true },
    { field: 'minStock', header: 'Min Stock', sortable: true, width: 80, visible: true },
    { field: 'currentStock', header: 'Current Stock', sortable: true, width: 80, visible: true },
    { field: 'trackInventory', sortable: true, width: 75, visible: true, header: 'Track Inv', cell: (row: any) => row.trackInventory ? 'Yes' : 'No' },
    {
      field: 'createdAt',
      header: 'Created On',
      sortable: true, width: 120, visible: true,
      cell: (row: any) =>
        row.createdAt ? this.datePipe.transform(row.createdAt, 'dd-MMM-yyyy') : '-'
    }
  ];

  ngOnInit(): void {
    this.canAdd = this.permissionService.hasPermission('CanAdd');
    this.canDelete = this.permissionService.hasPermission('CanDelete');

    // Global loader ON
    this.isDashboardLoading = true;
    this.isFirstLoad = true;
    this.loadingService.setLoading(true);
    this.cdr.detectChanges();

    this.route.queryParams.subscribe(params => {
      this.isLowStockFilterActive = params['filter'] === 'lowstock';

      this.loadPriceLists({
        pageNumber: 1,
        pageSize: 10,
        sortDirection: 'desc'
      });
    });

    // Safety timeout - force stop loader after 10 seconds
    setTimeout(() => {
      if (this.isDashboardLoading) {
        console.warn('[ProductList] Force stopping loader after 10s timeout');
        this.isDashboardLoading = false;
        this.isFirstLoad = false;
        this.loadingService.setLoading(false);
        this.cdr.detectChanges();
      }
    }, 10000);
  }

  loadPriceLists(request: GridRequest): void {
    this.loading = true;
    this.lastRequest = request;
    this.cdr.detectChanges();

    const apiCall: any = this.isLowStockFilterActive
      ? this.service.getLowStockProducts()
      : this.service.getPaged(request);

    apiCall.subscribe({
      next: (res: any) => {
        this.data = this.isLowStockFilterActive ? (res as any) : res.items;
        this.totalCount = this.isLowStockFilterActive ? this.data.length : res.totalCount;

        // Calculate Low Stock Count
        const lowStockCount = this.data.filter(p => p.currentStock <= p.minStock).length;

        // Update Summary Stats
        this.summaryStats = [
          { label: 'Total Products', value: this.totalCount, icon: 'inventory_2', type: 'total' },
          {
            label: 'Low Stock',
            value: lowStockCount,
            icon: 'warning',
            type: lowStockCount > 0 ? 'overdue' : 'active',
            badge: lowStockCount > 0 ? 'Action Required' : 'Healthy'
          },
          { label: 'Organization', value: 'Master Data', icon: 'account_tree', type: 'info' }
        ];

        this.loading = false;

        // Turn off global loader on first load
        if (this.isFirstLoad) {
          this.isFirstLoad = false;
          this.isDashboardLoading = false;
          this.loadingService.setLoading(false);
        }
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error(err);
        this.loading = false;

        // Turn off global loader on first load
        if (this.isFirstLoad) {
          this.isFirstLoad = false;
          this.isDashboardLoading = false;
          this.loadingService.setLoading(false);
        }
        this.cdr.detectChanges();
      }
    });
  }

  // NAYA: Purchase Order page par redirect karne ke liye
  navigateToCreatePO(row: any) {
    if (row.currentStock <= row.minStock) {
      const refillData = {
        productName: row.productName,
        productId: row.id,
        unit: row.unit,
        rate: row.basePurchasePrice || row.rate || 0,
        gstPercent: row.defaultGst || row.gstPercent || 0,
        suggestedQty: row.minStock - row.currentStock > 0 ? row.minStock - row.currentStock : 10
      };

      this.router.navigate(['/app/inventory/polist/add'], {
        state: { refillData }
      });
    }
  }

  // BULK REORDER: Selected products ko PO form mein transfer karne ke liye
  bulkReorder() {
    if (this.selectedRows.length === 0) return;

    const refillData = this.selectedRows.map(row => ({
      productName: row.productName,
      productId: row.id,
      unit: row.unit,
      rate: row.basePurchasePrice || row.rate || 0,
      gstPercent: row.defaultGst || row.gstPercent || 0,
      suggestedQty: row.minStock - row.currentStock > 0 ? row.minStock - row.currentStock : 10
    }));

    this.router.navigate(['/app/inventory/polist/add'], {
      state: { refillData }
    });
  }

  clearFilter(): void {
    this.router.navigate(['/app/master/products']);
  }

  onEdit(row: any): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Edit Product',
        message: `Are you sure you want to edit product: ${row.productName}?`,
        confirmText: 'Yes, Edit'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.router.navigate(['/app/master/products/edit', row.id]);
      }
    });
  }

  deleteProduct(category: any): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'Confirm Delete', message: 'Are you sure you want to delete this product list?' }
    })
      .afterClosed().subscribe(confirm => {
        if (!confirm) return;
        this.loading = true;
        this.service.delete(category.id).subscribe({
          next: (res: any) => {
            this.loading = false;
            this.cdr.detectChanges();
            this.dialog.open(StatusDialogComponent, { data: { isSuccess: true, message: res.message } });
            this.loadPriceLists(this.lastRequest);
          },
          error: (err: any) => {
            this.loading = false;
            this.dialog.open(StatusDialogComponent, { data: { isSuccess: false, message: err?.error?.message || 'Unable to delete' } });
          }
        });
      });
  }

  reloadGrid(): void {
    this.loadPriceLists(this.lastRequest);
  }

  confirmBulkDelete(): void {
    if (!this.selectedRows.length) return;
    this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: { title: 'Delete product List', message: `Are you sure you want to delete ${this.selectedRows.length} selected items?` }
    }).afterClosed().subscribe(confirm => {
      if (!confirm) return;
      const ids = this.selectedRows.map(x => x.id);
      this.loading = true;
      this.service.deleteMany(ids).subscribe({
        next: (res: any) => {
          this.loading = false;
          this.cdr.detectChanges();
          this.grid.clearSelection();
          this.dialog.open(StatusDialogComponent, { data: { isSuccess: true, message: res.message } });
          this.loadPriceLists(this.lastRequest);
        },
        error: (err: any) => {
          this.loading = false;
          this.dialog.open(StatusDialogComponent, { data: { isSuccess: false, message: err?.error?.message || 'Error' } });
        }
      });
    });
  }

  onSelectionChange(rows: any[]) {
    this.selectedRows = rows;
  }
}