import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MaterialModule } from '../../../../shared/material/material/material-module';
import { ProductService } from '../service/product.service';
import { Product } from '../model/product.model';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { MatDialog } from '@angular/material/dialog';
import { StatusDialogComponent } from '../../../../shared/components/status-dialog-component/status-dialog-component';
import { ProductTransactionHistory } from '../product-transaction-history/product-transaction-history';
import { LoadingService } from '../../../../core/services/loading.service';

@Component({
  selector: 'app-product-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MaterialModule, RouterLink],
  templateUrl: './product-dashboard.html',
  styleUrl: './product-dashboard.scss'
})
export class ProductDashboard implements OnInit {
  private fb = inject(FormBuilder);
  private productService = inject(ProductService);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private loadingService = inject(LoadingService);

  searchForm!: FormGroup;
  products: Product[] = [];
  filteredProducts: Product[] = [];
  loading = false; // Kept for local logic if needed, but will sync with Global

  ngOnInit() {
    this.initForm();
    this.loadProducts();
  }

  private initForm() {
    this.searchForm = this.fb.group({
      query: [''],
      category: ['all'],
      stockStatus: ['all']
    });

    this.searchForm.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(() => {
      this.applyFilters();
    });
  }

  private loadProducts() {
    this.loading = true;
    this.loadingService.setLoading(true);
    this.productService.getAll().subscribe({
      next: (res) => {
        this.products = res;
        this.applyFilters();
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

  applyFilters() {
    const { query, stockStatus } = this.searchForm.value;
    
    this.filteredProducts = this.products.filter(p => {
      const pName = p.name || p.productName || '';
      const pSku = p.sku || '';

      const matchesQuery = !query || 
        pName.toLowerCase().includes(query.toLowerCase()) || 
        pSku.toLowerCase().includes(query.toLowerCase());
      
      let matchesStock = true;
      if (stockStatus === 'low') {
        matchesStock = p.currentStock <= p.minStock;
      } else if (stockStatus === 'in') {
        matchesStock = p.currentStock > p.minStock;
      } else if (stockStatus === 'out') {
        matchesStock = p.currentStock <= 0;
      }

      return matchesQuery && matchesStock;
    });
    this.cdr.detectChanges();
  }

  onEdit(product: Product) {
    this.router.navigate(['/app/master/products/edit', product.id]);
  }

  onView(product: Product) {
    this.dialog.open(StatusDialogComponent, {
      data: { isSuccess: true, message: `Product Info: ${product.brand || 'N/A'} - ${product.productName || product.name}` }
    });
  }

  onHistory(product: Product) {
    const isMobile = window.innerWidth < 768;
    this.dialog.open(ProductTransactionHistory, {
      data: { product },
      width: isMobile ? '95%' : '900px',
      maxWidth: '100vw',
      panelClass: 'custom-dialog-container'
    });
  }

  onDelete(product: Product) {
    this.dialog.open(StatusDialogComponent, {
      data: { isSuccess: false, message: `Action Restricted: You do not have permission to delete SKU ${product.sku}.` }
    });
  }

  getProductImage(product: Product): string {
    return product.imageUrl || 'https://via.placeholder.com/300x300.png?text=No+Image';
  }

}
