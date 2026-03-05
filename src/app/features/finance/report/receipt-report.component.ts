import { Component, OnInit, ViewChild, AfterViewInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { FinanceService } from '../service/finance.service';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { finalize, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { ActivatedRoute } from '@angular/router';
import { LoadingService } from '../../../core/services/loading.service';
import { customerService } from '../../master/customer-component/customer.service';
import { Observable, map, startWith } from 'rxjs';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Optional, Inject } from '@angular/core';

@Component({
    selector: 'app-receipt-report',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, MaterialModule],
    templateUrl: './receipt-report.component.html',
    styleUrl: './receipt-report.component.scss'
})
export class ReceiptReportComponent implements OnInit, AfterViewInit {
    displayedColumns: string[] = ['receiptDate', 'customerName', 'receiptMode', 'referenceNumber', 'amount', 'actions'];
    dataSource = new MatTableDataSource<any>([]);
    isLoading = false;
    isDashboardLoading: boolean = true;
    isDialog: boolean = false;
    private isFirstLoad: boolean = true;

    // Server-side State
    totalCount = 0;
    pageSize = 10;
    pageNumber = 1;
    sortBy = 'ReceiptDate';
    sortOrder = 'desc';

    // Search & Autocomplete
    searchControl = new FormControl<string | any>('');
    customers: any[] = [];
    filteredCustomers!: Observable<any[]>;

    private loadingService = inject(LoadingService);
    private customerSvc = inject(customerService);
    private cdr = inject(ChangeDetectorRef);

    filters = {
        startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        endDate: new Date()
    };

    @ViewChild(MatPaginator) paginator!: MatPaginator;
    @ViewChild(MatSort) sort!: MatSort;

    constructor(
        private financeService: FinanceService,
        private route: ActivatedRoute,
        @Optional() public dialogRef: MatDialogRef<ReceiptReportComponent>,
        @Optional() @Inject(MAT_DIALOG_DATA) public data: any
    ) {
        this.isDialog = !!this.dialogRef;
        if (this.isDialog) {
            this.isDashboardLoading = false;
        }
    }

    ngOnInit() {
        this.isDashboardLoading = true;
        this.isFirstLoad = true;
        this.loadingService.setLoading(true);

        this.loadCustomers();
        this.loadReport();

        // Autocomplete filtering
        this.filteredCustomers = this.searchControl.valueChanges.pipe(
            startWith(''),
            map(value => {
                const name = typeof value === 'string' ? value : value?.name;
                return name ? this._filter(name) : this.customers.slice();
            })
        );

        // Dynamic search with debounce
        this.searchControl.valueChanges.pipe(
            debounceTime(600),
            distinctUntilChanged()
        ).subscribe(value => {
            this.pageNumber = 1;
            if (this.paginator) this.paginator.pageIndex = 0;
            this.loadReport();
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

    private _filter(value: string): any[] {
        const filterValue = value.toLowerCase();
        return this.customers.filter(c =>
            (c.customerName || '').toLowerCase().includes(filterValue) ||
            c.id?.toString().includes(filterValue)
        );
    }

    loadCustomers() {
        this.customerSvc.getAllCustomers().subscribe((data: any) => {
            this.customers = data || [];

            // Check for query parameters first, then dialog data
            const customerIdFromRoute = this.route.snapshot.queryParams['customerId'];
            const customerId = customerIdFromRoute || this.data?.customerId;

            if (customerId) {
                const customer = this.customers.find(c => c.id === Number(customerId));
                if (customer) {
                    this.searchControl.setValue(customer);
                    this.applyFilterValue(customer.customerName || '');
                }
            }
        });
    }

    onCustomerSelected(event: any) {
        this.pageNumber = 1;
        if (this.paginator) this.paginator.pageIndex = 0;
    }

    onPageChange(event: any) {
        this.pageNumber = event.pageIndex + 1;
        this.pageSize = event.pageSize;
        this.loadReport();
    }

    onSortChange(event: any) {
        this.sortBy = event.active || 'ReceiptDate';
        this.sortOrder = event.direction || 'desc';
        this.pageNumber = 1;
        if (this.paginator) this.paginator.pageIndex = 0;
        this.loadReport();
    }

    applyFilterValue(value: string) {
        this.pageNumber = 1;
        if (this.paginator) this.paginator.pageIndex = 0;
        this.loadReport();
    }

    clearSearch() {
        this.searchControl.setValue('');
        this.applyFilterValue('');
    }

    displayFn(customer: any): string {
        return customer && customer.customerName ? customer.customerName : '';
    }

    closeDialog() {
        if (this.dialogRef) {
            this.dialogRef.close();
        }
    }

    get searchDisplayText(): string {
        const value = this.searchControl.value as any;
        if (!value) return '';
        return typeof value === 'string' ? value : (value?.customerName || '');
    }

    ngAfterViewInit() {
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
    }

    loadReport() {
        this.isLoading = true;

        const searchValue = this.searchControl.value;
        const searchTerm = typeof searchValue === 'string' ? searchValue : '';
        const customerId = typeof searchValue === 'object' ? searchValue?.id : null;

        const request = {
            startDate: this.filters.startDate.toISOString(),
            endDate: this.filters.endDate.toISOString(),
            customerId: customerId,
            searchTerm: searchTerm,
            pageNumber: this.pageNumber,
            pageSize: this.pageSize,
            sortBy: this.sortBy,
            sortOrder: this.sortOrder
        };

        this.financeService.getReceiptsReport(request).pipe(
            finalize(() => {
                this.isLoading = false;
                if (this.isFirstLoad) {
                    this.isFirstLoad = false;
                    this.isDashboardLoading = false;
                    this.loadingService.setLoading(false);
                }
                this.cdr.detectChanges();
            })
        ).subscribe({
            next: (response: any) => {
                const items = (response.items || []).map((item: any) => {
                    if (item.receiptDate && typeof item.receiptDate === 'string') {
                        const d = item.receiptDate;
                        // Server UTC time bina timezone ke bhejta hai
                        // 'Z' append karo taaki Angular isse UTC maane aur
                        // 'Asia/Kolkata' timezone me +05:30 jodke sahi IST time dikhaye
                        const hasTimezone = /[Zz]$/.test(d) || /[+-]\d{2}:\d{2}$/.test(d);
                        if (!hasTimezone) {
                            item.receiptDate = d + 'Z';
                        }
                    }
                    return item;
                });
                this.dataSource.data = items;
                this.totalCount = response.totalCount || 0;
            },
            error: (err) => {
                console.error('Error loading receipts report', err);
            }
        });
    }

    getModeClass(mode: string): string {
        if (!mode) return '';
        // spaces ko hyphens se replace karo - e.g. "SALES RETURN" -> "mode-sales-return"
        return 'mode-' + mode.toLowerCase().replace(/\s+/g, '-');
    }

    applyFilter(event: Event) {
        const filterValue = (event.target as HTMLInputElement).value;
        this.applyFilterValue(filterValue);
    }

    printReceipt(receipt: any) {
        const dateStr = new Date(receipt.receiptDate).toLocaleString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true,
            timeZone: 'Asia/Kolkata'
        });
        const amountStr = receipt.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 });

