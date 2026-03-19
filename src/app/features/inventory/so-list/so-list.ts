import { ChangeDetectorRef, Component, inject, OnInit, ViewChild } from '@angular/core';
import { LoadingService } from '../../../core/services/loading.service';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { InventoryService } from '../service/inventory.service';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../shared/notification.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { Router } from '@angular/router';
import { SaleOrderDetailDialog } from '../sale-order-detail-dialog/sale-order-detail-dialog';
import { StatusDialogComponent } from '../../../shared/components/status-dialog-component/status-dialog-component';
import { SaleOrderService } from '../service/saleorder.service';
import { GatePassService } from '../gate-pass/services/gate-pass.service';
import { SelectionModel } from '@angular/cdk/collections';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { FinanceService } from '../../finance/service/finance.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { PermissionService } from '../../../core/services/permission.service';
import { PermissionDirective } from '../../../core/directives/permission.directive';
import { EnterpriseHierarchicalGridComponent } from '../../../shared/components/enterprise-hierarchical-grid-component/enterprise-hierarchical-grid-component';


@Component({
  selector: 'app-so-list',
  standalone: true,
  imports: [MaterialModule, CommonModule, 
    EnterpriseHierarchicalGridComponent, PermissionDirective],

  templateUrl: './so-list.html',
  styleUrl: './so-list.scss',
  providers: [DatePipe, CurrencyPipe]
})
export class SoList implements OnInit {
  private loadingService = inject(LoadingService);

  soColumns: any[] = [];
  itemColumns: any[] = [];
  userRole: any;
  highlightedSoId: any = null;
  // ...existing code...
  canEdit: boolean = true;
  canDelete: boolean = true;
  canBulkDispatch: boolean = true;
  canBulkReceipt: boolean = true;


  dataSource = new MatTableDataSource<any>([]);
  isAdmin: boolean = false;
  isLoading: boolean = true;
  isDashboardLoading: boolean = true;
  private isFirstLoad: boolean = true;

  private cdr = inject(ChangeDetectorRef);
  public router = inject(Router);
  private authService = inject(AuthService);
  private notification = inject(NotificationService);

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  selection = new SelectionModel<any>(true, []);
  totalRecords: number = 0;
  searchKey: string = "";
  paymentFilter: string = "";

  // Stats
  totalSalesAmount: number = 0;
  pendingDispatchCount: number = 0;
  unpaidOrdersCount: number = 0;

  constructor(
    private inventoryService: InventoryService,
    private saleOrderService: SaleOrderService,
    private gatePassService: GatePassService,
    private financeService: FinanceService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private permissionService: PermissionService,
    private datePipe: DatePipe,
    private currencyPipe: CurrencyPipe
  ) { }

  currentGridState: any = {};

  onGridStateChange(state: any) {
    this.currentGridState = state;
    this.loadOrders();
  }

  onDeleteSingleRecord(row: any) {
    this.deleteOrder(row);
  }

  onGridSelectionChange(selectedRows: any[]) {
    this.selection.clear();
    if (selectedRows && selectedRows.length > 0) {
      this.selection.select(...selectedRows);
    }
    this.cdr.markForCheck();
    this.cdr.detectChanges();
  }

  handleGridAction(event: { action: string, row: any }) {
    const row = event.row;
    switch (event.action) {
      case 'VIEW':
        this.viewOrder(row);
        break;
      case 'EDIT':
        this.editOrder(row);
        break;
      case 'DELETE':
        this.deleteOrder(row);
        break;
      case 'CONFIRM':
        this.confirmOrder(row);
        break;
      case 'CREATE_OUTWARD':
        this.createGatePass(row);
        break;
      case 'PAYMENT':
        this.collectPayment(row);
        break;
      case 'RECEIPT':
        this.downloadReceipt(row);
        break;
      case 'RETURN':
        this.returnOrder(row);
        break;
      default:
        console.warn('Unhandled action:', event.action);
    }
  }

  onRowExpanded(row: any) {
    if (!row.items || row.items.length === 0) {
      row.isLoadingItems = true;
      this.saleOrderService.getSaleOrderItems(row.id).subscribe({
        next: (items) => {
          row.items = items;
          row.isLoadingItems = false;
          this.cdr.detectChanges();
        },
        error: () => {
          row.isLoadingItems = false;
          this.cdr.detectChanges();
        }
      });
    }
  }

