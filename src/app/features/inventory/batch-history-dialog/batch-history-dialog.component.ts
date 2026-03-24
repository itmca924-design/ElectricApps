import { Component, Inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { InventoryService } from '../service/inventory.service';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-batch-history-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatTableModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './batch-history-dialog.component.html',
  styleUrls: ['./batch-history-dialog.component.css']
})
export class BatchHistoryDialogComponent implements OnInit {
  displayedColumns: string[] = ['transactionDate', 'transactionType', 'referenceId', 'quantity', 'category'];
  transactions: any[] = [];
  isLoading = true;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    private dialogRef: MatDialogRef<BatchHistoryDialogComponent>,
    private inventoryService: InventoryService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadHistory();
  }

  loadHistory() {
    this.isLoading = true;
    
    // Ensure dates are strings to avoid ApiService toQueryString issues with Date objects
    const mfgDate = this.data.manufacturingDate ? (typeof this.data.manufacturingDate === 'string' ? this.data.manufacturingDate : new Date(this.data.manufacturingDate).toISOString()) : null;
    const expDate = this.data.expiryDate ? (typeof this.data.expiryDate === 'string' ? this.data.expiryDate : new Date(this.data.expiryDate).toISOString()) : null;

    this.inventoryService.getBatchHistory(
      this.data.productId,
      this.data.warehouseId,
      this.data.rackId,
      mfgDate,
      expDate
    ).pipe(
      finalize(() => {
        this.isLoading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (res: any) => {
        console.log('Batch History Data Received:', res);
        this.transactions = res || [];
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Error loading batch history:', err);
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  onClose(): void {
    this.dialogRef.close();
  }
}
