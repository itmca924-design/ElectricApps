import { ChangeDetectorRef, Component, inject, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MaterialModule } from '../../../../shared/material/material/material-module';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { EnterpriseHierarchicalGridComponent } from '../../../../shared/components/enterprise-hierarchical-grid-component/enterprise-hierarchical-grid-component';
import { MatTableDataSource } from '@angular/material/table';
import { GridColumn } from '../../../../shared/models/grid-column.model';
import { InventoryService } from '../../service/inventory.service';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { MatDialog } from '@angular/material/dialog';
import { NotificationService } from '../../../shared/notification.service';
import { SelectionModel } from '@angular/cdk/collections';
import { AuthService } from '../../../../core/services/auth.service';
import { LoadingService } from '../../../../core/services/loading.service';
import { PermissionService } from '../../../../core/services/permission.service';
import { POService } from '../../service/po.service';
import { PoPrintModalComponent } from '../../po-list/po-print-modal/po-print-modal.component';

@Component({
  selector: 'app-quick-purchase-list',
  standalone: true,
  imports: [
    MaterialModule,
    ReactiveFormsModule,
    FormsModule,
    CommonModule,
    EnterpriseHierarchicalGridComponent,
  ],
  providers: [CurrencyPipe, DatePipe],
  templateUrl: './quick-purchase-list.component.html',
  styleUrl: './quick-purchase-list.component.scss',
})
export class QuickPurchaseListComponent implements OnInit {
  private loadingService = inject(LoadingService);
  private permissionService = inject(PermissionService);

  public dataSource = new MatTableDataSource<any>([]);
  public totalRecords: number = 0;
  public pageSize: number = 10;
  public isLoading: boolean = false;
  public isDashboardLoading: boolean = true;
  private isFirstLoad: boolean = true;

  public poColumns: GridColumn[] = [];
  public itemColumns: GridColumn[] = [];

  public router = inject(Router);
  private currentGridState: any = {};

  private route = inject(ActivatedRoute);

  public highlightedPoId: any = null;

  selection = new SelectionModel<any>(true, []);
  selectedParentRows: any[] = [];
  childSelection = new SelectionModel<any>(true, []);

  private authService = inject(AuthService);
  userRole: any;

  // Permissions
  canAdd: boolean = true;
  canEdit: boolean = true;
  canDelete: boolean = true;
  canSubmit: boolean = false;
  canApprove: boolean = false;
  canReject: boolean = false;
  canCreateGrn: boolean = false;

  @ViewChild(EnterpriseHierarchicalGridComponent) grid!: EnterpriseHierarchicalGridComponent;

  // Stats
  totalPurchaseAmount: number = 0;
  todayCount: number = 0;
  monthCount: number = 0;

  constructor(
    private inventoryService: InventoryService,
    private poActionService: POService,
    private cdr: ChangeDetectorRef,
    private datePipe: DatePipe,
    private currencyPipe: CurrencyPipe,
    private dialog: MatDialog,
    private notification: NotificationService
  ) { }

  ngOnInit() {
    this.initColumns();
    this.userRole = this.authService.getUserRole();

    this.canAdd = this.permissionService.hasPermission('CanAdd');
    this.canEdit = this.permissionService.hasPermission('CanEdit');
    this.canDelete = this.permissionService.hasPermission('CanDelete');

    this.isDashboardLoading = true;
    this.isFirstLoad = true;
    this.loadingService.setLoading(true);
    this.cdr.detectChanges();

    // Highlighted PO from query params
    this.route.queryParams.subscribe(params => {
      if (params['poId']) {
        this.highlightedPoId = Number(params['poId']) || params['poId'];
      }
    });

    // Safety timeout
    setTimeout(() => {
      if (this.isDashboardLoading) {
        this.isDashboardLoading = false;
        this.isFirstLoad = false;
        this.loadingService.setLoading(false);
        this.cdr.detectChanges();
      }
    }, 10000);
  }

