import { Component, ViewChild, AfterViewInit, OnInit, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { ActivatedRoute } from '@angular/router';
import { FinanceService } from '../service/finance.service';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { LoadingService } from '../../../core/services/loading.service';
import { SupplierService, Supplier } from '../../inventory/service/supplier.service';
import { Observable, Subscription } from 'rxjs';
import { map, startWith, finalize } from 'rxjs/operators';
import { SummaryStat, SummaryStatsComponent } from '../../../shared/components/summary-stats-component/summary-stats-component';

@Component({
    selector: 'app-supplier-ledger',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, MaterialModule, SummaryStatsComponent],
    templateUrl: './supplier-ledger.component.html',
    styleUrl: './supplier-ledger.component.scss'
})
export class SupplierLedgerComponent implements OnInit, AfterViewInit, OnDestroy {

    supplierControl = new FormControl('');
    filteredSuppliers!: Observable<Supplier[]>;
    suppliers: Supplier[] = [];

    supplierId: number | null = null;
    ledgerData: any = null;
    displayedColumns: string[] = ['transactionDate', 'transactionType', 'referenceId', 'description', 'debit', 'credit', 'balance'];
    dataSource = new MatTableDataSource<any>([]);
    currentBalance: number = 0;
    isDashboardLoading: boolean = true;
    private isFirstLoad: boolean = true;
    private routeSub!: Subscription;

    // Server-side State
    totalCount = 0;
    pageSize = 10;
    pageNumber = 1;
    sortBy = 'TransactionDate';
    sortOrder = 'desc';
    isLoading = false;
    summaryStats: SummaryStat[] = [];

    filters = {
        startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        endDate: new Date(),
        type: '',
        reference: ''
    };


    @ViewChild(MatPaginator) paginator!: MatPaginator;
    @ViewChild(MatSort) sort!: MatSort;

    constructor(
        private financeService: FinanceService,
        private loadingService: LoadingService,
        private supplierService: SupplierService,
        private route: ActivatedRoute,
        private cdr: ChangeDetectorRef
    ) {
    }

