import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { FinanceService } from '../service/finance.service';
import { customerService } from '../../master/customer-component/customer.service';
import { Observable } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import { ActivatedRoute } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { StatusDialogComponent } from '../../../shared/components/status-dialog-component/status-dialog-component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { LoadingService } from '../../../core/services/loading.service';
import { PermissionService } from '../../../core/services/permission.service';

@Component({
  selector: 'app-receipt-entry',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MaterialModule],
  templateUrl: './receipt-entry.component.html',
  styleUrl: './receipt-entry.component.scss'
})
export class ReceiptEntryComponent implements OnInit {
  customerControl = new FormControl('');
  filteredCustomers!: Observable<any[]>;
  customers: any[] = [];
  isLoading: boolean = false;
  isDashboardLoading: boolean = true;
  private isFirstLoad: boolean = true;
  currentBalance: number | null = null;
  isCustomerPreSelected: boolean = false;
  private loadingService = inject(LoadingService);
  private cdr = inject(ChangeDetectorRef);
  private permissionService = inject(PermissionService);
  canAdd: boolean = true;

  today = new Date();
  minDate = new Date();
  maxDate = new Date();

  receipt: any = {
    customerId: null,
    amount: null,
    paymentMode: 'Cash',
    referenceNumber: '',
    paymentDate: this.today,
    remarks: '',
    createdBy: 'Admin'
  };

  constructor(
    private financeService: FinanceService,
    private customerService: customerService,
    private route: ActivatedRoute,
    private router: Router,
    private dialog: MatDialog
  ) { }