  private initColumns() {
    this.poColumns = [
      { field: 'poNumber', header: 'PO No.', sortable: true, isFilterable: true, isResizable: true, width: 135 },
      { field: 'id', header: 'ID', sortable: true, isFilterable: true, visible: false, isResizable: true, width: 80 },
      {
        field: 'poDate',
        header: 'Date',
        sortable: true,
        isResizable: true,
        width: 145,
        cell: (row: any) => {
          try {
            const rawDate = row.CreatedAt || row.createdAt || row.CreatedDate || row.createdDate || row.poDate;
            if (!rawDate) return '';
            return this.datePipe.transform(rawDate, 'dd/MM/yyyy hh:mm a', '+0530');
          } catch {
            return row.poDate || '';
          }
        }
      },
      { field: 'createdBy', header: 'Created By', sortable: true, isFilterable: true, isResizable: true, width: 150 },
      { field: 'supplierName', header: 'Supplier Name', sortable: true, isResizable: true, width: 150, isFilterable: true },
      {
        field: 'grandTotal',
        header: 'Grand Total',
        sortable: true,
        isResizable: true,
        width: 120,
        align: 'left',
        cell: (row: any) => this.currencyPipe.transform(row.grandTotal, 'INR', 'symbol', '1.2-2')
      },
      {
        field: 'status',
        header: 'Status',
        sortable: true,
        isResizable: true,
        width: 130,
        isFilterable: true,
        cell: (row: any) => row.status || '-'
      },
      {
        field: 'remarks',
        header: 'Remarks',
        sortable: false,
        isResizable: true,
        width: 180,
        isFilterable: false,
        cell: (row: any) => row.remarks || ''
      }
    ];

    this.itemColumns = [
      { field: 'productName', header: 'Product Name', width: 215, sortable: true, isFilterable: false, isResizable: true },
      { field: 'qty', header: 'Ordered Qty', width: 90, align: 'left', isResizable: true },
      { field: 'unit', header: 'Unit', width: 85, align: 'left', isResizable: false },
      {
        field: 'rate', header: 'Rate', width: 105, align: 'left', isResizable: false, isFilterable: false,
        cell: (row: any) => this.currencyPipe.transform(row.rate, 'INR', 'symbol', '1.2-2')
      },
      {
        field: 'discountPercent', header: 'Dis(%)', width: 100, align: 'left', isResizable: false, isFilterable: false,
        cell: (row: any) => `${(row.discountPercent || 0).toFixed(2)}%`
      },
      {
        field: 'gstPercent', header: 'GST(%)', width: 100, align: 'left', isResizable: false, isFilterable: false,
        cell: (row: any) => `${(row.gstPercent || 0).toFixed(2)}%`
      },
      {
        field: 'taxAmount', header: 'Tax Amount', width: 125, align: 'left', isResizable: false, isFilterable: false,
        cell: (row: any) => this.currencyPipe.transform(row.taxAmount, 'INR', 'symbol', '1.2-2')
      },
      {
        field: 'total', header: 'Total', width: 125, align: 'left', isResizable: false, isFilterable: false,
        cell: (row: any) => this.currencyPipe.transform(row.total, 'INR', 'symbol', '1.2-2')
      }
    ];
  }

  public onGridStateChange(state: any) {
    this.currentGridState = state;
    this.pageSize = state.pageSize || 10;
    this.loadData(state);
  }

