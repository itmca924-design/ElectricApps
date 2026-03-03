import { Component, OnInit, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { FinanceService } from '../service/finance.service';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { SupplierService, Supplier } from '../../inventory/service/supplier.service';
import { Observable, Subscription, Subject } from 'rxjs';
import { map, startWith, finalize, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { StatusDialogComponent } from '../../../shared/components/status-dialog-component/status-dialog-component';
import { LoadingService } from '../../../core/services/loading.service';
import { PermissionService } from '../../../core/services/permission.service';

@Component({
  selector: 'app-payment-entry',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MaterialModule],
  templateUrl: './payment-entry.component.html',
  styleUrl: './payment-entry.component.scss'
})
export class PaymentEntryComponent implements OnInit, OnDestroy {
  payment: any = {
    supplierId: null,
    amount: null,
    paymentMode: 'Cash',
    referenceNumber: '',
    paymentDate: new Date(),
    remarks: '',
    createdBy: 'Admin'
  };

  suppliers: Supplier[] = [];
  filteredSuppliers!: Observable<Supplier[]>;
  supplierControl = new FormControl<string | Supplier>('');
  currentBalance: number | null = null;
  balanceType: string = '';
  recentTransactions: any[] = [];
  loadingCount: number = 0;
  isDashboardLoading: boolean = true;
  private isFirstLoad: boolean = true;
  isDuplicateRef: boolean = false;
  isCheckingRef: boolean = false;
  isSaving: boolean = false;
  isSupplierPreSelected: boolean = false;
  private refChangeSubject = new Subject<string>();
  private routeSub!: Subscription;

  constructor(
    private financeService: FinanceService,
    private supplierService: SupplierService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private route: ActivatedRoute,
    private router: Router,
    private loadingService: LoadingService,
    private cdr: ChangeDetectorRef
  ) { }

  private permissionService = inject(PermissionService);
  canAdd: boolean = true;

  private updateLoading(delta: number) {
    this.loadingCount = Math.max(0, this.loadingCount + delta);
    this.loadingService.setLoading(this.loadingCount > 0);
  }

  ngOnInit() {
    this.canAdd = this.permissionService.hasPermission('CanAdd');
    this.isDashboardLoading = true;
    this.isFirstLoad = true;
    this.loadingService.setLoading(true);

    this.loadSuppliers();

    // Store subscription to clean up
    this.routeSub = this.route.queryParams.subscribe(params => {
      const supplierId = params['supplierId'];
      const amount = params['amount'];
      const grnNumber = params['grnNumber'];

      if (supplierId) {
        // If suppliers are already loaded, select immediately. 
        // Otherwise loadSuppliers will handle it when it finishes.
        if (this.suppliers && this.suppliers.length > 0) {
          this.handleQueryParams(supplierId, amount, grnNumber);
        }
      } else {
        // If no supplier in route, stop loader early
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

    this.refChangeSubject.pipe(
      debounceTime(600),
      distinctUntilChanged()
    ).subscribe(ref => {
      this.checkRefDuplicate(ref);
    });

    this.filteredSuppliers = this.supplierControl.valueChanges.pipe(
      startWith(''),
      map(value => {
        const name = typeof value === 'string' ? value : (value as any)?.name;
        if (typeof value === 'string') {
          // User is typing, reset selection
          this.payment.supplierId = null;
          this.currentBalance = null;
          this.recentTransactions = [];
        }
        return name ? this._filter(name as string) : this.suppliers.slice();
      })
    );
  }

  ngOnDestroy() {
    if (this.routeSub) this.routeSub.unsubscribe();
  }

  loadSuppliers() {
    this.updateLoading(1);
    this.supplierService.getSuppliers().pipe(
      finalize(() => this.updateLoading(-1))
    ).subscribe({
      next: (data) => {
        this.suppliers = data;
        // Check for query params again after suppliers data is ready
        const params = this.route.snapshot.queryParams;
        if (params['supplierId']) {
          this.handleQueryParams(params['supplierId'], params['amount'], params['grnNumber']);
        }

        // Stop initial loader here as data is ready
        if (this.isFirstLoad) {
          this.isFirstLoad = false;
          this.isDashboardLoading = false;
          this.loadingService.setLoading(false);
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading suppliers', err);
        // Stop loader even on error so page is usable
        this.isFirstLoad = false;
        this.isDashboardLoading = false;
        this.loadingService.setLoading(false);
      }
    });
  }

  private handleQueryParams(supplierId: any, amount: any, grnNumber: any) {
    this.preselectSupplier(Number(supplierId));

    // Lock supplier field when pre-selected from URL
    this.isSupplierPreSelected = true;
    this.supplierControl.disable();

    if (amount) {
      this.payment.amount = Number(amount);
      console.log('✅ Auto-filled amount:', amount);
    }

    const currentDue = this.route.snapshot.queryParams['currentDue'];
    if (currentDue) {
      const balance = Number(currentDue);
      this.currentBalance = balance;
      console.log('✅ Using passed pending due:', this.currentBalance);

      // Ensure balance type is set correctly too
      if (balance > 0) this.balanceType = 'Payable';
      else if (balance < 0) this.balanceType = 'Advance';
      else this.balanceType = 'Clear';
    }

    const poNumber = this.route.snapshot.queryParams['poNumber'];

    if (grnNumber) {
      this.payment.referenceNumber = grnNumber;
      this.payment.remarks = `Payment for ${grnNumber}${poNumber ? ' (PO: ' + poNumber + ')' : ''}`;
      console.log('✅ Auto-filled grn details:', { grnNumber, poNumber });
    }

    // Auto-fill remarks if passed explicitly
    const remarks = this.route.snapshot.queryParams['remarks'];
    if (remarks) {
      this.payment.remarks = decodeURIComponent(remarks);
    }
  }

  private _filter(name: string): Supplier[] {
    const filterValue = name.toLowerCase();
    return this.suppliers.filter(option => option.name?.toLowerCase()?.includes(filterValue) ?? false);
  }

  displayFn(supplier: Supplier): string {
    return supplier && supplier.name ? supplier.name : '';
  }

  onSupplierSelected(event: MatAutocompleteSelectedEvent) {
    const supplier = event.option.value as Supplier;
    this.payment.supplierId = supplier.id;
    this.fetchBalance(supplier.id!);
  }

  private formatErrorMessage(err: any): string {
    let message = err.error?.message || err.error || 'Failed to record payment.';
    if (typeof message === 'string' && message.includes('System.InvalidOperationException: ')) {
      // Extract only the core message before the stack trace
      message = message.split('System.InvalidOperationException: ')[1].split(' at ')[0].split('\n')[0].trim();
    }
    return message;
  }

  preselectSupplier(supplierId: number) {
    const supplier = this.suppliers.find(s => s.id === supplierId);
    if (supplier) {
      this.supplierControl.setValue(supplier);
      this.payment.supplierId = supplier.id;

      // Only fetch balance if NOT already provided in URL
      if (!this.route.snapshot.queryParams['currentDue']) {
        this.fetchBalance(supplier.id!);
      }
    }
  }



  fetchBalance(supplierId: number) {
    this.updateLoading(1);

    // The API expects a search request object, not just an ID
    const request = {
      supplierId: supplierId,
      pageNumber: 1,
      pageSize: 1, // We only need the latest balance
      sortBy: 'TransactionDate',
      sortOrder: 'desc',
      startDate: new Date(2000, 0, 1).toISOString(), // Look back far enough
      endDate: new Date().toISOString()
    };

    this.financeService.getSupplierLedger(request).pipe(
      finalize(() => {
        this.updateLoading(-1);
        if (this.isFirstLoad) {
          this.isFirstLoad = false;
          this.isDashboardLoading = false;
          this.loadingService.setLoading(false);
        }
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (result: any) => {
        // The API returns { ledger: { items: [], ... }, currentBalance: X }
        if (result && result.ledger) {
          const balance = result.currentBalance ?? 0;
          this.currentBalance = balance;
          this.balanceType = balance > 0 ? 'Payable' : (balance < 0 ? 'Advance' : 'Clear');
          const items = (result.ledger.items || []).map((item: any) => {
            if (item.transactionDate && typeof item.transactionDate === 'string' && !item.transactionDate.includes('Z') && !item.transactionDate.includes('+')) {
              item.transactionDate += '+05:30';
            }
            return item;
          });
          this.recentTransactions = items;
        } else {
          this.currentBalance = 0;
          this.balanceType = 'Clear';
          this.recentTransactions = [];
        }
      },
      error: (err) => {
        console.error('Error fetching balance', err);
        // Reset state on error to avoid stuck indicator
        this.currentBalance = 0;
        this.balanceType = 'Clear';
      }
    });
  }

  onRefChange(val: any) {
    const ref = typeof val === 'string' ? val : (val?.target?.value || '');
    this.isDuplicateRef = false;
    if (ref && ref.trim().length >= 3) {
      this.refChangeSubject.next(ref);
    }
  }

  checkRefDuplicate(ref: string) {
    if (!ref || ref.trim().length < 3) return;

    this.isCheckingRef = true;
    this.financeService.checkDuplicateReference(ref).subscribe({
      next: (exists) => {
        this.isDuplicateRef = exists;
        this.isCheckingRef = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isCheckingRef = false;
        this.cdr.detectChanges();
      }
    });
  }



  payFullDue() {
    if (this.currentBalance && this.currentBalance > 0) {
      this.payment.amount = this.currentBalance;
    }
  }

  printReceipt() {
    window.print();
  }

  savePayment() {
    if (!this.payment.supplierId || !this.payment.amount) {
      this.snackBar.open('Please select a supplier and enter an amount.', 'Close', { duration: 3000 });
      return;
    }

    // Get supplier name for confirmation dialog
    const supplier = this.suppliers.find(s => s.id === this.payment.supplierId);
    const supplierName = supplier ? supplier.name : 'Unknown Supplier';

    // Confirm Dialog Logic
    const currentDue = (this.currentBalance && this.currentBalance > 0) ? this.currentBalance : 0;
    const payAmount = this.payment.amount;

    let dialogTitle = 'Confirm Payment';
    let dialogMessage = '';
    let dialogStatus = 'success';
    let isSuccess = true;
    let confirmBtnText = 'Yes, Pay';

    // 1. Advance Payment Case covers:
    //    a) Paying when no dues (currentDue = 0)
    //    b) Paying MORE than dues (payAmount > currentDue)
    if (payAmount > currentDue) {
      const advanceAmount = payAmount - currentDue;
      const totalAdvance = (currentDue === 0) ? payAmount : advanceAmount;

      dialogTitle = 'Confirm Advance Payment';
      dialogStatus = 'warning';
      isSuccess = false; // To show warning icon/color
      confirmBtnText = 'Yes, Pay Advance';

      if (currentDue === 0) {
        // Case: No pending dues
        dialogMessage = `⚠️ This supplier has NO pending dues.\n\nYou are paying:  ₹${payAmount.toLocaleString('en-IN')}\nCurrent Dues: - ₹0\n-----------------------\nAdvance Balance: ₹${payAmount.toLocaleString('en-IN')}\n\nThis entire amount will be saved as an ADVANCE.`;
      } else {
        // Case: Paying more than pending dues
        dialogMessage = `⚠️ You are paying MORE than the due amount.\n\nYou are paying:  ₹${payAmount.toLocaleString('en-IN')}\nCurrent Dues: - ₹${currentDue.toLocaleString('en-IN')}\n-----------------------\nAdvance Balance: ₹${advanceAmount.toLocaleString('en-IN')}\n\nThis extra ₹${advanceAmount.toLocaleString('en-IN')} will be saved as an ADVANCE.`;
      }

    } else {
      // 2. Standard Payment Case (Green Check)
      dialogTitle = 'Confirm Payment';
      dialogStatus = 'success';
      isSuccess = true; // Shows Green Check
      confirmBtnText = 'Yes, Pay';

      dialogMessage = `Are you sure you want to record this payment?\n\nSupplier: ${supplierName}\nAmount: ₹${payAmount.toLocaleString('en-IN')}\nMode: ${this.payment.paymentMode}`;
    }

    const confirmDialog = this.dialog.open(StatusDialogComponent, {
      width: '450px',
      data: {
        title: dialogTitle,
        message: dialogMessage,
        status: dialogStatus,
        isSuccess: isSuccess,
        showCancel: true,
        confirmText: confirmBtnText
      }
    });

    confirmDialog.afterClosed().subscribe(confirmed => {
      if (!confirmed) return; // User cancelled

      // User confirmed, proceed with payment
      this.performPayment();
    });
  }

  performPayment() {
    this.isSaving = true;
    this.updateLoading(1);
    this.cdr.detectChanges();

    // Ensure unique reference by adding a small suffix if it looks like a GRN reference
    let ref = this.payment.referenceNumber || '';
    if (ref.startsWith('GRN-') && !ref.includes('-', ref.indexOf('-', 5) + 1)) {
      ref = `${ref}-${new Date().getTime().toString().slice(-4)}`;
    }

    const payload = {
      ...this.payment,
      referenceNumber: ref,
      paymentDate: this.payment.paymentDate instanceof Date ? this.payment.paymentDate.toISOString() : this.payment.paymentDate
    };

    this.financeService.recordSupplierPayment(payload).pipe(
      finalize(() => {
        this.updateLoading(-1);
        this.isSaving = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (res) => {
        const successDialog = this.dialog.open(StatusDialogComponent, {
          data: {
            isSuccess: true,
            title: 'Success',
            message: 'Payment Recorded Successfully!',
            actions: [
              { label: 'Print Receipt', role: 'print', color: 'primary' },
              { label: 'OK', role: 'ok' }
            ]
          }
        });

        const supplier = this.suppliers.find(s => s.id === this.payment.supplierId);
        const paymentData = {
          ...this.payment,
          id: res.id || 'NEW',
          supplierName: supplier ? supplier.name : 'Supplier'
        };

        successDialog.afterClosed().subscribe(result => {
          if (result === 'print') {
            this.printVoucher(paymentData);
          }
          this.postPaymentActions();
        });
      },
      error: (err) => {
        this.updateLoading(-1);
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

  postPaymentActions() {
    const supplierId = this.payment.supplierId;
    this.resetForm();
    if (supplierId) {
      this.router.navigate(['/app/finance/suppliers/ledger'], {
        queryParams: { supplierId: supplierId }
      });
    } else {
      this.router.navigate(['/app/finance/suppliers/dues']);
    }
  }

  printVoucher(payment: any) {
    const prevBal = this.currentBalance || 0;
    const paid = payment.amount || 0;
    const closingBal = prevBal - paid; // Supplier ledger: Payable decreases when paid

    const formatCurrency = (amt: number) => {
      const absAmt = Math.abs(amt).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return `₹${absAmt}${amt < 0 ? ' (Adv)' : ''}`;
    };

    const balanceText = closingBal < 0 ? 'Advance to Supplier' : 'Remaining Payable';

    const printContent = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; border: 1px solid #e0e0e0; max-width: 700px; margin: auto; color: #333;">
        <div style="text-align: center; border-bottom: 2px solid #2e7d32; padding-bottom: 15px; margin-bottom: 20px;">
          <h1 style="margin: 0; color: #2e7d32; font-size: 24px;">PAYMENT VOUCHER</h1>
          <p style="margin: 5px 0; font-size: 13px; color: #666;">Official Confirmation of Payment</p>
        </div>
        
        <div style="display: flex; justify-content: space-between; margin-bottom: 25px; font-size: 13px;">
          <div>
            <span style="color: #888;">Voucher No:</span> <strong>PV-${payment.id}</strong><br>
            <span style="color: #888;">Date:</span> <strong>${new Date(payment.paymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
          </div>
          <div style="text-align: right;">
            <span style="color: #888;">Reference:</span> <strong>${payment.referenceNumber || 'N/A'}</strong><br>
            <span style="color: #888;">Mode:</span> <strong>${payment.paymentMode}</strong>
          </div>
        </div>

        <div style="margin-bottom: 25px; padding: 15px; background: #f8f9fa; border-left: 4px solid #2e7d32; border-radius: 4px;">
          <p style="font-size: 12px; color: #888; margin: 0 0 5px 0;">Paid To:</p>
          <h2 style="margin: 0; font-size: 18px; color: #2e7d32;">${payment.supplierName}</h2>
          <p style="color: #555; margin: 4px 0 0 0; font-size: 12px;">Supplier ID: #${payment.supplierId}</p>
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
                  ${payment.remarks || 'Payment towards outstanding dues.'}
                </td>
                <td style="padding: 12px; text-align: right; font-weight: bold; border-bottom: 1px solid #eee;">
                  ${formatCurrency(paid)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Balance Summary Section -->
        <div style="margin-left: auto; width: 60%; font-size: 13px;">
          <div style="display: flex; justify-content: space-between; padding: 6px 0; color: #666;">
            <span>Outstanding Before:</span>
            <span>${formatCurrency(prevBal)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; color: #2e7d32; font-weight: 600; border-top: 1px solid #eee;">
            <span>Amount Paid:</span>
            <span>- ${formatCurrency(paid)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 10px 0; margin-top: 5px; border-top: 2px solid #333; font-size: 15px;">
            <strong>${balanceText}:</strong>
            <strong style="color: ${closingBal < 0 ? '#2e7d32' : '#c62828'};">${formatCurrency(closingBal)}</strong>
          </div>
        </div>

        <div style="margin-top: 50px; display: flex; justify-content: space-between; font-size: 12px; color: #666;">
          <div style="border-top: 1px solid #ddd; width: 170px; text-align: center; padding-top: 8px;">
            Receiver's Signature
          </div>
          <div style="border-top: 1px solid #ddd; width: 170px; text-align: center; padding-top: 8px;">
            Authorized Signatory
          </div>
        </div>

        <div style="text-align: center; margin-top: 40px; font-size: 10px; color: #aaa;">
          This is a computer-generated voucher. No signature required.
        </div>
      </div>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Payment Voucher - PV-${payment.id}</title>
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
    this.payment = {
      supplierId: null,
      amount: null,
      paymentMode: 'Cash',
      referenceNumber: '',
      paymentDate: new Date(),
      remarks: '',
      createdBy: 'Admin'
    };
    this.isSupplierPreSelected = false;
    this.supplierControl.setValue('');
    this.supplierControl.enable();
    this.currentBalance = null;
    this.balanceType = '';
    this.recentTransactions = [];
  }
}
