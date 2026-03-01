import { ChangeDetectorRef, Component, inject, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { EnterpriseHierarchicalGridComponent } from '../../../shared/components/enterprise-hierarchical-grid-component/enterprise-hierarchical-grid-component';
import { MatTableDataSource } from '@angular/material/table';
import { GridColumn } from '../../../shared/models/grid-column.model';
import { InventoryService } from '../service/inventory.service';
import { POService } from '../service/po.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { MatDialog } from '@angular/material/dialog';
import { NotificationService } from '../../shared/notification.service';
import { SelectionModel } from '@angular/cdk/collections';
import { AuthService } from '../../../core/services/auth.service';
import { PurchaseOrderStatus } from '../models/po-status.enum';
import { StatusDialogComponent } from '../../../shared/components/status-dialog-component/status-dialog-component';
import { ActionConfirmDialog } from '../../../shared/components/action-confirm-dialog/action-confirm-dialog';
import { ReasonRejectDialog } from '../../../shared/components/reason-reject-dialog/reason-reject-dialog';
import { PoPrintModalComponent } from './po-print-modal/po-print-modal.component';
import { LoadingService } from '../../../core/services/loading.service';

@Component({
  selector: 'app-po-list',
  standalone: true,
  imports: [
    MaterialModule,
    ReactiveFormsModule,
    FormsModule,
    CommonModule,
    EnterpriseHierarchicalGridComponent,
  ],
  providers: [CurrencyPipe, DatePipe],
  templateUrl: './po-list.html',
  styleUrl: './po-list.scss',
})
export class PoList implements OnInit {
  private loadingService = inject(LoadingService);

  public dataSource = new MatTableDataSource<any>([]);
  public totalRecords: number = 0;
  public pageSize: number = 10;
  public isLoading: boolean = false;
  public isDashboardLoading: boolean = true;
  private isFirstLoad: boolean = true;

  public poColumns: GridColumn[] = [];
  public itemColumns: GridColumn[] = [];

  private currentGridState: any = {};
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  public highlightedPoId: any = null;

  selection = new SelectionModel<any>(true, []);
  selectedParentRows: any[] = [];

  // Aur agar child ke liye bhi chahiye:
  childSelection = new SelectionModel<any>(true, []);

  private authService = inject(AuthService);

  userRole: any;

  @ViewChild(EnterpriseHierarchicalGridComponent) grid!: EnterpriseHierarchicalGridComponent;

  // Stats
  totalPurchaseAmount: number = 0;
  pendingReceiveCount: number = 0;
  pendingApprovalCount: number = 0;
  pendingInwardCount: number = 0;
  overdueInwardCount: number = 0;
  partiallyReceivedCount: number = 0;

  constructor(
    private poService: InventoryService,
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

    console.log('[PoList] Current User Role:', this.userRole);

    // Global loader ON - Grid component khud triggerDataLoad karega
    this.isDashboardLoading = true;
    this.isFirstLoad = true;
    this.loadingService.setLoading(true);
    this.cdr.detectChanges();

    // Check for highlighted PO from query params
    this.route.queryParams.subscribe(params => {
      if (params['poId']) {
        this.highlightedPoId = Number(params['poId']) || params['poId'];
        console.log('[PoList] Highlighting PO ID:', this.highlightedPoId);
      }
    });

    // Stats will be loaded via loadData to stay in sync with filters

    // Safety timeout - force stop loader after 10 seconds
    setTimeout(() => {
      if (this.isDashboardLoading) {
        console.warn('Force stopping loader after 10s timeout');
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
            // Priority: Audit fields with time
            const rawDate = row.CreatedAt || row.createdAt || row.CreatedDate || row.createdDate || row.poDate;
            if (!rawDate) return '';

            // Clear AM/PM format to avoid 24-hour confusion
            return this.datePipe.transform(rawDate, 'dd/MM/yyyy hh:mm a', '+0530');
          } catch {
            return row.poDate || '';
          }
        }
      },
      {
        field: 'expectedDeliveryDate',
        header: 'Delivery Date',
        sortable: true,
        isResizable: true,
        width: 120,
        cell: (row: any) => {
          try {
            return row.expectedDeliveryDate ? this.datePipe.transform(row.expectedDeliveryDate, 'dd/MM/yyyy', '+0530') : '';
          } catch { return row.expectedDeliveryDate || ''; }
        }
      },
      { field: 'createdBy', header: 'Created By', sortable: true, isFilterable: true, isResizable: true, width: 150 },
      { field: 'supplierName', header: 'Supplier Name', sortable: true, isResizable: true, width: 150, isFilterable: true },
      {
        field: 'grandTotal',
        header: 'Grand Total',
        sortable: true,
        isResizable: true,
        width: 100,
        align: 'left',
        cell: (row: any) => this.currencyPipe.transform(row.grandTotal, 'INR', 'symbol', '1.2-2')
      },
      {
        field: 'status',
        header: 'Status',
        sortable: true,
        isResizable: true,
        width: 140,
        isFilterable: true,
        cell: (row: any) => {
          const status = (row.status || '').toLowerCase();
          const tOrd = Number(row.totalOrdered || 0);
          const tAcc = Number(row.totalAccepted || 0);
          const tRej = Number(row.totalRejected || 0);
          const tRet = Number(row.totalReturned || 0);
          const tRec = Number(row.totalReceived || 0);

          // Core status flags
          const fulfillmentCompleted = tAcc >= tOrd; // Everything ordered is now accepted
          const itemsAtGate = Math.max(tRec, tAcc + tRej) >= tOrd; // Everything ordered has reached the warehouse
          const hasPendingReturns = tRej > tRet;
          const isFulfillmentPending = (tAcc + tRej) < tOrd;
          const remainsToReceive = !itemsAtGate;

          // If fulfillment is complete, force "Received" (Clean GREEN status)
          if (fulfillmentCompleted && (status === 'received' || status === 'partially received' || status === 'approved')) {
            return 'Received';
          }

          const isFinished = fulfillmentCompleted && !hasPendingReturns && !remainsToReceive;
          if (isFinished) return row.status;

          const needsAction = isFulfillmentPending || hasPendingReturns || remainsToReceive;
          const hasMovement = tRec > 0 || tAcc > 0 || tRej > 0;

          if (((status === 'received' || status === 'partially received') || (status === 'approved' && hasMovement)) && needsAction) {
            const days = row.daysSinceUpdate || 0;
            let prefix = 'Partially Received';

            if (remainsToReceive) {
              const pending = tOrd - Math.max(tRec, tAcc + tRej);
              prefix = `Partial (${pending} due)`;
            }
            else if (hasPendingReturns && fulfillmentCompleted) {
              prefix = `Fulfilled (${tRej - tRet} return baki)`;
            }
            else if (isFulfillmentPending) {
              prefix = `At Gate (${tOrd - tAcc} to GRN)`;
            }

            if (days > 7) {
              return `<span class="overdue-text">${prefix}<br><small>(${days} days overdue)</small></span>`;
            }
            return `<span class="pending-text">${prefix}<br><small>(${days} days pending)</small></span>`;
          }
          return row.status;
        }
      }
    ];

    this.itemColumns = [
      { field: 'productName', header: 'Product Name', width: 215, sortable: true, isFilterable: false, isResizable: true },
      { field: 'qty', header: 'Ordered Qty', width: 90, align: 'left', isResizable: true },
      {
        field: 'receivedQty',
        header: 'Received Qty',
        width: 90,
        align: 'left',
        isResizable: true,
        cell: (row) => row.receivedQty || 0
      },
      {
        field: 'pendingQty',
        header: 'Pending Qty',
        width: 90,
        align: 'left',
        isResizable: true,
        cell: (row) => {
          // Logic: Pending should be what is actually missing from the accepted stock
          const pending = (row.qty || 0) - (row.acceptedQty || 0);
          return pending > 0 ? pending : 0;
        }
      },
      { field: 'rejectedQty', header: 'Rejected Qty', width: 90, align: 'left', isResizable: true, cell: (row) => row.rejectedQty || 0 },
      { field: 'acceptedQty', header: 'Accepted Qty', width: 90, align: 'left', isResizable: true, cell: (row) => row.acceptedQty || 0 },
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

  // Central control function: Grid se jo bhi change hoga, yahan se API call jayegi
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
    };

    // Load totals for stats across all pages
    this.loadTotalStats(requestPayload);

    this.poService.getPagedOrders(requestPayload).subscribe({
      next: (res) => {
        console.log('API PO List Response:', res);
        const dataRows = res.data || [];
        const items = dataRows.map((item: any) => {
          // Force UTC-to-Local conversion (Normalized to IST)
          ['poDate', 'expectedDeliveryDate', 'CreatedAt', 'createdAt', 'CreatedDate', 'createdDate'].forEach(key => {
            if (item[key] && typeof item[key] === 'string' && !item[key].includes('Z') && !item[key].includes('+')) {
              item[key] = item[key] + 'Z';
            }
          });

          // 1. Calculate summary stats (Prioritize existing header fields if items are missing)
          const poItems = item.items || [];
          if (poItems.length > 0) {
            item.totalOrdered = poItems.reduce((sum: number, i: any) => sum + (Number(i.qty || i.orderedQty || 0) || 0), 0);
            item.totalReceived = poItems.reduce((sum: number, i: any) => sum + (Number(i.receivedQty || 0)), 0);
            item.totalAccepted = poItems.reduce((sum: number, i: any) => sum + (Number(i.acceptedQty || 0)), 0);
            item.totalRejected = poItems.reduce((sum: number, i: any) => sum + (Number(i.rejectedQty || 0)), 0);
            item.totalReturned = poItems.reduce((sum: number, i: any) => sum + (Number(i.returnQty || i.returnedQty || 0) || 0), 0);
            item.totalPending = Math.max(0, item.totalOrdered - item.totalAccepted);
          } else {
            // Fallback to Header fields from API (Extensive naming support for both camelCase and PascalCase)
            item.totalOrdered = Number(item.totalOrdered || item.TotalOrdered || item.totalOrderedQty || item.OrderedQty || item.orderedQty || item.totalQty || 0);
            item.totalReceived = Number(item.totalReceived || item.TotalReceived || item.totalReceivedQty || item.ReceivedQty || item.receivedQty || 0);
            item.totalAccepted = Number(item.totalAccepted || item.TotalAccepted || item.totalAcceptedQty || item.AcceptedQty || item.acceptedQty || 0);
            item.totalRejected = Number(item.totalRejected || item.TotalRejected || item.totalRejectedQty || item.RejectedQty || item.rejectedQty || 0);
            item.totalReturned = Number(item.totalReturned || item.TotalReturned || item.totalReturnedQty || item.ReturnedQty || item.returnedQty || item.totalReturnQty || item.returnQty || 0);
            item.totalPending = Math.max(0, item.totalOrdered - item.totalAccepted);
          }

          // Calculate aging for overdue display in grid status column
          const lastActionDate = new Date(item.updatedDate || item.poDate);
          const today = new Date();
          const diffDays = Math.ceil(Math.abs(today.getTime() - lastActionDate.getTime()) / (1000 * 60 * 60 * 24));
          item.daysSinceUpdate = diffDays;

          return item;
        });

        this.dataSource.data = items;
        this.totalRecords = res.totalRecords || 0;
        this.isLoading = false;

        if (this.isFirstLoad) {
          this.isFirstLoad = false;
          this.isDashboardLoading = false;
          this.loadingService.setLoading(false);
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('API Error:', err);
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

  private loadTotalStats(state: any) {
    // We call the same paged API but with a very large pageSize to get everything for stats
    const statsPayload = {
      ...state,
      pageIndex: 0,
      pageSize: 2000 // Large enough to cover all records across all pages
    };

    this.poService.getPagedOrders(statsPayload).subscribe({
      next: (res: any) => {
        const allPos = res.data || [];

        // Reset global counts
        this.pendingReceiveCount = 0;
        this.pendingApprovalCount = 0;
        this.pendingInwardCount = 0;
        this.overdueInwardCount = 0;
        this.partiallyReceivedCount = 0;
        this.totalPurchaseAmount = 0;

        allPos.forEach((item: any) => {
          // Normalize status
          const status = (item.status || '').toLowerCase();

          // Helper flags for consistency with grid logic
          const poItems = item.items || [];
          let tOrd, tRec, tAcc, tRej, tRet, tPen;

          if (poItems.length > 0) {
            tOrd = poItems.reduce((sum: number, i: any) => sum + (Number(i.qty || i.orderedQty || 0) || 0), 0);
            tRec = poItems.reduce((sum: number, i: any) => sum + (Number(i.receivedQty || 0)), 0);
            tAcc = poItems.reduce((sum: number, i: any) => sum + (Number(i.acceptedQty || 0)), 0);
            tRej = poItems.reduce((sum: number, i: any) => sum + (Number(i.rejectedQty || 0)), 0);
            tRet = poItems.reduce((sum: number, i: any) => sum + (Number(i.returnQty || i.returnedQty || 0) || 0), 0);
            tPen = Math.max(0, tOrd - tAcc);
          } else {
            tOrd = Number(item.totalOrdered || item.TotalOrdered || item.totalOrderedQty || item.OrderedQty || item.orderedQty || item.totalQty || 0);
            tRec = Number(item.totalReceived || item.TotalReceived || item.totalReceivedQty || item.ReceivedQty || item.receivedQty || 0);
            tAcc = Number(item.totalAccepted || item.TotalAccepted || item.totalAcceptedQty || item.AcceptedQty || item.acceptedQty || 0);
            tRej = Number(item.totalRejected || item.TotalRejected || item.totalRejectedQty || item.RejectedQty || item.rejectedQty || 0);
            tRet = Number(item.totalReturned || item.TotalReturned || item.totalReturnedQty || item.ReturnedQty || item.returnedQty || item.totalReturnQty || item.returnQty || 0);
            tPen = Math.max(0, tOrd - tAcc);
          }

          const fulfillmentCompleted = tAcc >= tOrd;
          const itemsAtGate = Math.max(tRec, tAcc + tRej) >= tOrd;
          const hasPendingReturns = tRej > tRet;
          const isFulfillmentPending = (tAcc + tRej) < tOrd;
          const remainsToReceive = !itemsAtGate;
          const needsAction = isFulfillmentPending || hasPendingReturns || remainsToReceive;

          // 1. Pending Inwards
          if ((status === 'received' || status === 'partially received') && remainsToReceive) {
            this.pendingInwardCount++;
            const rawDate = item.updatedDate || item.poDate;
            const lastActionDate = new Date(rawDate);
            const today = new Date();
            const diffDays = Math.ceil(Math.abs(today.getTime() - lastActionDate.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays > 7) this.overdueInwardCount++;
          }

          // 2. Partially Received Card
          if ((status === 'partially received' || status === 'received') && needsAction) {
            this.partiallyReceivedCount++;
          }

          // 3. Awaiting Receiving
          if (status === 'approved' || ((status === 'received' || status === 'partially received') && (remainsToReceive || tPen > 0))) {
            this.pendingReceiveCount++;
          }

          // 4. Awaiting Approval
          if (status === 'submitted') {
            this.pendingApprovalCount++;
          }

          // 5. Total Purchase Amount (Finalized/Active orders)
          if (status === 'approved' || status === 'received' || status === 'partially received') {
            this.totalPurchaseAmount += (item.grandTotal || 0);
          }
        });
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Stats Load Error:', err)
    });
  }

  OnEditPo(row: any): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Edit Purchase Order',
        message: `Are you sure you want to edit PO No: ${row.poNumber}?`,
        confirmText: 'Yes, Edit',
        cancelText: 'Cancel'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.router.navigate(['/app/inventory/polist/edit', row.id], {
          state: {
            data: row,
            mode: 'edit'
          }
        });
      }
    });
  }



  // --- 1. SINGLE PARENT DELETE (Row Trash Icon) ---
  onDeleteSingleParentRecord(row: any) {
    if (row.status !== 'Draft' && row.status !== 'Rejected') {
      this.notification.showStatus(false, `Only Draft or Rejected orders can be deleted. Current status: ${row.status}`);
      return;
    }

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Delete Purchase Order',
        message: `Do you want to delete the PO No: ${row.poNumber}? This will delete all items.`,
        confirmText: 'Yes, Delete',
        cancelText: 'No',
        confirmColor: 'warn'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.isLoading = true;
        this.poService.deletePurchaseOrder(row.id).subscribe({
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
      this.notification.showStatus(false, 'First select the po!');
      return;
    }

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Bulk Delete Orders',
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

        this.poService.bulkDeletePurchaseOrders(parentIds).subscribe({
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

  // --- 3. CHILD DELETE (Single & Bulk merged) ---
  onBulkDeleteChildItems(event: any) {
    // event.isBulk true hai toh multiple IDs, warna single ID array mein
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
        this.poService.bulkDeletePOItems(event.parent.id, itemIds).subscribe({
          next: (res) => {
            this.isLoading = false;
            if (res.success) {
              this.notification.showStatus(true, 'Items removed successfully.');
              if (event.isBulk) this.childSelection.clear(); // Clear child selections
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

  // 1. Grid se aane wale actions ko route karne ke liye
  handleGridAction(event: { action: string, row: any }) {
    const row = event.row;

    switch (event.action) {
      case 'EDIT': // <--- Yeh case miss ho gaya tha
        this.OnEditPo(row);
        break;
      case 'SUBMIT':
        this.onSubmitPO(row);
        break;
      case 'APPROVE':
        this.onApprovePO(row);
        break;
      case 'REJECT':
        this.onRejectPO(row);
        break;

      case 'VIEW': // Eye icon -> Download Mode
        this.onPrintPO(row, 'VIEW');
        break;

      // --- Naye Cases Jo Humne Add Kiye ---
      case 'PRINT': // Print icon -> Print Mode
        this.onPrintPO(row, 'PRINT');
        break;
      case 'CREATE_GRN':
        this.redirectToInwardGatePass(row);
        break;
      case 'PROCESS_RETURN':
        this.redirectToPurchaseReturn(row);
        break;
      case 'DELETE':
        this.onDeleteSingleParentRecord(row);
        break;

      default:
        console.warn(`Action ${event.action} is not handled.`);
        break;
    }
  }
  // 1. Inward Gate Pass Page par bhejta hai (User: PO se pehle Gate Pass banna chahiye)
  redirectToInwardGatePass(row: any) {
    console.log('--- REDIRECTING TO INWARD GATE PASS ---', row.poNumber);

    // DYNAMIC QTY LOGIC:
    // Hum woh quantity expect kar rahe hain jo factory se bahar gayi hai (Returned).
    // Isme 'totalReturned' (Normal stock returns) aur 'totalRejected' (Rejected items) dono ho sakte hain.
    const totalReturned = Number(row.totalReturned || 0);
    const totalRejected = Number(row.totalRejected || 0);

    // Agar dono 0 hain, toh Ordered - Accepted (Shortage) pick karein
    const shortage = (row.totalOrdered || 0) - (row.totalAccepted || 0);

    // Final dynamic qty: Dono returns ka sum ya shortage
    let resultQty = (totalReturned > 0 || totalRejected > 0) ? (totalReturned + totalRejected) : shortage;

    // Safest fallback: if result is still 0, use totalPending
    if (resultQty <= 0) resultQty = (row.totalPending || 0);

    this.router.navigate(['/app/inventory/gate-pass/inward'], {
      queryParams: {
        type: 'po',
        refNo: row.poNumber,
        refId: row.id,
        partyName: row.supplierName,
        qty: resultQty,
        isReplacement: (totalReturned > 0 || totalRejected > 0) ? 'true' : 'false'
      }
    });
  }

  redirectToPurchaseReturn(row: any) {
    this.router.navigate(['/app/inventory/purchase-return/add'], {
      queryParams: {
        poId: row.id,
        supplierId: row.supplierId || row.partyId || row.vendorId || row.party_Id || row.id_Supplier || 0
      }
    });
  }

  // 2. Print logic
  // 2. Print logic
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
            data: { ...res, mode: mode, id: row.id, status: row.status }, // Pass status for conditional buttons
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
  // 1. User: Submit (Status: 'Submitted')
  onSubmitPO(row: any) {
    const poNumber = row.poNumber || 'N/A';

    const dialogRef = this.dialog.open(ActionConfirmDialog, {
      width: '400px',
      data: {
        title: 'Confirm Submission',
        message: `Do you want to send Po No: ${poNumber} for approval?`,
        confirmText: 'Submit',
        confirmColor: 'primary'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.updateStatus(row.id, 'Submitted', `PO ${poNumber} has been successfully submitted!`);
      }
    });
  }

  // 2. Manager: Approve (Status: 'Approved')
  onApprovePO(row: any) {
    const poNumber = row.poNumber || 'N/A';

    const dialogRef = this.dialog.open(ActionConfirmDialog, {
      width: '400px',
      data: {
        title: 'Approve PO',
        message: `Do you want to approve the PO NO: ${poNumber}?`,
        confirmText: 'Approve',
        confirmColor: 'success'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.updateStatus(row.id, 'Approved', 'PO Approved Successfully!');
      }
    });
  }

  // 3. Manager: Reject (Status: 'Rejected')
  onRejectPO(row: any) {
    // Debugging ke liye console zaroor check karein ki 'row' mein kya aa raha hai
    console.log('Rejecting Row:', row);

    const dialogRef = this.dialog.open(ReasonRejectDialog, {
      width: '450px',
      maxWidth: '90vw',
      disableClose: true,
      // Fallback logic: poNo check karein, agar nahi hai toh pono check karein [cite: 2026-01-22]
      data: { poNo: row.poNumber || row.poNumber || 'N/A' }
    });

    dialogRef.afterClosed().subscribe(reason => {
      if (reason) {
        this.poService.updatePOStatus(row.id, 'Rejected', reason).subscribe({
          next: () => {
            this.isLoading = false;
            this.cdr.detectChanges();
            this.dialog.open(StatusDialogComponent, {
              width: '400px',
              data: {
                title: 'Success',
                message: `PO ${row.poNumber || row.poNumber} has been rejected successfully.`,
                isSuccess: true
              }
            });
            this.loadData(this.currentGridState);
          },
          error: (err) => {
            this.dialog.open(StatusDialogComponent, {
              width: '400px',
              data: { title: 'Error', message: 'Failed to reject PO.', type: 'error', isSuccess: false, },

            });
          }
        });
      }
    });
  }

  // 4. Common Update Method with Status Dialog
  private updateStatus(id: number, status: string, successMessage: string) {
    console.log(`🚀 Updating PO ID: ${id} to Status: ${status}`);
    this.poService.updatePOStatus(id, status).subscribe({
      next: (response) => {
        console.log(`✅ Status Update Success for ID ${id}:`, response);
        this.isLoading = false;
        this.cdr.detectChanges();
        // SUCCESS logic: isSuccess ko true bhejna hai [cite: 2026-01-22]
        const dialogRef = this.dialog.open(StatusDialogComponent, {
          width: '350px',
          data: {
            message: successMessage,
            isSuccess: true // Aapke HTML mein yahi property use ho rahi hai [cite: 2026-01-22]
          }
        });

        setTimeout(() => dialogRef.close(), 2500);
        this.loadData(this.currentGridState);
      },
      error: (err) => {
        console.error(`❌ Status Update Error for ID ${id}:`, err);
        // ERROR logic: isSuccess ko false bhejna hai [cite: 2026-01-22]
        this.dialog.open(StatusDialogComponent, {
          width: '350px',
          data: {
            message: 'Server connectivity issue ya data validation error.',
            isSuccess: false // Error icon aur red color ke liye [cite: 2026-01-22]
          }
        });
      }
    });
  }

  onBulkSentForDraftApproval(selectedRows: any[]) {
    // 1. Validation: Only Drafts
    const draftRows = selectedRows.filter((row: any) => row.status === 'Draft');

    if (draftRows.length === 0) {
      this.notification.showStatus(false, 'Selected items must be in "Draft" status to submit.');
      return;
    }

    if (draftRows.length !== selectedRows.length) {
      this.notification.showStatus(false, 'Some selected items were skipped (not Draft). Processing valid ones only.');
    }

    // 2. Confirmation Dialog
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '450px',
      data: {
        title: 'Bulk Approval Submission',
        message: `Are you sure you want to send ${draftRows.length} POs for approval?`,
        confirmText: 'Yes, Send All',
        cancelText: 'Cancel'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.isLoading = true;
        const ids = draftRows.map((row: any) => row.id);

        this.poActionService.bulkSentForDraftApproval(ids).subscribe({
          next: () => {
            this.isLoading = false;
            this.notification.showStatus(true, 'Selected POs sent for approval successfully.');

            // Clear selection and reload
            if (this.grid && this.grid.selection) {
              this.grid.selection.clear();
            }
            this.loadData(this.currentGridState);
          },
          error: (err) => {
            console.error(err);
            this.isLoading = false;
            this.notification.showStatus(false, 'Failed to submit POs for approval.');
          }
        });
      }
    });
  }

  onBulkDraftApproved(selectedRows: any[]) {
    // 1. Validation: Only Submitted items usually, but strictly based on user req, maybe Drafts too?
    // Assuming we are approving drafts directly or similar state. 
    // The previous logic filtered 'Draft', lets see. The user said 'Bulk Draft Approved'.
    // If the API is bulkApprove, usually it moves status to Approved.
    // I'll check if they need to be in a specific state. 
    // Usually "Draft Approved" might mean skipping "Submitted" state or Approving "Submitted" ones.
    // Given the previous button was "Bulk Draft Approval" (which calls 'bulkSentForDraftApproval' -> changes status to Submitted?),
    // and this is "Bulk Draft Approved" (calls 'bulkDraftApprove' -> changes status to Approved?).

    // Let's assume we can approve from Draft or Submitted if the API allows. 
    // But usually approval happens on 'Submitted' items.
    // However, if the user explicitly calls it "Bulk Draft Approved", maybe they want to approve drafts directly?
    // Be safe, just send the IDs and let backend handle status checks, or filter for non-Approved.

    const validRows = selectedRows.filter((row: any) => row.status !== 'Approved'); // Basic check

    if (validRows.length === 0) {
      this.notification.showStatus(false, 'Selected items are already Approved.');
      return;
    }

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '450px',
      data: {
        title: 'Bulk Approve',
        message: `Are you sure you want to Approve ${validRows.length} POs?`,
        confirmText: 'Yes, Approve All',
        cancelText: 'Cancel'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.isLoading = true;
        this.cdr.detectChanges();
        const ids = validRows.map((row: any) => row.id);
        console.log('🚀 Bulk Approving PO IDs:', ids);

        this.poActionService.bulkDraftApprove(ids).subscribe({
          next: (res) => {
            console.log('✅ Bulk Approve Success Response:', res);
            this.isLoading = false;
            this.notification.showStatus(true, 'Selected POs Approved successfully.');
            if (this.grid && this.grid.selection) {
              this.grid.selection.clear();
            }
            this.loadData(this.currentGridState);
          },
          error: (err) => {
            console.error('❌ Bulk Approve Error:', err);
            this.isLoading = false;
            this.notification.showStatus(false, 'Failed to Approve POs.');
            this.cdr.detectChanges();
          }
        });
      }
    });
  }

  onBulkCreateGrn(selectedRows: any[]) {
    if (!selectedRows || selectedRows.length === 0) return;

    // Filter only those which are eligible for receive: Approved or Partially Received
    const eligibleOrders = selectedRows.filter(r =>
      ['approved', 'partially received'].includes(r.status?.toLowerCase())
    );

    if (eligibleOrders.length === 0) {
      this.dialog.open(StatusDialogComponent, {
        width: '400px',
        data: {
          type: 'info',
          title: 'Selection Invalid',
          message: 'Only Approved or Partially Received orders can be selected for Bulk Receiving.'
        }
      });
      return;
    }

    const totalQty = eligibleOrders.reduce((sum, r) => sum + (Number(r.totalPending || 0)), 0);
    const poNumbers = eligibleOrders.map(r => r.poNumber).join(', ');
    const breakdown = eligibleOrders.map(r => `${r.poNumber} (${r.totalPending || 0})`).join(', ');

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '450px',
      data: {
        title: 'Bulk Receive Items',
        message: `System will redirect you to create a Bulk Inward Gate Pass for ${eligibleOrders.length} selected POs. Do you want to continue?`,
        confirmText: 'Yes, Proceed',
        cancelText: 'Cancel',
        confirmColor: 'primary'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.router.navigate(['/app/inventory/gate-pass/inward'], {
          queryParams: {
            type: 'po',
            isBulk: 'true',
            refNo: 'BULK-INWARD',
            partyName: 'Multiple Suppliers',
            qty: totalQty,
            breakdown: breakdown,
            refId: eligibleOrders.map(r => r.id).join(',')
          }
        });
      }
    });
  }

  onBulkPOReject(selectedRows: any[]) {
    // 1. Filter for Submitted items (Since manager views Submitted items)
    // We can also double check that they are not already Rejected or Approved if needed
    // But Manager selects "Submitted" items mostly.

    if (!selectedRows || selectedRows.length === 0) return;

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '450px',
      data: {
        title: 'Bulk Reject',
        message: `Are you sure you want to Reject ${selectedRows.length} POs?`,
        confirmText: 'Yes, Reject All',
        cancelText: 'Cancel',
        confirmColor: 'warn'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.isLoading = true;
        this.cdr.detectChanges();
        const ids = selectedRows.map((row: any) => row.id);

        this.poActionService.bulkPOReject(ids).subscribe({
          next: () => {
            this.isLoading = false;
            this.notification.showStatus(true, 'Selected POs Rejected successfully.');
            if (this.grid && this.grid.selection) {
              this.grid.selection.clear();
            }
            this.loadData(this.currentGridState);
            this.cdr.detectChanges();
          },
          error: (err) => {
            console.error(err);
            this.isLoading = false;
            this.notification.showStatus(false, 'Failed to Reject POs.');
            this.cdr.detectChanges();
          }
        });
      }
    });
  }
}