  public loadData(state: any) {
    this.isLoading = true;
    this.cdr.detectChanges();

    const requestPayload = {
      pageIndex: state.pageIndex ?? 0,
      pageSize: state.pageSize ?? 10,
      sortField: state.sortField ?? 'CreatedDate',
      sortOrder: state.sortOrder ?? 'desc',
      filter: state.globalSearch || '',
      fromDate: state.fromDate ? this.datePipe.transform(state.fromDate, 'yyyy-MM-dd') : null,
      toDate: state.toDate ? this.datePipe.transform(state.toDate, 'yyyy-MM-dd') : null,
      filters: (state.filters || []).filter((f: any) => f.field && f.value)
    };

    // Stats are now coming with the paged data
    // this.loadTotalStats(requestPayload);

    this.inventoryService.getQuickPagedOrders(requestPayload).subscribe({
      next: (res) => {
        const dataRows = res.data || [];
        const items = dataRows.map((item: any) => {
          // Normalize dates
          ['poDate', 'expectedDeliveryDate', 'CreatedAt', 'createdAt', 'CreatedDate', 'createdDate'].forEach(key => {
            if (item[key] && typeof item[key] === 'string' && !item[key].includes('Z') && !item[key].includes('+')) {
              item[key] = item[key] + 'Z';
            }
          });
          return item;
        });

        this.dataSource.data = items;
        this.totalRecords = res.totalRecords || 0;
        this.totalPurchaseAmount = res.totalAmount || 0;
        this.todayCount = res.todayCount || 0;
        this.monthCount = res.monthCount || 0;
        
        this.isLoading = false;

        if (this.isFirstLoad) {
          this.isFirstLoad = false;
          this.isDashboardLoading = false;
          this.loadingService.setLoading(false);
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Quick Purchase List Error:', err);
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


  onDeleteSingleRecord(row: any) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Delete Quick Purchase',
        message: `Do you want to delete PO No: ${row.poNumber}? This will remove all items.`,
        confirmText: 'Yes, Delete',
        cancelText: 'No',
        confirmColor: 'warn'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.isLoading = true;
        this.inventoryService.deletePurchaseOrder(row.id).subscribe({
          next: (res) => {
            this.isLoading = false;
            if (res.success) {
              this.notification.showStatus(true, `PO: ${row.poNumber} deleted!`);
              if (this.grid) this.grid.selection.clear();
              this.loadData(this.currentGridState);
            } else {
              this.notification.showStatus(false, res.message || 'Error: PO not deleted.');
            }
            this.cdr.detectChanges();
          },
          error: (err) => {
            this.isLoading = false;
            const errorMsg = err.error?.message || err.message || 'Error: PO not deleted.';
            this.notification.showStatus(false, errorMsg);
            this.cdr.detectChanges();
          }
        });
      }
    });
  }

  onBulkDeleteParentOrders(selectedRows: any[]) {
    if (!selectedRows || selectedRows.length === 0) {
      this.notification.showStatus(false, 'First select the orders!');
      return;
    }

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Bulk Delete Quick Purchases',
        message: `Are you sure you want to delete ${selectedRows.length} selected orders? This action cannot be undone.`,
        confirmText: 'Yes, Delete All',
        cancelText: 'Cancel',
        confirmColor: 'warn'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.isLoading = true;
        const parentIds = selectedRows.map(row => row.id);

        this.inventoryService.bulkDeletePurchaseOrders(parentIds).subscribe({
          next: (res) => {
            this.isLoading = false;
            if (res.success) {
              this.notification.showStatus(true, `${selectedRows.length} Orders deleted.`);
              if (this.grid) this.grid.selection.clear();
              this.loadData(this.currentGridState);
            } else {
              this.notification.showStatus(false, res.message || 'Error: Bulk delete failed.');
            }
            this.cdr.detectChanges();
          },
          error: (err) => {
            this.isLoading = false;
            const errorMsg = err.error?.message || err.message || 'Error: Bulk delete failed.';
            this.notification.showStatus(false, errorMsg);
            this.cdr.detectChanges();
          }
        });
      }
    });
  }

  onBulkDeleteChildItems(event: any) {
    const poNo = event.parent.poNumber;
    const itemIds = event.isBulk ? event.child.map((i: any) => i.id) : [event.child.id];
    const displayMsg = event.isBulk ? `${event.child.length} items` : `item "${event.child.productName}"`;

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Remove Line Item(s)',
        message: `Do you want to remove ${displayMsg} from PO: ${poNo}?`,
        confirmText: 'Remove',
        cancelText: 'Keep'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.isLoading = true;
        this.inventoryService.bulkDeletePOItems(event.parent.id, itemIds).subscribe({
          next: (res) => {
            this.isLoading = false;
            if (res.success) {
              this.notification.showStatus(true, 'Items removed successfully.');
              if (event.isBulk) this.childSelection.clear();
              this.loadData(this.currentGridState);
            } else {
              this.notification.showStatus(false, res.message || 'Error removing items.');
            }
            this.cdr.detectChanges();
          },
          error: (err) => {
            this.isLoading = false;
            const errorMsg = err.error?.message || err.message || 'Error removing items.';
            this.notification.showStatus(false, errorMsg);
            this.cdr.detectChanges();
          }
        });
      }
    });
  }

  onGridSelectionChange(selectedRows: any[]) {
    this.selectedParentRows = selectedRows;
  }

  handleGridAction(event: { action: string, row: any }) {
    const row = event.row;
    switch (event.action) {
      case 'EDIT':
        this.router.navigate(['/app/quick-inventory/purchase/edit', row.id]);
        break;
      case 'SUBMIT':
        this.onSubmitApproval(row);
        break;
      case 'APPROVE':
        this.onApprove(row);
        break;
      case 'REJECT':
        this.onReject(row);
        break;
      case 'CREATE_GRN':
        this.onCreateGrn(row);
        break;
      case 'VIEW':
        this.onPrintPO(row, 'VIEW');
        break;
      case 'PRINT':
        this.onPrintPO(row, 'PRINT');
        break;
      case 'DELETE':
        this.onDeleteSingleRecord(row);
        break;
      default:
        console.warn(`Action ${event.action} is not handled in Quick Purchase List.`);
        break;
    }
  }

  onSubmitApproval(row: any) {
    this.inventoryService.updatePOStatus(row.id, 'Submitted').subscribe({
      next: () => {
        this.notification.showStatus(true, `PO ${row.poNumber} submitted for approval.`);
        this.loadData(this.currentGridState);
      },
      error: (err) => this.notification.showStatus(false, err.error?.message || 'Submission failed.')
    });
  }

  onApprove(row: any) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Approve PO',
        message: `Are you sure you want to approve PO: ${row.poNumber}?`,
        confirmText: 'Approve',
        confirmColor: 'primary'
      }
    });

    dialogRef.afterClosed().subscribe(res => {
      if (res) {
        this.inventoryService.updatePOStatus(row.id, 'Approved').subscribe({
          next: () => {
            this.notification.showStatus(true, `PO ${row.poNumber} Approved.`);
            this.loadData(this.currentGridState);
          },
          error: (err) => this.notification.showStatus(false, err.error?.message || 'Approval failed.')
        });
      }
    });
  }

  onReject(row: any) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Reject PO',
        message: `Are you sure you want to reject PO: ${row.poNumber}?`,
        confirmText: 'Reject',
        confirmColor: 'warn'
      }
    });

    dialogRef.afterClosed().subscribe(res => {
      if (res) {
        this.inventoryService.updatePOStatus(row.id, 'Rejected', 'Rejected by Manager').subscribe({
          next: () => {
            this.notification.showStatus(true, `PO ${row.poNumber} Rejected.`);
            this.loadData(this.currentGridState);
          },
          error: (err) => this.notification.showStatus(false, err.error?.message || 'Rejection failed.')
        });
      }
    });
  }

  onCreateGrn(row: any) {
    // Quick PO logic: Direct to Quick GRN form within quick-inventory module
    this.router.navigate(['/app/quick-inventory/grn-list/add'], { 
      queryParams: { poId: row.id, poNo: row.poNumber } 
    });
  }

  onPrintPO(row: any, mode: string = 'PRINT') {
    this.isLoading = true;
    this.cdr.detectChanges();

    this.poActionService.getPrintDetails(row.id).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.cdr.detectChanges();

        if (res) {
          this.dialog.open(PoPrintModalComponent, {
            width: '850px',
            maxWidth: '95vw',
            data: { ...res, mode: mode, id: row.id, status: row.status },
            autoFocus: false
          });
        } else {
          this.notification.showStatus(false, 'No print details found.');
        }
      },
      error: (err) => {
        this.isLoading = false;
        this.cdr.detectChanges();
        console.error('Print Fetch Error:', err);
        this.notification.showStatus(false, 'Failed to fetch print data.');
      }
    });
  }
}