    ngOnInit() {
        this.isDashboardLoading = true;
        this.isFirstLoad = true;
        this.loadingService.setLoading(true);

        this.loadSuppliers();

        this.filteredSuppliers = this.supplierControl.valueChanges.pipe(
            startWith(''),
            map(value => {
                if (typeof value === 'string') return value;
                return (value as any)?.name || '';
            }),
            map(name => name ? this._filter(name) : this.suppliers.slice())
        );

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

    private _filter(name: string): Supplier[] {
        const filterValue = name.toLowerCase();
        return this.suppliers.filter(supplier =>
            (supplier.name && supplier.name.toLowerCase().includes(filterValue)) ||
            (supplier.id && supplier.id.toString().includes(filterValue))
        );
    }

    displayFn(supplier: Supplier): string {
        return supplier && supplier.name ? `${supplier.name} (#${supplier.id})` : '';
    }

    loadSuppliers() {
        this.supplierService.getSuppliers().subscribe(data => {
            this.suppliers = data;

            // Check query params after lookups are loaded
            this.routeSub = this.route.queryParams.subscribe(params => {
                const sid = params['supplierId'];
                if (sid) {
                    this.supplierId = Number(sid);
                    this.preselectSupplier(this.supplierId);
                    this.loadLedger();
                    return; // loadLedger handles loader
                }

                // If no supplier in route, stop loader
                if (this.isFirstLoad) {
                    this.isFirstLoad = false;
                    this.isDashboardLoading = false;
                    this.loadingService.setLoading(false);
                    this.cdr.detectChanges();
                }
            });

            this.cdr.detectChanges();
        });
    }

    onSupplierSelected(event: any) {
        const supplier = event.option.value as Supplier;
        this.supplierId = supplier.id!;
        this.loadLedger();
    }

    preselectSupplier(id: number) {
        const supplier = this.suppliers.find(s => s.id === id);
        if (supplier) {
            this.supplierControl.setValue(supplier as any);
        }
    }

    ngOnDestroy() {
        if (this.routeSub) this.routeSub.unsubscribe();
    }


    private updateLoading(delta: number) {
        this.loadingService.setLoading(delta > 0);
    }

    ngAfterViewInit() {
        // We will assign paginator and sort in the template via event bindings
        // or keep them for reference if needed.
    }

    onPageChange(event: any) {
        this.pageNumber = event.pageIndex + 1;
        this.pageSize = event.pageSize;
        this.loadLedger();
    }

    onSortChange(event: any) {
        this.sortBy = event.active || 'TransactionDate';
        this.sortOrder = event.direction || 'desc';
        this.pageNumber = 1;
        if (this.paginator) this.paginator.pageIndex = 0;
        this.loadLedger();
    }

    updateReport() {
        this.pageNumber = 1;
        if (this.paginator) this.paginator.pageIndex = 0;
        this.loadLedger();
    }

    clearFilter(column: string) {
        if (column === 'type') this.filters.type = '';
        if (column === 'reference') this.filters.reference = '';
        this.updateReport();
    }

    loadLedger() {
        if (this.supplierId && this.supplierId > 0) {
            this.isLoading = true;
            this.loadingService.setLoading(true); // Global Loader

            const request = {
                supplierId: this.supplierId,
                pageNumber: this.pageNumber,
                pageSize: this.pageSize,
                sortBy: this.sortBy,
                sortOrder: this.sortOrder,
                startDate: this.filters.startDate.toISOString(),
                endDate: this.filters.endDate.toISOString(),
                typeFilter: this.filters.type,
                referenceFilter: this.filters.reference,
                searchTerm: ''
            };

            this.financeService.getSupplierLedger(request).pipe(
                finalize(() => {
                    this.isLoading = false;
                    this.loadingService.setLoading(false);
                    if (this.isFirstLoad) {
                        this.isFirstLoad = false;
                        this.isDashboardLoading = false;
                    }
                    this.cdr.detectChanges();
                })
            ).subscribe({
                next: (result: any) => {
                    if (result && result.ledger) {
                        this.ledgerData = result;
                        const items = (result.ledger.items || []).map((item: any) => {
                            if (item.transactionDate && typeof item.transactionDate === 'string' && !item.transactionDate.includes('Z') && !item.transactionDate.includes('+')) {
                                item.transactionDate += 'Z';
                            }
                            return item;
                        });
                        this.dataSource.data = items;
                        this.totalCount = result.ledger.totalCount || 0;
                        this.currentBalance = result.currentBalance || 0;

                        // Stats
                        this.summaryStats = [
                            {
                                label: 'Current Balance',
                                value: this.currentBalance >= 0 ? `₹${this.currentBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `₹${Math.abs(this.currentBalance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Adv)`,
                                icon: 'account_balance_wallet',
                                type: this.currentBalance > 0 ? 'warning' : 'success'
                            },
                            { label: 'Transactions', value: this.totalCount, icon: 'receipt_long', type: 'info' }
                        ];
                        console.log('Stats updated:', this.summaryStats);
                    } else {
                        this.dataSource.data = [];
                        this.currentBalance = 0;
                        this.totalCount = 0;
                        this.summaryStats = [];
                    }

                },
                error: (err) => {
                    console.error('Error fetching ledger:', err);
                    this.ledgerData = null;
                    this.dataSource.data = [];
                    this.totalCount = 0;
                    this.summaryStats = [];

                    if (err.status === 404) {
                        this.ledgerData = { supplierName: 'Not Found', ledger: [] };
                        this.dataSource.data = [];
                        this.currentBalance = 0;
                    } else {
                        this.ledgerData = null;
                        this.dataSource.data = [];
                        alert('Failed to fetch ledger. Please check Supplier ID.');
                    }

                }
            });
        }
    }

}
