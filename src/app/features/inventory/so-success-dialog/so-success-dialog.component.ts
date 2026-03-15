import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../shared/material/material/material-module';

export interface SoSuccessData {
    soNumber: string;
    grandTotal: number;
    customerId: number;
    customerName: string;
    status: string;
}

@Component({
    selector: 'app-so-success-dialog',
    standalone: true,
    imports: [CommonModule, MaterialModule],
    template: `
    <div class="so-success-dialog">
      <div class="dialog-header">
        <mat-icon class="success-icon">check_circle</mat-icon>
        <h2 mat-dialog-title>Sale Order Saved Successfully!</h2>
      </div>

      <mat-dialog-content>
        <div class="so-details">
          <div class="detail-row">
            <span class="label">Order Number:</span>
            <span class="value">{{ data.soNumber }}</span>
          </div>
          <div class="detail-row">
            <span class="label">Customer:</span>
            <span class="value">{{ data.customerName }}</span>
          </div>
          <div class="detail-row highlight">
            <span class="label">Grand Total:</span>
            <span class="value amount">₹{{ data.grandTotal | number:'1.2-2' }}</span>
          </div>
        </div>

        <div class="info-message">
          <mat-icon>info</mat-icon>
          <p>What would you like to do next?</p>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button (click)="onViewList()">
          <mat-icon>list</mat-icon>
          View Sale Order List
        </button>
        <button mat-flat-button color="primary" (click)="onMakePayment()" *ngIf="data.status.toLowerCase() !== 'draft'">
          <mat-icon>payment</mat-icon>
          Make Payment Now
        </button>
      </mat-dialog-actions>
    </div>
  `,
    styles: [`
    .so-success-dialog {
      padding: 8px;
    }

    .dialog-header {
      text-align: center;
      margin-bottom: 20px;
    }

    .success-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: #4caf50;
      margin-bottom: 8px;
    }

    .so-details {
      background: #f5f5f5;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
    }

    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #e0e0e0;
    }

    .detail-row:last-child {
      border-bottom: none;
    }

    .detail-row.highlight {
      background: #e3f2fd;
      margin: 8px -16px -16px -16px;
      padding: 12px 16px;
      border-radius: 0 0 8px 8px;
    }

    .label {
      font-weight: 500;
      color: #666;
    }

    .value {
      font-weight: 600;
      color: #333;
    }

    .value.amount {
      font-size: 18px;
      color: #1976d2;
    }

    .info-message {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      background: #fff3e0;
      border-radius: 4px;
      margin-bottom: 16px;
    }

    .info-message mat-icon {
      color: #ffa000;
    }

    .info-message p {
      margin: 0;
      color: #ff6f00;
      font-weight: 500;
    }

    mat-dialog-actions {
      padding: 16px 0 0 0;
      gap: 8px;
    }

    mat-dialog-actions button {
      gap: 4px;
    }
  `]
})
export class SoSuccessDialogComponent {
    constructor(
        public dialogRef: MatDialogRef<SoSuccessDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: SoSuccessData
    ) { }

    onViewList() {
        this.dialogRef.close('view-list');
    }

    onMakePayment() {
        this.dialogRef.close('make-payment');
    }
}