  private initColumns() {
    this.soColumns = [
      { field: 'soNumber', header: 'SO No.', sortable: true, isFilterable: true, isResizable: true, width: 135 },
      { 
        field: 'gatePassNo', 
        header: 'Gate Pass', 
        sortable: true, 
        isFilterable: true, 
        isResizable: true, 
        width: 180,
        cell: (row: any) => row.gatePassNo || '—'
      },
      { 
        field: 'soDate', 
        header: 'Date', 
        sortable: true, 
        isFilterable: true, 
        isResizable: true, 
        width: 170, 
        cell: (row: any) => this.datePipe.transform(row.soDate, 'dd/MM/yyyy h:mm a')
      },
      { field: 'customerName', header: 'Customer', sortable: true, isFilterable: true, isResizable: true, width: 180 },
      { field: 'totalQty', header: 'Qty', sortable: true, isResizable: true, width: 180 },
      { field: 'grandTotal', header: 'Amount', sortable: true, isResizable: true, width: 120 },
      { field: 'status', header: 'Order Status', sortable: true, isFilterable: true, isResizable: true, width: 180 },
      { field: 'paymentStatus', header: 'Payment', sortable: true, isFilterable: true, isResizable: true, width: 180 },
      { field: 'createdBy', header: 'Created By', sortable: true, isResizable: true, width: 150 },
      { field: 'remarks', header: 'Remarks', isResizable: true, width: 180 }
    ];
    this.itemColumns = [
      { field: 'productName', header: 'Product Name', isResizable: true, width: 220 },
      { field: 'qty', header: 'Qty', isResizable: true, width: 80 },
      { field: 'unit', header: 'Unit', isResizable: true, width: 80 },
      { 
        field: 'rate', 
        header: 'Rate', 
        isResizable: true, 
        width: 100, 
        cell: (row: any) => this.currencyPipe.transform(row.rate, 'INR') 
      },
      { 
        field: 'discountPercent', 
        header: 'Disc%', 
        isResizable: true, 
        width: 80, 
        cell: (row: any) => (row.discountPercent || 0) + '%' 
      },
      { 
        field: 'gstPercent', 
        header: 'GST%', 
        isResizable: true, 
        width: 80, 
        cell: (row: any) => (row.gstPercent || 0) + '%' 
      },
      { 
        field: 'warehouseName', 
        header: 'Warehouse', 
        isResizable: true, 
        width: 130,
        cell: (row: any) => row.warehouseName || row.WarehouseName || '—'
      },
      { 
        field: 'rackName', 
        header: 'Rack', 
        isResizable: true, 
        width: 110,
        cell: (row: any) => row.rackName || row.RackName || '—'
      },
      { 
        field: 'manufacturingDate', 
        header: 'Mfg Date', 
        isResizable: true, 
        width: 110, 
        cell: (row: any) => row.manufacturingDate ? this.datePipe.transform(row.manufacturingDate, 'dd/MM/yyyy') : '—'
      },
      { 
        field: 'expiryDate', 
        header: 'Exp Date', 
        isResizable: true, 
        width: 110, 
        cell: (row: any) => row.expiryDate ? this.datePipe.transform(row.expiryDate, 'dd/MM/yyyy') : '—'
      },
      { 
        field: 'total', 
        header: 'Total', 
        isResizable: true, 
        width: 120, 
        cell: (row: any) => this.currencyPipe.transform(row.total || (row.qty * row.rate), 'INR') 
      }
    ];
  }

  // ...existing code...

  canAdd: boolean = true;

  // --- Column Resizing Logic ---
  private resizingColumn: string = '';
  private startX: number = 0;
  private startWidth: number = 0;

  onResizeColumn(event: MouseEvent, column: string) {
    event.stopPropagation();
    event.preventDefault();
    this.resizingColumn = column;
    this.startX = event.pageX;

    const columnEl = (event.target as HTMLElement).parentElement;
    if (columnEl) {
      this.startWidth = columnEl.offsetWidth;
    }

    const mouseMoveListener = (e: MouseEvent) => this.onMouseMove(e);
    const mouseUpListener = () => {
      this.resizingColumn = '';
      window.removeEventListener('mousemove', mouseMoveListener);
      window.removeEventListener('mouseup', mouseUpListener);
    };

    window.addEventListener('mousemove', mouseMoveListener);
    window.addEventListener('mouseup', mouseUpListener);
  }

