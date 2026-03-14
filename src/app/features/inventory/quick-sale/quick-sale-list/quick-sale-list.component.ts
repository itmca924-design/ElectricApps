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
import { SaleOrderService } from '../../service/saleorder.service';
import { SaleOrderDetailDialog } from '../../sale-order-detail-dialog/sale-order-detail-dialog';
import { FinanceService } from '../../../finance/service/finance.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Component({
  selector: 'app-quick-sale-list',
  standalone: true,
  imports: [
    MaterialModule,
    ReactiveFormsModule,
    FormsModule,
    CommonModule,
    EnterpriseHierarchicalGridComponent,
  ],
  providers: [CurrencyPipe, DatePipe],
  templateUrl: './quick-sale-list.component.html',
  styleUrl: './quick-sale-list.component.scss',
})
export class QuickSaleListComponent implements OnInit {
  private loadingService = inject(LoadingService);
  private permissionService = inject(PermissionService);

  public dataSource = new MatTableDataSource<any>([]);
  public totalRecords: number = 0;
  public totalSalesAmount: number = 0;
  public todayCount: number = 0;
  public monthCount: number = 0;
  public unpaidOrdersCount: number = 0;
  public pageSize: number = 10;
  public isLoading: boolean = false;
  public isDashboardLoading: boolean = true;
  private isFirstLoad: boolean = true;

  public soColumns: GridColumn[] = [];
  public itemColumns: GridColumn[] = [];

  public router = inject(Router);
  private currentGridState: any = {};

  private route = inject(ActivatedRoute);

  public highlightedSoId: any = null;

  selection = new SelectionModel<any>(true, []);
  selectedParentRows: any[] = [];

  private authService = inject(AuthService);
  userRole: any;

  // Permissions
  canAdd: boolean = true;
  canEdit: boolean = true;
  canDelete: boolean = true;

  @ViewChild(EnterpriseHierarchicalGridComponent) grid!: EnterpriseHierarchicalGridComponent;


  constructor(
    private inventoryService: InventoryService,
    private saleOrderService: SaleOrderService,
    private financeService: FinanceService,
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

    this.route.queryParams.subscribe(params => {
      if (params['soId']) {
        this.highlightedSoId = Number(params['soId']) || params['soId'];
      }
    });

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
    this.soColumns = [
      { field: 'soNumber', header: 'SO No.', sortable: true, isFilterable: true, isResizable: true, width: 135 },
      {
        field: 'soDate',
        header: 'Date',
        sortable: true,
        isResizable: true,
        width: 165,
        cell: (row: any) => this.datePipe.transform(row.soDate, 'dd/MM/yyyy hh:mm a', '+0530')
      },
      { field: 'customerName', header: 'Customer', sortable: true, isResizable: true, width: 220, isFilterable: true },
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
        isFilterable: true
      },
      {
        field: 'paymentStatus',
        header: 'Payment Status',
        sortable: false,
        isResizable: true,
        width: 130
      },
      { field: 'createdBy', header: 'Created By', sortable: true, width: 150 },
      { 
        field: 'remarks', header: 'Remarks', sortable: false, width: 180,
        cell: (row: any) => (row.remarks === 'Q Draft' && row.status === 'Confirmed') ? 'Confirmed' : (row.remarks || '—')
      }
    ];

