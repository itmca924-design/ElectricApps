import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, ChangeDetectorRef, OnDestroy, AfterViewInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { Observable, of, Subject } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, finalize, map, startWith, switchMap, takeUntil } from 'rxjs/operators';
import { MatDialog } from '@angular/material/dialog';
import { CustomerComponent } from '../../master/customer-component/customer-component';

import { ProductService } from '../../master/product/service/product.service';
import { StatusDialogComponent } from '../../../shared/components/status-dialog-component/status-dialog-component';
import { SaleOrderService } from '../service/saleorder.service';
import { Router } from '@angular/router';
import { UnitService } from '../../master/units/services/units.service';
import { customerService } from '../../master/customer-component/customer.service';
import { ProductSelectionDialogComponent } from '../../../shared/components/product-selection-dialog/product-selection-dialog';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { trigger, transition, style, animate } from '@angular/animations';
import { FinanceService } from '../../finance/service/finance.service';
import { SoSuccessDialogComponent } from '../so-success-dialog/so-success-dialog.component';
import { BarcodeReaderHelper } from '../../../shared/barcode-reader-helper/barcode-reader-helper.service';
import { InventoryService } from '../service/inventory.service';
import { BatchSelectionDialogComponent } from '../../../shared/components/batch-selection-dialog/batch-selection-dialog';
import { ActivatedRoute } from '@angular/router';
import { ProductForm } from '../../master/product/product-form/product-form';

@Component({
  selector: 'app-so-form',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, MaterialModule],
  templateUrl: './so-form.html',
  styleUrl: './so-form.scss',
  animations: [
    trigger('fadeInOut', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.5)' }),
        animate('200ms ease-out', style({ opacity: 1, transform: 'scale(1)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'scale(0.5)' }))
      ])
    ])
  ]
})
export class SoForm implements OnInit, OnDestroy, AfterViewInit {
  isAtTop = true;
  private scrollContainer: HTMLElement | null = null;
  private scrollListener: any;

  onScroll() {
    if (this.scrollContainer) {
      const { scrollTop } = this.scrollContainer;
      this.isAtTop = scrollTop < 50;
      this.cdr.detectChanges();
    }
  }

