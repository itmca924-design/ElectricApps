import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../material/material/material-module';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-batch-selection-dialog',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule],
  template: `
    <div class="batch-selection-container">
      <div class="dialog-header">
        <h2 class="title">Select Batch — {{ data.productName }}</h2>
        <p class="subtitle" *ngIf="data.validCount > 0">
          <span style="color: #16a34a; font-weight: 600;">{{data.validCount}} valid batch{{data.validCount > 1 ? 'es' : ''}} available</span>
          <span *ngIf="getUnselectableCount() > 0" style="color: #dc2626; margin-left: 8px;">
            &bull; {{getUnselectableCount()}} unavailable (expired or 0 stock)
          </span>
        </p>
        <p class="subtitle" *ngIf="!data.validCount || data.validCount === 0" style="color: #dc2626; font-weight: 600;">
          ⚠️ No selectable batches available.
        </p>
      </div>

      <div class="batches-list">
        <div class="batch-card" 
             *ngFor="let batch of data.batches; let i = index"
             [class.selected]="selectedBatchIndex === i"
             [class.disabled]="isDisabled(batch)"
             (click)="!isDisabled(batch) && selectBatch(i)">
          
          <div class="batch-header">
            <div class="batch-number">
              <mat-icon class="batch-icon">inventory_2</mat-icon>
              <span class="label">Batch {{ i + 1 }}</span>
            </div>
            <mat-radio-button [checked]="selectedBatchIndex === i"></mat-radio-button>
          </div>

          <div class="batch-details">
            <div class="detail-row">
              <span class="label">Warehouse:</span>
              <span class="value warehouse">{{ batch.warehouseName || batch.WarehouseName || 'N/A' }}</span>
            </div>
            <div class="detail-row">
              <span class="label">Rack:</span>
              <span class="value rack">{{ batch.rackName || batch.RackName || 'N/A' }}</span>
            </div>
            <div class="detail-row">
              <span class="label">Mfg Date:</span>
              <span class="value date" [class.expired]="isMfgExpired(batch)">
                {{ formatDate(batch.manufacturingDate || batch.ManufacturingDate) }}
              </span>
            </div>
            <div class="detail-row">
              <span class="label">Exp Date:</span>
              <span class="value date" [class.expired]="isExpired(batch)">
                {{ formatDate(batch.expiryDate || batch.ExpiryDate) }} 
                <span *ngIf="isExpired(batch)" style="font-size: 0.7rem; display: block; line-height: 1;">(Expired)</span>
              </span>
            </div>
            <div class="detail-row">
              <span class="label">Stock:</span>
              <span class="value stock" [class.low]="(batch.availableStock || batch.AvailableStock || 0) <= 5">
                {{ batch.availableStock || batch.AvailableStock || 0 }} {{ batch.unit || 'PCS' }}
              </span>
            </div>
          </div>

          <div class="batch-expiry-warning" *ngIf="isExpired(batch)">
            <mat-icon class="warning-icon">warning</mat-icon>
            <span class="warning-text">Expired</span>
          </div>
          <div class="batch-expiry-warning" *ngIf="!isExpired(batch) && (batch.availableStock || batch.AvailableStock || 0) <= 0">
            <mat-icon class="warning-icon">block</mat-icon>
            <span class="warning-text">Out of Stock</span>
          </div>
          <div class="batch-low-stock-warning" *ngIf="!isExpired(batch) && (batch.availableStock || batch.AvailableStock || 0) <= 5 && (batch.availableStock || batch.AvailableStock || 0) > 0">
            <mat-icon class="warning-icon">info</mat-icon>
            <span class="warning-text">Low Stock</span>
          </div>
        </div>
      </div>

      <div class="dialog-footer">
        <button mat-stroked-button (click)="close()">
          <mat-icon>close</mat-icon> Cancel
        </button>
        <button mat-raised-button color="primary" (click)="confirm()" 
                [disabled]="selectedBatchIndex === null || (selectedBatchIndex !== null && isDisabled(data.batches[selectedBatchIndex]))">
          <mat-icon>check_circle</mat-icon> Confirm Selection
        </button>
      </div>
    </div>
  `,
  styles: [`
    .batch-selection-container {
      padding: 0;
      display: flex;
      flex-direction: column;
      width: 100%;
      max-width: 600px;
      gap: 0;
    }

    .dialog-header {
      padding: 20px 24px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;

      .title {
        margin: 0 0 8px 0;
        font-size: 1.25rem;
        font-weight: 700;
        color: #1e293b;
      }

      .subtitle {
        margin: 0;
        font-size: 0.9rem;
        color: #64748b;
      }
    }

    .batches-list {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 200px;
      max-height: 400px;
    }

    .batch-card {
      padding: 14px;
      border: 2px solid #e2e8f0;
      border-radius: 10px;
      background: #ffffff;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;

      &:hover:not(.disabled) {
        border-color: #3b82f6;
        background: #f0f4ff;
        box-shadow: 0 2px 8px rgba(59, 130, 246, 0.1);
      }

      &.selected {
        border-color: #3b82f6;
        background: #eff6ff;
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
      }

      &.disabled {
        opacity: 0.6;
        cursor: not-allowed;
        border-color: #fecaca;
        background: #fef2f2;
      }

      .batch-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;

        .batch-number {
          display: flex;
          align-items: center;
          gap: 8px;

          .batch-icon {
            color: #3b82f6;
            font-size: 20px;
            width: 20px;
            height: 20px;
          }

          .label {
            font-weight: 600;
            color: #1e293b;
          }
        }
      }

      .batch-details {
        display: flex;
        flex-direction: column;
        gap: 8px;

        .detail-row {
          display: flex;
          justify-content: space-between;
          font-size: 0.9rem;

          .label {
            color: #64748b;
            font-weight: 500;
            min-width: 110px;
          }

          .value {
            color: #1e293b;
            font-weight: 600;
            text-align: right;

            &.warehouse {
              background: #e8f4f8;
              padding: 2px 8px;
              border-radius: 4px;
              color: #0369a1;
            }

            &.rack {
              background: #fef3c7;
              padding: 2px 8px;
              border-radius: 4px;
              color: #b45309;
            }

            &.date {
              padding: 2px 8px;
              border-radius: 4px;
              background: #f0fdf4;
              color: #16a34a;

              &.expired {
                background: #fef2f2;
                color: #dc2626;
              }
            }

            &.stock {
              padding: 2px 8px;
              border-radius: 4px;
              background: #f3f4f6;
              color: #374151;

              &.low {
                background: #fef3c7;
                color: #b45309;
              }
            }
          }
        }
      }

      .batch-expiry-warning,
      .batch-low-stock-warning {
        position: absolute;
        top: 8px;
        right: 8px;
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 0.8rem;
        padding: 4px 8px;
        border-radius: 4px;

        .warning-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
        }

        .warning-text {
          font-weight: 600;
        }
      }

      .batch-expiry-warning {
        background: #fef2f2;
        color: #dc2626;
      }

      .batch-low-stock-warning {
        background: #fef3c7;
        color: #b45309;
      }
    }

    .dialog-footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding: 16px 24px;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;

      button {
        min-width: 140px;
      }
    }
  `]
})
export class BatchSelectionDialogComponent implements OnInit {
  dialogRef = inject(MatDialogRef<BatchSelectionDialogComponent>);
  data = inject(MAT_DIALOG_DATA);