        const printContent = `
      <div style="font-family: sans-serif; padding: 40px; border: 2px solid #333; max-width: 800px; margin: auto;">
        <div style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 20px;">
          <h1 style="margin: 0; color: #1976d2;">RECEIPT VOUCHER</h1>
          <p style="margin: 5px 0;">Official Acknowledgement of Payment Received</p>
        </div>
        
        <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
          <div>
            <strong>Receipt No:</strong> RV-${receipt.id}<br>
            <strong>Date:</strong> ${dateStr}
          </div>
          <div style="text-align: right;">
            <strong>Reference:</strong> ${receipt.referenceNumber || 'N/A'}<br>
            <strong>Mode:</strong> ${receipt.receiptMode}
          </div>
        </div>

        <div style="margin-bottom: 40px; padding: 20px; background: #f9f9f9; border-radius: 8px;">
          <p style="font-size: 1.1rem; margin-bottom: 10px;">Received From:</p>
          <h2 style="margin: 0;">${receipt.customerName}</h2>
          <p style="color: #666; margin-top: 5px;">Customer ID: #${receipt.customerId}</p>
        </div>

        <div style="border: 1px solid #ddd; border-radius: 8px; overflow: hidden; margin-bottom: 40px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="background: #eee;">
              <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd;">Description</th>
              <th style="padding: 12px; text-align: right; border-bottom: 1px solid #ddd;">Amount</th>
            </tr>
            <tr>
              <td style="padding: 15px; border-bottom: 1px solid #eee;">
                ${receipt.remarks || 'Amount received towards outstanding dues.'}
              </td>
              <td style="padding: 15px; text-align: right; font-weight: bold; border-bottom: 1px solid #eee;">
                ₹${amountStr}
              </td>
            </tr>
            <tr style="background: #fcfcfc;">
              <td style="padding: 15px; text-align: right;"><strong>TOTAL RECEIVED</strong></td>
              <td style="padding: 15px; text-align: right; font-size: 1.25rem; font-weight: bold; color: #1976d2;">
                ₹${amountStr}
              </td>
            </tr>
          </table>
        </div>

        <div style="margin-top: 60px; display: flex; justify-content: space-between;">
          <div style="border-top: 1px solid #333; width: 200px; text-align: center; padding-top: 10px;">
            Payer's Signature
          </div>
          <div style="border-top: 1px solid #333; width: 200px; text-align: center; padding-top: 10px;">
            Authorized Signatory
          </div>
        </div>
      </div>
    `;

        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write('<html><head><title>Receipt Voucher</title>');
            printWindow.document.write('<style>@media print { .no-print { display: none; } } body { margin: 0; padding: 0; }</style>');
            printWindow.document.write('</head><body onload="window.print();window.close()">');
            printWindow.document.write(printContent);
            printWindow.document.write('</body></html>');
            printWindow.document.close();
        }
    }
}
