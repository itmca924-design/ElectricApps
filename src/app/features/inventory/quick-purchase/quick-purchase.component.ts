import { Component, OnInit, inject, ChangeDetectorRef, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { InventoryService } from '../service/inventory.service';
import { ProductService } from '../../master/product/service/product.service';
import { NotificationService } from '../../shared/notification.service';
import { Router, ActivatedRoute } from '@angular/router';
import { Observable, debounceTime, distinctUntilChanged, switchMap, of, catchError, map, startWith, Subject, takeUntil, finalize } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { MatDialog } from '@angular/material/dialog';
import { ProductSelectionDialogComponent } from '../../../shared/components/product-selection-dialog/product-selection-dialog';
import { PermissionService } from '../../../core/services/permission.service';
import { SupplierModalComponent } from '../supplier-modal/supplier-modal';
import { SupplierService } from '../service/supplier.service';
import { UnitService } from '../../master/units/services/units.service';
import { LocationService } from '../../master/locations/services/locations.service';
import { DateHelper } from '../../../shared/models/date-helper';
import { POService } from '../service/po.service';
import { BarcodeReaderHelper } from '../../../shared/barcode-reader-helper/barcode-reader-helper.service';
import { trigger, transition, style, animate } from '@angular/animations';
import { ProductForm } from '../../master/product/product-form/product-form';
import { SharedPrintService } from '../../../core/services/shared-print.service';

@Component({
    selector: 'app-quick-purchase',
    standalone: true,
    imports: [CommonModule, MaterialModule, ReactiveFormsModule, FormsModule],
    templateUrl: './quick-purchase.component.html',
    styleUrls: ['./quick-purchase.component.scss'],
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
export class QuickPurchaseComponent implements OnInit, OnDestroy, AfterViewInit {
    private fb = inject(FormBuilder);
    public inventoryService = inject(InventoryService);
    private notification = inject(NotificationService);
    public router = inject(Router);
    private authService = inject(AuthService);
    private dialog = inject(MatDialog);
    private permissionService = inject(PermissionService);
    private supplierService = inject(SupplierService);
    private unitService = inject(UnitService);
    private locationService = inject(LocationService);
    private productService = inject(ProductService);
    private poService = inject(POService);
    private route = inject(ActivatedRoute);
    private barcodeHelper = inject(BarcodeReaderHelper);
    private cdr = inject(ChangeDetectorRef);
    private sharedPrintService = inject(SharedPrintService);
    private destroy$ = new Subject<void>();

    purchaseForm!: FormGroup;
    suppliers: any[] = [];
    units: any[] = [];
    warehouses: any[] = [];
    racksByItem: any[][] = []; // Racks list for each item row
    priceLists: any[] = [];
    filteredUnits: Observable<any[]>[] = [];
    filteredSuppliers: any[] = [];
    isScanning = false;
    lastScannedCode = '';
    isLoading = false;
    isSaving = false;
    isLoadingPriceLists = false;
    isPriceListAutoSelected = false;
    isEditMode = false;
    poId: any = null;
    currentStatus = '';
    selectedSupplierIsUnregistered = false;
    isAtTop = true;
    private scrollContainer: HTMLElement | null = null;
    private scrollListener: any;
    today = new Date();

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

    constructor() {
        this.initForm();
    }

    ngOnInit() {
        this.loadSuppliers();
        this.loadUnits();
        this.loadWarehouses();
        this.bindDropdownPriceList();
        this.initBarcodeListener();

        const id = this.route.snapshot.paramMap.get('id');
        if (id && id !== '0') {
            this.poId = id;
            this.isEditMode = true;
            this.loadPODetails(id);
        } else {
            this.loadNextPoNumber();
            setTimeout(() => {
                const state = window.history.state;
                if (state?.refillData) {
                    this.addProductToForm(state.refillData);
                    this.cdr.detectChanges();
                } else if (state?.refillItems) {
                    state.refillItems.forEach((item: any) => this.addProductToForm(item));
                    this.cdr.detectChanges();
                }
            }, 500);
        }
    }

    loadWarehouses() {
        this.locationService.getWarehouses().subscribe((res: any) => {
            this.warehouses = res;
        });
    }

    onWarehouseChange(index: number) {
        const warehouseId = this.items.at(index).get('warehouseId')?.value;
        if (warehouseId) {
            this.locationService.getRacksByWarehouse(warehouseId).subscribe((res: any) => {
                this.racksByItem[index] = res;
            });
        } else {
            this.racksByItem[index] = [];
        }
    }

    loadUnits() {
        this.unitService.getAll().subscribe(res => {
            this.units = res;
        });
    }

    private initForm() {
        this.purchaseForm = this.fb.group({
            supplierId: [null, Validators.required],
            supplierName: [''],
            priceListId: [null, Validators.required],
            remarks: [''],
            date: [new Date()],
            expectedDeliveryDate: [this.today, Validators.required],
            poNumber: [{ value: '', disabled: true }],
            items: this.fb.array([], Validators.required),
            isTaxApplicable: [true],
            taxType: ['local'],
            tdsPercent: [0],
            tcsPercent: [0]
        });

        this.purchaseForm.get('isTaxApplicable')?.valueChanges.subscribe(val => {
            this.selectedSupplierIsUnregistered = !val;
            this.items.controls.forEach((ctrl, idx) => {
                if (!val) {
                    ctrl.get('gstPercent')?.setValue(0, { emitEvent: false });
                } else {
                    const original = ctrl.get('originalGst')?.value || 0;
                    ctrl.get('gstPercent')?.setValue(original, { emitEvent: false });
                }
                this.calculateItemTotal(idx);
            });
        });
    }

    loadPODetails(id: any) {
        this.isLoading = true;
        this.poService.getById(id).subscribe({
            next: (res: any) => {
                this.currentStatus = res.status;
                this.purchaseForm.patchValue({
                    supplierId: res.supplierId,
                    supplierName: res.supplierName,
                    priceListId: res.priceListId,
                    poNumber: res.poNumber,
                    date: DateHelper.toDateObject(res.poDate),
                    expectedDeliveryDate: DateHelper.toDateObject(res.expectedDeliveryDate),
                    remarks: res.remarks || ''
                });
                this.items.clear();
                if (res.items) {
                    res.items.forEach((item: any) => this.addEditRow(item));
                }
                this.isLoading = false;
                this.onSupplierChange(res.supplierId);
                this.cdr.detectChanges();
            },
            error: () => {
                this.isLoading = false;
                this.notification.showStatus(false, 'Failed to load order details');
            }
        });
    }

    addEditRow(item: any): void {
        const isExpReq = item.isExpiryRequired || item.IsExpiryRequired || false;
        const row = this.fb.group({
            productId: [item.productId, Validators.required],
            productName: [item.productName, Validators.required],
            sku: [item.sku || ''],
            availableStock: [item.currentStock || 0],
            rackName: [item.rackName || 'NA'],
            warehouseId: [item.warehouseId || null],
            rackId: [item.rackId || null],
            qty: [item.qty, [Validators.required, Validators.min(0.01)]],
            unit: [item.unit || 'PCS', Validators.required],
            rate: [item.rate, [Validators.required, Validators.min(0)]],
            discountPercent: [item.discountPercent || 0],
            gstPercent: [item.gstPercent || 0],
            total: [{ value: item.total, disabled: true }],
            id: [item.id || 0],
            originalGst: [item.gstPercent || 0],
            manufacturingDate: [item.manufacturingDate ? DateHelper.toDateObject(item.manufacturingDate) : null, isExpReq ? Validators.required : []],
            expiryDate: [item.expiryDate ? DateHelper.toDateObject(item.expiryDate) : null, isExpReq ? Validators.required : []],
            isExpiryRequired: [isExpReq]
        }, { validators: [this.dateRangeValidator] });
        const index = this.items.length;
        this.items.push(row);
        this.setupItemCalculations(index);
        this.calculateItemTotal(index);

        if (row.get('warehouseId')?.value) {
            this.locationService.getRacksByWarehouse(row.get('warehouseId')?.value).subscribe(racks => {
                this.racksByItem[index] = racks;
            });
        }
    }

    openProductDialog() {
        const dialogRef = this.dialog.open(ProductSelectionDialogComponent, {
            width: '1250px',
            maxWidth: '96vw',
            data: { 
                allowOutOfStock: true,
                existingIds: this.items.controls.map(c => c.get('productId')?.value) 
            }
        });

        dialogRef.afterClosed().subscribe((selectedProducts: any[]) => {
            if (selectedProducts && selectedProducts.length > 0) {
                selectedProducts.forEach(product => {
                    const isDuplicate = this.items.controls.some(control => control.get('productId')?.value === product.id);
                    if (!isDuplicate) {
                        const mappedProduct = {
                            ...product,
                            rackName: product.defaultRackName || product.rackName || 'NA'
                        };
                        this.addProductToForm(mappedProduct);
                        const idx = this.items.length - 1;
                        if (mappedProduct.defaultWarehouseId) {
                            this.locationService.getRacksByWarehouse(mappedProduct.defaultWarehouseId).subscribe((racks: any[]) => {
                                this.racksByItem[idx] = racks;
                                if (mappedProduct.defaultRackId) {
                                    this.items.at(idx).get('rackId')?.setValue(mappedProduct.defaultRackId, { emitEvent: false });
                                }
                            });
                        }
                    }
                });
            }
        });
    }

    addProductToForm(product: any) {
        const productId = product.id || product.productId;
        const itemForm = this.fb.group({
            productId: [productId, Validators.required],
            productName: [product.productName || product.name, Validators.required],
            sku: [product.sku || ''],
            availableStock: [product.currentStock || product.availableStock || 0],
            rackName: [product.rackName || 'NA'],
            warehouseId: [product.defaultWarehouseId || null],
            rackId: [product.defaultRackId || null],
            qty: [product.suggestedQty || 1, [Validators.required, Validators.min(0.01)]],
            unit: [product.unit || 'PCS', Validators.required],
            rate: [product.basePurchasePrice || product.purchasePrice || product.basePrice || product.rate || 0, [Validators.required, Validators.min(0)]],
            discountPercent: [0],
            gstPercent: [this.selectedSupplierIsUnregistered ? 0 : (product.gstPercent ?? product.defaultGst ?? 18)],
            originalGst: [product.gstPercent ?? product.defaultGst ?? 18],
            taxAmount: [0],
            total: [{ value: 0, disabled: true }],
            manufacturingDate: [null, product.isExpiryRequired ? Validators.required : []],
            expiryDate: [null, product.isExpiryRequired ? Validators.required : []],
            isExpiryRequired: [product.isExpiryRequired || false]
        }, { validators: [this.dateRangeValidator] });

        const index = this.items.length;
        this.items.push(itemForm);
        this.calculateItemTotal(index);
        this.setupItemCalculations(index);
        this.setupUnitFilter(index);
        this.cdr.detectChanges();

        if (productId) {
            const priceListId = this.purchaseForm.get('priceListId')?.value;
            if (priceListId) {
                this.inventoryService.getProductRate(productId, priceListId).subscribe({
                    next: (res: any) => {
                        if (res) {
                            itemForm.patchValue({
                                rate: res.recommendedRate || res.rate,
                                discountPercent: res.discount || res.discountPercent || 0
                            });
                            this.calculateItemTotal(index);
                            this.cdr.detectChanges();
                        }
                    }
                });
            }
        }
    }

    get items(): FormArray {
        return this.purchaseForm.get('items') as FormArray;
    }

    addItem() {
        const itemForm = this.fb.group({
            productId: [null, Validators.required],
            productName: ['', Validators.required],
            sku: [''],
            availableStock: [0],
            rackName: ['NA'],
            warehouseId: [null],
            rackId: [null],
            unit: ['PCS', Validators.required],
            rate: [0, [Validators.required, Validators.min(0)]],
            discountPercent: [0],
            gstPercent: [this.selectedSupplierIsUnregistered ? 0 : 18],
            originalGst: [18],
            taxAmount: [0],
            total: [{ value: 0, disabled: true }],
            manufacturingDate: [null],
            expiryDate: [null],
            isExpiryRequired: [false]
        }, { validators: [this.dateRangeValidator] });

        const index = this.items.length;
        this.items.push(itemForm);
        this.setupItemCalculations(index);
        this.setupUnitFilter(index);
    }

    dateRangeValidator(group: any): any {
        const isRequired = group.get('isExpiryRequired')?.value;
        if (!isRequired) return null;
        const mfg = group.get('manufacturingDate')?.value;
        const exp = group.get('expiryDate')?.value;
        if (mfg && exp) {
            const mfgDate = new Date(mfg);
            const expDate = new Date(exp);
            if (isNaN(mfgDate.getTime()) || isNaN(expDate.getTime())) return null;
            mfgDate.setHours(0, 0, 0, 0);
            expDate.setHours(0, 0, 0, 0);
            if (expDate < mfgDate) return { dateRangeInvalid: true };
        }
        return null;
    }

    private setupUnitFilter(index: number) {
        const unitCtrl = this.items.at(index).get('unit');
        if (unitCtrl) {
            this.filteredUnits[index] = unitCtrl.valueChanges.pipe(
                startWith(''),
                map(value => this._filterUnits(value || ''))
            );
        }
    }

    private _filterUnits(value: string): any[] {
        const filterValue = value.toLowerCase();
        return this.units.filter(unit => (unit.unitName || unit.name || '').toLowerCase().includes(filterValue));
    }

    removeItem(index: number) {
        this.items.removeAt(index);
        this.racksByItem.splice(index, 1);
        this.filteredUnits.splice(index, 1);
    }

    getWarehouseName(warehouseId: any): string {
        if (!warehouseId) return 'No WH';
        const wh = this.warehouses.find(w => w.id === warehouseId);
        return wh ? wh.name : 'No WH';
    }

    getRackName(index: number, rackId: any): string {
        const item = this.items.at(index);
        const staticName = item.get('rackName')?.value;
        if (staticName && staticName !== 'NA') return staticName;
        if (!rackId) return 'No Rack';
        const racks = this.racksByItem[index] || [];
        const rack = racks.find((r: any) => r.id === rackId);
        return rack ? rack.name : 'No Rack';
    }

    private setupItemCalculations(index: number) {
        const item = this.items.at(index);
        item.valueChanges.pipe(debounceTime(100)).subscribe(() => {
            this.calculateItemTotal(index);
        });
    }

    private calculateItemTotal(index: number) {
        const item = this.items.at(index);
        const qty = item.get('qty')?.value || 0;
        const rate = item.get('rate')?.value || 0;
        const disc = item.get('discountPercent')?.value || 0;
        const gst = item.get('gstPercent')?.value || 0;
        const netRate = rate * (1 - disc / 100);
        const isTaxApplicable = this.purchaseForm.get('isTaxApplicable')?.value ?? true;
        const tax = isTaxApplicable ? (netRate * (gst / 100)) : 0;
        const total = qty * (netRate + tax);
        item.get('total')?.patchValue(total.toFixed(2), { emitEvent: false });
        item.get('taxAmount')?.patchValue((qty * tax).toFixed(2), { emitEvent: false });
    }

    get grandTotal(): number {
        return this.items.controls.reduce((sum, ctrl) => sum + (parseFloat(ctrl.get('total')?.value) || 0), 0);
    }

    get totalQty(): number {
        return this.items.controls.reduce((sum, ctrl) => sum + (Number(ctrl.get('qty')?.value) || 0), 0);
    }

    get subTotal(): number {
        return this.items.controls.reduce((sum, ctrl) => {
            const qty = Number(ctrl.get('qty')?.value) || 0;
            const rate = Number(ctrl.get('rate')?.value) || 0;
            const disc = Number(ctrl.get('discountPercent')?.value) || 0;
            return sum + (qty * rate * (1 - disc / 100));
        }, 0);
    }

    get totalTax(): number {
        return this.items.controls.reduce((sum, ctrl) => {
            const qty = Number(ctrl.get('qty')?.value) || 0;
            const rate = Number(ctrl.get('rate')?.value) || 0;
            const disc = Number(ctrl.get('discountPercent')?.value) || 0;
            const gst = Number(ctrl.get('gstPercent')?.value) || 0;
            const netRate = rate * (1 - disc / 100);
            return sum + (qty * netRate * (gst / 100));
        }, 0);
    }

    get tdsAmount(): number {
        return (this.subTotal * (this.purchaseForm.get('tdsPercent')?.value || 0)) / 100;
    }

    get tcsAmount(): number {
        return (this.subTotal * (this.purchaseForm.get('tcsPercent')?.value || 0)) / 100;
    }

    get finalGrandTotal(): number {
        return this.grandTotal - this.tdsAmount + this.tcsAmount;
    }

    loadNextPoNumber() {
        this.inventoryService.getNextPoNumber().subscribe(res => {
            this.purchaseForm.patchValue({ poNumber: res.poNumber });
        });
    }

    bindDropdownPriceList() {
        this.isLoadingPriceLists = true;
        this.inventoryService.getPriceListsForDropdown().subscribe({
            next: (data) => {
                this.priceLists = data || [];
                this.isLoadingPriceLists = false;
            },
            error: () => this.isLoadingPriceLists = false
        });
    }

    onSupplierChange(supplierId: number): void {
        if (!supplierId) return;
        this.supplierService.getSupplierById(supplierId).subscribe((res: any) => {
            const pListId = res.defaultpricelistId || res.defaultPriceListId || res.priceListId;
            this.selectedSupplierIsUnregistered = !res.gstIn || res.gstIn === '' || res.gstIn.toUpperCase() === 'PENDING';
            this.purchaseForm.get('isTaxApplicable')?.setValue(!this.selectedSupplierIsUnregistered, { emitEvent: true });
            if (pListId) {
                this.purchaseForm.get('priceListId')?.setValue(pListId);
                this.isPriceListAutoSelected = true;
                this.refreshAllItemRates(pListId);
            } else {
                this.isPriceListAutoSelected = false;
            }
        });
    }

    refreshAllItemRates(priceListId: string) {
        this.items.controls.forEach((control, index) => {
            const prodId = control.get('productId')?.value;
            if (prodId && priceListId) {
                this.inventoryService.getProductRate(prodId, priceListId).subscribe({
                    next: (res: any) => {
                        if (res) {
                            control.patchValue({
                                rate: res.recommendedRate || res.rate,
                                discountPercent: res.discount || res.discountPercent || 0
                            });
                        }
                        this.calculateItemTotal(index);
                    }
                });
            }
        });
    }

    loadSuppliers(selectId?: number) {
        this.supplierService.getSuppliers().subscribe({
            next: (res) => {
                this.suppliers = res;
                this.filteredSuppliers = res;
                if (selectId) {
                    this.purchaseForm.get('supplierId')?.setValue(selectId);
                    const supplier = this.suppliers.find(s => s.id === selectId);
                    if (supplier) {
                        this.purchaseForm.patchValue({ supplierName: supplier.name });
                        this.onSupplierChange(selectId);
                    }
                }
            }
        });
    }

    openSupplierModal() {
        const dialogRef = this.dialog.open(SupplierModalComponent, {
            width: '600px',
            disableClose: true
        });
        dialogRef.afterClosed().subscribe(res => {
            if (res) {
                const newId = (typeof res === 'object') ? res.id : undefined;
                this.loadSuppliers(newId);
                this.notification.showStatus(true, 'New supplier added successfully!');
            }
        });
    }

    onSupplierSelect(event: any) {
        const supplier = this.suppliers.find(s => s.id === event.value);
        if (supplier) {
            this.purchaseForm.patchValue({ supplierName: supplier.name });
            this.onSupplierChange(event.value);
        }
    }

    save() {
        if (!this.permissionService.hasPermission(this.isEditMode ? 'CanEdit' : 'CanAdd')) {
            this.notification.showStatus(false, 'You do not have permission to perform this action.');
            return;
        }
        if (this.purchaseForm.invalid) {
            this.purchaseForm.markAllAsTouched();
            this.notification.showStatus(false, 'Please fill all required fields correctly.');
            return;
        }
        this.isSaving = true;
        const formValue = this.purchaseForm.getRawValue();
        const payload = {
            id: this.isEditMode ? Number(this.poId) : 0,
            supplierId: Number(formValue.supplierId),
            supplierName: this.suppliers.find(s => s.id === Number(formValue.supplierId))?.name || '',
            priceListId: formValue.priceListId,
            poDate: DateHelper.toLocalISOString(formValue.date) || '',
            expectedDeliveryDate: DateHelper.toLocalISOString(formValue.expectedDeliveryDate) || '',
            poNumber: formValue.poNumber,
            remarks: formValue.remarks || '',
            taxType: formValue.taxType || 'local',
            tdsPercent: Number(formValue.tdsPercent || 0),
            tcsPercent: Number(formValue.tcsPercent || 0),
            tdsAmount: this.tdsAmount,
            tcsAmount: this.tcsAmount,
            igstAmount: formValue.taxType === 'interState' ? this.totalTax : 0,
            cgstAmount: formValue.taxType === 'local' ? this.totalTax / 2 : 0,
            sgstAmount: formValue.taxType === 'local' ? this.totalTax / 2 : 0,
            grandTotal: this.finalGrandTotal,
            subTotal: this.subTotal,
            totalTax: this.totalTax,
            totalQuantity: this.totalQty,
            status: 'Draft',
            isQuick: true,
            createdBy: this.authService.getUserEmail(),
            items: this.items.getRawValue().map((i: any) => ({
                id: i.id || 0,
                productId: i.productId,
                qty: Number(i.qty),
                unit: i.unit || 'PCS',
                rate: Number(i.rate),
                discountPercent: Number(i.discountPercent),
                gstPercent: Number(i.gstPercent),
                taxAmount: Number(i.taxAmount || 0),
                total: Number(i.total),
                warehouseId: i.warehouseId || null,
                rackId: i.rackId || null,
                manufacturingDate: i.manufacturingDate ? DateHelper.toLocalISOString(i.manufacturingDate) : null,
                expiryDate: i.expiryDate ? DateHelper.toLocalISOString(i.expiryDate) : null
            }))
        };
        const request$ = this.isEditMode ? this.poService.update(this.poId, payload) : this.inventoryService.savePoDraft(payload);
        request$.subscribe({
            next: (res) => {
                this.notification.showStatus(true, `Quick Purchase Draft ${this.isEditMode ? 'Updated' : 'Saved'}!`);
                this.router.navigate(['/app/quick-inventory/purchase/list']);
            },
            error: (err) => {
                this.notification.showStatus(false, err.error?.message || 'Failed to save draft.');
                this.isSaving = false;
            }
        });
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

    ngOnDestroy() {
        if (this.scrollContainer && this.scrollListener) {
            this.scrollContainer.removeEventListener('scroll', this.scrollListener);
        }
        this.destroy$.next();
        this.destroy$.complete();
    }

    private initBarcodeListener() {
        this.barcodeHelper.onScan().pipe(takeUntil(this.destroy$)).subscribe(code => {
            this.isScanning = true;
            this.lastScannedCode = code;
            this.handleBarcodeScan(code);
            setTimeout(() => {
                this.isScanning = false;
                this.cdr.detectChanges();
            }, 1500);
        });
    }

    private handleBarcodeScan(sku: string) {
        const existingIndex = this.items.controls.findIndex(ctrl => ctrl.get('sku')?.value === sku);
        if (existingIndex > -1) {
            const qtyCtrl = this.items.at(existingIndex).get('qty');
            qtyCtrl?.setValue(Number(qtyCtrl.value) + 1);
            this.calculateItemTotal(existingIndex);
            this.notification.showStatus(true, `Quantity updated for SKU: ${sku}`);
            return;
        }
        this.isLoading = true;
        this.productService.searchProducts(sku).pipe(finalize(() => this.isLoading = false)).subscribe(products => {
            const match = products.find((p: any) => p.sku === sku);
            if (match) {
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
                        this.addProductToForm(newProduct);
                        this.notification.showStatus(true, `New product created and added: ${newProduct.productName}`);
                    }
                });
            }
        });
    }
}