  selectedBatchIndex: number | null = null;

  ngOnInit() {
    // Auto-select first NON-expired batch with stock
    if (this.data.batches && this.data.batches.length > 0) {
      const firstValidIdx = this.data.batches.findIndex((b: any) => !this.isExpired(b) && (b.availableStock || b.AvailableStock || 0) > 0);
      this.selectedBatchIndex = firstValidIdx >= 0 ? firstValidIdx : null;
    }
  }

  selectBatch(index: number) {
    // Prevent selection of disabled batches
    if (index < this.data.batches.length && !this.isDisabled(this.data.batches[index])) {
      this.selectedBatchIndex = index;
    }
  }

  confirm() {
    if (this.selectedBatchIndex !== null && this.selectedBatchIndex < this.data.batches.length) {
      const selectedBatch = this.data.batches[this.selectedBatchIndex];
      // Final check: don't allow disabled batches
      if (this.isDisabled(selectedBatch)) {
        alert('❌ This batch cannot be selected (Expired or No Stock).');
        return;
      }
      this.dialogRef.close(selectedBatch);
    }
  }

  close() {
    this.dialogRef.close(null);
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'N/A';
    
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    
    return `${day}/${month}/${year}`;
  }

  isExpired(batch: any): boolean {
    // Use pre-computed flag from parent if available
    if (batch.isExpired !== undefined) return batch.isExpired;
    const expDate = batch.expiryDate || batch.ExpiryDate;
    if (!expDate) return false;
    // Date-only comparison: today ka din bhi expired
    const exp = new Date(expDate);
    exp.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return exp <= today;
  }

  isMfgExpired(batch: any): boolean {
    const mfgDate = batch.manufacturingDate || batch.ManufacturingDate;
    if (!mfgDate) return false;
    const date = typeof mfgDate === 'string' ? new Date(mfgDate) : new Date(mfgDate);
    // Consider "old" if manufactured more than 2 years ago
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    return date < twoYearsAgo;
  }

  isDisabled(batch: any): boolean {
    const stock = batch.availableStock || batch.AvailableStock || 0;
    return this.isExpired(batch) || stock <= 0;
  }

  getUnselectableCount(): number {
    if (!this.data.batches) return 0;
    return this.data.batches.filter((b: any) => this.isDisabled(b)).length;
  }
}