  toggleScroll() {
    if (this.scrollContainer) {
      if (this.isAtTop) {
        this.scrollContainer.scrollTo({ top: this.scrollContainer.scrollHeight, behavior: 'smooth' });
      } else {
        this.scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.scrollContainer = document.querySelector('.content');
      if (this.scrollContainer) {
        this.scrollListener = this.onScroll.bind(this);
        this.scrollContainer.addEventListener('scroll', this.scrollListener);
      }
    }, 500);
  }

  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);
  private dialog = inject(MatDialog);
  private customerService = inject(customerService);
  private productService = inject(ProductService);
  private soService = inject(SaleOrderService);
  private unitService = inject(UnitService);
  private financeService = inject(FinanceService);
  private destroy$ = new Subject<void>();
  private router = inject(Router);
  private barcodeHelper = inject(BarcodeReaderHelper);
  private inventoryService = inject(InventoryService);

  soForm!: FormGroup;
  isLoading = false;
  filteredProducts: Observable<any[]>[] = [];
  filteredUnits: Observable<any[]>[] = [];
  filteredCustomersSo!: Observable<any[]>;
  isProductLoading: boolean[] = [];
  isCustomerLoading = false;
  isScanning = false;
  lastScannedCode = '';

  subTotal = 0;
  totalTax = 0;
  grandTotal = 0;
  allUnits: any[] = [];
  customers: any = [];
  public generatedSoNumber: string = 'NEW ORDER';
  minDate: Date = new Date();
  
  // Edit mode properties
  private activatedRoute = inject(ActivatedRoute);
  isEdit = false;
  orderId: number | null = null;

  ngOnInit(): void {
    this.initForm();
    this.loadCustomers();
    this.loadUnits();

    this.filteredCustomersSo = this.soForm.get('customerSearch')!.valueChanges.pipe(
      startWith(''),
      map(value => {
        const name = typeof value === 'string' ? value : value?.customerName;
        return name ? this._filterCustomers(name) : this.customers.slice();
      })
    );

    this.activatedRoute.params.subscribe(params => {
      if (params['id']) {
        this.isEdit = true;
        this.orderId = +params['id'];
        this.loadOrderForEdit(this.orderId);
      } else {
        this.addRow();
      }
    });

    this.initBarcodeListener();
  }

  private loadOrderForEdit(id: number) {
    this.isLoading = true;
    this.soService.getSaleOrderById(id).subscribe({
      next: (order) => {
        this.isLoading = false;
        this.generatedSoNumber = order.soNumber;
        
        // Fix dates if they don't have timezone info
        const parseDt = (d: any) => {
          if (!d) return null;
          return (typeof d === 'string' && !d.includes('Z') && !d.includes('+')) ? d + 'Z' : d;
        };

        this.soForm.patchValue({
          customerId: order.customerId,
          soDate: parseDt(order.soDate),
          expectedDeliveryDate: parseDt(order.expectedDeliveryDate),
          remarks: order.remarks,
          status: order.status,
          subTotal: order.subTotal,
          totalTax: order.totalTax,
          grandTotal: order.grandTotal
        });

        // Clear initial dummy row
        this.items.clear();
        this.filteredProducts = [];
        this.filteredUnits = [];
        this.isProductLoading = [];

        // Add saved items
        order.items.forEach((item: any, idx: number) => {
          const row = this.fb.group({
            productSearch: [{ id: item.productId, productName: item.productName }, Validators.required],
            productId: [item.productId, Validators.required],
            qty: [item.qty, [Validators.required, Validators.min(1)]],
            unit: [item.unit || 'PCS'],
            rate: [item.rate, [Validators.required, Validators.min(0.01)]],
            discountPercent: [item.discountPercent || 0],
            gstPercent: [item.gstPercent || 0],
            taxAmount: [item.taxAmount],
            total: [{ value: item.total, disabled: true }],
            availableStock: [0], 
            warehouseId: [item.warehouseId],
            rackId: [item.rackId],
            rackName: [item.rackName || ''],
            isExpiryRequired: [!!item.expiryDate],
            manufacturingDate: [item.manufacturingDate],
            expiryDate: [item.expiryDate]
          });

          this.items.push(row);
          const index = this.items.length - 1;
          this.filteredProducts.push(of([]));
          this.filteredUnits.push(of([]));
          this.isProductLoading.push(false);
          this.setupFilter(index);
          this.updateTotal(index);

          // Fetch real stock for this product
          this.inventoryService.getCurrentStock('', '', 0, 10, item.productName).subscribe((res: any) => {
            const itemsArray = res?.data?.items || res?.items || res?.Items || res?.data?.Items || [];
            const productStock = itemsArray.find((x: any) => String(x.productId || x.ProductId) === String(item.productId));
            if (productStock) {
              // For Drafts, total available stock is just what's in the warehouse
              const maxStock = (productStock.availableStock || 0);
              row.get('availableStock')?.setValue(maxStock);
              row.get('qty')?.setValidators([Validators.required, Validators.min(1), Validators.max(maxStock)]);
              row.get('qty')?.updateValueAndValidity();

              // If Rack Name is missing (common in Drafts), pick from current stock
              if (!row.get('rackName')?.value) {
                row.patchValue({
                  rackName: productStock.rackName || 'Not Assigned',
                  warehouseId: row.get('warehouseId')?.value || productStock.warehouseId,
                  rackId: row.get('rackId')?.value || productStock.rackId
                }, { emitEvent: false });
              }
            }
          });
        });

        // Find and set customer in autocomplete
        if (this.customers && this.customers.length > 0) {
          const cust = this.customers.find((c: any) => c.id === order.customerId);
          if (cust) {
            this.soForm.get('customerSearch')?.setValue(cust);
          }
        }

        this.calculateGrandTotal();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoading = false;
        this.dialog.open(StatusDialogComponent, {
          width: '350px',
          data: { type: 'error', title: 'Load Failed', message: "An error occurred while loading the order data." }
        });
      }
    });
  }

  private initBarcodeListener() {
    this.barcodeHelper.onScan().pipe(takeUntil(this.destroy$)).subscribe(code => {
      console.log('📦 Barcode Scanned (SO):', code);
      this.isScanning = true;
      this.lastScannedCode = code;
      this.handleBarcodeScan(code);

      // Reset scanning state after a short delay
      setTimeout(() => {
        this.isScanning = false;
        this.cdr.detectChanges();
      }, 1500);
    });
  }

  private handleBarcodeScan(sku: string) {
    // 1. Check if product already exists in the current list by SKU
    // Note: Sale Order row doesn't store SKU explicitly in the form, 
    // but the productSearch value contains the full product object after selection.
    const existingIndex = this.items.controls.findIndex(ctrl => {
      const p = ctrl.get('productSearch')?.value;
      return p && p.sku === sku;
    });

    if (existingIndex > -1) {
      // Product exists, increment quantity
      const qtyCtrl = this.items.at(existingIndex).get('qty');
      qtyCtrl?.setValue(Number(qtyCtrl.value) + 1);
      this.updateTotal(existingIndex);
      this.cdr.detectChanges();
      return;
    }

    // 2. If not found, search product by SKU in database
    this.isLoading = true;
    this.productService.searchProducts(sku).pipe(
      finalize(() => this.isLoading = false)
    ).subscribe(products => {
      const match = products.find(p => p.sku === sku);
      if (match) {
        // If first row is empty and not touched, replace it
        if (this.items.length === 1 && !this.items.at(0).get('productId')?.value) {
          this.items.removeAt(0);
        }
        this.addProductToForm(match);
      } else {
        // Product not found - Open Quick Add Product Dialog
        const dialogRef = this.dialog.open(ProductForm, {
          width: '850px',
          disableClose: true,
          data: { sku: sku }
        });

        dialogRef.afterClosed().subscribe(newProduct => {
          if (newProduct) {
            // If first row is empty and not touched, replace it
            if (this.items.length === 1 && !this.items.at(0).get('productId')?.value) {
              this.items.removeAt(0);
            }
            this.addProductToForm(newProduct);
          }
        });
      }
    });
  }

  addProductToForm(product: any, targetIndex: number | null = null) {
    const isExistingItem = !!(product as any).productId;
    const productId = isExistingItem ? (product as any).productId : product.id;

    const formatDt = (dt: any) => {
      if (!dt) return null;
      if (typeof dt === 'string' && dt.length >= 10) return dt.substring(0, 10);
      try { return new Date(dt).toISOString().substring(0, 10); } catch { return null; }
    };

    const isExpiredBatch = (expDate: any): boolean => {
      if (!expDate) return false;
      const exp = new Date(expDate);
      exp.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return exp <= today;
    };

    const row = this.fb.group({
      productSearch: [product, Validators.required],
      productId: [productId, Validators.required],
      qty: [product.qty || 1, [Validators.required, Validators.min(1), Validators.max(product.currentStock || product.availableStock || 0)]],
      unit: [product.unit || 'PCS'],
      rate: [product.rate || product.saleRate || 0, [Validators.required, Validators.min(0.01)]],
      discountPercent: [product.discount || product.discountPercent || 0],
      gstPercent: [product.defaultGst ?? product.gstPercent ?? 18],
      taxAmount: [0],
      total: [{ value: 0, disabled: true }],
      availableStock: [product.currentStock || product.availableStock || 0],
      warehouseId: [product.warehouseId || null],
      rackId: [product.rackId || null],
      rackName: [product.defaultRackName || product.rackName || ''],
      isExpiryRequired: [product.isExpiryRequired || false],
      manufacturingDate: [null],
      expiryDate: [null]
    });

    let index: number;
    if (targetIndex !== null) {
      this.items.insert(targetIndex, row);
      index = targetIndex;
      // Sync metadata arrays
      this.filteredProducts.splice(index, 0, of([]));
      this.filteredUnits.splice(index, 0, of([]));
      this.isProductLoading.splice(index, 0, false);
    } else {
      this.items.push(row);
      index = this.items.length - 1;
    }

    this.setupFilter(index);
    this.updateTotal(row);

    if (!isExistingItem) {
      const productName = product.productName || product.name || '';
      // 🧐 Using Name for search as Stock controller might not index SKU for search, 
      // but matching by ID is case-insensitive for GUID consistency.
      this.inventoryService.getCurrentStock('', '', 0, 100, productName).subscribe((res: any) => {
        const currentItem = row;
        const itemsArray = res?.data?.items || res?.items || res?.Items || res?.data?.Items || [];
        
        // AGGREGATE ALL ITEMS for the same product Id from ALL racks
        const matchingProductItems = itemsArray.filter((x: any) => {
          const xId = String(x.productId || x.ProductId || x.id || x.Id).toLowerCase();
          const targetId = String(productId).toLowerCase();
          return xId === targetId || (x.productName === productName && productName.length > 0);
        });

        if (matchingProductItems.length === 0) {
          this.dialog.open(StatusDialogComponent, { width: '350px', data: { isSuccess: false, title: 'Out of Stock', message: 'No stock available for this product.' } });
          const idx = this.items.controls.indexOf(row);
          if (idx > -1) this.removeItem(idx);
          return;
        }

        // Sum total stock from all racks for display
        const totalAvail = matchingProductItems.reduce((acc: number, curr: any) => acc + (curr.availableStock || 0), 0);
        currentItem.get('availableStock')?.setValue(totalAvail);

        // Build consolidated history from ALL matching items
        const allBatches: any[] = [];
        matchingProductItems.forEach((pItem: any) => {
            const pItemHistory = pItem.history || [];
            pItemHistory.forEach((h: any) => {
              allBatches.push({
                grnNumber: h.grnNumber || 'N/A',
                manufacturingDate: h.manufacturingDate,
                expiryDate: h.expiryDate,
                availableStock: h.availableQty ?? h.AvailableQty ?? 0,
                warehouseName: h.warehouseName || pItem.warehouseName,
                rackName: h.rackName || pItem.rackName,
                warehouseId: h.warehouseId || pItem.warehouseId,
                rackId: h.rackId || pItem.rackId,
                isExpired: isExpiredBatch(h.expiryDate)
              });
            });

            // If item has stock but NO history records, add the item itself as a batch
            if (pItemHistory.length === 0 && (pItem.availableStock || 0) > 0) {
              allBatches.push({
                grnNumber: 'N/A',
                manufacturingDate: pItem.manufacturingDate,
                expiryDate: pItem.expiryDate,
                availableStock: pItem.availableStock || 0,
                warehouseName: pItem.warehouseName,
                rackName: pItem.rackName,
                warehouseId: pItem.warehouseId,
                rackId: pItem.rackId,
                isExpired: isExpiredBatch(pItem.expiryDate)
              });
            }
        });

        // Show batches that have stock OR are expired OR are valid but 0 stock (so they are visible)
        const selectableBatches = allBatches.filter((b: any) => b.availableStock > 0 || b.isExpired || b.manufacturingDate); 
        const validBatches = allBatches.filter((b: any) => !b.isExpired && b.availableStock > 0);

        if (validBatches.length === 1 && allBatches.filter((b: any) => b.availableStock > 0).length === 1) {
          this.applyBatchToForm(validBatches[0], currentItem);
        } else if (validBatches.length > 0 || selectableBatches.length > 0) {
          const dialogRef = this.dialog.open(BatchSelectionDialogComponent, {
            width: '620px',
            disableClose: false,
            data: { productName: product.productName || product.name, batches: selectableBatches, validCount: validBatches.length }
          });

          dialogRef.afterClosed().subscribe((selectedBatch: any) => {
            if (selectedBatch) {
              this.applyBatchToForm(selectedBatch, currentItem);
            } else {
              const idx = this.items.controls.indexOf(row);
              if (idx > -1) this.removeItem(idx);
            }
          });
        } else {
          this.dialog.open(StatusDialogComponent, { width: '350px', data: { isSuccess: false, title: 'Out of Stock', message: 'No stock available for this product.' } });
          const idx = this.items.controls.indexOf(row);
          if (idx > -1) this.removeItem(idx);
        }
      });
    }
  }

  applyBatchToForm(batch: any, formGroup: any) {
    if (!batch || !formGroup) return;

    const mfgDate = batch.manufacturingDate || batch.ManufacturingDate;
    const expDate = batch.expiryDate || batch.ExpiryDate;
    const whId = batch.warehouseId || batch.WarehouseId;
    const rkId = batch.rackId || batch.RackId;
    const rackName = batch.rackName || batch.RackName;
    const stock = batch.availableStock || batch.AvailableStock || 0;

    formGroup.patchValue({
      warehouseId: whId,
      warehouseName: batch.warehouseName || batch.WarehouseName,
      rackId: rkId,
      rackName: rackName,
      manufacturingDate: mfgDate ? new Date(mfgDate) : null,
      expiryDate: expDate ? new Date(expDate) : null,
      availableStock: stock
    });
    formGroup.get('qty')?.setValidators([Validators.required, Validators.min(1), Validators.max(stock)]);
    formGroup.get('qty')?.updateValueAndValidity();
    this.updateTotal(formGroup);
    this.cdr.detectChanges();
  }

  initForm() {
    this.soForm = this.fb.group({
      customerId: [null, [Validators.required]],
      customerSearch: ['', [Validators.required]],
      soDate: [new Date(), Validators.required],
      expectedDeliveryDate: [new Date(), Validators.required],
      remarks: [''],
      status: ['Draft'],
      subTotal: [0],
      totalTax: [0],
      grandTotal: [0],
      items: this.fb.array([]),
      taxType: ['local'],
      tdsPercent: [0],
      tcsPercent: [0]
    });
  }

  private _filterCustomers(name: string): any[] {
    const filterValue = name.toLowerCase();
    return this.customers.filter((c: any) => 
      (c.customerName || c.name || '').toLowerCase().includes(filterValue)
    );
  }

  displayCustomerFn(customer: any): string {
    return customer && customer.customerName ? customer.customerName : (typeof customer === 'string' ? customer : '');
  }

  onCustomerSelected(event: any): void {
    const customer = event.option.value;
    this.soForm.get('customerId')?.setValue(customer.id);
  }

  clearCustomerSearch(): void {
    this.soForm.get('customerSearch')?.setValue('');
    this.soForm.get('customerId')?.setValue(null);
  }

  loadCustomers(): void {
    this.isCustomerLoading = true;
    this.customerService.getAllCustomers().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        // Filter out Internal/Proprietor accounts
        const PROPRIETOR_NAME = 'Proprietor (Self / Capital Account)';
        const BANK_ACCOUNT_NAME = 'Company Bank Account (Internal)';
        
        this.customers = (res || []).filter((c: any) => {
          const name = c.customerName || c.name || '';
          return name !== PROPRIETOR_NAME && name !== BANK_ACCOUNT_NAME;
        });
        
        // Handle initial value for edit mode
        const currentCustId = this.soForm.get('customerId')?.value;
        if (currentCustId && this.customers.length > 0) {
            const cust = this.customers.find((c: any) => c.id === currentCustId);
            if (cust) this.soForm.get('customerSearch')?.setValue(cust);
        }

        this.isCustomerLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isCustomerLoading = false;
      }
    });
  }

  loadUnits() {
    this.unitService.getAll().pipe(takeUntil(this.destroy$)).subscribe(data => this.allUnits = data || []);
  }

  get items(): FormArray {
    return this.soForm.get('items') as FormArray;
  }

  get totalQty(): number {
    return this.items.controls.reduce((sum, item) => sum + (Number(item.get('qty')?.value) || 0), 0);
  }

  addRow(): void {
    const row = this.fb.group({
      productSearch: ['', Validators.required],
      productId: [null, Validators.required],
      qty: [1, [Validators.required, Validators.min(1)]],
      unit: [''], // Note: Isse disabled mat rakhein, getRawValue handle kar lega
      rate: [0, [Validators.required, Validators.min(0.01)]],
      discountPercent: [0],
      gstPercent: [0],
      taxAmount: [0],
      total: [{ value: 0, disabled: true }],
      availableStock: [0],
      rackName: [''], // Added Rack Name
      isExpiryRequired: [false],
      manufacturingDate: [null],
      expiryDate: [null]
    });

    this.items.push(row);
    this.setupFilter(this.items.length - 1);
  }

  openBulkAddDialog() {
    const dialogRef = this.dialog.open(ProductSelectionDialogComponent, {
      width: '1250px',
      height: '620px',
      maxWidth: '96vw',
      disableClose: true,
      data: {
        allowOutOfStock: false,
        existingIds: this.items.controls.map(c => c.get('productId')?.value)
      }
    });

    dialogRef.afterClosed().subscribe((selectedProducts: any[]) => {
      if (selectedProducts && selectedProducts.length > 0) {
        selectedProducts.forEach(product => {
          // Check if product already exists in the list
          const exists = this.items.controls.some(control => control.get('productId')?.value === product.id);

          if (!exists) {
            this.addProductToForm(product);
          }
        });

        // Remove the first empty row if it was not used
        if (this.items.length > 1) {
          const firstRow = this.items.at(0);
          if (!firstRow.get('productId')?.value) {
            this.removeItem(0);
          }
        }

        this.calculateGrandTotal();
        this.cdr.detectChanges();
      }
    });
  }

  private setupFilter(index: number): void {
    const row = this.items.at(index);
    const control = row.get('productSearch');
    if (!control) return;

    // Product Autocomplete
    this.filteredProducts[index] = control.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(value => {
        if (typeof value !== 'string' || value.length < 1) return of([]);
        this.isProductLoading[index] = true;
        return this.productService.searchProducts(value).pipe(
          finalize(() => this.isProductLoading[index] = false),
          catchError(() => of([]))
        );
      }),
      takeUntil(this.destroy$)
    );

    // Unit Autocomplete
    this.filteredUnits[index] = row.get('unit')!.valueChanges.pipe(
      debounceTime(200),
      distinctUntilChanged(),
      switchMap(value => {
        const str = (value || '').toLowerCase();
        return of(this.allUnits.filter(u => u.name.toLowerCase().includes(str)));
      }),
      takeUntil(this.destroy$)
    );
  }

  displayProductFn(p: any): string {
    if (!p) return '';
    if (typeof p === 'string') return p;
    return p.productName || p.name || '';
  }

  onProductChange(index: number, event: any): void {
    const p = event.option.value;
    if (p) {
      // Check for duplicate product
      const isDuplicate = this.items.controls.some((control, i) =>
        i !== index && control.get('productId')?.value === p.id
      );

      if (isDuplicate) {
        this.dialog.open(StatusDialogComponent, {
          width: '350px',
          data: {
            isSuccess: false,
            title: 'Duplicate Product',
            message: `"${p.productName || p.name}" is already added to the list.`
          }
        });

        // Reset the current row
        const row = this.items.at(index);
        row.patchValue({
          productSearch: '',
          productId: null,
          unit: '',
          rate: 0,
          qty: 1,
          gstPercent: 0,
          taxAmount: 0,
          total: 0,
          availableStock: 0
        }, { emitEvent: false });

        return;
      }

      const row = this.items.at(index);
      // Remove the dummy row created by autocomplete and use addProductToForm at the same index
      this.removeItem(index);
      this.addProductToForm(p, index);
    }
  }

  updateTotal(indexOrRow: number | FormGroup): void {
    const row = typeof indexOrRow === 'number' ? (this.items.at(indexOrRow) as FormGroup) : (indexOrRow as FormGroup);
    if (!row) return;
    const qty = +row.get('qty')?.value || 0;
    const rate = +row.get('rate')?.value || 0;
    const disc = +row.get('discountPercent')?.value || 0;
    const gst = +row.get('gstPercent')?.value || 0;

    const amount = qty * rate;
    const discountAmount = amount * (disc / 100);
    const taxable = amount - discountAmount;
    const tax = taxable * (gst / 100);
    const total = taxable + tax;

    row.patchValue({
      taxAmount: tax.toFixed(2),
      total: total.toFixed(2)
    }, { emitEvent: false });

    this.calculateGrandTotal();
  }

  calculateGrandTotal(): void {
    let sub = 0;
    let tax = 0;
    let grand = 0;

    this.items.controls.forEach(c => {
      const rowTotal = +c.get('total')?.value || 0;
      const rowTax = +c.get('taxAmount')?.value || 0;
      grand += rowTotal;
      tax += rowTax;
    });

    this.grandTotal = grand;
    this.totalTax = tax;
    this.subTotal = grand - tax;

    this.soForm.patchValue({
      subTotal: this.subTotal.toFixed(2),
      totalTax: this.totalTax.toFixed(2),
      grandTotal: this.grandTotal.toFixed(2)
    }, { emitEvent: false });

    this.cdr.detectChanges();
  }

  get tdsAmount(): number {
    return (this.subTotal * (this.soForm.get('tdsPercent')?.value || 0)) / 100;
  }

  get tcsAmount(): number {
    return (this.subTotal * (this.soForm.get('tcsPercent')?.value || 0)) / 100;
  }

  get finalGrandTotal(): number {
    return this.grandTotal - this.tdsAmount + this.tcsAmount;
  }

  getMinExpDate(mfgDateValue: any): Date | null {
    if (!mfgDateValue) return null;
    const d = new Date(mfgDateValue);
    if (!isNaN(d.getTime())) {
      const minDate = new Date(d);
      minDate.setDate(d.getDate() + 1);
      return minDate;
    }
    return null;
  }

  removeItem(index: number): void {
    if (this.items.length > 0) { // Allowed 0 items if we are about to add/replace
      this.items.removeAt(index);
      this.filteredProducts.splice(index, 1);
      this.filteredUnits.splice(index, 1);
      this.isProductLoading.splice(index, 1);
      this.calculateGrandTotal();
    }
  }

  getStockForProduct(index: number): number {
    return this.items.at(index).get('availableStock')?.value || 0;
  }

  getRackName(index: number): string {
    return this.items.at(index).get('rackName')?.value || 'Not Assigned';
  }

  openAddCustomerDialog() {
    const dialogRef = this.dialog.open(CustomerComponent, { width: '600px', disableClose: true });
    dialogRef.afterClosed().subscribe(result => { if (result) this.loadCustomers(); });
  }

  get hasZeroStockItems(): boolean {
    return this.items.controls.some(control => {
      const stock = control.get('availableStock')?.value || 0;
      const productId = control.get('productId')?.value;
      const qty = Number(control.get('qty')?.value || 0);

      // Invalid if:
      // 1. Product is selected but stock is 0 or less (Out of Stock)
      // 2. Qty entered is greater than available stock
      return productId && (stock <= 0 || qty > stock);
    });
  }

  Save(): void {
    if (this.soForm.invalid) {
      this.soForm.markAllAsTouched();
      return;
    }

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Confirm Save',
        message: 'Are you sure you want to save this Sale Order?',
        confirmText: 'Save',
        confirmColor: 'primary'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        const formValues = this.soForm.getRawValue();

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const soDate = new Date(formValues.soDate);
        soDate.setHours(0, 0, 0, 0);

        if (soDate < today) {
          this.dialog.open(StatusDialogComponent, {
            width: '400px',
            data: { isSuccess: false, title: 'Validation Error', message: 'Sale Order Date cannot be in the past.' }
          });
          return;
        }

        if (formValues.expectedDeliveryDate) {
          const deliveryDate = new Date(formValues.expectedDeliveryDate);
          deliveryDate.setHours(0, 0, 0, 0);

          if (deliveryDate < today) {
            this.dialog.open(StatusDialogComponent, {
              width: '400px',
              data: { isSuccess: false, title: 'Validation Error', message: 'Expected Delivery Date cannot be in the past.' }
            });
            return;
          }

          if (deliveryDate < soDate) {
            this.dialog.open(StatusDialogComponent, {
              width: '400px',
              data: {
                isSuccess: false,
                title: 'Validation Error',
                message: 'Expected Delivery Date must be greater than or equal to Sale Order Date.'
              }
            });
            return;
          }
        }

        const userId = localStorage.getItem('email') || 'admin@admin.com'; // Default user handle
        const currentStatus = formValues.status;

        const successMessageText = currentStatus === 'Confirmed'
          ? 'Sale Order saved and inventory adjusted successfully.'
          : (this.isEdit ? 'Sale Order updated successfully.' : 'Sale Order saved as Draft. Inventory was not affected.');

        const payload = {
          id: this.isEdit ? this.orderId : 0,
          soNumber: this.isEdit ? this.generatedSoNumber : null,
          customerId: formValues.customerId,
          status: currentStatus,
          soDate: formValues.soDate,
          expectedDeliveryDate: formValues.expectedDeliveryDate,
          remarks: formValues.remarks || '',
          taxType: formValues.taxType || 'local',
          tdsPercent: Number(formValues.tdsPercent || 0),
          tcsPercent: Number(formValues.tcsPercent || 0),
          tdsAmount: this.tdsAmount,
          tcsAmount: this.tcsAmount,
          igstAmount: formValues.taxType === 'interState' ? this.totalTax : 0,
          cgstAmount: formValues.taxType === 'local' ? this.totalTax / 2 : 0,
          sgstAmount: formValues.taxType === 'local' ? this.totalTax / 2 : 0,
          subTotal: Number(formValues.subTotal) || 0,
          totalTax: Number(formValues.totalTax) || 0,
          grandTotal: this.finalGrandTotal,
          createdBy: userId,
          items: this.items.controls.map(item => {
            const val = (item as FormGroup).getRawValue();
            return {
              productId: val.productId,
              productName: val.productSearch?.productName || val.productSearch?.name || (typeof val.productSearch === 'string' ? val.productSearch : ''),
              qty: Number(val.qty),
              unit: val.unit || 'PCS', // Ensure unit is not null
              rate: Number(val.rate),
              discountPercent: Number(val.discountPercent) || 0,
              gstPercent: Number(val.gstPercent) || 0,
              taxAmount: Number(val.taxAmount) || 0,
              total: Number(val.total) || 0,
              warehouseId: val.warehouseId || null,
              rackId: val.rackId || null,
              manufacturingDate: val.manufacturingDate || null,
              expiryDate: val.expiryDate || null
            };
          })
        };

        this.soService.saveSaleOrder(payload).subscribe({
          next: (res: any) => {
            // ✅ Order Number Display Fix
            const orderNo = res.soNumber || res.SONumber || 'N/A';
            const soId = res.id || res.Id;

            // Find customer name for the dialog
            const selectedCust = this.customers.find((c: any) => String(c.id) == String(formValues.customerId));
            const customerName = selectedCust?.customerName || selectedCust?.name || 'Customer';

            this.generatedSoNumber = orderNo;

            // Show success dialog with payment option
            const dialogRef = this.dialog.open(SoSuccessDialogComponent, {
              width: '500px',
              disableClose: true,
              data: {
                soNumber: orderNo,
                grandTotal: Number(formValues.grandTotal) || 0,
                customerId: formValues.customerId,
                customerName: customerName,
                status: currentStatus
              }
            });

            dialogRef.afterClosed().subscribe(result => {
              if (result === 'make-payment') {
                this.performDirectPayment({
                  soId: soId,
                  soNumber: orderNo,
                  grandTotal: Number(formValues.grandTotal) || 0,
                  customerId: formValues.customerId,
                  customerName: customerName
                });
              } else {
                // Navigate to SO List
                this.router.navigate(['/app/inventory/solist']);
              }
            });
          },
          error: (err) => {
            // Detailed error handling based on Network response
            console.error("Save Error:", err);
            this.dialog.open(StatusDialogComponent, {
              width: '350px',
              data: { isSuccess: false, title: 'Action Failed', message: 'Check if all fields (Unit/Rate) are valid.' }
            });
          }
        });
      }
    });
  }

  performDirectPayment(data: any) {
    console.log('🚀 Initiating Direct Receipt with data:', data);

    const receiptPayload = {
      id: 0,
      customerId: Number(data.customerId),
      amount: Number(data.grandTotal),
      totalAmount: Number(data.grandTotal),
      discountAmount: 0,
      netAmount: Number(data.grandTotal),
      paymentMode: 'Cash',
      // Add unique suffix to prevent duplicate reference block
      referenceNumber: `${data.soNumber}-${new Date().getTime().toString().slice(-4)}`,
      paymentDate: new Date().toISOString(),
      remarks: `Direct Receipt for SO: ${data.soNumber}`,
      createdBy: localStorage.getItem('email') || 'Admin'
    };

    // Calculate total quantity for Gate Pass
    const totalQty = this.items.controls.reduce((sum, item) => sum + (Number(item.get('qty')?.value) || 0), 0);

    // Increase delay to ensure SO transaction is committed
    setTimeout(() => {
      this.financeService.recordCustomerReceipt(receiptPayload).subscribe({
        next: () => {
          this.dialog.open(StatusDialogComponent, {
            width: '350px',
            data: {
              isSuccess: true,
              title: 'Payment Successful',
              message: `Receipt of ₹${data.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })} recorded. Redirecting to Outward Gate Pass...`,
              status: 'success'
            }
          });
          this.router.navigate(['/app/inventory/gate-pass/outward'], {
            queryParams: { type: 'sale-order', refId: data.soId, refNo: data.soNumber, partyName: data.customerName, qty: totalQty }
          });
        },
        error: (err) => {
          console.error('❌ Direct receipt failed:', err);
          const serverMsg = err.error?.message || err.message || 'Unknown server error';

          this.dialog.open(StatusDialogComponent, {
            width: '400px',
            data: {
              isSuccess: false,
              title: 'Payment Failed',
              message: `Sale Order saved but payment failed.\n\nReason: ${serverMsg}`,
              status: 'error'
            }
          });
          this.router.navigate(['/app/inventory/solist']);
        }
      });
    }, 800);
  }

  ngOnDestroy() {
    if (this.scrollContainer && this.scrollListener) {
      this.scrollContainer.removeEventListener('scroll', this.scrollListener);
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  goBack() {
    this.router.navigate(['/app/inventory/solist']);
  }
}