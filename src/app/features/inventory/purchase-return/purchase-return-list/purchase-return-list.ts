import { CommonModule, DatePipe, CurrencyPipe } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit, ViewChild } from '@angular/core';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSort, Sort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { ActivatedRoute, Router } from '@angular/router';
import { SelectionModel } from '@angular/cdk/collections';
import { MaterialModule } from '../../../../shared/material/material/material-module';
import { PurchaseReturnService } from '../services/purchase-return.service';
import { FormsModule } from '@angular/forms';
import { PurchaseReturnView } from '../purchase-return-view/purchase-return-view';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { CompanyService } from '../../../company/services/company.service';
import { CompanyProfileDto } from '../../../company/model/company.model';
import { environment } from '../../../../enviornments/environment';
import { LoadingService } from '../../../../core/services/loading.service';
import { GatePassService } from '../../gate-pass/services/gate-pass.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { PermissionService } from '../../../../core/services/permission.service';
import { ResizableColumnDirective } from '../../../../shared/directives/resizable-column.directive';
import { SharedPrintService } from '../../../../core/services/shared-print.service';

@Component({
  selector: 'app-purchase-return-list',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ResizableColumnDirective],
  providers: [DatePipe, CurrencyPipe],
  templateUrl: './purchase-return-list.html',
  styleUrl: './purchase-return-list.scss',
})
export class PurchaseReturnList implements OnInit {
  private loadingService = inject(LoadingService);
  private prService = inject(PurchaseReturnService);
  private gatePassService = inject(GatePassService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private cdr = inject(ChangeDetectorRef);
  private companyService = inject(CompanyService);
  private datePipe = inject(DatePipe);
  private currencyPipe = inject(CurrencyPipe);
  private permissionService = inject(PermissionService);
  private route = inject(ActivatedRoute);
  private sharedPrintService = inject(SharedPrintService);

  canAdd: boolean = true;
  isQuick: boolean = false;

  companyInfo: CompanyProfileDto | null = null;

  dataSource = new MatTableDataSource<any>();
  selection = new SelectionModel<any>(true, []);
  displayedColumns: string[] = ['select', 'returnNumber', 'gatePassNo', 'returnDate', 'supplierName', 'grnRef', 'totalQty', 'totalAmount', 'status', 'actions'];

  // Separate Loading States [cite: 2026-02-04]
  isTableLoading = true;
  isDashboardLoading: boolean = true;
  private isFirstLoad: boolean = true;
  isExportLoading = false;

  selectedReturn: any;
  searchKey: string = "";
  fromDate: Date | null = null;
  toDate: Date | null = null;

  totalRecords = 0;
  pageSize = 10;
  pageIndex = 0;
  activeStatus: string = "";

  // Stats data from API
  summaryData: any = {
    totalReturnsToday: 0,
    totalRefundValue: 0,
    stockReducedPcs: 0,
    confirmedReturns: 0,
    pendingOutwardCount: 0
  };

  totalReturnAmount: number = 0;
  confirmedReturnsCount: number = 0;
  totalReturnsCount: number = 0;
  totalItemsReturned: number = 0;

  get selectedTotalQty(): number {
    return this.selection.selected.reduce((sum, item) => sum + (Number(item.totalQty) || Number(item.qty) || Number(item.quantity) || Number(item.returnQty) || Number(item.returnQuantity) || 0), 0);
  }

  // Un-dispatched selected rows (جن کا gate pass نہیں ہے اور جو Quick بھی نہیں ہیں)
  get pendingOutwardSelected(): boolean {
    return this.selection.selected.some(r => !r.gatePassNo && !r.isQuick && !r.IsQuick);
  }

  get pendingOutwardSelectedCount(): number {
    return this.selection.selected.filter(r => !r.gatePassNo && !r.isQuick && !r.IsQuick).length;
  }

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  numberToWords(num: number): string {
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return '';
    let str = '';
    str += Number(n[1]) != 0 ? (a[Number(n[1])] || b[Number(n[1].toString().charAt(0))] + ' ' + a[Number(n[1].toString().charAt(1))]) + 'Crore ' : '';
    str += Number(n[2]) != 0 ? (a[Number(n[2])] || b[Number(n[2].toString().charAt(0))] + ' ' + a[Number(n[2].toString().charAt(1))]) + 'Lakh ' : '';
    str += Number(n[3]) != 0 ? (a[Number(n[3])] || b[Number(n[3].toString().charAt(0))] + ' ' + a[Number(n[3].toString().charAt(1))]) + 'Thousand ' : '';
    str += Number(n[4]) != 0 ? (a[Number(n[4])] || b[Number(n[4].toString().charAt(0))] + ' ' + a[Number(n[4].toString().charAt(1))]) + 'Hundred ' : '';
    str += Number(n[5]) != 0 ? (str != '' ? 'and ' : '') + (a[Number(n[5])] || b[Number(n[5].toString().charAt(0))] + ' ' + a[Number(n[5].toString().charAt(1))]) + 'only' : '';
    return str;
  }

  ngOnInit(): void {
    this.isQuick = (this.route as any).snapshot.data['isQuick'] || false;
    this.canAdd = this.permissionService.hasPermission('CanAdd');

    if (this.isQuick) {
      this.displayedColumns = this.displayedColumns.filter(c => c !== 'gatePassNo');
    }

    // Global loader ON - same as dashboard pattern
    this.isDashboardLoading = true;
    this.isFirstLoad = true;
    this.loadingService.setLoading(true);
    this.cdr.detectChanges();

    this.loadReturns();
    this.loadCompanyProfile();

    // Safety timeout - force stop loader after 10 seconds
    setTimeout(() => {
      if (this.isDashboardLoading) {
        console.warn('[PurchaseReturnList] Force stopping loader after 10s timeout');
        this.isDashboardLoading = false;
        this.isFirstLoad = false;
        this.loadingService.setLoading(false);
        this.cdr.detectChanges();
      }
    }, 10000);
  }

  loadCompanyProfile(): void {
    this.companyService.getCompanyProfile().subscribe({
      next: (res) => {
        this.companyInfo = res;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error fetching company profile:', err)
    });
  }

  getImgUrl(url: string | null | undefined): string {
    if (!url) return '';
    if (url.startsWith('data:image') || url.startsWith('http')) {
      return url;
    }
    const cleanUrl = url.startsWith('/') ? url.substring(1) : url;
    return `${environment.CompanyRootUrl}/${cleanUrl}`;
  }

  loadReturns() {
    this.isTableLoading = true;

    const start = this.fromDate ? this.fromDate.toISOString() : undefined;
    const end = this.toDate ? this.toDate.toISOString() : undefined;
    const sortField = this.sort?.active || 'ReturnDate';
    const sortOrder = this.sort?.direction || 'desc';

    forkJoin({
      returns: this.prService.getPurchaseReturns(
        this.searchKey,
        this.pageIndex,
        this.pageSize,
        start,
        end,
        sortField,
        sortOrder,
        this.activeStatus,
        this.isQuick
      ),
      summary: this.prService.getSummary(this.isQuick),
      gatePasses: this.gatePassService.getGatePassesPaged({ pageSize: 150, sortField: 'CreatedAt', sortOrder: 'desc' }).pipe(catchError(() => of({ data: [] })))
    }).subscribe({
      next: (res: any) => {
        const returnData = res.returns;
        this.summaryData = res.summary || this.summaryData;
        const gatePasses = res.gatePasses?.data || [];
        const items = returnData.items || [];

        // 🚛 Match Returns with Gate Passes & Fix Timezone
        items.forEach((item: any) => {
          // Fix Date: Treat as UTC if no timezone exists
          if (item.returnDate && typeof item.returnDate === 'string' && !item.returnDate.includes('Z') && !item.returnDate.includes('+')) {
            item.returnDate = item.returnDate + 'Z';
          }
          const matchingPass = gatePasses.find((gp: any) =>
            gp.referenceNo === item.returnNumber ||
            (gp.referenceNo && gp.referenceNo.split(',').includes(item.returnNumber))
          );
          if (matchingPass) {
            item.gatePassNo = matchingPass.passNo;
          }
        });

        this.dataSource.data = items;
        this.totalRecords = returnData.totalCount || 0;

        // Fetch Detail for each item to populate Qty [cite: 2026-02-21]
        // This is necessary because the list API doesn't return totalQty
        if (items.length > 0) {
          const detailRequests = items.map((item: any) =>
            this.prService.getPurchaseReturnById(item.purchaseReturnHeaderId || item.id).pipe(
              catchError(() => of(null))
            )
          );

          forkJoin(detailRequests).subscribe((details: any) => {
            items.forEach((item: any, index: number) => {
              const detail = (details as any[])[index];
              if (detail) {
                if (detail.items) {
                  item.totalQty = detail.items.reduce((sum: number, i: any) => sum + (Number(i.returnQty) || 0), 0);
                }
                item.isQuick = detail.isQuick !== undefined ? detail.isQuick : detail.IsQuick;
              }
            });

            this.calculateSummaryStats(items);
            this.dataSource.data = [...items];
            this.finishLoading();
          });
        } else {
          this.calculateSummaryStats(items);
          this.dataSource.data = items;
          this.finishLoading();
        }
      },
      error: (err) => {
        console.error("Load Error:", err);
        this.finishLoading();
      }
    });

  }

  private calculateSummaryStats(items: any[]) {
    this.totalReturnAmount = 0;
    this.confirmedReturnsCount = 0;
    this.totalReturnsCount = this.totalRecords;
    this.totalItemsReturned = items.reduce((sum: number, item: any) => sum + (Number(item.totalQty) || Number(item.qty) || Number(item.quantity) || Number(item.returnQty) || Number(item.returnQuantity) || 0), 0);

    items.forEach((item: any) => {
      if (item.status === 'Completed' || item.status === 'Confirmed') {
        this.totalReturnAmount += item.totalAmount || 0;
        this.confirmedReturnsCount++;
      }
    });
  }

  private finishLoading() {
    this.isTableLoading = false;
    if (this.isFirstLoad) {
      this.isFirstLoad = false;
      this.isDashboardLoading = false;
      this.loadingService.setLoading(false);
    }
    this.cdr.detectChanges();
  }

  onPageChange(event: PageEvent) {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadReturns();
  }

  applySearch(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    console.log("filterValue", filterValue);
    this.searchKey = filterValue.trim().toLowerCase();
    this.pageIndex = 0;
    this.loadReturns();
  }

  navigateToCreate() {
    const target = this.isQuick ? '/app/quick-inventory/po-return/add' : '/app/inventory/purchase-return/add';
    this.router.navigate([target]);
  }

  createOutwardGatePass(row: any) {
    this.router.navigate(['/app/inventory/gate-pass/outward'], {
      queryParams: {
        type: 'purchase-return',
        refNo: row.returnNumber,
        refId: row.purchaseReturnHeaderId || row.id,
        partyName: row.supplierName,
        qty: row.totalQty || 1
      }
    });
  }

  // Bulk Logic [cite: 2026-02-21]
  isAllSelected() {
    const numSelected = this.selection.selected.length;
    const numRows = this.dataSource.data.length;
    return numSelected > 0 && numSelected === numRows;
  }

  masterToggle() {
    this.isAllSelected() ?
      this.selection.clear() :
      this.dataSource.data.forEach(row => this.selection.select(row));
  }

  createBulkOutwardGatePass() {
    if (this.selection.selected.length < 2) return;

    // Sirf un-dispatched rows process karein (Quick Returns ko exclude karein kyunki wo Direct Outward hote hain)
    const pendingRows = this.selection.selected.filter(r => !r.gatePassNo && !r.isQuick && !r.IsQuick);

    if (pendingRows.length === 0) {
      this.dialog.open(ConfirmDialogComponent, {
        data: {
          title: 'Already Dispatched',
          message: 'All selected returns already have a Gate Pass. Please select returns that are pending outward dispatch.',
          confirmText: 'OK',
          cancelText: ''
        }
      });
      return;
    }

    const selectedCount = pendingRows.length;
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Confirm Bulk Outward',
        message: `Are you sure you want to generate a single Outward Gate Pass for ${selectedCount} Purchase Returns?`,
        confirmText: 'Yes, Proceed'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadingService.setLoading(true);
        const selectedItems = pendingRows; // sirf un-dispatched rows
        const ids = selectedItems.map(item => item.purchaseReturnHeaderId || item.id);

        // 1. Bulk Outward Status Update call [cite: 2026-02-21]
        this.prService.bulkOutward(ids).subscribe({
          next: () => {
            // 2. Fetch full details for each selected item to get mapping data for Gate Pass
            const detailRequests = selectedItems.map(item =>
              this.prService.getPurchaseReturnById(item.purchaseReturnHeaderId || item.id)
            );

            forkJoin(detailRequests).subscribe({
              next: (details: any[]) => {
                const refNos = selectedItems.map(item => item.returnNumber).join(',');
                const refIds = ids.join(',');
                const partyName = selectedItems[0].supplierName;

                // Sum up returnQty from all line items of all selected returns
                const totalSumQty = details.reduce((total, d) => {
                  const itemSum = (d.items || []).reduce((s: number, i: any) => s + (Number(i.returnQty) || 0), 0);
                  return total + itemSum;
                }, 0);

                this.loadingService.setLoading(false);
                this.router.navigate(['/app/inventory/gate-pass/outward'], {
                  queryParams: {
                    type: 'purchase-return',
                    refNo: refNos,
                    refId: refIds,
                    partyName: partyName,
                    qty: totalSumQty,
                    isBulk: true
                  }
                });
              },
              error: (err) => {
                this.loadingService.setLoading(false);
                console.error('Error fetching details for bulk:', err);
                // Fallback redirect
                this.router.navigate(['/app/inventory/gate-pass/outward'], {
                  queryParams: { type: 'purchase-return', refNo: selectedItems.map(item => item.returnNumber).join(','), refId: ids.join(','), isBulk: true }
                });
              }
            });
          },
          error: (err) => {
            this.loadingService.setLoading(false);
            console.error('Bulk Outward update failed', err);
          }
        });
      }
    });
  }

  viewDetails(row: any) {
    this.isTableLoading = true;
    this.prService.getPurchaseReturnById(row.id).subscribe({
      next: (res) => {
        console.log('popupdata', res);
        this.isTableLoading = false;
        this.cdr.detectChanges();
        this.dialog.open(PurchaseReturnView, {
          width: '800px',
          data: res
        });
      },
      error: () => {
        this.isTableLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  printReturn(row: any) {
    this.isTableLoading = true;
    this.prService.getPurchaseReturnById(row.id).subscribe({
      next: (fullOrder) => {
        this.selectedReturn = fullOrder;
        this.isTableLoading = false;
        this.cdr.detectChanges();
        
        this.sharedPrintService.printDocument(
          this.isQuick ? 'Quick Purchase Return' : 'Purchase Return', 
          'PR', 
          fullOrder
        );
      },
      error: (err) => {
        this.isTableLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  exportToExcel() {
    this.isExportLoading = true; // Button specific loader [cite: 2026-02-04]
    const start = this.fromDate ? this.fromDate.toISOString() : undefined;
    const end = this.toDate ? this.toDate.toISOString() : undefined;

    this.prService.downloadExcel(start, end).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `PurchaseReturns_${new Date().toISOString().split('T')[0]}.xlsx`;
        link.click();
        window.URL.revokeObjectURL(url);
        this.isExportLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isExportLoading = false;
        this.cdr.detectChanges();
      }
    });
  }
}