  private onMouseMove(event: MouseEvent) {
    if (!this.resizingColumn) return;

    const deltaX = event.pageX - this.startX;
    const newWidth = Math.max(50, this.startWidth + deltaX); // Min width 50px

    // Apply width via CSS Variables
    const root = document.documentElement;
    document.body.style.setProperty(`--col-${this.resizingColumn}-width`, `${newWidth}px`);
    this.cdr.detectChanges();
  }

  ngOnInit() {
    this.initColumns();
    this.canAdd = this.permissionService.hasPermission('CanAdd');
    this.canEdit = this.permissionService.hasPermission('CanEdit');
    this.canDelete = this.permissionService.hasPermission('CanDelete');
    this.canBulkDispatch = this.permissionService.hasAction('BULK_DISPATCH');
    this.canBulkReceipt = this.permissionService.hasAction('BULK_RECEIPT');

    this.userRole = this.authService.getUserRole();

    this.checkUserRole();

    // Global loader ON - same as dashboard/po-list pattern
    this.isDashboardLoading = true;
    this.isFirstLoad = true;
    this.loadingService.setLoading(true);
    this.cdr.detectChanges();

    // this.loadOrders(); // Triggered by grid's triggerDataLoad -> onGridStateChange

    // Safety timeout - force stop loader after 10 seconds
    setTimeout(() => {
      if (this.isDashboardLoading) {
        console.warn('[SoList] Force stopping loader after 10s timeout');
        this.isDashboardLoading = false;
        this.isFirstLoad = false;
        this.loadingService.setLoading(false);
        this.cdr.detectChanges();
      }
    }, 10000);
  }

  // --- Selection Helper Logic (New) ---
  isAllSelected() {
    const numSelected = this.selection.selected.length;
    const selectableRows = this.dataSource.data.filter(row => row.isDispatchPending);
    return numSelected === selectableRows.length && selectableRows.length > 0;
  }

  masterToggle() {
    if (this.isAllSelected()) {
      this.selection.clear();
    } else {
      this.dataSource.data.forEach(row => {
        if (row.isDispatchPending) {
          this.selection.select(row);
        }
      });
    }
  }

  getSelectedIds(): string[] {
    return this.selection.selected.map(row => row.id);
  }

  get canShowBulkDispatch(): boolean {
    return this.selection.selected.length > 1 && this.selection.selected.every(r =>
      r.status?.toLowerCase() === 'confirmed' &&
      r.paymentStatus === 'Paid' &&
      r.isDispatchPending
    );
  }

  get canShowBulkDelete(): boolean {
    return this.selection.selected.length > 1 && this.selection.selected.every(r =>
      r.status?.toLowerCase() === 'draft'
    );
  }

  get canShowBulkPayment(): boolean {
    const selected = this.selection.selected;
    if (selected.length <= 1) return false;

    const customerId = selected[0].customerId;
    return selected.every(r => 
      r.customerId === customerId && 
      r.status?.toLowerCase() === 'confirmed' && 
      (r.paymentStatus === 'Unpaid' || r.paymentStatus === 'Partial')
    );
  }

  get canShowExport(): boolean {
    return false; // User requested to replace Export Excel with Bulk Delete
  }

  // --- Existing Methods ---

