import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef, HostListener } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { MatDialog } from '@angular/material/dialog';
import { SupplierModalComponent } from '../supplier-modal/supplier-modal';
import { Supplier, SupplierService } from '../service/supplier.service';
import { InventoryService } from '../service/inventory.service';
import { Observable, of, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, takeUntil, finalize, catchError } from 'rxjs/operators';
import { ActivatedRoute, Router } from '@angular/router';
import { ProductService } from '../../master/product/service/product.service';
import { POService } from '../service/po.service';
import { UnitService } from '../../master/units/services/units.service';
import { DateHelper } from '../../../shared/models/date-helper';
import { NotificationService } from '../../shared/notification.service';
import { ProductSelectionDialogComponent } from '../../../shared/components/product-selection-dialog/product-selection-dialog';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { BarcodeReaderHelper } from '../../../shared/barcode-reader-helper/barcode-reader-helper.service';

import { trigger, transition, style, animate } from '@angular/animations';
import { ProductForm } from '../../master/product/product-form/product-form';

@Component({
  selector: 'app-po-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MaterialModule],
  templateUrl: './po-form.html',
  styleUrl: './po-form.scss',
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
export class PoForm implements OnInit, OnDestroy, AfterViewInit {
  isAtTop = true;
  today = new Date();
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
  private dialog = inject(MatDialog);
  private cdr = inject(ChangeDetectorRef);
  private supplierService = inject(SupplierService);
  private inventoryService = inject(InventoryService);
  private productService = inject(ProductService);
  private poService = inject(POService);
  private unitService = inject(UnitService);
  private router = inject(Router);
  private destroy$ = new Subject<void>();
  private route = inject(ActivatedRoute);
  private notification = inject(NotificationService);
  private barcodeHelper = inject(BarcodeReaderHelper);

  isPriceListAutoSelected = false;
  filteredProducts: Observable<any[]>[] = [];
  filteredUnits: Observable<any[]>[] = [];
  isProductLoading: boolean[] = [];
  suppliers: Supplier[] = [];
  priceLists: any[] = [];
  isLoadingSuppliers = false;
  isLoadingPriceLists = false;
  isLoading = false;
  allUnits: any[] = [];
  grandTotal = 0;
  totalTaxAmount = 0;
  subTotal = 0;
  totalQty = 0;
  isScanning = false;
  lastScannedCode = '';
  poForm!: FormGroup;
  poId!: any;
  currentStatus = '';
  isEditMode: boolean = false;
  private refillData: any = null;
  isReorder: boolean = false;
  reorderTooltipText: string = 'Items pre-filled from Reorder recommendations';
  minDate: Date = new Date();
  selectedSupplierIsUnregistered: boolean = false;

  constructor() {
    const navigation = this.router.getCurrentNavigation();
    if (navigation?.extras.state) {
      this.refillData = navigation.extras.state['refillData'];
    }
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.initForm();
    this.loadSuppliers();
    this.bindDropdownPriceList();
    this.loadUnits();

    if (id && id !== '0') {
      this.poId = id;
      this.isEditMode = true;
      this.loadPODetails(id);
    } else if (this.refillData) {
      this.isEditMode = false;
      this.isReorder = true;
      this.loadNextPoNumber();
      if (Array.isArray(this.refillData)) {
        this.refillData.forEach(item => this.addRefillRow(item));
      } else {
        this.addRefillRow(this.refillData);
      }
    } else {
      this.isEditMode = false;
      this.loadNextPoNumber();
      this.addRow();
    }

    this.initBarcodeListener();
  }

  private initBarcodeListener() {
    this.barcodeHelper.onScan().pipe(takeUntil(this.destroy$)).subscribe(code => {
      console.log('📦 Barcode Scanned:', code);
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
    const existingIndex = this.items.controls.findIndex(ctrl => ctrl.get('sku')?.value === sku);

    if (existingIndex > -1) {
      // Product exists, increment quantity
      const qtyCtrl = this.items.at(existingIndex).get('qty');
      qtyCtrl?.setValue(Number(qtyCtrl.value) + 1);
      this.updateTotal(existingIndex);
      this.notification.showStatus(true, `Quantity updated for SKU: ${sku}`);
      return;
    }

    // 2. If not found, search product by SKU in database
    this.isLoading = true;
    this.productService.searchProducts(sku).pipe(
      finalize(() => this.isLoading = false)
    ).subscribe(products => {
      // Find exact SKU match if multiple returned
      const match = products.find(p => p.sku === sku);

      if (match) {
        // If first row is empty and not touched, replace it
        if (this.items.length === 1 && !this.items.at(0).get('productId')?.value) {
          this.items.removeAt(0);
        }
        // Product found, add it to the list
        this.addProductToForm(match);
        this.notification.showStatus(true, `Product added: ${match.productName}`);
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
            this.notification.showStatus(true, `New product created and added: ${newProduct.productName}`);
          }
        });
      }
    });
  }

  openBulkAddDialog() {
    const dialogRef = this.dialog.open(ProductSelectionDialogComponent, {
      width: '1250px',
      maxWidth: '96vw',
      disableClose: false,
      data: { 
        allowOutOfStock: true,
        existingIds: this.items.controls.map(c => c.get('productId')?.value)
      }
    });

    dialogRef.afterClosed().subscribe((selectedProducts: any[]) => {
      if (selectedProducts && selectedProducts.length > 0) {
        if (this.items.length === 1 && !this.items.at(0).get('productId')?.value) {
          this.items.removeAt(0);
        }
        selectedProducts.forEach(product => {
          const isDuplicate = this.items.controls.some(control => control.get('productId')?.value === product.id);
          if (!isDuplicate) {
            this.addProductToForm(product);
          }
        });
        this.cdr.detectChanges();
      }
    });
  }

  addProductToForm(product: any) {
    const priceListId = this.poForm.get('priceListId')?.value;
    const index = this.items.length;

    const row = this.fb.group({
      productSearch: [product, Validators.required],
      productId: [product.id, Validators.required],
      qty: [1, [Validators.required, Validators.min(1)]],
      unit: [product.unit || 'PCS', Validators.required],
      price: [product.basePurchasePrice || 0, [Validators.required, Validators.min(1)]],
      discountPercent: [0],
      gstPercent: [this.selectedSupplierIsUnregistered ? 0 : (product.defaultGst ?? product.gstPercent ?? 18)],
      taxAmount: [{ value: 0, disabled: true }],
      total: [{ value: 0, disabled: true }],
      currentStock: [product.currentStock || 0],
      sku: [product.sku || ''],
      mfgDate: [null, product.isExpiryRequired ? Validators.required : null],
      expDate: [null, product.isExpiryRequired ? Validators.required : null],
      isExpiryRequired: [product.isExpiryRequired ?? false],
      originalGst: [product.defaultGst ?? product.gstPercent ?? 18],
      id: [0]
    });

    this.items.push(row);
    this.isProductLoading[index] = false;
    this.setupFilter(index);

    if (product.id && priceListId) {
      this.inventoryService.getProductRate(product.id, priceListId).subscribe({
        next: (res: any) => {
          if (res) {
            row.patchValue({
              price: res.recommendedRate || res.rate,
              // Note: GST Product Master wala hi rahega, Discount PriceList se aayega
              discountPercent: res.discount || res.discountPercent || 0
            });
          }
          this.updateTotal(index);
        },
        error: () => this.updateTotal(index)
      });
    } else {
      this.updateTotal(index);
    }
  }

  private addRefillRow(data: any) {
    const index = this.items.length;
    const row = this.fb.group({
      productSearch: [data.productName, Validators.required],
      productId: [data.productId, Validators.required],
      qty: [data.suggestedQty || 10, [Validators.required, Validators.min(1)]],
      unit: [{ value: data.unit || 'PCS', disabled: false }],
      price: [data.rate || 0, [Validators.required, Validators.min(1)]],
      discountPercent: [0],
      gstPercent: [this.selectedSupplierIsUnregistered ? 0 : (data.gstPercent ?? data.defaultGst ?? 18)],
      taxAmount: [{ value: 0, disabled: true }],
      total: [{ value: 0, disabled: true }],
      currentStock: [data.currentStock || 0],
      sku: [data.sku || ''],
      mfgDate: [null, data.isExpiryRequired ? Validators.required : null],
      expDate: [null, data.isExpiryRequired ? Validators.required : null],
      isExpiryRequired: [data.isExpiryRequired ?? false],
      originalGst: [data.gstPercent ?? data.defaultGst ?? 18],
      id: [0]
    });

    this.items.push(row);
    this.isProductLoading[index] = false;
    this.setupFilter(index);

    const pListId = this.poForm.get('priceListId')?.value;
    if (pListId && data.productId) {
      this.inventoryService.getProductRate(data.productId, pListId).subscribe({
        next: (res: any) => {
          if (res) {
            row.patchValue({
              price: res.recommendedRate || res.rate,
              discountPercent: res.discount || res.discountPercent || 0 // Discount from PriceList
            });
          }
          this.updateTotal(index);
        },
        error: () => this.updateTotal(index)
      });
    } else {
      this.updateTotal(index);
    }
    this.cdr.detectChanges();
  }

  loadPODetails(id: any) {
    this.isLoading = true;
    this.poService.getById(id).subscribe({
      next: (res: any) => {
        this.currentStatus = res.status;
        this.poForm.patchValue({
          supplierId: res.supplierId,
          priceListId: res.priceListId,
          PoNumber: res.poNumber,
          poDate: DateHelper.toDateObject(res.poDate),
          expectedDeliveryDate: DateHelper.toDateObject(res.expectedDeliveryDate),
          remarks: res.remarks || ''
        });
        this.items.clear();
        if (res.items) {
          res.items.forEach((item: any, idx: number) => this.addEditRow(item, idx));
        }
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoading = false;
        this.notification.showStatus(false, 'Failed to load order details');
      }
    });
  }

  initForm(): void {
    this.poForm = this.fb.group({
      supplierId: [null, Validators.required],
      priceListId: [null, Validators.required],
      poDate: [new Date(), Validators.required],
      expectedDeliveryDate: [new Date(), Validators.required],
      PoNumber: [{ value: '', disabled: true }],
      remarks: ['', Validators.required],
      items: this.fb.array([]),
      isTaxApplicable: [true],
      taxType: ['local'],
      tdsPercent: [0],
      tcsPercent: [0]
    });

    // Listen to manual checkbox change
    this.poForm.get('isTaxApplicable')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(val => {
      this.selectedSupplierIsUnregistered = !val;
      this.items.controls.forEach((ctrl, idx) => {
        if (!val) {
          // Unchecked: Set display to 0
          ctrl.get('gstPercent')?.setValue(0, { emitEvent: false });
        } else {
          // Checked: Restore original GST
          const original = ctrl.get('originalGst')?.value || 0;
          ctrl.get('gstPercent')?.setValue(original, { emitEvent: false });
        }
        this.updateTotal(idx);
      });
    });
  }

  addEditRow(item: any, index: number): void {
    const row = this.fb.group({
      productSearch: [item.productName, Validators.required],
      productId: [item.productId, Validators.required],
      qty: [item.qty, [Validators.required, Validators.min(1)]],
      unit: [item.unit || 'PCS', Validators.required],
      price: [item.rate, [Validators.required, Validators.min(1)]],
      discountPercent: [item.discountPercent || 0],
      gstPercent: [item.gstPercent || 0],
      originalGst: [item.gstPercent || 0],
      taxAmount: [{ value: item.taxAmount, disabled: true }],
      total: [{ value: item.total, disabled: true }],
      currentStock: [item.currentStock || 0],
      sku: [item.sku || ''],
      mfgDate: [item.mfgDate ? new Date(item.mfgDate) : null],
      expDate: [item.expDate ? new Date(item.expDate) : null],
      isExpiryRequired: [item.isExpiryRequired ?? false],
      id: [item.id || 0]
    });
    this.items.push(row);
    this.setupFilter(index);
    this.updateTotal(index);
  }

  get items(): FormArray {
    return this.poForm.get('items') as FormArray;
  }

  onSupplierChange(supplierId: number): void {
    if (!supplierId) return;
    this.supplierService.getSupplierById(supplierId).subscribe((res: any) => {
      console.log('🔍 Supplier Data Received:', res);

      // Checking multiple common casing variations for the price list property
      const pListId = res.defaultpricelistId || res.defaultPriceListId || res.priceListId;
      
      this.selectedSupplierIsUnregistered = !res.gstIn || res.gstIn === '' || res.gstIn.toUpperCase() === 'PENDING';
      
      // Update checkbox based on GST status (triggers updateTotal via valueChanges)
      this.poForm.get('isTaxApplicable')?.setValue(!this.selectedSupplierIsUnregistered, { emitEvent: true });

      if (pListId) {
        console.log('✅ Auto-populating Price List ID:', pListId);
        this.poForm.get('priceListId')?.setValue(pListId);
        this.isPriceListAutoSelected = true;
        this.refreshAllItemRates(pListId);
      } else {
        console.warn('⚠️ No default price list found for this supplier in Master.');
        this.isPriceListAutoSelected = false;
      }
      this.cdr.detectChanges();
    });
  }

  refreshAllItemRates(priceListId: string) {
    this.items.controls.forEach((control, index) => {
      const prodId = control.get('productId')?.value;
      if (prodId && priceListId) {
        const isTaxOff = !this.poForm.get('isTaxApplicable')?.value;
        this.inventoryService.getProductRate(prodId, priceListId).subscribe({
          next: (res: any) => {
            if (res) {
              control.patchValue({
                price: res.recommendedRate || res.rate,
                // GST constant from Master, Discount from PriceList
                discountPercent: res.discount || res.discountPercent || 0,
                gstPercent: isTaxOff ? 0 : (res.GstPercent || res.gstPercent || control.get('gstPercent')?.value || 18)
              });
            }
            this.updateTotal(index);
          },
          error: () => this.updateTotal(index)
        });
      }
    });
  }

  onProductChange(index: number, event: any): void {
    const product = event.option.value;
    const row = this.items.at(index);
    const priceListId = this.poForm.get('priceListId')?.value;

    if (!product) return;

    const isDuplicate = this.items.controls.some((ctrl, i) => i !== index && ctrl.get('productId')?.value === product.id);
    if (isDuplicate) {
      this.notification.showStatus(false, 'Product already added.');
      row.patchValue({ productId: null, productSearch: '' });
      return;
    }

    const isTaxOff = !this.poForm.get('isTaxApplicable')?.value;
    
    row.patchValue({
      productId: product.id,
      productSearch: product,
      unit: product.unit || 'PCS',
      price: product.basePurchasePrice || 0,
      gstPercent: isTaxOff ? 0 : (product.defaultGst ?? product.gstPercent ?? 18), // Master GST
      originalGst: product.defaultGst ?? product.gstPercent ?? 18,
      discountPercent: 0,
      qty: 1,
      currentStock: product.currentStock || 0,
      sku: product.sku || '',
      isExpiryRequired: product.isExpiryRequired ?? false,
      mfgDate: null,
      expDate: null
    });

    if (product.isExpiryRequired) {
      row.get('mfgDate')?.setValidators(Validators.required);
      row.get('expDate')?.setValidators(Validators.required);
    } else {
      row.get('mfgDate')?.clearValidators();
      row.get('expDate')?.clearValidators();
    }
    row.get('mfgDate')?.updateValueAndValidity();
    row.get('expDate')?.updateValueAndValidity();

    if (product.id && priceListId) {
      this.inventoryService.getProductRate(product.id, priceListId).subscribe({
        next: (res: any) => {
          if (res) {
            row.patchValue({
              price: res.recommendedRate || res.rate,
              discountPercent: res.discount || res.discountPercent || 0, // PriceList Discount
              gstPercent: isTaxOff ? 0 : (res.GstPercent || res.gstPercent || row.get('gstPercent')?.value || 18)
            });
          }
          this.updateTotal(index);
        },
        error: () => this.updateTotal(index)
      });
    } else {
      this.updateTotal(index);
    }
  }

  updateTotal(index: number): void {
    const row = this.items.at(index);
    const qty = Number(row.get('qty')?.value || 0);
    const price = Number(row.get('price')?.value || 0);
    const discPercent = Number(row.get('discountPercent')?.value || 0);
    const gstPercent = Number(row.get('gstPercent')?.value || 0);

    // Business Logic Calculation
    const amount = qty * price;
    const discountAmount = (amount * discPercent) / 100;
    const taxableAmount = amount - discountAmount;
    const isTaxApplicable = this.poForm.get('isTaxApplicable')?.value ?? true;
    const taxAmt = isTaxApplicable ? (taxableAmount * gstPercent) / 100 : 0;
    const rowTotal = taxableAmount + taxAmt;

    row.patchValue({ taxAmount: taxAmt.toFixed(2), total: rowTotal.toFixed(2) }, { emitEvent: false });
    this.calculateGrandTotal();
  }

  calculateGrandTotal(): void {
    let totalTax = 0, totalWithTax = 0, totalQtySum = 0;
    this.items.controls.forEach(c => {
      totalTax += Number(c.get('taxAmount')?.value || 0);
      totalWithTax += Number(c.get('total')?.value || 0);
      totalQtySum += Number(c.get('qty')?.value || 0);
    });
    this.totalTaxAmount = Number(totalTax.toFixed(2));
    this.grandTotal = Number(totalWithTax.toFixed(2));
    this.subTotal = Number((this.grandTotal - this.totalTaxAmount).toFixed(2));
    this.totalQty = totalQtySum;
    this.cdr.detectChanges();
  }

  get tdsAmount(): number {
    return (this.subTotal * (this.poForm.get('tdsPercent')?.value || 0)) / 100;
  }

  get tcsAmount(): number {
    return (this.subTotal * (this.poForm.get('tcsPercent')?.value || 0)) / 100;
  }

  get finalGrandTotal(): number {
    return this.grandTotal - this.tdsAmount + this.tcsAmount;
  }

  addRow(): void {
    const row = this.fb.group({
      productSearch: ['', Validators.required],
      productId: [null, Validators.required],
      qty: [1, [Validators.required, Validators.min(1)]],
      unit: ['PCS', Validators.required],
      price: [0, [Validators.required, Validators.min(1)]],
      discountPercent: [0],
      gstPercent: [0],
      taxAmount: [{ value: 0, disabled: true }],
      total: [{ value: 0, disabled: true }],
      currentStock: [0],
      sku: [''],
      mfgDate: [null],
      expDate: [null],
      isExpiryRequired: [false],
      originalGst: [0],
      id: [0]
    });
    this.items.push(row);
    this.setupFilter(this.items.length - 1);
  }

  private setupFilter(index: number): void {
    const row = this.items.at(index);

    // Product Autocomplete
    this.filteredProducts[index] = row.get('productSearch')!.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(value => {
        const str = typeof value === 'string' ? value : value?.productName || value?.name;
        if (!str || str.length < 2) return of([]);
        this.isProductLoading[index] = true;
        return this.productService.searchProducts(str).pipe(
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
    return p.productName || p.name || (typeof p === 'string' ? p : '');
  }

  removeItem(index: number): void {
    if (this.items.length > 1) {
      this.items.removeAt(index);
      this.calculateGrandTotal();
    }
  }

  openSupplierModal() {
    this.dialog.open(SupplierModalComponent, { width: '600px' }).afterClosed().subscribe(res => {
      if (res && res.id) {
        this.suppliers = [...this.suppliers, res];
        this.poForm.patchValue({ supplierId: res.id });
        this.onSupplierChange(res.id);
      } else {
        this.loadSuppliers();
      }
    });
  }

  loadNextPoNumber() { this.inventoryService.getNextPoNumber().subscribe(res => this.poForm.patchValue({ PoNumber: res.poNumber })); }
  loadSuppliers() {
    this.isLoadingSuppliers = true;
    this.supplierService.getSuppliers().pipe(finalize(() => this.isLoadingSuppliers = false)).subscribe(data => this.suppliers = data || []);
  }

  bindDropdownPriceList() {
    this.isLoadingPriceLists = true;
    this.inventoryService.getPriceListsForDropdown().pipe(finalize(() => this.isLoadingPriceLists = false)).subscribe(data => this.priceLists = data || []);
  }

  loadUnits() {
    this.unitService.getAll().pipe(takeUntil(this.destroy$)).subscribe(data => this.allUnits = data || []);
  }

  getMinExpDate(mfgDateValue: any): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!mfgDateValue) return today;
    
    const mfgDate = new Date(mfgDateValue);
    mfgDate.setHours(0, 0, 0, 0);
    
    // Minimum expiry is either today or Day after MFG
    const nextDay = new Date(mfgDate);
    nextDay.setDate(nextDay.getDate() + 1);
    
    return nextDay > today ? nextDay : today;
  }

  ngOnDestroy() {
    if (this.scrollContainer && this.scrollListener) {
      this.scrollContainer.removeEventListener('scroll', this.scrollListener);
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  saveDraft() {
    const formValue = this.poForm.getRawValue();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const poDate = new Date(formValue.poDate);
    poDate.setHours(0, 0, 0, 0);

    if (poDate < today) {
      this.notification.showStatus(false, 'PO Date cannot be in the past.');
      return;
    }

    if (formValue.expectedDeliveryDate) {
      const deliveryDate = new Date(formValue.expectedDeliveryDate);
      deliveryDate.setHours(0, 0, 0, 0);

      if (deliveryDate < today) {
        this.notification.showStatus(false, 'Delivery Date cannot be in the past.');
        return;
      }

      if (deliveryDate < poDate) {
        this.notification.showStatus(false, 'Delivery Date cannot be before PO Date.');
        return;
      }
    }

    const hasZeroPrice = formValue.items.some((item: any) => Number(item.price) <= 0);
    if (this.poForm.invalid || hasZeroPrice) {
      this.notification.showStatus(false, 'Check required fields and rates.');
      return;
    }

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: this.isEditMode ? 'Confirm Update' : 'Confirm Save',
        message: `Are you sure you want to ${this.isEditMode ? 'update' : 'save'} this Purchase Order?`,
        confirmText: this.isEditMode ? 'Update' : 'Save',
        confirmColor: 'primary'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        const supplier = this.suppliers.find(s => s.id === Number(formValue.supplierId));
        const userId = localStorage.getItem('email') || 'System User';
        this.isLoading = true;
        const payload: any = {
          id: this.isEditMode ? Number(this.poId) : 0,
          supplierId: Number(formValue.supplierId),
          supplierName: supplier ? supplier.name : 'Unknown',
          priceListId: formValue.priceListId,
          poDate: DateHelper.toLocalISOString(formValue.poDate),
          expectedDeliveryDate: DateHelper.toLocalISOString(formValue.expectedDeliveryDate),
          poNumber: formValue.PoNumber,
          remarks: formValue.remarks || '',
          taxType: formValue.taxType || 'local',
          tdsPercent: Number(formValue.tdsPercent || 0),
          tcsPercent: Number(formValue.tcsPercent || 0),
          tdsAmount: this.tdsAmount,
          tcsAmount: this.tcsAmount,
          igstAmount: formValue.taxType === 'interState' ? this.totalTaxAmount : 0,
          cgstAmount: formValue.taxType === 'local' ? this.totalTaxAmount / 2 : 0,
          sgstAmount: formValue.taxType === 'local' ? this.totalTaxAmount / 2 : 0,
          grandTotal: this.finalGrandTotal,
          subTotal: this.subTotal,
          totalTax: this.totalTaxAmount,
          totalQuantity: this.totalQty,
          status: 'Draft',
          createdBy: userId,
          items: formValue.items.map((item: any) => ({
            productId: item.productId,
            qty: Number(item.qty),
            unit: item.unit || 'PCS',
            rate: Number(item.price),
            gstPercent: Number(item.gstPercent), // Saved from Master
            discountPercent: Number(item.discountPercent), // Saved from PriceList
            taxAmount: Number(item.taxAmount),
            total: Number(item.total),
            mfgDate: item.mfgDate ? DateHelper.toLocalISOString(item.mfgDate) : null,
            expDate: item.expDate ? DateHelper.toLocalISOString(item.expDate) : null,
            manufacturingDate: item.mfgDate ? DateHelper.toLocalISOString(item.mfgDate) : null,
            expiryDate: item.expDate ? DateHelper.toLocalISOString(item.expDate) : null
          }))
        };

        console.log('🚀 Final PO Payload for backend:', payload);
        const request$ = this.isEditMode ? this.poService.update(this.poId, payload) : this.inventoryService.savePoDraft(payload);

        request$.subscribe({
          next: (res) => {
            console.log('✅ PO Save Success. Backend Response:', res);
            this.isLoading = false;
            this.notification.showStatus(true, `PO ${this.isEditMode ? 'Updated' : 'Saved'} Successfully`);
            this.router.navigate(['/app/inventory/polist']);
          },
          error: (err) => {
            console.group('❌ PO Save Failed');
            console.error('Error Object:', err);
            console.error('Status:', err.status);
            console.error('Server Message:', err.error?.message || err.message);
            console.groupEnd();

            this.isLoading = false;
            this.notification.showStatus(false, `Error ${this.isEditMode ? 'updating' : 'saving'} PO. Check console for details.`);
          }
        });
      }
    });
  }

  goBack() { this.router.navigate(['/app/inventory/polist']); }
}