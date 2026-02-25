import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild, AfterViewInit, ChangeDetectorRef, inject } from '@angular/core';
import { LoadingService } from '../../../core/services/loading.service';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { Router, RouterLink } from '@angular/router';
import { InventoryService } from '../service/inventory.service';
import { merge, of, forkJoin } from 'rxjs';
import { FinanceService } from '../../finance/service/finance.service';
import { startWith, switchMap, map, catchError, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { PoSelectionDialog } from '../po-selection-dialog/po-selection-dialog';
import { MatDialog } from '@angular/material/dialog';
import { GrnPrintDialogComponent } from '../grn-print-dialog/grn-print-dialog.component';
import { animate, state, style, transition, trigger } from '@angular/animations';

export interface GRNItem {
  productName: string;
  orderedQty: number;
  receivedQty: number;
  pendingQty: number;
  rejectedQty: number;
  unitRate: number;
}

export interface GRNListRow {
  id: number;
  grnNo: string;
  refPO: string;
  supplierName: string;
  supplierId: number;  // For payment navigation
  receivedDate: string | Date;
  status: string;
  paymentStatus: string;  // Paid, Partial, Unpaid
  totalAmount: number;    // GRN Total Amount
  adjustedDue?: number;   // Calculated net due after ledger adjustments
  totalRejected: number;
  items: GRNItem[];
}

@Component({
  selector: 'app-grn-list-component',
  standalone: true,
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './grn-list-component.html',
  styleUrl: './grn-list-component.scss',

  animations: [
    trigger('detailExpand', [
      state('collapsed', style({ height: '0px', minHeight: '0', display: 'none' })),
      state('expanded', style({ height: '*' })),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),
  ],
})
export class GrnListComponent implements OnInit, AfterViewInit {
  private loadingService = inject(LoadingService);

  // Columns matching Backend DTO
  displayedColumns: string[] = ['grnNo', 'refPO', 'supplierName', 'receivedDate', 'totalAmount', 'status', 'paymentStatus', 'actions'];
  dataSource = new MatTableDataSource<GRNListRow>([]);

  // Expansion variable jo HTML ko chahiye
  expandedElement: GRNListRow | null = null;

  // Search and Pagination states
  resultsLength = 0;
  isLoadingResults = true;
  isDashboardLoading: boolean = true;
  private isFirstLoad: boolean = true;
  searchControl = new FormControl('');

  // Child Table Paging variables
  innerPageIndex = 0;
  innerPageSize = 10;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  // Stats
  totalStockAmount: number = 0;
  pendingPaymentCount: number = 0;
  qualityIssueCount: number = 0;
  totalRejectedItemsQty: number = 0;

  constructor(
    private router: Router,
    private cdr: ChangeDetectorRef,
    private inventoryService: InventoryService,
    private financeService: FinanceService,
    private dialog: MatDialog
  ) { }

  ngOnInit(): void {
    this.searchControl.disable({ emitEvent: false });

    // Search input par debounce lagaya hai taaki har word par API call na ho [cite: 2026-01-22]
    this.searchControl.valueChanges.pipe(
      debounceTime(400),
      distinctUntilChanged()
    ).subscribe(() => {
      this.paginator.pageIndex = 0;
      this.loadGRNData();
    });
  }

  ngAfterViewInit() {
    // Sorting change hone par page index reset karein [cite: 2026-01-22]
    this.sort.sortChange.subscribe(() => (this.paginator.pageIndex = 0));

    // Global loader ON - same as dashboard/po-list pattern
    this.isDashboardLoading = true;
    this.isFirstLoad = true;
    this.loadingService.setLoading(true);
    this.cdr.detectChanges();

    // Merge Sort, Page aur Search events into one stream [cite: 2026-01-22]
    // Fix NG0100: Wrap in setTimeout to avoid ExpressionChangedAfterItHasBeenCheckedError
    setTimeout(() => {
      this.loadGRNData();
    });

    // Safety timeout - force stop loader after 10 seconds
    setTimeout(() => {
      if (this.isDashboardLoading) {
        console.warn('[GrnList] Force stopping loader after 10s timeout');
        this.isDashboardLoading = false;
        this.isFirstLoad = false;
        this.loadingService.setLoading(false);
        this.cdr.detectChanges();
      }
    }, 10000);
  }

  loadGRNData() {
    merge(this.sort.sortChange, this.paginator.page)
      .pipe(
        startWith({}),
        switchMap(() => {
          // Loader ON: API call start [cite: 2026-01-22]
          this.isLoadingResults = true;
          this.searchControl.disable({ emitEvent: false });
          this.cdr.detectChanges();
          return forkJoin({
            grnData: this.inventoryService.getGRNPagedList(
              this.sort.active,
              this.sort.direction,
              this.paginator.pageIndex,
              this.paginator.pageSize,
              this.searchControl.value || ''
            ),
            pendingDues: this.financeService.getPendingDues().pipe(catchError(() => of([])))
          }).pipe(
            catchError(() => {
              this.isLoadingResults = false;
              this.searchControl.enable({ emitEvent: false });
              if (this.isFirstLoad) {
                this.isFirstLoad = false;
                this.isDashboardLoading = false;
                this.loadingService.setLoading(false);
              }
              return of(null);
            })
          );
        }),
        map(result => {
          this.isLoadingResults = false;
          this.searchControl.enable({ emitEvent: false });

          if (this.isFirstLoad) {
            this.isFirstLoad = false;
            this.isDashboardLoading = false;
            this.loadingService.setLoading(false);
          }
          this.cdr.detectChanges();

          if (!result || !result.grnData) return [];

          const data = result.grnData;
          const pendingDues = result.pendingDues;

          this.resultsLength = data.totalCount;

          // 🧠 SMART FIFO LOGIC for Payment Status:
          // We apply the supplier's total debt to bills starting from the NEWEST towards the OLDEST.
          // Any bill not covered by the current "Total Due" is considered PAID.

          const items = data.items;
          const supplierIds = [...new Set(items.map((i: any) => i.supplierId))];

          supplierIds.forEach(sid => {
            const supplierDue = pendingDues.find((d: any) => d.supplierId === sid);
            let runningDue = supplierDue ? supplierDue.pendingAmount : 0;

            // Sort supplier's items in THIS page by date DESC (Newest first)
            const supItemsInPage = items.filter((i: any) => i.supplierId === sid)
              .sort((a: any, b: any) => new Date(b.receivedDate).getTime() - new Date(a.receivedDate).getTime());

            supItemsInPage.forEach((item: any) => {
              if (runningDue <= 0.01) {
                item.paymentStatus = 'Paid';
                item.adjustedDue = 0;
              } else if (runningDue >= item.totalAmount - 0.01) {
                item.paymentStatus = item.paymentStatus === 'Paid' ? 'Paid' : 'Unpaid';
                item.adjustedDue = item.totalAmount;
                runningDue -= item.totalAmount;
              } else {
                item.paymentStatus = 'Partial';
                item.adjustedDue = runningDue;
                runningDue = 0;
              }
            });
          });

          // Aggregating Stats
          this.totalStockAmount = 0;
          this.pendingPaymentCount = 0;
          this.qualityIssueCount = 0;
          this.totalRejectedItemsQty = 0;

          items.forEach((item: any) => {
            this.totalStockAmount += item.totalAmount || 0;
            if (item.paymentStatus === 'Unpaid' || item.paymentStatus === 'Partial') {
              this.pendingPaymentCount++;
            }

            const rejQty = item.totalRejected || item.items?.reduce((acc: number, curr: any) => acc + (curr.rejectedQty || 0), 0) || 0;
            if (rejQty > 0) {
              this.qualityIssueCount++;
              this.totalRejectedItemsQty += rejQty;
            }
          });

          return items.map((item: any): GRNListRow => {
            // Normalize Date to UTC if it doesn't have timezone
            if (item.receivedDate && typeof item.receivedDate === 'string' && !item.receivedDate.includes('Z')) {
              item.receivedDate += 'Z';
            }
            return {
              ...item,
              items: item.items || [],
              totalRejected: item.items?.reduce((acc: number, curr: any) => acc + (curr.rejectedQty || 0), 0) || 0
            };
          });
        })
      ).subscribe(data => {
        this.dataSource.data = data;
        console.log('GRN Data Loaded:', data);
      });
  }

  toggleRow(row: GRNListRow) {
    if (this.expandedElement === row) {
      this.expandedElement = null;
    } else {
      this.expandedElement = row;
      this.innerPageIndex = 0; // Reset paging when expanding new row
    }
  }

  onInnerPageChange(event: any) {
    this.innerPageIndex = event.pageIndex;
    this.innerPageSize = event.pageSize;
  }

  getRowItems(row: any): GRNItem[] {
    return (row as GRNListRow).items || [];
  }

  calculateTotalOrdered(row: any): number {
    const items = (row as GRNListRow).items || [];
    return items.reduce((sum, item) => sum + (Number(item.orderedQty) || 0), 0);
  }

  calculateTotalReceived(row: any): number {
    const items = (row as GRNListRow).items || [];
    return items.reduce((sum, item) => sum + (Number(item.receivedQty) || 0), 0);
  }

  // Navigation Logic
  viewGRN(id: number) {
    this.router.navigate(['/app/inventory/grn-list/view', id]);
  }

  printGRN(grn: any) {
    this.dialog.open(GrnPrintDialogComponent, {
      width: '900px',
      maxWidth: '95vw',
      data: { grnNo: grn.grnNo },
      panelClass: 'grn-print-dialog'
    });
  }

  applyFilter(event: any) { }

  openPOSearchDialog() {
    const dialogRef = this.dialog.open(PoSelectionDialog, {
      width: '600px',
      disableClose: true,
      panelClass: 'custom-dialog-container'
    });

    dialogRef.afterClosed().subscribe(selectedPO => {
      if (selectedPO) {
        // Selected PO milne par GRN form par navigate karein
        this.router.navigate(['/app/inventory/grn-list/add'], {
          queryParams: { poId: selectedPO.id, poNo: selectedPO.poNumber }
        });
      }
    });
  }

  makePayment(grn: any) {
    console.log('=== Make Payment Clicked ===');
    console.log('GRN Data:', grn);
    console.log('Supplier ID:', grn.supplierId);

    // Navigate to Payment Entry with supplier pre-selected and balance amount
    if (grn.supplierId) {
      console.log('Navigating to payment with supplierId:', grn.supplierId);

      // Use the smart 'adjustedDue' we calculated in FIFO
      const suggestAmount = grn.adjustedDue !== undefined ? grn.adjustedDue : grn.totalAmount;

      this.router.navigate(['/app/finance/suppliers/payment'], {
        queryParams: {
          supplierId: grn.supplierId,
          amount: suggestAmount,
          currentDue: suggestAmount, // Pass the same as current due to avoid UI mismatch
          grnNumber: grn.grnNo,
          poNumber: grn.refPO
        }
      });
    } else {
      console.error('❌ Supplier ID not found for GRN:', grn);
      alert(`Supplier ID missing for GRN: ${grn.grnNo}. Cannot make payment.`);
    }
  }
}