  checkUserRole() {
    const role = localStorage.getItem('userRole');
    this.isAdmin = role === 'Admin' || role === 'Manager';
  }
  loadOrders() {
    this.isLoading = true;

    // Use currentGridState if available, else defaults
    const pageIndex = (this.currentGridState.pageIndex ?? 0) + 1;
    const pageSize = this.currentGridState.pageSize ?? 10;
    const sortField = this.currentGridState.sortField ?? 'soDate';
    const sortDir = this.currentGridState.sortOrder ?? 'desc';
    const filter = this.currentGridState.globalSearch || this.searchKey;

    forkJoin({
      orders: this.saleOrderService.getSaleOrders(pageIndex, pageSize, sortField, sortDir, this.searchKey),
      pendingDues: this.financeService.getPendingCustomerDues().pipe(catchError(() => of([]))),
      gatePasses: this.gatePassService.getGatePassesPaged({ pageSize: 100, sortField: 'CreatedAt', sortOrder: 'desc' }).pipe(catchError(() => of({ data: [] })))
    }).subscribe({
      next: (res: any) => {
        const orderData = res.orders;
        const pendingDues = res.pendingDues;
        const recentGatePasses = res.gatePasses?.data || [];

        this.totalRecords = orderData.totalCount;
        const items = orderData.data || [];

        items.forEach((item: any) => {
          // QuickOrders (SO-Q) ka gatepass se koi matlab nahi, wo hamesha dispatched maane jayenge
          const isQuick = item.soNumber?.includes('-Q-');
          item.isDispatchPending = !isQuick && !item.gatePassNo;
        });

        // 🧠 FIFO LOGIC for Customer Payment Status (Mirroring GRN logic)
        const customerIds = [...new Set(items.map((i: any) => i.customerId))];

        customerIds.forEach(cid => {
          if (!cid) return;
          const customerDue = pendingDues.find((d: any) => d.customerId === cid);
          let runningDue = customerDue ? customerDue.pendingAmount : 0;

          // Newest orders first for FIFO tracking
          const custItems = items.filter((i: any) => i.customerId === cid && i.status?.toLowerCase() !== 'draft')
            .sort((a: any, b: any) => new Date(b.soDate).getTime() - new Date(a.soDate).getTime());

          // Initialize Draft orders payment status
          items.filter((i: any) => i.customerId === cid && i.status?.toLowerCase() === 'draft').forEach((item: any) => {
            item.paymentStatus = 'Unpaid';
            item.pendingAmount = item.grandTotal;
          });

          custItems.forEach((item: any) => {
            if (runningDue < -0.01) {
              // Case: Customer has ADVANCE (Negative balance)
              const credit = Math.abs(runningDue);
              if (credit >= item.grandTotal - 0.01) {
                item.paymentStatus = 'Paid';
                item.pendingAmount = 0;
                runningDue += item.grandTotal;
              } else {
                item.paymentStatus = 'Partial';
                item.pendingAmount = item.grandTotal - credit;
                runningDue = 0;
              }
            } else if (runningDue > 0.01) {
              // Case: Customer has DEBT (Positive balance)
              if (runningDue >= item.grandTotal - 0.01) {
                item.paymentStatus = 'Unpaid';
                item.pendingAmount = item.grandTotal;
                runningDue -= item.grandTotal;
              } else {
                item.paymentStatus = 'Partial';
                item.pendingAmount = runningDue;
                runningDue = 0;
              }
            } else {
              // Case: Balance is 0
              item.paymentStatus = 'Paid';
              item.pendingAmount = 0;
            }
          });
        });

        // 🎯 Global Stats from Backend (Ensures consistency across pages)
        this.totalSalesAmount = orderData.totalSalesAmount || 0;
        this.pendingDispatchCount = orderData.pendingDispatchCount || 0;

        // We still calculate Unpaid locally for now because it depends on FIFO + Ledger
        this.unpaidOrdersCount = 0;

        let processedItems = items.map((item: any) => {
          if (item.soDate && typeof item.soDate === 'string' && !item.soDate.includes('Z') && !item.soDate.includes('+')) {
            item.soDate += 'Z';
          }

          // Local aggregation for Unpaid (Note: this is still page-based but unavoidable without backend FIFO)
          if (item.paymentStatus === 'Unpaid' || item.paymentStatus === 'Partial') {
            this.unpaidOrdersCount++;
          }

          return item;
        });

        // 🎯 Apply UI Filter if set
        if (this.paymentFilter) {
          processedItems = processedItems.filter((i: any) => i.paymentStatus === this.paymentFilter);
        }

        this.dataSource.data = processedItems;

        this.isLoading = false;
        if (this.isFirstLoad) {
          this.isFirstLoad = false;
          this.isDashboardLoading = false;
          this.loadingService.setLoading(false);
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoading = false;
        if (this.isFirstLoad) {
          this.isFirstLoad = false;
          this.isDashboardLoading = false;
          this.loadingService.setLoading(false);
        }
        this.cdr.detectChanges();
      }
    });
  }

  onBulkDeleteGrid(selectedRows: any[]) {
    if (!selectedRows || selectedRows.length === 0) return;

    this.isLoading = true;
    const ids = selectedRows.map(r => r.id);
    const deleteTasks = ids.map(id => this.saleOrderService.deleteSaleOrder(id));

    forkJoin(deleteTasks).subscribe({
      next: () => {
        this.isLoading = false;
        this.dialog.open(StatusDialogComponent, {
          width: '350px',
          data: {
            type: 'success',
            title: 'Orders Deleted',
            message: `${selectedRows.length} Draft orders have been successfully deleted.`
          }
        });
        this.selection.clear();
        this.loadOrders();
      },
      error: (err) => {
        this.isLoading = false;
        console.error('Bulk delete failed:', err);
        this.dialog.open(StatusDialogComponent, {
          width: '350px',
          data: { isSuccess: false, title: 'Delete Failed', message: 'Some orders could not be deleted.' }
        });
      }
    });
  }

  onBulkConfirmGrid(selectedRows: any[]) {
    if (!selectedRows || selectedRows.length === 0) return;

    this.isLoading = true;
    this.cdr.detectChanges();

    const confirmTasks = selectedRows.map(order => 
      this.saleOrderService.updateSaleOrderStatus(order.id, 'Confirmed').pipe(
        catchError(err => {
          console.error(`Failed to confirm order ${order.soNumber}:`, err);
          return of({ error: true, orderNo: order.soNumber, message: err.error?.message });
        })
      )
    );

    forkJoin(confirmTasks).subscribe({
      next: (results: any[]) => {
        this.isLoading = false;
        const errors = results.filter(r => r && r.error);
        
        if (errors.length > 0) {
          const errorMsg = errors.map(e => `${e.orderNo}: ${e.message || 'Error'}`).join('\n');
          this.dialog.open(StatusDialogComponent, {
            width: '400px',
            data: {
              type: 'error',
              title: 'Bulk Action Partially Failed',
              message: `Processed ${results.length} orders. ${errors.length} failed:\n${errorMsg}`
            }
          });
        } else {
          this.dialog.open(StatusDialogComponent, {
            width: '350px',
            data: {
              type: 'success',
              title: 'Orders Confirmed',
              message: `${selectedRows.length} Orders have been confirmed and stock adjusted.`
            }
          });
        }
        this.loadOrders();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoading = false;
        this.notification.showStatus(false, 'An unexpected error occurred during bulk confirmation.');
        this.cdr.detectChanges();
      }
    });
  }

  // Search bar ke liye function
  applySearch(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.searchKey = filterValue.trim().toLowerCase();
    this.paginator.pageIndex = 0; // Search par hamesha page 1 par jayein
    this.loadOrders();
  }

  setPaymentFilter(status: string) {
    this.paymentFilter = status;
    if (this.paginator) {
      this.paginator.pageIndex = 0;
    }
    this.loadOrders();
  }

  clearSearch() {
    this.searchKey = "";
    this.paginator.pageIndex = 0;
    this.loadOrders();
  }

  confirmOrder(order: any) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: "Confirm Stock Reduction",
        message: `Order #${order.soNumber} Upon confirmation, the stock will be deducted from the inventory. Are you sure?`,
        confirmText: "Confirm",
        confirmColor: "primary"
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.isLoading = true;
        this.cdr.detectChanges();
        this.saleOrderService.updateSaleOrderStatus(order.id, 'Confirmed').subscribe({
          next: (res) => {
            this.isLoading = false;
            this.dialog.open(StatusDialogComponent, {
              width: '350px',
              data: {
                type: 'success',
                title: 'Order Confirmed',
                message: `Order #${order.soNumber} The order has been successfully confirmed and the stock has been updated.`
              }
            });
            this.loadOrders();
            this.cdr.detectChanges();
          },
          error: (err) => {
            this.isLoading = false;
            this.dialog.open(StatusDialogComponent, {
              width: '350px',
              data: {
                type: 'error',
                title: 'Action Failed',
                message: err.error?.message || "Stock update karne mein error aaya."
              }
            });
            this.cdr.detectChanges();
          }
        });
      }
    });
  }

  viewOrder(row: any) {
    this.isLoading = true;
    this.cdr.detectChanges();
    this.saleOrderService.getSaleOrderById(row.id).subscribe({
      next: (res) => {
        this.isLoading = false;
        // Merge detail data (res) into list data (row) so that list properties (like customerName) 
        // are preserved if they are missing or empty in the detail response.
        const dialogData = { ...res, ...row };

        // Ensure customerName is definitely taken from row if res doesn't have a valid one
        if (!res.customerName && row.customerName) {
          dialogData.customerName = row.customerName;
        }

        this.dialog.open(SaleOrderDetailDialog, { width: '800px', data: dialogData });
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoading = false;
        this.dialog.open(StatusDialogComponent, {
          width: '350px',
          data: { type: 'error', title: 'Load Failed', message: "Connection error." }
        });
        this.cdr.detectChanges();
      }
    });
  }

  returnOrder(row: any) {
    if (!row.customerId || !row.id) return;
    this.router.navigate(['/app/inventory/sale-return/add'], {
      queryParams: {
        customerId: row.customerId,
        soId: row.id
      }
    });
  }

  createGatePass(row: any) {
    this.router.navigate(['/app/inventory/gate-pass/outward'], {
      queryParams: {
        type: 'sale-order',
        refNo: row.soNumber,
        refId: row.id,
        partyName: row.customerName,
        qty: row.totalQty || 0
      }
    });
  }

  bulkCreateGatePass() {
    const selectedRows = this.selection.selected;
    if (selectedRows.length === 0) return;

    // Filter only those which are eligible for dispatch: Confirmed + Paid + Pending Dispatch
    const eligibleOrders = selectedRows.filter(r =>
      r.status?.toLowerCase() === 'confirmed' &&
      r.paymentStatus === 'Paid' &&
      r.isDispatchPending
    );

    if (eligibleOrders.length === 0) {
      this.dialog.open(StatusDialogComponent, {
        width: '400px',
        data: {
          type: 'info',
          title: 'Selection Invalid',
          message: 'Only Confirmed & Paid orders with pending dispatch can be selected for Bulk Outward.'
        }
      });
      return;
    }

    const totalQty = eligibleOrders.reduce((sum, r) => sum + (r.totalQty || 0), 0);
    const orderNumbers = eligibleOrders.map(r => r.soNumber).join(', ');
    const breakdown = eligibleOrders.map(r => `${r.soNumber} (${r.totalQty || 0})`).join(', ');

    this.router.navigate(['/app/inventory/gate-pass/outward'], {
      queryParams: {
        type: 'sale-order',
        isBulk: 'true',
        refNo: 'BULK-OUTWARD',
        partyName: 'Multiple Customers',
        qty: totalQty,
        breakdown: breakdown,
        refId: eligibleOrders.map(r => r.id).join(',')
      }
    });
  }

  createNewOrder() {
    this.router.navigate(['/app/inventory/solist/add']);
  }

  editOrder(row: any) {
    this.router.navigate(['/app/inventory/solist/edit', row.id]);
  }

  deleteOrder(row: any) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: "Delete Draft Order",
        message: `Are you sure you want to delete Order #${row.soNumber}? This action cannot be undone.`,
        confirmText: "Delete",
        confirmColor: "warn"
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.isLoading = true;
        this.cdr.detectChanges();
        this.saleOrderService.deleteSaleOrder(row.id).subscribe({
          next: () => {
            this.isLoading = false;
            this.dialog.open(StatusDialogComponent, {
              width: '350px',
              data: {
                type: 'success',
                title: 'Order Deleted',
                message: `Order #${row.soNumber} has been successfully deleted.`
              }
            });
            this.loadOrders();
          },
          error: (err) => {
            this.isLoading = false;
            this.dialog.open(StatusDialogComponent, {
              width: '350px',
              data: {
                type: 'error',
                title: 'Delete Failed',
                message: err.error?.message || "Order delete karne mein error aaya."
              }
            });
            this.cdr.detectChanges();
          }
        });
      }
    });
  }

  bulkCollectPayment() {
    const selected = this.selection.selected;
    if (selected.length === 0) return;

    const customerId = selected[0].customerId;
    const totalAmount = selected.reduce((sum, r) => sum + (r.pendingAmount || r.grandTotal), 0);
    const invoiceNos = selected.map(r => r.soNumber).join(', ');

    this.router.navigate(['/app/finance/customers/receipt'], {
      queryParams: {
        customerId: customerId,
        amount: totalAmount,
        invoiceNo: invoiceNos // Passing comma separated invoices
      }
    });
  }

  collectPayment(row: any) {
    if (!row.customerId) return;

    // Suggest the actual pending amount if available (Partial/Unpaid), otherwise default to Grand Total
    const suggestAmount = (row.paymentStatus === 'Partial' || row.paymentStatus === 'Unpaid')
      ? (row.pendingAmount || row.grandTotal)
      : row.grandTotal;

    this.router.navigate(['/app/finance/customers/receipt'], {
      queryParams: {
        customerId: row.customerId,
        amount: suggestAmount,
        invoiceNo: row.soNumber
      }
    });
  }

  downloadReceipt(row: any) {
    this.isLoading = true;
    this.cdr.detectChanges();

    // Strategy 1: Search specifically for this SO number
    const searchRequest = {
      customerId: row.customerId,
      searchTerm: row.soNumber,
      sortBy: 'TransactionDate',
      sortOrder: 'desc',
      pageNumber: 1,
      pageSize: 50
    };

    this.financeService.getCustomerLedger(searchRequest).subscribe({
      next: (res: any) => {
        const items = res.ledger?.items || [];
        const receipts = items.filter((l: any) => l.transactionType === 'Receipt');

        if (receipts.length > 0) {
          // Found by SO number reference
          this.printLatestReceipt(receipts[0], row);
        } else {
          // Strategy 2: Look for a receipt with the EXACT same amount as the order
          this.fetchReceiptByAmount(row);
        }
      },
      error: () => this.handleFetchError()
    });
  }

  private fetchReceiptByAmount(row: any) {
    const generalRequest = {
      customerId: row.customerId,
      searchTerm: '',
      sortBy: 'TransactionDate',
      sortOrder: 'desc',
      pageNumber: 1,
      pageSize: 50 // Fetch more to find the correct one
    };

    this.financeService.getCustomerLedger(generalRequest).subscribe({
      next: (res: any) => {
        this.isLoading = false;
        const items = res.ledger?.items || [];
        const receipts = items.filter((l: any) => l.transactionType === 'Receipt');

        // Try to find a receipt that matches the grand total exactly (within 0.01 margin)
        const exactMatch = receipts.find((r: any) => Math.abs(r.credit - row.grandTotal) <= 0.01);

        if (exactMatch) {
          this.printLatestReceipt(exactMatch, row);
        } else if (receipts.length > 0) {
          // If no exact amount match, fallback to the very latest one
          this.printLatestReceipt(receipts[0], row);
        } else {
          this.showNoReceiptDialog(row.soNumber);
        }
        this.cdr.detectChanges();
      },
      error: () => this.handleFetchError()
    });
  }

  private printLatestReceipt(receipt: any, row: any) {
    this.isLoading = false;
    this.generateVoucherPrint({
      id: receipt.id,
      paymentDate: receipt.transactionDate,
      paymentMode: receipt.description?.includes('Cash') ? 'Cash' : 'Bank/Online',
      referenceNumber: receipt.referenceId,
      remarks: receipt.description,
      amount: receipt.credit,
      customerName: row.customerName,
      customerId: row.customerId
    });
    this.cdr.detectChanges();
  }

  private showNoReceiptDialog(soNumber: string) {
    this.dialog.open(StatusDialogComponent, {
      width: '400px',
      data: {
        type: 'info',
        title: 'No Receipt History',
        message: `No payment receipt found for Order #${soNumber} or this customer. Please ensure the payment has been recorded.`
      }
    });
  }

  private handleFetchError() {
    this.isLoading = false;
    this.dialog.open(StatusDialogComponent, {
      width: '400px',
      data: {
        type: 'error',
        title: 'System Error',
        message: 'There was a problem fetching the receipt details. Please check your network connection.'
      }
    });
    this.cdr.detectChanges();
  }

  private generateVoucherPrint(receipt: any) {
    const printContent = `
      <div style="font-family: sans-serif; padding: 40px; border: 2px solid #333; max-width: 800px; margin: auto;">
        <div style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 20px;">
          <h1 style="margin: 0; color: #1e293b;">PAYMENT RECEIPT</h1>
          <p style="margin: 5px 0;">Official Acknowledgement of Payment</p>
        </div>
        
        <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
          <div>
            <strong>Receipt No:</strong> CR-${receipt.id}<br>
            <strong>Date:</strong> ${new Date(receipt.paymentDate).toLocaleDateString()}
          </div>
          <div style="text-align: right;">
            <strong>Reference:</strong> ${receipt.referenceNumber || 'N/A'}<br>
            <strong>Mode:</strong> ${receipt.paymentMode}
          </div>
        </div>

        <div style="margin-bottom: 40px; padding: 20px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
          <p style="font-size: 1.1rem; margin-bottom: 10px;">Received From:</p>
          <h2 style="margin: 0; color: #3b82f6;">${receipt.customerName}</h2>
          <p style="color: #64748b; margin-top: 5px;">Customer ID: #${receipt.customerId}</p>
        </div>

        <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 40px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="background: #f1f5f9;">
              <th style="padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0;">Description</th>
              <th style="padding: 12px; text-align: right; border-bottom: 1px solid #e2e8f0;">Amount</th>
            </tr>
            <tr>
              <td style="padding: 20px; border-bottom: 1px solid #f1f5f9; color: #475569;">
                ${receipt.remarks || 'Payment received towards outstanding balance.'}
              </td>
              <td style="padding: 20px; text-align: right; font-weight: bold; border-bottom: 1px solid #f1f5f9; font-size: 1.2rem;">
                ₹${receipt.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </td>
            </tr>
            <tr style="background: #f8fafc;">
              <td style="padding: 20px; text-align: right; text-transform: uppercase; letter-spacing: 1px; font-size: 0.8rem; color: #64748b;"><strong>Total Received</strong></td>
              <td style="padding: 20px; text-align: right; font-size: 1.5rem; font-weight: 800; color: #0891b2;">
                ₹${receipt.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </td>
            </tr>
          </table>
        </div>

        <div style="margin-top: 80px; display: flex; justify-content: space-between;">
          <div style="border-top: 2px solid #cbd5e1; width: 220px; text-align: center; padding-top: 10px; color: #64748b;">
            Customer Signature
          </div>
          <div style="border-top: 2px solid #cbd5e1; width: 220px; text-align: center; padding-top: 10px; color: #64748b;">
            Authorized Receiver
          </div>
        </div>
        
        <div style="margin-top: 40px; text-align: center; color: #94a3b8; font-size: 0.75rem;">
          This is a computer generated document. No signature required.
        </div>
      </div>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Receipt - ${receipt.referenceNumber}</title>
            <style>
              @media print { 
                body { margin: 0; padding: 20px; }
                .no-print { display: none; } 
              }
              body { background: #f1f5f9; padding: 50px; }
            </style>
          </head>
          <body onload="window.print();window.close()">
            ${printContent}
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  }

  DownloadMultipleOrders(productIds: string[]) {
    if (!productIds || productIds.length === 0) {
      this.dialog.open(StatusDialogComponent, {
        width: '350px',
        data: { type: 'error', title: 'Selection Required', message: 'Please select products to download the report.' }
      });
      return;
    }

    this.isLoading = true;
    this.cdr.detectChanges();
    this.saleOrderService.SaleOrderReportDownload(productIds).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SaleOrder_Report_${new Date().getTime()}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.isLoading = false;
        this.cdr.detectChanges();
        this.dialog.open(StatusDialogComponent, {
          width: '350px',
          data: { type: 'success', title: 'Report Downloaded', message: 'The Sale Order report has been successfully downloaded.' }
        });
      },
      error: (err) => {
        this.isLoading = false;
        this.dialog.open(StatusDialogComponent, {
          width: '350px',
          data: { type: 'error', title: 'Export Failed', message: "Server responded with 400 Bad Request." }
        });
        this.cdr.detectChanges();
      }
    });
  }

  exportOrders() {
    this.isLoading = true;
    this.cdr.detectChanges();
    this.saleOrderService.exportSaleOrderList().subscribe({
      next: (blob) => {
        this.isLoading = false;
        this.cdr.detectChanges();

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Orders_Report_${new Date().getTime()}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);

        this.dialog.open(StatusDialogComponent, {
          width: '350px',
          data: { type: 'success', title: 'Success', message: 'Excel download complete!' }
        });
      },
      error: (err) => {
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }


}