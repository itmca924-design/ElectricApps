import { Component, Inject, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { MaterialModule } from '../../material/material/material-module';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { FinanceService } from '../../../features/finance/service/finance.service';
import { StatusDialogComponent } from '../../components/status-dialog-component/status-dialog-component';
import { NotificationService } from '../../../features/shared/notification.service';

@Component({
  selector: 'app-quick-payment-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MaterialModule],
  template: `
    <div class="dialog-container">
      <h2 mat-dialog-title class="dialog-header">
        <div class="header-icon-bg">
          <mat-icon>account_balance_wallet</mat-icon>
        </div>
        <div class="header-text">
          <span class="title">Collect Payment</span>
          <span class="subtitle">Enter payment details to complete sale</span>
        </div>
      </h2>
      
      <mat-dialog-content class="dialog-content">
        <div class="summary-card">
          <div class="summary-inner">
            <div class="label">Total Amount Due</div>
            <div class="amount">
              <span class="currency">₹</span>{{ data.amount | number:'1.2-2' }}
            </div>
            <div class="customer-badge">
              <mat-icon>person</mat-icon>
              {{ data.customerName }}
            </div>
          </div>
        </div>

        <form [formGroup]="paymentForm" class="payment-form">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Payment Mode</mat-label>
            <mat-select formControlName="paymentMode">
              <mat-option value="Cash">
                <mat-icon>payments</mat-icon> Cash
              </mat-option>
              <mat-option value="UPI">
                <mat-icon>qr_code_2</mat-icon> UPI / QR Scan
              </mat-option>
              <mat-option value="Card">
                <mat-icon>credit_card</mat-icon> Debit / Credit Card
              </mat-option>
              <mat-option value="Bank">
                <mat-icon>account_balance</mat-icon> Bank Transfer
              </mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width animate-field" *ngIf="paymentForm.get('paymentMode')?.value !== 'Cash'">
            <mat-label>Reference / Transaction ID</mat-label>
            <mat-icon matPrefix>confirmation_number</mat-icon>
            <input matInput formControlName="referenceNumber" placeholder="e.g. UPI Ref No">
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Remarks (Optional)</mat-label>
            <mat-icon matPrefix>notes</mat-icon>
            <textarea matInput formControlName="remarks" rows="2"></textarea>
          </mat-form-field>
        </form>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-button class="cancel-btn" [mat-dialog-close]="false">
          Pay Later (Draft/Credit)
        </button>
        <button mat-flat-button color="primary" class="confirm-btn" [disabled]="paymentForm.invalid || isSaving" (click)="confirmPayment()">
          <mat-spinner diameter="18" mode="indeterminate" *ngIf="isSaving"></mat-spinner>
          <mat-icon *ngIf="!isSaving">check_circle</mat-icon>
          <span *ngIf="!isSaving">Record & Complete Sale</span>
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .dialog-container {
      position: relative;
    }
    .dialog-header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px 24px !important;
      background: #fdfdfd;
      border-bottom: 1px solid #f0f0f0;
    }
    .header-icon-bg {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      background: #e8f5e9;
      color: #2e7d32;
      border-radius: 12px;
    }
    .header-icon-bg mat-icon {
      font-size: 24px;
    }
    .header-text {
      display: flex;
      flex-direction: column;
    }
    .header-text .title {
      font-size: 20px;
      font-weight: 700;
      color: #1a1a1a;
      line-height: normal;
    }
    .header-text .subtitle {
      font-size: 13px;
      font-weight: 400;
      color: #757575;
      margin-top: 2px;
    }
    .dialog-content {
      padding: 24px !important;
    }
    .summary-card {
      background: #2e7d32;
      background: linear-gradient(135deg, #2e7d32, #1b5e20);
      padding: 20px;
      border-radius: 12px;
      text-align: center;
      margin-bottom: 24px;
      box-shadow: 0 4px 20px rgba(46, 125, 50, 0.2);
      color: white;
    }
    .amount {
      font-size: 32px;
      font-weight: 800;
      margin: 8px 0;
      color: #ffffff;
      letter-spacing: -0.5px;
    }
    .currency {
      font-size: 20px;
      vertical-align: super;
      margin-right: 4px;
      opacity: 0.9;
    }
    .label {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.85);
      text-transform: uppercase;
      letter-spacing: 1.5px;
      font-weight: 600;
    }
    .customer-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: rgba(255, 255, 255, 0.95);
      background: rgba(0, 0, 0, 0.15);
      padding: 4px 12px;
      border-radius: 20px;
      margin-top: 8px;
    }
    .customer-badge mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
    .payment-form {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .full-width {
      width: 100%;
    }
    mat-form-field mat-icon[matPrefix] {
      margin-right: 8px;
      color: #666;
    }
    .dialog-actions {
      padding: 16px 24px !important;
      background: #f9f9f9;
      border-top: 1px solid #eee;
      display: flex;
      gap: 12px;
    }
    .confirm-btn {
      height: 48px;
      border-radius: 8px;
      padding: 0 24px;
      font-weight: 600;
      letter-spacing: 0.3px;
      background-color: #2e7d32 !important;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .cancel-btn {
      height: 48px;
      font-weight: 500;
      color: #666;
    }
    mat-spinner {
      margin-right: 4px;
    }
    mat-option mat-icon {
      margin-right: 8px;
      color: #555;
    }
    .animate-field {
      animation: slideDown 0.3s ease;
    }
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `]
})
export class QuickPaymentDialogComponent {
  private fb = inject(FormBuilder);
  private financeService = inject(FinanceService);
  private notification = inject(NotificationService);
  private dialog = inject(MatDialog);
  private dialogRef = inject(MatDialogRef<QuickPaymentDialogComponent>);