    this.itemColumns = [
      { field: 'sno', header: '#', width: 50, cell: (row: any, index: number) => index + 1 },
      { field: 'productName', header: 'Product Name', width: 215, sortable: true },
      { field: 'qty', header: 'Qty', width: 90, align: 'left' },
      { field: 'unit', header: 'Unit', width: 85 },
      {
        field: 'rate', header: 'Rate', width: 105,
        cell: (row: any) => this.currencyPipe.transform(row.rate, 'INR', 'symbol', '1.2-2')
      },
      {
        field: 'discountPercent', header: 'Disc%', width: 80,
        cell: (row: any) => `${row.discountPercent}%`
      },
      {
        field: 'gstPercent', header: 'GST%', width: 80,
        cell: (row: any) => `${row.gstPercent}%`
      },
      { field: 'warehouseName', header: 'Warehouse', width: 140 },
      { field: 'rackName', header: 'Rack', width: 110 },
      {
        field: 'manufacturingDate', header: 'Mfg Date', width: 110,
        cell: (row: any) => row.manufacturingDate ? this.datePipe.transform(row.manufacturingDate, 'dd/MM/yyyy') : 'N/A'
      },
      {
        field: 'expiryDate', header: 'Exp Date', width: 110,
        cell: (row: any) => row.expiryDate ? this.datePipe.transform(row.expiryDate, 'dd/MM/yyyy') : 'N/A'
      },
      {
        field: 'total', header: 'Total', width: 110,
        cell: (row: any) => this.currencyPipe.transform(row.total, 'INR', 'symbol', '1.2-2')
      }
    ];
  }

  public onGridStateChange(state: any) {
    this.currentGridState = state;
    this.loadData(state);
  }

  public loadData(state: any) {
    this.isLoading = true;
    this.cdr.detectChanges();

    const pageIndex = (state.pageIndex ?? 0) + 1;
    const pageSize = state.pageSize ?? 10;
    const sortField = state.sortField ?? 'soDate';
    const sortOrder = state.sortOrder ?? 'desc';
    const searchTerm = state.globalSearch || '';

    forkJoin({
      sales: this.inventoryService.getQuickPagedSales(pageIndex, pageSize, sortField, sortOrder, searchTerm),
      pendingDues: this.financeService.getPendingCustomerDues().pipe(catchError(() => of([])))
    }).subscribe({
      next: (res: any) => {
        const salesData = res.sales;
        const pendingDues = res.pendingDues;

        const items = salesData.data || [];
        this.totalRecords = salesData.totalCount || 0;
        this.totalSalesAmount = salesData.totalSalesAmount || 0;
        this.todayCount = salesData.todayCount || 0; 
        this.monthCount = salesData.monthCount || 0; 
        this.unpaidOrdersCount = salesData.unpaidOrdersCount || 0;

        // 🧠 FIFO LOGIC for Customer Payment Status (Mirroring Standard SO Logic)
        const customerIds = [...new Set(items.map((i: any) => i.customerId))];

        customerIds.forEach(cid => {
          if (!cid) return;
          const customerDue = pendingDues.find((d: any) => d.customerId === cid);
          let runningDue = customerDue ? customerDue.pendingAmount : 0;

          // Newest orders first for FIFO tracking
          const custItems = items.filter((i: any) => i.customerId === cid)
            .sort((a: any, b: any) => new Date(b.soDate).getTime() - new Date(a.soDate).getTime());

          custItems.forEach((item: any) => {
            if (runningDue < -0.01) {
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
              item.paymentStatus = 'Paid';
              item.pendingAmount = 0;
            }
          });
        });

        this.dataSource.data = items;
        
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

  onDeleteSingleRecord(row: any) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Delete Quick Sale',
        message: `Do you want to delete Sale Order No: ${row.soNumber}? This will revert any stock deductions if the order was confirmed.`,
        confirmText: 'Yes, Delete',
        cancelText: 'No',
        confirmColor: 'warn'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.isLoading = true;
        this.inventoryService.deleteSaleOrder(row.id).subscribe({
          next: (res) => {
            this.isLoading = false;
            this.notification.showStatus(true, `Order: ${row.soNumber} deleted successfully!`);
            this.loadData(this.currentGridState);
            this.cdr.detectChanges();
          },
          error: (err) => {
            this.isLoading = false;
            this.notification.showStatus(false, err.error?.message || 'Failed to delete order.');
            this.cdr.detectChanges();
          }
        });
      }
    });
  }

  handleGridAction(event: { action: string, row: any }) {
    const row = event.row;
    switch (event.action) {
      case 'VIEW':
        this.onViewOrder(row);
        break;
      case 'EDIT':
          this.router.navigate(['/app/quick-inventory/sale/edit', row.id]);
          break;
      case 'DELETE':
        this.onDeleteSingleRecord(row);
        break;
      case 'PAYMENT':
        this.onCollectPayment(row);
        break;
      case 'RECEIPT':
        this.onDownloadReceipt(row);
        break;
      default:
        break;
    }
  }

  onViewOrder(row: any) {
    this.isLoading = true;
    this.saleOrderService.getSaleOrderById(row.id).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.dialog.open(SaleOrderDetailDialog, {
          width: '800px',
          data: res
        });
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoading = false;
        this.notification.showStatus(false, 'Failed to fetch order details.');
        this.cdr.detectChanges();
      }
    });
  }

  onCollectPayment(row: any) {
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

  onGridSelectionChange(selectedRows: any[]) {
    this.selectedParentRows = selectedRows;
  }

  onDownloadReceipt(row: any) {
    this.isLoading = true;
    this.cdr.detectChanges();

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
          this.printLatestReceipt(receipts[0], row);
        } else {
          // Fallback: search by amount if direct SO reference not found
          this.fetchReceiptByAmount(row);
        }
      },
      error: () => {
        this.isLoading = false;
        this.notification.showStatus(false, 'Unable to fetch receipt details.');
        this.cdr.detectChanges();
      }
    });
  }

  private fetchReceiptByAmount(row: any) {
    const generalRequest = {
      customerId: row.customerId,
      searchTerm: '',
      sortBy: 'TransactionDate',
      sortOrder: 'desc',
      pageNumber: 1,
      pageSize: 50
    };

    this.financeService.getCustomerLedger(generalRequest).subscribe({
      next: (res: any) => {
        this.isLoading = false;
        const items = res.ledger?.items || [];
        const receipts = items.filter((l: any) => l.transactionType === 'Receipt');
        const exactMatch = receipts.find((r: any) => Math.abs(r.credit - row.grandTotal) <= 0.01);

        if (exactMatch) {
          this.printLatestReceipt(exactMatch, row);
        } else if (receipts.length > 0) {
          this.printLatestReceipt(receipts[0], row);
        } else {
          this.notification.showStatus(false, 'No receipt found for this order.');
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoading = false;
        this.notification.showStatus(false, 'Unable to fetch receipt details.');
        this.cdr.detectChanges();
      }
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

  private generateVoucherPrint(receipt: any) {
    const printContent = `
      <div style="font-family: sans-serif; padding: 40px; border: 2px solid #333; max-width: 800px; margin: auto;">
        <div style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 20px;">
          <h1 style="margin: 0; color: #1e293b;">PAYMENT RECEIPT</h1>
          <p style="margin: 5px 0;">Official Acknowledgement of Payment</p>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
          <div><strong>Receipt No:</strong> CR-${receipt.id}<br><strong>Date:</strong> ${new Date(receipt.paymentDate).toLocaleDateString()}</div>
          <div style="text-align: right;"><strong>Reference:</strong> ${receipt.referenceNumber || 'N/A'}<br><strong>Mode:</strong> ${receipt.paymentMode}</div>
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
              <td style="padding: 20px; border-bottom: 1px solid #f1f5f9; color: #475569;">${receipt.remarks || 'Payment received towards outstanding balance.'}</td>
              <td style="padding: 20px; text-align: right; font-weight: bold; border-bottom: 1px solid #f1f5f9; font-size: 1.2rem;">₹${receipt.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            </tr>
          </table>
        </div>
        <div style="margin-top: 80px; display: flex; justify-content: space-between;">
          <div style="border-top: 2px solid #cbd5e1; width: 220px; text-align: center; padding-top: 10px; color: #64748b;">Customer Signature</div>
          <div style="border-top: 2px solid #cbd5e1; width: 220px; text-align: center; padding-top: 10px; color: #64748b;">Authorized Receiver</div>
        </div>
      </div>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`<html><head><title>Receipt - ${receipt.referenceNumber}</title></head><body onload="window.print();window.close()">${printContent}</body></html>`);
      printWindow.document.close();
    }
  }
}
