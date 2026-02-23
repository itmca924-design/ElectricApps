import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSort, Sort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { Router } from '@angular/router';
import { SelectionModel } from '@angular/cdk/collections';
import { MaterialModule } from '../../../../shared/material/material/material-module';
import { SaleReturnService } from '../services/sale-return.service';
import { MatDialog } from '@angular/material/dialog';
import { StatusDialogComponent } from '../../../../shared/components/status-dialog-component/status-dialog-component';
import { SaleReturnDetailsModal } from '../sale-return-details-modal/sale-return-details-modal';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { LoadingService } from '../../../../core/services/loading.service';
import { GatePassService } from '../../gate-pass/services/gate-pass.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Component({
    selector: 'app-sale-return-list',
    standalone: true,
    imports: [CommonModule, MaterialModule, FormsModule],
    templateUrl: './sale-return-list.component.html',
    styleUrl: './sale-return-list.component.scss',
})
export class SaleReturnListComponent implements OnInit {
    private srService = inject(SaleReturnService);
    private gatePassService = inject(GatePassService);
    private router = inject(Router);
    private cdr = inject(ChangeDetectorRef);
    private dialog = inject(MatDialog);

    dataSource = new MatTableDataSource<any>();
    selection = new SelectionModel<any>(true, []);
    displayedColumns: string[] = ['select', 'returnNumber', 'gatePassNo', 'returnDate', 'customerName', 'soRef', 'totalQty', 'totalAmount', 'status', 'actions'];

    isTableLoading = true;
    isDashboardLoading: boolean = true;
    private isFirstLoad: boolean = true;
    private loadingService = inject(LoadingService);
    isExportLoading = false;

    searchKey: string = "";
    fromDate: Date | null = null;
    toDate: Date | null = null;

    // Active Filter State for Widgets
    activeStatus: string = "";

    totalRecords = 0;
    pageSize = 10;
    pageIndex = 0;

    sortField = 'ReturnDate';
    sortOrder = 'desc';

    stats = {
        todayCount: 0,
        totalRefund: 0,
        itemsReturned: 0,
        confirmedReturns: 0
    };

    filterValues: any = {
        returnNumber: '',
        customerName: ''
    };

    summaryData: any = {
        totalReturnsToday: 0,
        totalRefundValue: 0,
        stockRefilledPcs: 0,
        confirmedReturns: 0
    };

    @ViewChild(MatPaginator) paginator!: MatPaginator;
    @ViewChild(MatSort) sort!: MatSort;

    ngOnInit(): void {
        // Global loader ON
        this.isDashboardLoading = true;
        this.isFirstLoad = true;
        this.loadingService.setLoading(true);
        this.cdr.detectChanges();

        this.loadDashboardSummary();
        this.loadReturns();

        // Safety timeout - force stop loader after 10 seconds
        setTimeout(() => {
            if (this.isDashboardLoading) {
                console.warn('[SaleReturnList] Force stopping loader after 10s timeout');
                this.isDashboardLoading = false;
                this.isFirstLoad = false;
                this.loadingService.setLoading(false);
                this.cdr.detectChanges();
            }
        }, 10000);
    }

    loadDashboardSummary() {
        this.srService.getDashboardSummary().subscribe({
            next: (data) => {
                this.summaryData = data;
                this.cdr.detectChanges();
            },
            error: (err) => console.error("Summary load failed", err)
        });
    }


    filterByStatus(status: string) {
        this.activeStatus = this.activeStatus === status ? '' : status;
        this.pageIndex = 0;
        this.loadReturns();
    }

    private calculateStats(items: any[]) {
        if (!items || items.length === 0) {
            this.stats = { todayCount: 0, totalRefund: 0, itemsReturned: 0, confirmedReturns: 0 };
            return;
        }

        const todayStr = new Date().toDateString();

        this.stats.todayCount = items.filter(x => new Date(x.returnDate).toDateString() === todayStr).length;
        this.stats.totalRefund = items.reduce((acc, curr) => acc + (curr.totalAmount || 0), 0);
        this.stats.confirmedReturns = items.filter(x => x.status?.toUpperCase() === 'CONFIRMED').length;
        // Try multiple field names for Qty fallbacks [cite: 2026-02-21]
        this.stats.itemsReturned = items.reduce((acc, curr) => acc + (Number(curr.totalQty) || Number(curr.qty) || Number(curr.quantity) || Number(curr.returnQty) || Number(curr.returnQuantity) || 0), 0);
    }

    get selectedTotalQty(): number {
        return this.selection.selected.reduce((acc, curr) => acc + (Number(curr.totalQty) || Number(curr.qty) || Number(curr.quantity) || Number(curr.returnQty) || Number(curr.returnQuantity) || 0), 0);
    }

