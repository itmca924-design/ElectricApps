import { Component, Inject, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../../shared/material/material/material-module';
import { ProductService } from '../service/product.service';
import { Product } from '../model/product.model';
import { LoadingService } from '../../../../core/services/loading.service';
import { ChangeDetectorRef } from '@angular/core';

@Component({
  selector: 'app-product-transaction-history',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './product-transaction-history.html',
  styleUrl: './product-transaction-history.scss'
})
export class ProductTransactionHistory implements OnInit {
  private productService = inject(ProductService);
  private loadingService = inject(LoadingService);
  private cdr = inject(ChangeDetectorRef);
  
  transactions: any[] = [];
  loading = true;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { product: Product },
    private dialogRef: MatDialogRef<ProductTransactionHistory>
  ) {}

  ngOnInit() {
    this.loadHistory();
  }

  loadHistory() {
    this.loadingService.setLoading(true);
    this.productService.getTransactions(this.data.product.id!).subscribe({
      next: (res) => {
        this.transactions = res || [];
        this.loading = false;
        this.loadingService.setLoading(false);
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.loadingService.setLoading(false);
        this.cdr.detectChanges();
      }
    });
  }

  close() {
    this.dialogRef.close();
  }
}