  isSaving = false;
  paymentForm: FormGroup;

  constructor(@Inject(MAT_DIALOG_DATA) public data: { 
    amount: number, 
    customerId: number, 
    customerName: string, 
    invoiceNo: string 
  }) {
    this.paymentForm = this.fb.group({
      paymentMode: ['Cash', Validators.required],
      referenceNumber: [''],
      remarks: [`Payment for Invoice: ${this.data.invoiceNo}`]
    });
  }

  confirmPayment() {
    if (this.paymentForm.invalid) return;

    this.isSaving = true;
    const formVal = this.paymentForm.value;

    // 🎯 Use a unique reference number to avoid 500 Duplicate error in backend
    const ref = formVal.referenceNumber || this.data.invoiceNo;
    const uniqueRef = `${ref}-${new Date().getTime().toString().slice(-4)}`;

    const payload = {
      id: 0,
      customerId: Number(this.data.customerId),
      amount: Number(this.data.amount),
      totalAmount: Number(this.data.amount),
      discountAmount: 0,
      netAmount: Number(this.data.amount),
      paymentMode: formVal.paymentMode,
      referenceNumber: uniqueRef,
      paymentDate: new Date().toISOString(),
      remarks: formVal.remarks,
      createdBy: localStorage.getItem('email') || 'Admin'
    };

    this.financeService.recordCustomerReceipt(payload).subscribe({
      next: () => {
        this.isSaving = false;
        
        // Use MatDialog directly to wait for 'OK' click before closing payment dialog
        const successRef = this.dialog.open(StatusDialogComponent, {
          width: '350px',
          data: { 
            isSuccess: true, 
            title: 'Success', 
            message: 'Payment recorded successfully!' 
          }
        });

        successRef.afterClosed().subscribe(() => {
          this.dialogRef.close(true);
        });
      },
      error: (err) => {
        this.isSaving = false;
        this.notification.showStatus(false, 'Failed to record payment: ' + (err.error?.message || err.message));
      }
    });
  }
}