    applyColumnFilter(key: string, value: any) {
        this.filterValues[key] = value;
        const activeFilters = Object.values(this.filterValues).filter(v => v !== '');

        if (activeFilters.length > 0) {
            this.searchKey = activeFilters.join(' ');
        } else {
            this.searchKey = '';
        }

        this.pageIndex = 0;
        this.loadReturns();
    }

    clearColumnFilter(key: string) {
        this.filterValues[key] = '';
        this.applyColumnFilter(key, '');
    }

    onSortChange(sort: Sort) {
        this.sortField = sort.active;
        this.sortOrder = sort.direction || 'desc';
        this.loadReturns();
    }

    loadReturns() {
        this.isTableLoading = true;

        forkJoin({
            returns: this.srService.getSaleReturns(
                this.searchKey,
                this.pageIndex,
                this.pageSize,
                this.sortField,
                this.sortOrder,
                this.fromDate || undefined,
                this.toDate || undefined,
                this.activeStatus
            ),
            gatePasses: this.gatePassService.getGatePassesPaged({ pageSize: 150, sortField: 'CreatedAt', sortOrder: 'desc' }).pipe(catchError(() => of({ data: [] })))
        }).subscribe({
            next: (res: any) => {
                const returnData = res.returns;
                const gatePasses = res.gatePasses?.data || [];

                // 🚛 Match Returns with Gate Passes & Fix Timezone
                const processedItems = returnData.items.map((item: any) => {
                    // Fix Date to UTC if it doesn't have timezone info
                    if (item.returnDate && !item.returnDate.includes('Z')) {
                        item.returnDate = item.returnDate + 'Z';
                    }

                    // Match by RefNo (ReturnNumber) - Support bulk (comma)
                    const matchingPass = gatePasses.find((gp: any) =>
                        gp.referenceNo === item.returnNumber ||
                        (gp.referenceNo && gp.referenceNo.split(',').includes(item.returnNumber))
                    );
                    if (matchingPass) {
                        item.gatePassNo = matchingPass.passNo;
                    }
                    return item;
                });

                this.totalRecords = returnData.totalCount;

                // Fetch Detail for each item to populate Qty [cite: 2026-02-21]
                // Using getPrintData instead of getSaleReturnById as it is confirmed to work for qty
                if (processedItems.length > 0) {
                    const detailRequests = processedItems.map((item: any) =>
                        this.srService.getPrintData(item.saleReturnHeaderId || item.id).pipe(
                            catchError(() => of(null))
                        )
                    );

                    forkJoin(detailRequests).subscribe((details: any) => {
                        processedItems.forEach((item: any, index: number) => {
                            const detail = (details as any[])[index];
                            if (detail) {
                                // Try Multiple fields as per Popup mapping [cite: 2026-02-21]
                                const returnItems = detail.items || detail.saleReturnItems || detail.returnItems || [];
                                item.totalQty = returnItems.reduce((sum: number, i: any) =>
                                    sum + (Number(i.qty) || Number(i.returnQty) || Number(i.returnQuantity) || 0), 0);
                            }
                        });

                        this.calculateStats(processedItems);
                        this.dataSource.data = [...processedItems];
                        this.finishLoading();
                    });
                } else {
                    this.calculateStats(processedItems);
                    this.dataSource.data = processedItems;
                    this.finishLoading();
                }
            },
            error: (err) => {
                console.error("Error loading returns", err);
                this.finishLoading();
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
        this.searchKey = filterValue.trim().toLowerCase();
        this.activeStatus = ''; // Search karne par status filter clear kar dein
        this.pageIndex = 0;
        this.loadReturns();
    }

    navigateToCreate() {
        this.router.navigate(['/app/inventory/sale-return/add']);
    }

    createInwardGatePass(row: any) {
        this.router.navigate(['/app/inventory/gate-pass/inward'], {
            queryParams: {
                type: 'sale-return',
                refNo: row.returnNumber,
                refId: row.saleReturnHeaderId || row.id,
                partyName: row.customerName,
                qty: row.totalQty || 1
            }
        });
    }

    // Bulk Logic [cite: 2026-02-21]
    isAllSelected() {
        const numSelected = this.selection.selected.length;
        const selectableRows = this.dataSource.data.filter(row => !row.gatePassNo);
        const numRows = selectableRows.length;
        return numSelected > 0 && numSelected === numRows;
    }

    masterToggle() {
        this.isAllSelected() ?
            this.selection.clear() :
            this.dataSource.data.forEach(row => {
                if (!row.gatePassNo) {
                    this.selection.select(row);
                }
            });
    }

    createBulkInwardGatePass() {
        if (this.selection.selected.length < 2) return;

        const selectedCount = this.selection.selected.length;
        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            data: {
                title: 'Confirm Bulk Inward',
                message: `Are you sure you want to generate a single Inward Gate Pass for ${selectedCount} Sale Returns?`,
                confirmText: 'Yes, Proceed'
            }
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                this.loadingService.setLoading(true);
                const selectedItems = this.selection.selected;
                const ids = selectedItems.map(item => item.saleReturnHeaderId || item.id);

                // 1. Bulk Inward Status Update call [cite: 2026-02-21]
                this.srService.bulkInward(ids).subscribe({
                    next: () => {
                        // 2. Fetch full details for each selected item to get mapping data for Gate Pass
                        const detailRequests = selectedItems.map(item =>
                            this.srService.getPrintData(item.saleReturnHeaderId || item.id)
                        );

                        forkJoin(detailRequests).subscribe({
                            next: (details: any[]) => {
                                const refNos = selectedItems.map(item => item.returnNumber).join(',');
                                const refIds = ids.join(',');
                                const partyName = selectedItems[0].customerName;

                                const breakdown = details.map((d, idx) => {
                                    const itemsList = d.items || d.saleReturnItems || d.returnItems || [];
                                    const itemSum = itemsList.reduce((s: number, i: any) => s + (Number(i.qty) || Number(i.returnQty) || 0), 0);
                                    return `${selectedItems[idx].returnNumber}: ${itemSum} Pcs`;
                                }).join(', ');

                                const totalSumQty = details.reduce((total, d) => {
                                    const itemsList = d.items || d.saleReturnItems || d.returnItems || [];
                                    const itemSum = itemsList.reduce((s: number, i: any) => s + (Number(i.qty) || Number(i.returnQty) || 0), 0);
                                    return total + itemSum;
                                }, 0);

                                this.loadingService.setLoading(false);
                                this.router.navigate(['/app/inventory/gate-pass/inward'], {
                                    queryParams: {
                                        type: 'sale-return',
                                        refNo: refNos,
                                        refId: refIds,
                                        partyName: partyName,
                                        qty: totalSumQty,
                                        isBulk: true,
                                        breakdown: breakdown
                                    }
                                });
                            },
                            error: (err) => {
                                this.loadingService.setLoading(false);
                                console.error('Error fetching details for bulk:', err);
                                // Default redirect anyway even if qty fetch fails to not block the user
                                this.router.navigate(['/app/inventory/gate-pass/inward'], {
                                    queryParams: { type: 'sale-return', refNo: selectedItems.map(item => item.returnNumber).join(','), refId: ids.join(','), isBulk: true }
                                });
                            }
                        });
                    },
                    error: (err) => {
                        this.loadingService.setLoading(false);
                        console.error('Bulk Inward Status update failed', err);
                    }
                });
            }
        });
    }

