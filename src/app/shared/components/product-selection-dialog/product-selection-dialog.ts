import { Component, inject, OnInit, ViewChild, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../material/material/material-module';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ProductService } from '../../../features/master/product/service/product.service';
import { SelectionModel } from '@angular/cdk/collections';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';
import { finalize, Subject, debounceTime, distinctUntilChanged, takeUntil, firstValueFrom, timeout, catchError, of, Observable, startWith, map, switchMap } from 'rxjs';
import { ProductLookUpService } from '../../../features/master/product/service/product.lookup.sercice';
import { LoadingService } from '../../../core/services/loading.service';

@Component({
  selector: 'app-product-selection-dialog',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="dialog-container">
      <!-- Global-style Loader inside Dialog -->
      <div *ngIf="isLoading" class="dialog-loader-overlay" role="status" aria-label="Loading inventory items" aria-live="polite">
        <div class="loader-content">
          <mat-spinner diameter="50" strokeWidth="4" aria-hidden="true"></mat-spinner>
          <p class="loader-text">Fetching Inventory Items...</p>
          <p class="loader-subtext">Optimizing selection for you</p>
        </div>
      </div>

      <div class="dialog-header" [attr.aria-hidden]="isLoading">
        <h2 class="title">Select Products</h2>
        <button class="header-close-btn" (click)="close()" [disabled]="isLoading"><mat-icon>close</mat-icon></button>
      </div>

      <div class="search-bar d-flex gap-3 align-items-center flex-wrap" [attr.aria-hidden]="isLoading">
        <!-- Category Autocomplete -->
        <mat-form-field appearance="outline" class="filter-field" subscriptSizing="dynamic">
          <mat-label>Category</mat-label>
          <input type="text" matInput [formControl]="categoryCtrl" [matAutocomplete]="autoCat" placeholder="Select Category" [disabled]="isLoading">
          <button mat-icon-button matSuffix *ngIf="categoryCtrl.value" (click)="clearCategory()">
            <mat-icon>clear</mat-icon>
          </button>
          <mat-autocomplete #autoCat="matAutocomplete" [displayWith]="displayCategory" (optionSelected)="onCategorySelect($event.option.value)">
            <mat-option *ngFor="let cat of filteredCategories$ | async" [value]="cat">
              {{cat.name}}
            </mat-option>
          </mat-autocomplete>
        </mat-form-field>

        <!-- SubCategory Autocomplete -->
        <mat-form-field appearance="outline" class="filter-field" subscriptSizing="dynamic">
          <mat-label>Sub Category</mat-label>
          <input type="text" matInput [formControl]="subCategoryCtrl" [matAutocomplete]="autoSubCat" placeholder="Select Sub Category" [disabled]="isLoading">
          <button mat-icon-button matSuffix *ngIf="subCategoryCtrl.value" (click)="clearSubCategory()">
            <mat-icon>clear</mat-icon>
          </button>
          <mat-autocomplete #autoSubCat="matAutocomplete" [displayWith]="displaySubCategory" (optionSelected)="onSubCategorySelect($event.option.value)">
            <mat-option *ngFor="let sub of filteredSubCategories$ | async" [value]="sub">
              {{sub.subcategoryName || sub.name}}
            </mat-option>
          </mat-autocomplete>
        </mat-form-field>

        <!-- Product Autocomplete -->
        <mat-form-field appearance="outline" class="flex-grow-1 filter-field" subscriptSizing="dynamic">
          <mat-label>Product Name / SKU</mat-label>
          <input type="text" matInput [formControl]="productCtrl" [matAutocomplete]="autoProd" placeholder="Search Product..." [disabled]="isLoading" (keyup.enter)="loadProducts()">
          <button mat-icon-button matSuffix *ngIf="productCtrl.value" (click)="clearProduct()">
            <mat-icon>clear</mat-icon>
          </button>
          <mat-autocomplete #autoProd="matAutocomplete" [displayWith]="displayProduct" (optionSelected)="onProductSelect($event.option.value)">
            <mat-option *ngFor="let prod of filteredProducts$ | async" [value]="prod">
               {{prod.productName || prod.name}} <small class="text-muted ms-2">(SKU: {{prod.sku}})</small>
            </mat-option>
          </mat-autocomplete>
          <!-- Additional Search trigger button if user prefers clicking -->
          <button mat-icon-button matSuffix (click)="loadProducts()" class="search-btn" [disabled]="isLoading" *ngIf="!productCtrl.value">
            <mat-icon>search</mat-icon>
          </button>
        </mat-form-field>

        <button mat-stroked-button color="primary" class="bulk-select-btn" (click)="selectAllMatching()" 
                [disabled]="isLoading || totalRecords <= dataSource.data.length">
           Select All ({{totalRecords}})
        </button>
      </div>

      <div class="table-container" [class.loading]="isLoading" [attr.aria-hidden]="isLoading">
        <table mat-table [dataSource]="dataSource" class="product-table" [attr.aria-hidden]="isLoading">
          <ng-container matColumnDef="select">
            <th mat-header-cell *matHeaderCellDef class="checkbox-col">
              <mat-checkbox (change)="$event ? masterToggle() : null"
                            [checked]="selection.hasValue() && isAllSelected()"
                            [indeterminate]="selection.hasValue() && !isAllSelected()">
              </mat-checkbox>
            </th>
            <td mat-cell *matCellDef="let row" class="checkbox-col">
              <mat-checkbox (click)="$event.stopPropagation()"
                            (change)="$event ? toggleRow(row) : null"
                            [checked]="isRowSelected(row)"
                            [disabled]="!allowOutOfStock && row.currentStock <= 0">
              </mat-checkbox>
            </td>
          </ng-container>

          <ng-container matColumnDef="sku">
            <th mat-header-cell *matHeaderCellDef class="sku-header"> SKU </th>
            <td mat-cell *matCellDef="let row" class="sku-cell"> {{row.sku}} </td>
          </ng-container>

          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef> Product Name </th>
            <td mat-cell *matCellDef="let row" class="name-cell"> {{row.productName}} </td>
          </ng-container>

          <ng-container matColumnDef="unit">
            <th mat-header-cell *matHeaderCellDef class="unit-header"> Unit </th>
            <td mat-cell *matCellDef="let row" class="unit-cell"> 
               <span class="unit-badge text-secondary">{{row.unit || 'PCS'}}</span>
            </td>
          </ng-container>

          <ng-container matColumnDef="category">
            <th mat-header-cell *matHeaderCellDef class="cat-header"> Category </th>
            <td mat-cell *matCellDef="let row" class="cat-cell"> 
               <span class="category-badge">{{row.categoryName}}</span>
            </td>
          </ng-container>
          
          <ng-container matColumnDef="location">
            <th mat-header-cell *matHeaderCellDef class="location-header"> Location (Rack) </th>
            <td mat-cell *matCellDef="let row" class="location-cell"> 
               <div class="location-info">
                 <span class="warehouse-text">{{row.defaultWarehouseName || 'N/A'}}</span>
                 <span class="rack-badge" *ngIf="row.defaultRackName">{{row.defaultRackName}}</span>
               </div>
            </td>
          </ng-container>

          <ng-container matColumnDef="stock">
            <th mat-header-cell *matHeaderCellDef> Stock </th>
            <td mat-cell *matCellDef="let row"> 
                <span class="stock-badge-inline" [class.danger]="row.currentStock <= 0" [class.success]="row.currentStock > 0">
                  {{row.currentStock > 0 ? row.currentStock : 'Out of Stock'}}
                </span>
            </td>
          </ng-container>

          <ng-container matColumnDef="expiry">
            <th mat-header-cell *matHeaderCellDef> Expiry Track </th>
            <td mat-cell *matCellDef="let row"> 
                <span class="expiry-badge" [class.required]="row.isExpiryRequired" [class.not-required]="!row.isExpiryRequired">
                  <mat-icon inline="true">{{row.isExpiryRequired ? 'check_circle' : 'cancel'}}</mat-icon>
                  {{row.isExpiryRequired ? 'Required' : 'No'}}
                </span>
            </td>
          </ng-container>

          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef> Status </th>
            <td mat-cell *matCellDef="let row">
              @if (isAlreadyInList(row.id)) {
                <span class="status-badge added">Already Added</span>
              } @else if (row.currentStock <= 0) {
                <span class="status-badge na">N/A</span>
              } @else {
                <span class="status-badge available">Available</span>
              }
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns; sticky: true"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns;" (click)="toggleRow(row)" [class.selected-row]="isRowSelected(row)"></tr>
        </table>
      </div>

      <mat-paginator [length]="totalRecords"
                     [pageSize]="pageSize"
                     [pageSizeOptions]="[10, 20, 50]"
                     (page)="onPageChange($event)"
                     [disabled]="isLoading"
                     [attr.aria-hidden]="isLoading">
      </mat-paginator>

      <div class="dialog-footer" [attr.aria-hidden]="isLoading">
        <div class="selection-info">
          <mat-icon class="info-icon">check_circle</mat-icon>
          <span class="count">{{selection.selected.length}}</span>
          <span class="text">products selected</span>
        </div>
        <div class="action-buttons">
          <button mat-raised-button class="back-btn" (click)="close()" [disabled]="isLoading">
            <mat-icon>close</mat-icon> Cancel
          </button>
          <button mat-raised-button class="save-btn" [disabled]="selection.isEmpty() || isLoading" (click)="addSelected()">
            <mat-icon>add_shopping_cart</mat-icon> Add Selected Products
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dialog-container {
      position: relative; /* For loader positioning */
      padding: 0;
      display: flex;
      flex-direction: column;
      max-height: 90vh; /* Kept from original product-selection-container */
      height: 100%;
      min-height: 500px;
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
    }

    /* Standard Global Style Loader for Dialog */
    .dialog-loader-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(255, 255, 255, 0.7);
      backdrop-filter: blur(6px);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      animation: fadeIn 0.2s ease-in;
    }

    .loader-content {
      background: white;
      padding: 30px 40px;
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.1);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 15px;
      text-align: center;
    }

    .loader-text {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 700;
      color: #1e293b;
    }

    .loader-subtext {
      margin: 0;
      font-size: 0.85rem;
      color: #64748b;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .dialog-header {
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;

      .title {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 700;
        color: #1e293b;
        letter-spacing: -0.02em;
      }

      .header-close-btn {
        background: transparent;
        border: none;
        cursor: pointer;
        color: #94a3b8;
        width: 36px !important;
        height: 36px !important;
        padding: 0 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border-radius: 50% !important;

        mat-icon {
          font-size: 20px;
          width: 20px;
          height: 20px;
          line-height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        &:hover {
          color: #ef4444;
          background: #fef2f2;
        }
      }
    }

    .search-bar {
      padding: 16px 24px 4px 24px;
      background: #ffffff;
      display: flex;
      gap: 16px;
      align-items: center;
      flex-wrap: wrap;

      .filter-field {
        min-width: 220px;
        flex: 1 1 auto;
        ::ng-deep .mat-mdc-text-field-wrapper {
          background-color: #f1f5f9 !important;
          border-radius: 10px !important;
        }
      }
    }

    .table-container {
      flex: 1;
      overflow: auto;
      min-height: 300px;
      position: relative;
      border-top: 1px solid #f1f5f9;
    }

    .loading-overlay {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(255,255,255,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
    }

    .product-table {
      width: 100%;
      th {
        background: #f8fafc !important;
        color: #64748b !important;
        font-weight: 600 !important;
        text-transform: uppercase;
        font-size: 0.75rem !important;
        letter-spacing: 0.05em;
        padding: 10px 16px !important;
      }
      td {
        padding: 10px 16px !important;
        color: #334155;
      }
    }

    .checkbox-col { width: 48px; }
    .sku-cell { font-weight: 600; color: #4f46e5; }
    .name-cell { font-weight: 500; }
    
    .category-badge {
      background: #f1f5f9;
      color: #475569;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .location-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      
      .warehouse-text {
        font-size: 0.75rem;
        color: #64748b;
        font-weight: 500;
      }
      
      .rack-badge {
        font-size: 0.7rem;
        font-weight: 700;
        color: #4f46e5;
        background: #eef2ff;
        padding: 1px 6px;
        border-radius: 4px;
        width: fit-content;
        border: 1px solid #c7d2fe;
      }
    }

    .status-badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 12px;
      font-weight: 600;
      &.added     { background: #fee2e2; color: #b91c1c; }
      &.available { background: #d1fae5; color: #065f46; }
      &.na        { background: #f1f5f9; color: #94a3b8; border: 1px solid #e2e8f0; }
    }

    .unit-badge {
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      background: #f8fafc;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
    }

    .stock-badge-inline {
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 0.8rem;
      &.danger { background: #fee2e2; color: #ef4444; border: 1px solid #fecdd3; }
      &.success { background: #f0fdf4; color: #22c55e; border: 1px solid #dcfce7; }
    }

    .expiry-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
      mat-icon { font-size: 14px; width: 14px; height: 14px; }
      
      &.required {
        background: #fffbeb;
        color: #d97706;
        border: 1px solid #fde68a;
      }
      &.not-required {
        background: #f1f5f9;
        color: #64748b;
        border: 1px solid #e2e8f0;
      }
    }

    .bulk-select-btn {
      height: 48px !important;
      border-radius: 10px !important;
      font-weight: 600 !important;
    }

    .selected-row {
      background-color: #f5f3ff !important;
    }

    .dialog-footer {
      padding: 12px 24px;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .selection-info {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #64748b;

      .info-icon {
        color: #10b981;
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
      .count {
        font-weight: 700;
        color: #4f46e5;
        font-size: 1.1rem;
      }
      .text {
        font-size: 0.85rem;
        font-weight: 500;
      }
    }

    .action-buttons {
      display: flex;
      gap: 12px;
    }

    .save-btn {
      background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%) !important;
      color: white !important;
      box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3) !important;
      border-radius: 8px !important;
      font-weight: 600 !important;
      height: 40px !important;
      padding: 0 16px !important;
      transition: all 0.3s ease !important;
      border: none !important;
      mat-icon { margin-right: 6px; font-size: 18px; width: 18px; height: 18px; }
      &:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(79, 70, 229, 0.45) !important; }
      &:disabled { background: #e2e8f0 !important; color: #94a3b8 !important; box-shadow: none !important; cursor: not-allowed; }
    }

    .back-btn {
      color: #64748b !important;
      font-weight: 600 !important;
      border-radius: 8px !important;
      height: 40px !important;
      padding: 0 12px !important;
      mat-icon { margin-right: 4px; font-size: 18px; width: 18px; height: 18px; }
      &:hover { background-color: #f1f5f9 !important; color: #1e293b !important; }
    }

    ::ng-deep .mat-mdc-dialog-container { padding: 0 !important; border-radius: 12px !important; }

    /* 📱 Mobile Responsiveness optimized for smaller screens (iPhone SE etc) */
    @media (max-width: 768px) {
      .dialog-container {
        max-height: 100vh; 
        height: 100vh; /* Force full height on mobile */
        border-radius: 0; /* Full screen look */
        min-height: 0;
      }

      .search-bar {
        padding: 8px 12px;
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 6px !important;

        .filter-field {
          width: 100% !important;
          margin: 0 !important;
          ::ng-deep .mat-mdc-text-field-wrapper {
            height: 40px !important;
          }
        }

        .bulk-select-btn {
          width: 100% !important;
          margin: 0 !important;
          height: 36px !important;
          font-size: 12px !important;
        }
      }

      .dialog-header {
        padding: 10px 16px;
        .title { font-size: 1rem; }
      }

      .table-container {
        min-height: 150px; /* Allow more space for footer */
      }

      .product-table {
        th, td {
          padding: 6px !important;
          font-size: 12px !important;
        }
        .sku-header, .sku-cell,
        .cat-header, .cat-cell,
        .location-header, .location-cell,
        .unit-header, .unit-cell {
          display: none !important;
        }
      }

      .dialog-footer {
        flex-direction: column !important;
        gap: 8px !important;
        padding: 12px 16px 20px 16px !important; /* Extra bottom padding for mobile safe area */
        background: #ffffff;
        box-shadow: 0 -4px 10px rgba(0,0,0,0.05);
        
        .selection-info {
          width: 100%;
          justify-content: center;
          margin-bottom: 4px;
          .count { font-size: 1rem; }
        }

        .action-buttons {
          width: 100%;
          display: flex !important;
          flex-direction: row-reverse !important; /* Save on right, Cancel on left */
          gap: 10px !important;
          
          button {
            flex: 1;
            font-size: 11px !important;
            padding: 0 8px !important;
            height: 44px !important; /* Tappable size */
            white-space: nowrap;
            
            mat-icon {
              font-size: 18px;
              width: 18px;
              height: 18px;
              margin-right: 4px;
            }
          }
        }
      }
    }
  `]
})
export class ProductSelectionDialogComponent implements OnInit, OnDestroy {
  private productService = inject(ProductService);
  private lookupService = inject(ProductLookUpService);
  private loadingService = inject(LoadingService);
  private cdr = inject(ChangeDetectorRef);
  private dialogRef = inject(MatDialogRef<ProductSelectionDialogComponent>);
  public data = inject(MAT_DIALOG_DATA);
  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<string>();

  existingIds: any[] = [];
  displayedColumns: string[] = ['select', 'sku', 'name', 'unit', 'category', 'location', 'stock', 'expiry', 'status'];
  dataSource = new MatTableDataSource<any>([]);
  selection = new SelectionModel<any>(true, []);
  allowOutOfStock: boolean = false;

  // Form Controls
  categoryCtrl = new FormControl();
  subCategoryCtrl = new FormControl({value: null, disabled: true});
  productCtrl = new FormControl();

  // Observables
  filteredCategories$!: Observable<any[]>;
  filteredSubCategories$!: Observable<any[]>;
  filteredProducts$!: Observable<any[]>;

  categories: any[] = [];
  subCategories: any[] = [];
  productsAutocomplete: any[] = []; // For the autocomplete list

  // Active filters
  selectedCategoryId: any = null;
  selectedSubCategoryId: any = null;
  searchQuery: string = '';
  selectedProductId: any = null;

  isLoading: boolean = false;
  totalRecords: number = 0;
  pageSize: number = 10;
  pageIndex: number = 0;

  ngOnInit() {
    this.existingIds = this.data?.existingIds || [];
    this.allowOutOfStock = this.data?.allowOutOfStock ?? false;
    this.loadCategories();
    this.loadProducts();

    // Setup Category Autocomplete
    this.filteredCategories$ = this.categoryCtrl.valueChanges.pipe(
      startWith(''),
      map(value => typeof value === 'string' ? value : (value as any)?.name),
      map(name => name ? this._filterCategories(name) : this.categories.slice())
    );

    // Setup SubCategory Autocomplete
    this.filteredSubCategories$ = this.subCategoryCtrl.valueChanges.pipe(
      startWith(''),
      map(value => typeof value === 'string' ? value : (value as any)?.subcategoryName || (value as any)?.name),
      map(name => name ? this._filterSubCategories(name) : this.subCategories.slice())
    );

    // Setup Product Autocomplete (Local filtering)
    this.filteredProducts$ = this.productCtrl.valueChanges.pipe(
      startWith(''),
      map(value => {
        const nameStr = typeof value === 'string' ? value : (value as any)?.productName || (value as any)?.name || '';
        if (typeof value === 'string') {
          this.searchQuery = value;
          this.selectedProductId = null;
        }
        return nameStr;
      }),
      map(name => name ? this._filterProducts(name) : this.productsAutocomplete.slice())
    );
  }

  // Value Display formatters
  displayCategory(cat: any): string { return cat && cat.name ? cat.name : ''; }
  displaySubCategory(sub: any): string { return sub && (sub.subcategoryName || sub.name) ? (sub.subcategoryName || sub.name) : ''; }
  displayProduct(prod: any): string { return prod && (prod.productName || prod.name) ? (prod.productName || prod.name) : ''; }

  private _filterCategories(name: string): any[] {
    const filterValue = name.toLowerCase();
    return this.categories.filter(option => (option.name || '').toLowerCase().includes(filterValue));
  }

  private _filterSubCategories(name: string): any[] {
    const filterValue = name.toLowerCase();
    return this.subCategories.filter(option => (option.subcategoryName || option.name || '').toLowerCase().includes(filterValue));
  }

  private _filterProducts(name: string): any[] {
    const filterValue = name.toLowerCase();
    return this.productsAutocomplete.filter(option => (option.productName || option.name || '').toLowerCase().includes(filterValue));
  }

  // Handle Selections
  onCategorySelect(cat: any) {
    this.selectedCategoryId = cat.id;
    this.subCategoryCtrl.enable();
    this.subCategoryCtrl.setValue(null);
    this.selectedSubCategoryId = null;
    this.productCtrl.setValue(null);
    this.selectedProductId = null;
    this.searchQuery = '';
    
    // Fetch SubCategories
    this.lookupService.getSubcategoriesByCategory(cat.id).subscribe((res: any) => {
      this.subCategories = res || [];
      this.subCategoryCtrl.updateValueAndValidity();
    });

    this.pageIndex = 0;
    this.loadProducts();
    this.fetchProductsForAutocomplete();
  }

  onSubCategorySelect(sub: any) {
    this.selectedSubCategoryId = sub.id;
    this.productCtrl.setValue(null);
    this.selectedProductId = null;
    this.searchQuery = '';

    this.pageIndex = 0;
    this.loadProducts();
    this.fetchProductsForAutocomplete();
  }

  onProductSelect(prod: any) {
    this.selectedProductId = prod.id;
    this.searchQuery = prod.productName || prod.name;
    this.pageIndex = 0;
    this.loadProducts();
  }

  // Clear Handlers
  clearCategory() {
    this.categoryCtrl.setValue(null);
    this.selectedCategoryId = null;
    this.clearSubCategory();
    this.loadProducts();
    this.fetchProductsForAutocomplete();
  }

  clearSubCategory() {
    this.subCategoryCtrl.setValue(null);
    this.subCategoryCtrl.disable();
    this.selectedSubCategoryId = null;
    this.subCategories = [];
    this.clearProduct();
    this.loadProducts();
    this.fetchProductsForAutocomplete();
  }

  clearProduct() {
    this.productCtrl.setValue('');
    this.selectedProductId = null;
    this.searchQuery = '';
    this.loadProducts();
  }

  loadCategories() {
    this.lookupService.getLookups().pipe(takeUntil(this.destroy$)).subscribe((res: any) => {
      this.categories = res.categories || [];
      this.categoryCtrl.setValue(this.categoryCtrl.value);
    });
    this.fetchProductsForAutocomplete();
  }

  // Fetch products into a local array so Product autocomplete doesn't need to ask backend for every keystroke
  fetchProductsForAutocomplete() {
    const request = {
      pageIndex: 0,
      pageNumber: 1,
      pageSize: 500, // Fetch up to 500 matching products for immediate autocomplete
      search: '',
      categoryId: this.selectedCategoryId || null,
      filters: {} as Record<string, string>,
      sortBy: 'ProductName',
      sortDirection: 'asc' as 'asc' | 'desc'
    };

    if (this.selectedSubCategoryId) {
      request.filters['subCategoryId'] = this.selectedSubCategoryId;
    }

    this.productService.getPaged(request).pipe(takeUntil(this.destroy$)).subscribe(res => {
      this.productsAutocomplete = res.items || [];
      this.productCtrl.setValue(this.productCtrl.value); // Trigger re-evaluation of filteredProducts$
    });
  }

  loadProducts(isSilent: boolean = false) {
    if (!isSilent) {
      this.isLoading = true;
      this.loadingService.setLoading(true);
      this.cdr.detectChanges(); // Force internal loader to show immediately
    }
    
    const request = {
      pageIndex: this.pageIndex, // 0-based
      pageNumber: this.pageIndex + 1, // 1-based
      pageSize: this.pageSize,
      search: this.searchQuery || '',
      categoryId: this.selectedCategoryId || null,
      filters: {} as Record<string, string>,
      sortBy: 'ProductName',
      sortDirection: 'asc' as 'asc' | 'desc'
    };

    // If subcategory is selected, pass it via filters object since grid request might not have a direct property
    if (this.selectedSubCategoryId) {
      request.filters['subCategoryId'] = this.selectedSubCategoryId;
    }
    
    // If specific product selected, we can constrain search
    if (this.selectedProductId) {
       request.filters['id'] = this.selectedProductId;
    }

    this.productService.getPaged(request).pipe(
      timeout(15000), // Safety Timeout
      finalize(() => {
        if (!isSilent) {
          this.isLoading = false;
          this.loadingService.setLoading(false);
          this.cdr.detectChanges();
        }
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (res) => {
        this.dataSource.data = res.items || [];
        this.totalRecords = res.totalCount || 0;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading products:', err);
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  onPageChange(event: PageEvent) {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadProducts();
  }

  isRowSelected(row: any): boolean {
    return this.selection.selected.some(item => item.id === row.id);
  }

  toggleRow(row: any) {
    if (this.isAlreadyInList(row.id)) return;
    if (!this.allowOutOfStock && row.currentStock <= 0) return;
    const found = this.selection.selected.find(item => item.id === row.id);
    if (found) {
      this.selection.deselect(found);
    } else {
      this.selection.select(row);
    }
    this.cdr.detectChanges();
  }

  isAllSelected() {
    const activeRows = this.dataSource.data.filter(row => {
      const isNotDuplicate = !this.isAlreadyInList(row.id);
      const isSelectable = this.allowOutOfStock || row.currentStock > 0;
      return isNotDuplicate && isSelectable;
    });
    if (activeRows.length === 0) return false;
    return activeRows.every(row => this.isRowSelected(row));
  }

  isAlreadyInList(id: string): boolean {
    return this.existingIds.includes(id);
  }

  masterToggle() {
    if (this.isAllSelected()) {
      this.dataSource.data.forEach(row => this.selection.deselect(row));
    } else {
      this.dataSource.data.forEach(row => {
        const isNotDuplicate = !this.isAlreadyInList(row.id);
        const isSelectable = this.allowOutOfStock || row.currentStock > 0;
        if (isNotDuplicate && isSelectable) {
          this.selection.select(row);
        }
      });
    }
  }

  selectAllMatching() {
    if (this.totalRecords <= 0 || this.isLoading) return;

    this.isLoading = true;
    this.loadingService.setLoading(true);
    this.cdr.detectChanges(); // Force UI update
    const fullRequest = {
      pageIndex: 0,
      pageNumber: 1,
      pageSize: this.totalRecords, // Get everything
      search: this.searchQuery || '',
      categoryId: this.selectedCategoryId || null,
      filters: {} as Record<string, string>,
      sortBy: 'ProductName',
      sortDirection: 'asc' as 'asc' | 'desc'
    };

    if (this.selectedSubCategoryId) {
      fullRequest.filters['subCategoryId'] = this.selectedSubCategoryId;
    }
    if (this.selectedProductId) {
       fullRequest.filters['id'] = this.selectedProductId;
    }

    this.productService.getPaged(fullRequest).pipe(
      timeout(20000), // Bulk selection takes a bit longer
      finalize(() => {
        this.isLoading = false;
        this.loadingService.setLoading(false);
        this.cdr.detectChanges();
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (res) => {
        if (res.items && res.items.length > 0) {
          // Identify items not in existing list
          const eligibleItems = res.items.filter((item: any) => !this.isAlreadyInList(item.id));

          // Sync with visible references to ensure checkmarks show up on current page
          const visibleIdMap = new Map(this.dataSource.data.map(i => [i.id, i]));
          const finalizedItems = eligibleItems.map(item => visibleIdMap.get(item.id) || item);

          this.selection.clear();
          this.selection.select(...finalizedItems);
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error in Select All:', err);
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  addSelected() {
    this.dialogRef.close(this.selection.selected);
  }

  close() {
    this.dialogRef.close();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
