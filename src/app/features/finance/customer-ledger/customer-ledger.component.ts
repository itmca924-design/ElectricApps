import { Component, ViewChild, AfterViewInit, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { FinanceService } from '../service/finance.service';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { customerService } from '../../master/customer-component/customer.service';
import { Observable } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import { MatDialog } from '@angular/material/dialog';
import { StatusDialogComponent } from '../../../shared/components/status-dialog-component/status-dialog-component';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingService } from '../../../core/services/loading.service';
import { ChangeDetectorRef } from '@angular/core';
import { SummaryStat, SummaryStatsComponent } from '../../../shared/components/summary-stats-component/summary-stats-component';
import { forkJoin, of } from 'rxjs';
import { SaleOrderService } from '../../inventory/service/saleorder.service';

@Component({
    selector: 'app-customer-ledger',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, MaterialModule, SummaryStatsComponent],
    templateUrl: './customer-ledger.component.html',
    styleUrl: './customer-ledger.component.scss'
})
export class CustomerLedgerComponent implements OnInit, AfterViewInit {
    customerControl = new FormControl('');
    filteredCustomers!: Observable<any[]>;
    customers: any[] = [];

    customerId: number | null = null;
    ledgerData: any = null;
    displayedColumns: string[] = ['transactionDate', 'transactionType', 'referenceId', 'description', 'debit', 'credit', 'balance'];
    dataSource = new MatTableDataSource<any>([]);
    currentBalance: number = 0;
    isLoading: boolean = false;
    isDashboardLoading: boolean = true;
    private isFirstLoad: boolean = true;
    summaryStats: SummaryStat[] = [];