    viewCreditNote(row: any) {
        const id = row.saleReturnHeaderId;
        this.isTableLoading = true;
        this.srService.getPrintData(id).subscribe({
            next: (res) => {
                this.isTableLoading = false;
                const modalData = { ...res, saleReturnHeaderId: id };
                this.dialog.open(SaleReturnDetailsModal, {
                    width: '850px',
                    data: modalData,
                    panelClass: 'custom-modalbox'
                });
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error("Popup data fetch failed", err);
                this.isTableLoading = false;
                this.cdr.detectChanges();
            }
        });
    }

    printCreditNote(row: any) {
        const returnId = row.saleReturnHeaderId;
        if (!returnId) return;

        this.isTableLoading = true;
        this.srService.printCreditNote(returnId).subscribe({
            next: (blob: Blob) => {
                const fileURL = URL.createObjectURL(blob);
                window.open(fileURL, '_blank');
                setTimeout(() => URL.revokeObjectURL(fileURL), 100);
                this.isTableLoading = false;
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error("PDF generation failed", err);
                this.isTableLoading = false;
                this.cdr.detectChanges();
            }
        });
    }

    deleteReturn(row: any) {
        const dialogRef = this.dialog.open(StatusDialogComponent, {
            data: {
                title: 'Confirm Delete',
                message: `Are you sure you want to delete ${row.returnNumber}?`,
                isConfirm: true
            }
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                this.srService.deleteSaleReturn(row.id).subscribe(() => {
                    this.loadReturns();
                });
            }
        });
    }

    exportToExcel() {
        this.isExportLoading = true;
        this.cdr.detectChanges();

        const start = this.fromDate ? new Date(this.fromDate).toISOString() : undefined;
        const end = this.toDate ? new Date(this.toDate).toISOString() : undefined;

        this.srService.downloadExcel(start, end).subscribe({
            next: (blob: Blob) => {
                if (blob.size > 0) {
                    const url = window.URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    const fileName = `SaleReturns_${new Date().toISOString().split('T')[0]}.xlsx`;
                    link.download = fileName;
                    link.click();
                    window.URL.revokeObjectURL(url);
                }
                this.isExportLoading = false;
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error("Excel Export Error:", err);
                this.isExportLoading = false;
                this.cdr.detectChanges();
            }
        });
    }
}