  ngOnInit() {
    this.canAdd = this.permissionService.hasPermission('CanAdd');
    this.isDashboardLoading = true;
    this.isFirstLoad = true;
    this.loadingService.setLoading(true);

    this.loadCustomers();

    this.filteredCustomers = this.customerControl.valueChanges.pipe(
      startWith(''),
      map(value => {
        const name = typeof value === 'string' ? value : (value as any)?.name;
        return name ? this._filter(name as string) : this.customers.slice();
      }),
    );

    // Check for query params (e.g. from Sales List / Outstanding Tracker)
    this.route.queryParams.subscribe(params => {
      if (params['customerId']) {
        this.receipt.customerId = Number(params['customerId']);
        if (params['amount']) this.receipt.amount = Number(params['amount']);
        if (params['invoiceNo']) {
          this.receipt.referenceNumber = params['invoiceNo'];
          this.receipt.remarks = `Receipt for Invoice: ${params['invoiceNo']}`;
        }

        // Lock customer field when pre-selected from URL
        this.isCustomerPreSelected = true;
        this.customerControl.disable();

        if (this.customers.length > 0) {
          this.preselectCustomer(this.receipt.customerId);
        }
      } else {
        // If no customer in route, stop loader early
        if (this.isFirstLoad) {
          this.isFirstLoad = false;
          this.isDashboardLoading = false;
          this.loadingService.setLoading(false);
          this.cdr.detectChanges();
        }
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

  private _filter(name: string): any[] {
    const filterValue = name.toLowerCase();
    return this.customers.filter(customer =>
      ((customer as any).name as string).toLowerCase().includes(filterValue) ||
      customer.id.toString().includes(filterValue)
    );
  }

  displayFn(customer: any): string {
    return customer && customer.name ? `${customer.name} (#${customer.id})` : '';
  }

  loadCustomers() {
    this.customerService.getCustomersLookup().subscribe((data: any) => {
      this.customers = Array.isArray(data) ? data : [];
      if (this.receipt.customerId) {
        this.preselectCustomer(this.receipt.customerId);
      }
      this.cdr.detectChanges();
    });
  }

  onCustomerSelected(event: any) {
    const customer = event.option.value;
    this.receipt.customerId = customer.id;
    this.loadCustomerBalance(customer.id);
  }

  loadCustomerBalance(customerId: number) {
    const request = {
      customerId: customerId,
      pageNumber: 1,
      pageSize: 1,
      sortBy: 'TransactionDate',
      sortOrder: 'desc'
    };
    this.financeService.getCustomerLedger(request).subscribe(data => {
      // Correct response format: data.currentBalance holds the customer's total outstanding balance
      if (data && data.currentBalance !== undefined && data.currentBalance !== null) {
        this.currentBalance = data.currentBalance;
      } else {
        this.currentBalance = 0;
      }

      if (this.isFirstLoad) {
        this.isFirstLoad = false;
        this.isDashboardLoading = false;
        this.loadingService.setLoading(false);
      }
      this.cdr.detectChanges();
    });
  }

  private formatErrorMessage(err: any): string {
    let message = err.error?.message || err.error || 'Failed to record receipt.';
    if (typeof message === 'string' && message.includes('System.InvalidOperationException: ')) {
      // Extract only the core message before the stack trace
      message = message.split('System.InvalidOperationException: ')[1].split(' at ')[0].split('\n')[0].trim();
    }
    return message;
  }

  preselectCustomer(id: number) {
    const customer = this.customers.find(c => c.id === id);
    if (customer) {
      this.customerControl.setValue(customer);
      this.loadCustomerBalance(id);
    }
  }

  saveReceipt() {
    if (!this.receipt.customerId || !this.receipt.amount) {
      this.dialog.open(StatusDialogComponent, {
        data: { isSuccess: false, message: 'Please select a customer and enter amount.' }
      });
      return;
    }

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Confirm Receipt',
        message: `Are you sure you want to record a receipt of ₹${this.receipt.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}?`,
        confirmText: 'Record Receipt',
        confirmColor: 'primary'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.isLoading = true;
        this.cdr.detectChanges();
        let ref = this.receipt.referenceNumber || '';
        // 🎯 Avoid Duplicate Reference Error: For SO/GRN references (commonly used for partial payments),
        // we always append a short unique suffix to satisfy the database uniqueness constraint.
        if (ref.startsWith('SO-') || ref.startsWith('GRN-')) {
          ref = `${ref}-${new Date().getTime().toString().slice(-4)}`;
        }

        const payload = {
          id: 0,
          ...this.receipt,
          amount: Number(this.receipt.amount),
          totalAmount: Number(this.receipt.amount),
          discountAmount: 0,
          netAmount: Number(this.receipt.amount),
          referenceNumber: ref,
          paymentDate: this.receipt.paymentDate instanceof Date ? this.receipt.paymentDate.toISOString() : this.receipt.paymentDate
        };

        this.financeService.recordCustomerReceipt(payload).subscribe({
          next: (res) => {
            this.isLoading = false;
            this.cdr.detectChanges();
            const successDialog = this.dialog.open(StatusDialogComponent, {
              data: {
                isSuccess: true,
                title: 'Success',
                message: 'Receipt Recorded Successfully!',
                actions: [
                  { label: 'Print Receipt', role: 'print', color: 'primary' },
                  { label: 'OK', role: 'ok' }
                ]
              }
            });

            const customer = this.customers.find(c => c.id === this.receipt.customerId);
            const receiptData = {
              ...this.receipt,
              id: res.id || 'NEW',
              customerName: customer ? customer.name : 'Customer'
            };

            successDialog.afterClosed().subscribe(result => {
              const customerId = this.receipt.customerId;
              if (result === 'print') {
                this.printVoucher(receiptData);
              }
              this.resetForm();
              if (customerId) {
                this.router.navigate(['/app/finance/customers/ledger'], {
                  queryParams: { customerId: customerId }
                });
              } else {
                this.router.navigate(['/app/finance/customers/tracker']);
              }
            });
          },
          error: (err) => {
            this.isLoading = false;
            this.cdr.detectChanges();
            console.error(err);
            const errorMessage = this.formatErrorMessage(err);
            this.dialog.open(StatusDialogComponent, {
              data: {
                isSuccess: false,
                title: 'Action Failed',
                message: errorMessage
              }
            });
          }
        });
      }
    });
  }

  printVoucher(receipt: any) {
    const prevBal = this.currentBalance || 0;
    const received = receipt.amount || 0;
    const closingBal = prevBal - received; // Customer ledger: Due decreases when received

    const formatCurrency = (amt: number) => {
      const absAmt = Math.abs(amt).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return `₹${absAmt}${amt < 0 ? ' (Adv)' : ''}`;
    };

    const balanceText = closingBal < 0 ? 'Advance Amount' : 'Remaining Due';

    const printContent = `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; border: 1px solid #e0e0e0; max-width: 700px; margin: auto; color: #333;">
            <div style="text-align: center; border-bottom: 2px solid #1976d2; padding-bottom: 15px; margin-bottom: 20px;">
              <h1 style="margin: 0; color: #1976d2; font-size: 24px;">PAYMENT RECEIPT</h1>
              <p style="margin: 5px 0; font-size: 13px; color: #666;">Official Receipt of Funds</p>
            </div>
            
            <div style="display: flex; justify-content: space-between; margin-bottom: 25px; font-size: 13px;">
              <div>
                <span style="color: #888;">Receipt No:</span> <strong>CR-${receipt.id}</strong><br>
                <span style="color: #888;">Date:</span> <strong>${new Date(receipt.paymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
              </div>
              <div style="text-align: right;">
                <span style="color: #888;">Reference:</span> <strong>${receipt.referenceNumber || 'N/A'}</strong><br>
                <span style="color: #888;">Mode:</span> <strong>${receipt.paymentMode}</strong>
              </div>
            </div>
    
            <div style="margin-bottom: 25px; padding: 15px; background: #f8f9fa; border-left: 4px solid #1976d2; border-radius: 4px;">
              <p style="font-size: 12px; color: #888; margin: 0 0 5px 0;">Received From:</p>
              <h2 style="margin: 0; font-size: 18px; color: #1976d2;">${receipt.customerName}</h2>
              <p style="color: #555; margin: 4px 0 0 0; font-size: 12px;">Customer ID: #${receipt.customerId}</p>
            </div>
    
            <div style="border: 1px solid #eee; border-radius: 8px; overflow: hidden; margin-bottom: 25px;">
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <thead style="background: #f1f3f4;">
                  <tr>
                    <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd;">Description</th>
                    <th style="padding: 12px; text-align: right; border-bottom: 1px solid #ddd;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style="padding: 12px; border-bottom: 1px solid #eee; color: #555;">
                      ${receipt.remarks || 'Payment received towards outstanding balance.'}
                    </td>
                    <td style="padding: 12px; text-align: right; font-weight: bold; border-bottom: 1px solid #eee;">
                      ${formatCurrency(received)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Balance Summary Section -->
            <div style="margin-left: auto; width: 60%; font-size: 13px;">
              <div style="display: flex; justify-content: space-between; padding: 6px 0; color: #666;">
                <span>Previous Balance:</span>
                <span>${formatCurrency(prevBal)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 6px 0; color: #1976d2; font-weight: 600; border-top: 1px solid #eee;">
                <span>Amount Received:</span>
                <span>- ${formatCurrency(received)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 10px 0; margin-top: 5px; border-top: 2px solid #333; font-size: 15px;">
                <strong>${balanceText}:</strong>
                <strong style="color: ${closingBal < 0 ? '#2e7d32' : '#c62828'};">${formatCurrency(closingBal)}</strong>
              </div>
            </div>
    
            <div style="margin-top: 50px; display: flex; justify-content: space-between; font-size: 12px; color: #666;">
              <div style="border-top: 1px solid #ddd; width: 170px; text-align: center; padding-top: 8px;">
                Customer Signature
              </div>
              <div style="border-top: 1px solid #ddd; width: 170px; text-align: center; padding-top: 8px;">
                Authorized Receiver
              </div>
            </div>

            <div style="text-align: center; margin-top: 40px; font-size: 10px; color: #aaa;">
              This is a computer-generated receipt. No signature required.
            </div>
          </div>
        `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
            <html>
              <head>
                <title>Payment Receipt - CR-${receipt.id}</title>
                <style>@media print { .no-print { display: none; } }</style>
              </head>
              <body onload="window.print();window.close()">
                ${printContent}
              </body>
            </html>
          `);
      printWindow.document.close();
    }
  }

  resetForm() {
    this.receipt = {
      customerId: null,
      amount: null,
      paymentMode: 'Cash',
      referenceNumber: '',
      paymentDate: this.today,
      remarks: '',
      createdBy: 'Admin'
    };
    this.isCustomerPreSelected = false;
    this.customerControl.setValue('');
    this.customerControl.enable();
    this.currentBalance = null;
  }
}