    // Server-side State
    totalCount = 0;
    pageSize = 10;
    pageNumber = 1;
    sortBy = 'TransactionDate';
    sortOrder = 'desc';

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
        private customerService: customerService,
        private dialog: MatDialog,
        private route: ActivatedRoute,
        private router: Router,
        private loadingService: LoadingService,
        private cdr: ChangeDetectorRef,
        private saleOrderService: SaleOrderService
    ) { }

    ngOnInit() {
        this.isDashboardLoading = true;
        this.isFirstLoad = true;
        this.loadingService.setLoading(true);

        this.loadCustomers();
        this.filteredCustomers = this.customerControl.valueChanges.pipe(
            startWith(''),
            map(value => {
                const name = typeof value === 'string' ? value : (value as any)?.name;
                // Fix: ensure customers is array before slice
                return name ? this._filter(name as string) : (Array.isArray(this.customers) ? this.customers.slice() : []);
            }),
        );

        // Auto-detect customer ID even from manual typing to enable "Show Ledger" button
        this.customerControl.valueChanges.subscribe(value => {
            if (!value) {
                this.customerId = null;
            } else if (value && typeof value === 'object') {
                this.customerId = (value as any).id;
            } else {
                // If user types exact name, find it in the lookup
                const match = (this.customers || []).find(c => c.name.toLowerCase() === value.toLowerCase());
                this.customerId = match ? match.id : null;
            }
            this.cdr.detectChanges();
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

    ngAfterViewInit() {
        // Handled via onSortChange and onPageChange
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

    private _filter(name: string): any[] {
        const filterValue = name.toLowerCase();
        if (!Array.isArray(this.customers)) return [];
        return this.customers.filter(customer =>
            (customer.name as string).toLowerCase().includes(filterValue) ||
            customer.id.toString().includes(filterValue)
        );
    }

    displayFn(customer: any): string {
        return customer && customer.name ? `${customer.name} (#${customer.id})` : '';
    }

    loadCustomers() {
        this.customerService.getCustomersLookup().subscribe((data: any) => {
            this.customers = Array.isArray(data) ? data : [];

            // Param check after load
            this.route.queryParams.subscribe(params => {
                if (params['customerId']) {
                    const id = Number(params['customerId']);
                    const customer = this.customers.find(c => c.id === id);
                    if (customer) {
                        this.customerControl.setValue(customer);
                        this.customerId = id;
                        this.loadLedger();
                        return; // loadLedger will handle stopping the loader
                    }
                }

                // If no customer to load, stop the loader here
                if (this.isFirstLoad) {
                    this.isFirstLoad = false;
                    this.isDashboardLoading = false;
                    this.loadingService.setLoading(false);
                    this.cdr.detectChanges();
                }
            });
        });
    }

    handleEnterKey() {
        if (this.customerId) {
            this.loadLedger();
        }
    }

    onCustomerSelected(event: any) {
        const customer = event.option.value;
        this.customerId = customer.id;
        this.loadLedger();
    }

    loadLedger() {
        if (!this.filters.startDate || !this.filters.endDate) return;

        this.isLoading = true;
        this.loadingService.setLoading(true);

        const start = new Date(this.filters.startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(this.filters.endDate);
        end.setHours(23, 59, 59, 999);

        if (this.customerId && this.customerId > 0) {
            // SPECIFIC CUSTOMER VIEW (Original Logic)
            const request = {
                customerId: this.customerId,
                pageNumber: this.pageNumber,
                pageSize: this.pageSize,
                sortBy: this.sortBy,
                sortOrder: this.sortOrder,
                startDate: start.toISOString(),
                endDate: end.toISOString(),
                typeFilter: this.filters.type,
                referenceFilter: this.filters.reference,
                searchTerm: ''
            };

            this.financeService.getCustomerLedger(request).subscribe({
                next: (data: any) => this.handleResponse(data),
                error: (err) => this.handleError(err)
            });
        } else {
            // CONSOLIDATED VIEW (All Customers)
            const receiptReq = this.financeService.getReceiptsReport({
                startDate: start.toISOString(),
                endDate: end.toISOString(),
                pageNumber: 1,
                pageSize: 2000, 
                sortBy: 'ReceiptDate',
                sortOrder: 'desc'
            });

            const saleReq = this.saleOrderService.getSaleOrders(1, 2000, 'soDate', 'desc', '', start, end);

            forkJoin([receiptReq, saleReq]).subscribe({
                next: ([receiptsRes, salesRes]: any) => {
                    const mappedReceipts = (receiptsRes.items || []).map((r: any) => ({
                        transactionDate: r.receiptDate || r.ReceiptDate,
                        transactionType: 'Receipt',
                        referenceId: r.referenceNumber || r.ReferenceNumber || '-',
                        description: `Received from ${r.customerName || 'Customer'}`,
                        debit: 0,
                        credit: r.amount || r.Amount || 0,
                        balance: 0 
                    }));

                    const mappedSales = (salesRes.data || salesRes.items || []).map((s: any) => ({
                        transactionDate: s.soDate || s.SoDate || s.date,
                        transactionType: 'Sales',
                        referenceId: s.soNumber || s.SoNumber || '-',
                        description: `Sale to ${s.customerName || 'Cash Customer'}`,
                        debit: s.grandTotal || s.GrandTotal || 0,
                        credit: 0,
                        balance: 0
                    }));

                    const combined = [...mappedReceipts, ...mappedSales].sort((a: any, b: any) => 
                        new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()
                    );

                    this.handleResponse({
                        ledger: { items: combined, totalCount: combined.length },
                        customerName: 'Consolidated Transaction History',
                        currentBalance: 0
                    });
                },
                error: (err) => this.handleError(err)
            });
        }
    }

    private handleResponse(data: any) {
        this.isLoading = false;
        this.loadingService.setLoading(false);
        this.ledgerData = data;
        if (data && data.ledger) {
            const items = (data.ledger.items || []).map((item: any) => {
                const d = item.transactionDate;
                if (d && typeof d === 'string' && !/[Zz]$/.test(d) && !/[+-]\d{2}:\d{2}$/.test(d)) {
                    item.transactionDate = d + 'Z';
                }
                return item;
            });
            this.dataSource.data = items;
            this.totalCount = data.ledger.totalCount || 0;
            this.currentBalance = data.currentBalance || 0;

            this.summaryStats = [
                {
                    label: this.customerId ? 'Current Balance' : 'Transactions Total',
                    value: this.customerId ? 
                        (this.currentBalance >= 0 ? `₹${this.currentBalance.toLocaleString('en-IN')}` : `₹${Math.abs(this.currentBalance).toLocaleString('en-IN')} (Adv)`) :
                        `Entries: ${this.totalCount}`,
                    icon: 'account_balance_wallet',
                    type: this.customerId ? (this.currentBalance > 0 ? 'warning' : 'success') : 'info'
                }
            ];
        }
        
        if (this.isFirstLoad) {
            this.isFirstLoad = false;
            this.isDashboardLoading = false;
        }
        this.cdr.detectChanges();
    }

    private handleError(err: any) {
        this.isLoading = false;
        this.loadingService.setLoading(false);
        console.error('Error fetching data:', err);
        this.ledgerData = null;
        this.dataSource.data = [];
        this.totalCount = 0;
        this.summaryStats = [];
        this.cdr.detectChanges();
    }
    goToReceipt() {
        if (!this.customerId) return;
        this.router.navigate(['/app/finance/customers/receipt'], {
            queryParams: {
                customerId: this.customerId,
                amount: this.currentBalance
            }
        });
    }
}
