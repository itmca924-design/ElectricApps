import { Component, OnInit, inject, ChangeDetectorRef, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule, FormsModule, FormControl } from '@angular/forms';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { InventoryService } from '../service/inventory.service';
import { ProductService } from '../../master/product/service/product.service';
import { NotificationService } from '../../shared/notification.service';
import { Router, ActivatedRoute } from '@angular/router';
import { Observable, debounceTime, distinctUntilChanged, map, startWith, Subject, takeUntil, finalize } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { MatDialog } from '@angular/material/dialog';
import { ProductSelectionDialogComponent } from '../../../shared/components/product-selection-dialog/product-selection-dialog';
import { BatchSelectionDialogComponent } from '../../../shared/components/batch-selection-dialog/batch-selection-dialog';
import { PermissionService } from '../../../core/services/permission.service';
import { UnitService } from '../../master/units/services/units.service';
import { LocationService } from '../../master/locations/services/locations.service';
import { SaleOrderService } from '../service/saleorder.service';
import { CustomerComponent } from '../../master/customer-component/customer-component';
import { customerService } from '../../master/customer-component/customer.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { SoSuccessDialogComponent } from '../so-success-dialog/so-success-dialog.component';
import { BarcodeReaderHelper } from '../../../shared/barcode-reader-helper/barcode-reader-helper.service';
import { trigger, transition, style, animate } from '@angular/animations';
import { ProductForm } from '../../master/product/product-form/product-form';
import { FinanceService } from '../../finance/service/finance.service';
import { StatusDialogComponent } from '../../../shared/components/status-dialog-component/status-dialog-component';

@Component({
    selector: 'app-quick-sale',
    standalone: true,
    imports: [CommonModule, MaterialModule, ReactiveFormsModule, FormsModule],
    templateUrl: './quick-sale.component.html',
    styleUrls: ['./quick-sale.component.scss'],
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
export class QuickSaleComponent implements OnInit, OnDestroy, AfterViewInit {
    private fb = inject(FormBuilder);
    public inventoryService = inject(InventoryService);
    private productService = inject(ProductService);
    private notification = inject(NotificationService);
    public router = inject(Router);
    private authService = inject(AuthService);
    private dialog = inject(MatDialog);
    private permissionService = inject(PermissionService);
    private unitService = inject(UnitService);
    private locationService = inject(LocationService);
    private route = inject(ActivatedRoute);
    private soService = inject(SaleOrderService);
    private customerService = inject(customerService);
    private barcodeHelper = inject(BarcodeReaderHelper);
    private cdr = inject(ChangeDetectorRef);
    private financeService = inject(FinanceService);
    private destroy$ = new Subject<void>();

    saleOrderId: number | null = null;
    isEdit = false;
    saleForm!: FormGroup;
    isSaving = false;
    isLoadingCustomers = false;
    customers: any[] = [];
    filteredCustomers!: Observable<any[]>;
    customerSearchCtrl = new FormControl<any>('');
    units: any[] = [];
    warehouses: any[] = [];
    racksByItem: any[][] = [];
    filteredUnits: Observable<any[]>[] = [];
    isScanning = false;
    lastScannedCode = '';
    isAtTop = true;
    isMobile = false;
    today = new Date();
    minDate: Date | null = new Date();
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

    constructor() {
        this.initForm();
    }

    openAddCustomerDialog() {
        const dialogRef = this.dialog.open(CustomerComponent, { width: '600px', disableClose: true });
        dialogRef.afterClosed().subscribe(result => { if (result) this.loadCustomers(); });
    }

    isItemExpired(index: number): boolean {
        const expDate = this.items.at(index).get('expiryDate')?.value;
        if (!expDate) return false;
        const exp = new Date(expDate);
        exp.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return exp <= today;
    }

    isItemNearExpiry(index: number): boolean {
        const expDate = this.items.at(index).get('expiryDate')?.value;
        if (!expDate) return false;
        const exp = new Date(expDate);
        const today = new Date();
        const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 3600 * 24));
        return diffDays > 0 && diffDays <= 90;
    }

    ngOnInit() {
        this.loadCustomers();
        this.loadUnits();
        this.loadWarehouses();
        this.initBarcodeListener();

        this.route.paramMap.subscribe(params => {
            const id = params.get('id');
            if (id) {
                this.saleOrderId = +id;
                this.isEdit = true;
                this.minDate = null; // Important: Disable past date restriction for editing
                this.isSaving = false; // Ensure not stuck
                this.loadSaleOrder(this.saleOrderId);
            }
        });
    }

    loadSaleOrder(id: number) {
        this.soService.getSaleOrderById(id).subscribe({
            next: (res) => {
                this.saleForm.patchValue({
                    customerId: res.customerId,
                    customerName: (res.customerName || '').replace(/^"|"$/g, ''),
                    remarks: res.remarks || '',
                    date: res.soDate,
                    expectedDeliveryDate: res.expectedDeliveryDate || res.ExpectedDeliveryDate || null,
                    status: res.status
                });
                const sanitizedName = (res.customerName || '').replace(/^"|"$/g, '');
                this.customerSearchCtrl.setValue({ id: res.customerId, customerName: sanitizedName });

                this.saleForm.updateValueAndValidity();
                this.cdr.detectChanges();

                while (this.items.length) {
                    this.items.removeAt(0);
                }

                if (res.items && res.items.length > 0) {
                    res.items.forEach((item: any, idx: number) => {
                        this.addProductToForm(item);
                        this.inventoryService.getProductById(item.productId || item.id).subscribe((stockResult: any) => {
                           const currentItem = this.items.at(idx);
                           const stockInWarehouse = stockResult?.data?.currentStock ?? 
                                          stockResult?.currentStock ?? 
                                          stockResult?.data?.CurrentStock ?? 
                                          stockResult?.CurrentStock ?? 0;
                           
                           if (currentItem) {
                               const originalQty = item.qty || 0;
                               currentItem.get('availableStock')?.setValue(stockInWarehouse + originalQty);
                               this.calculateItemTotal(idx);
                               
                               // Force validity check for each item
                               currentItem.updateValueAndValidity();
                           }
                        });

                        const whId = item.warehouseId || item.defaultWarehouseId;
                        if (whId) {
                            this.locationService.getRacksByWarehouse(whId).subscribe({
                                next: (racks: any[]) => {
                                    this.racksByItem[idx] = racks || [];
                                },
                                error: () => {
                                    this.racksByItem[idx] = [];
                                }
                            });
                        }
                    });
                }
                this.isSaving = false;
                this.saleForm.updateValueAndValidity();
                this.cdr.detectChanges();
            },
            error: () => {
                this.isSaving = false;
                this.notification.showStatus(false, 'Failed to load sale order.');
            }
        });
    }

    loadWarehouses() {
        this.locationService.getWarehouses().subscribe((res: any) => {
            this.warehouses = res;
        });
    }

    onWarehouseChange(index: number) {
        const warehouseId = this.items.at(index).get('warehouseId')?.value;
        if (warehouseId) {
            this.locationService.getRacksByWarehouse(warehouseId).subscribe({
                next: (res: any) => {
                    this.racksByItem[index] = res || [];
                },
                error: () => {
                    this.racksByItem[index] = [];
                }
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
        this.saleForm = this.fb.group({
            customerId: [0],
            customerName: ['Cash Customer', Validators.required],
            remarks: [''],
            date: [new Date()],
            expectedDeliveryDate: [new Date()],
            status: ['Confirmed'],
            items: this.fb.array([]), // Removed Validators.required
            taxType: ['local'],
            tdsPercent: [0],
            tcsPercent: [0]
        });
    }

    openProductDialog() {
        const dialogRef = this.dialog.open(ProductSelectionDialogComponent, {
            width: '1250px',
            maxWidth: '96vw',
            data: { allowOutOfStock: false }
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
                            this.locationService.getRacksByWarehouse(mappedProduct.defaultWarehouseId).subscribe({
                                next: (racks: any[]) => {
                                    this.racksByItem[idx] = racks || [];
                                    if (mappedProduct.defaultRackId) {
                                        this.items.at(idx).get('rackId')?.setValue(mappedProduct.defaultRackId, { emitEvent: false });
                                    }
                                },
                                error: () => {
                                    this.racksByItem[idx] = [];
                                }
                            });
                        }
                    }
                });
            }
        });
    }

    addProductToForm(product: any, bypassBatchDialog = false) {
        const isExistingItem = !!product.productId;
        const lineItemId = isExistingItem ? (product.id || 0) : 0;
        const productId = isExistingItem ? product.productId : product.id;

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

        const itemForm = this.fb.group({
            id: [lineItemId],
            productId: [productId, Validators.required],
            productName: [product.productName || product.name, Validators.required],
            sku: [product.sku || ''],
            availableStock: [product.currentStock || 0],
            rackName: [product.rackName || 'NA'],
            warehouseId: [product.warehouseId || product.defaultWarehouseId || null],
            rackId: [product.rackId || product.defaultRackId || null],
            qty: [product.qty || 1, [Validators.required, Validators.min(0.01)]],
            unit: [{ value: product.unit || 'PCS', disabled: true }],
            rate: [product.rate || product.Rate || product.saleRate || product.salePrice || product.price || product.mrp || 0, [Validators.required, Validators.min(0)]],
            discountPercent: [product.discountPercent || product.discount || 0],
            gstPercent: [product.gstPercent ?? product.defaultGst ?? 18],
            total: [{ value: 0, disabled: true }],
            isExpiryRequired: [product.isExpiryRequired || false],
            manufacturingDate: [formatDt(product.manufacturingDate)],
            expiryDate: [formatDt(product.expiryDate)],
            originalQty: [isExistingItem ? (product.qty || 0) : 0]
        });

        // For existing items, manually trigger any derived calculations
        if (isExistingItem) {
            itemForm.updateValueAndValidity();
        }

        const index = this.items.length;
        this.items.push(itemForm);
        this.setupItemCalculations(index);
        this.calculateItemTotal(index);
        this.setupUnitFilter(index);

        if (!isExistingItem) {
             const productName = product.productName || product.name || '';
             this.inventoryService.getCurrentStock('', '', 0, 100, productName).subscribe((res: any) => {
                 const currentItem = this.items.at(index);
                 const itemsArray = res?.data?.items || res?.items || res?.Items || res?.data?.Items || [];
                 const productItem = itemsArray.find((x: any) => {
                     const xId = String(x.productId || x.ProductId || x.id || x.Id).toLowerCase();
                     const targetId = String(productId).toLowerCase();
                     return xId === targetId || (x.productName === productName && productName.length > 0);
                 });

                 if (!productItem) {
                     this.notification.showStatus(false, 'No stock available for this product.');
                     this.items.removeAt(index);
                     return;
                 }

                if (currentItem) {
                    currentItem.get('availableStock')?.setValue(productItem.availableStock || 0);
                }

                const allBatches = (productItem.history || []).map((h: any) => {
                     return {
                         grnNumber: h.grnNumber || 'N/A',
                         manufacturingDate: h.manufacturingDate,
                         expiryDate: h.expiryDate,
                         availableStock: h.availableQty ?? h.AvailableQty ?? 0,
                         warehouseName: h.warehouseName, warehouseId: productItem.warehouseId,
                         rackName: h.rackName, rackId: productItem.rackId,
                         isExpired: isExpiredBatch(h.expiryDate)
                     };
                 });

                 if (allBatches.length === 0) {
                     allBatches.push({
                         grnNumber: 'N/A',
                         manufacturingDate: productItem.manufacturingDate,
                         expiryDate: productItem.expiryDate,
                         availableStock: productItem.availableStock || 0,
                         warehouseName: productItem.warehouseName,
                         rackName: productItem.rackName,
                         warehouseId: productItem.warehouseId,
                         rackId: productItem.rackId,
                         isExpired: isExpiredBatch(productItem.expiryDate)
                     });
                 }

                 const selectableBatches = allBatches.filter((b: any) => b.availableStock > 0 || b.isExpired || b.manufacturingDate);
                 const validBatches = allBatches.filter((b: any) => !b.isExpired && b.availableStock > 0);

                 if (bypassBatchDialog && validBatches.length > 0) {
                     // Auto-select first valid batch for scanning
                     this.applyBatchToForm(validBatches[0], currentItem, formatDt, index);
                 } else if (validBatches.length === 1 && allBatches.filter((b: any) => b.availableStock > 0).length === 1) {
                     this.applyBatchToForm(validBatches[0], currentItem, formatDt, index);
                 } else if (validBatches.length > 0 || selectableBatches.length > 0) {
                     const dialogRef = this.dialog.open(BatchSelectionDialogComponent, {
                         width: '620px',
                         disableClose: false,
                         data: {
                             productName: product.productName || product.name,
                             batches: selectableBatches,
                             validCount: validBatches.length
                         }
                     });

                     dialogRef.afterClosed().subscribe((selectedBatch: any) => {
                         if (selectedBatch) {
                             this.applyBatchToForm(selectedBatch, currentItem, formatDt, index);
                         } else {
                             this.notification.showStatus(false, 'Batch selection cancelled. Item not added.');
                             this.items.removeAt(index);
                         }
                     });
                 } else {
                     this.notification.showStatus(false, 'No stock available for this product.');
                     this.items.removeAt(index);
                 }
             });
        }
    }

    private applyBatchToForm(batch: any, formGroup: any, formatDt: Function, index: number) {
        const mfgDate = batch.manufacturingDate || batch.ManufacturingDate;
        const expDate = batch.expiryDate || batch.ExpiryDate;
        const whId = batch.warehouseId || batch.WarehouseId;
        const rkId = batch.rackId || batch.RackId;
        const warehouseName = batch.warehouseName || batch.WarehouseName;
        const rackName = batch.rackName || batch.RackName;
        const stock = batch.availableStock || batch.AvailableStock || 0;

        if (warehouseName) {
            if (!whId && this.warehouses.length > 0) {
                const foundWh = this.warehouses.find(w => w.name === warehouseName);
                if (foundWh) formGroup.get('warehouseId')?.setValue(foundWh.id);
            } else if (whId) {
                formGroup.get('warehouseId')?.setValue(whId);
            }
        }

        if (rackName) {
            formGroup.get('rackName')?.setValue(rackName);
            if (rkId) formGroup.get('rackId')?.setValue(rkId);
        }

        if (mfgDate) formGroup.get('manufacturingDate')?.setValue(formatDt(mfgDate));
        if (expDate) formGroup.get('expiryDate')?.setValue(formatDt(expDate));

        formGroup.get('availableStock')?.setValue(stock);

        if (formGroup.get('warehouseId')?.value) {
            this.onWarehouseChange(index);
        }
    }

    get items(): FormArray {
        return this.saleForm.get('items') as FormArray;
    }

    addItem() {
        const itemForm = this.fb.group({
            id: [0],
            productId: [null, Validators.required],
            productName: ['', Validators.required],
            sku: [''],
            availableStock: [0],
            rackName: ['NA'],
            warehouseId: [null],
            rackId: [null],
            qty: [1, [Validators.required, Validators.min(0.01)]],
            unit: ['PCS'],
            rate: [0, [Validators.required, Validators.min(0)]],
            discountPercent: [0],
            gstPercent: [18],
            total: [{ value: 0, disabled: true }],
            isExpiryRequired: [false],
            manufacturingDate: [null],
            expiryDate: [null],
            originalQty: [0]
        });

        const index = this.items.length;
        this.items.push(itemForm);
        this.setupItemCalculations(index);
        this.setupUnitFilter(index);
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
        const tax = netRate * (gst / 100);
        const total = qty * (netRate + tax);
        item.get('total')?.patchValue(total.toFixed(2), { emitEvent: false });
    }

    get subTotal(): number {
        return this.items.controls.reduce((sum, ctrl) => {
            const qty = parseFloat(ctrl.get('qty')?.value) || 0;
            const rate = parseFloat(ctrl.get('rate')?.value) || 0;
            const disc = parseFloat(ctrl.get('discountPercent')?.value) || 0;
            return sum + (qty * rate * (1 - disc / 100));
        }, 0);
    }

    get totalTax(): number {
        return this.items.controls.reduce((sum, ctrl) => {
            const qty = parseFloat(ctrl.get('qty')?.value) || 0;
            const rate = parseFloat(ctrl.get('rate')?.value) || 0;
            const disc = parseFloat(ctrl.get('discountPercent')?.value) || 0;
            const gst = parseFloat(ctrl.get('gstPercent')?.value) || 0;
            const netRate = rate * (1 - disc / 100);
            return sum + (qty * netRate * (gst / 100));
        }, 0);
    }

    get grandTotal(): number {
        return this.items.controls.reduce((sum, ctrl) => sum + (parseFloat(ctrl.get('total')?.value) || 0), 0);
    }

    get tdsAmount(): number { return (this.subTotal * (this.saleForm.get('tdsPercent')?.value || 0)) / 100; }
    get tcsAmount(): number { return (this.subTotal * (this.saleForm.get('tcsPercent')?.value || 0)) / 100; }
    get finalGrandTotal(): number { return this.grandTotal - this.tdsAmount + this.tcsAmount; }

    loadCustomers() {
        this.isLoadingCustomers = true;
        this.customerService.getAllCustomers().subscribe({
            next: (res: any) => {
                const PROPRIETOR_NAME = 'Proprietor (Self / Capital Account)';
                const BANK_ACCOUNT_NAME = 'Company Bank Account (Internal)';
                let loadedCustomers = (res || [])
                    .map((c: any) => ({
                        ...c,
                        customerName: (c.customerName || c.name || '').replace(/^"|"$/g, ''),
                        name: (c.name || c.customerName || '').replace(/^"|"$/g, '')
                    }))
                    .filter((c: any) => c.customerName !== PROPRIETOR_NAME && c.customerName !== BANK_ACCOUNT_NAME);

                loadedCustomers.sort((a: any, b: any) => {
                    const aIsWalkIn = this.isWalkIn(a);
                    const bIsWalkIn = this.isWalkIn(b);
                    if (aIsWalkIn && !bIsWalkIn) return -1;
                    if (!aIsWalkIn && bIsWalkIn) return 1;
                    return 0;
                });

                this.customers = loadedCustomers;
                if (!this.isEdit) {
                    const walkIn = this.customers.find(c => this.isWalkIn(c));
                    if (walkIn) {
                        this.customerSearchCtrl.setValue({ id: walkIn.id, customerName: walkIn.customerName });
                        this.saleForm.patchValue({ customerId: walkIn.id, customerName: walkIn.customerName });
                    }
                }

                this.filteredCustomers = this.customerSearchCtrl.valueChanges.pipe(
                    startWith(''),
                    map(value => {
                        const name = typeof value === 'string' ? value : (value?.customerName || value?.name || '');
                        return name ? this._filterCustomers(name) : this.customers;
                    })
                );
                this.isLoadingCustomers = false;
            },
            error: () => this.isLoadingCustomers = false
        });
    }

    isWalkIn(customer: any): boolean {
        if (!customer) return false;
        const name = (customer.customerName || customer.name || '').toLowerCase();
        return name.includes('walk-in') || name.includes('walk in') || name.includes('cash');
    }

    displayCustomer(customer: any): string { return customer ? (customer.customerName || customer.name || '') : ''; }

    private _filterCustomers(name: string): any[] {
        const filterValue = name.toLowerCase();
        return this.customers.filter(c => (c.customerName || c.name || '').toLowerCase().includes(filterValue));
    }

    onCustomerAutoSelect(event: any) {
        const cust = event.option.value;
        if (cust) this.saleForm.patchValue({ customerId: cust.id, customerName: cust.customerName || cust.name });
    }

    clearCustomer() {
        this.customerSearchCtrl.setValue('');
        this.saleForm.patchValue({ customerId: null, customerName: '' });
    }

    save() {
        if (!this.permissionService.hasPermission(this.isEdit ? 'CanEdit' : 'CanAdd')) {
            this.notification.showStatus(false, 'You do not have permission to perform this action.');
            return;
        }
        if (this.saleForm.invalid) {
            this.saleForm.markAllAsTouched();
            this.notification.showStatus(false, 'Please correct the highlighted errors.');
            return;
        }

        if (this.items.length === 0) {
            this.notification.showStatus(false, 'Please add at least one item to the sale.');
            return;
        }

        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            width: '400px',
            data: { title: 'Confirm Save', message: 'Are you sure you want to save this Sale Order?' }
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                this.isSaving = true;
                const formRaw = this.saleForm.getRawValue();
                const payload = {
                    id: this.isEdit ? this.saleOrderId : 0,
                    customerId: formRaw.customerId,
                    customerName: formRaw.customerName,
                    remarks: formRaw.remarks,
                    status: formRaw.status,
                    soDate: formRaw.date,
                    expectedDeliveryDate: formRaw.expectedDeliveryDate,
                    taxType: formRaw.taxType || 'local',
                    tdsPercent: Number(formRaw.tdsPercent || 0),
                    tcsPercent: Number(formRaw.tcsPercent || 0),
                    tdsAmount: this.tdsAmount,
                    tcsAmount: this.tcsAmount,
                    igstAmount: formRaw.taxType === 'interState' ? this.totalTax : 0,
                    cgstAmount: formRaw.taxType === 'local' ? this.totalTax / 2 : 0,
                    sgstAmount: formRaw.taxType === 'local' ? this.totalTax / 2 : 0,
                    subTotal: this.subTotal,
                    totalTax: this.totalTax,
                    grandTotal: this.finalGrandTotal,
                    createdBy: this.authService.getUserEmail(),
                    isQuick: true,
                    items: this.items.getRawValue().map((i: any) => ({
                        id: i.id || 0,
                        productId: i.productId,
                        productName: i.productName,
                        qty: i.qty,
                        unit: i.unit,
                        rate: i.rate,
                        discountPercent: i.discountPercent,
                        gstPercent: i.gstPercent,
                        taxAmount: (i.rate * (1 - (i.discountPercent || 0) / 100)) * ((i.gstPercent || 0) / 100) * i.qty,
                        total: i.total,
                        warehouseId: i.warehouseId || null,
                        rackId: i.rackId || null,
                        manufacturingDate: i.manufacturingDate || null,
                        expiryDate: i.expiryDate || null
                    }))
                };

                this.inventoryService.quickSale(payload).subscribe({
                    next: (res: any) => {
                        this.isSaving = false;
                        const orderNo = res.soNumber || res.SONumber || 'N/A';
                        const soId = res.id || res.Id;
                        const dialogRef = this.dialog.open(SoSuccessDialogComponent, {
                            width: '500px',
                            disableClose: true,
                            data: {
                                soNumber: orderNo,
                                grandTotal: Number(this.grandTotal) || 0,
                                customerId: formRaw.customerId,
                                customerName: formRaw.customerName,
                                status: formRaw.status
                            }
                        });

                        dialogRef.afterClosed().subscribe(action => {
                            if (action === 'make-payment') {
                                this.performDirectPayment({
                                    id: soId,
                                    soNumber: orderNo,
                                    grandTotal: Number(this.grandTotal) || 0,
                                    customerId: formRaw.customerId,
                                    customerName: formRaw.customerName
                                });
                            } else {
                                this.router.navigate(['/app/quick-inventory/sale/list']);
                            }
                        });
                    },
                    error: (err) => {
                        this.isSaving = false;
                        this.notification.showStatus(false, err.error?.message || 'Failed to process quick sale.');
                    }
                });
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
            const avail = this.items.at(existingIndex).get('availableStock')?.value || 0;
            if (Number(qtyCtrl?.value) + 1 > avail) {
                this.notification.showStatus(false, 'Cannot add more. Insufficient stock!');
                return;
            }
            qtyCtrl?.setValue(Number(qtyCtrl.value) + 1);
            this.calculateItemTotal(existingIndex);
            this.notification.showStatus(true, `Quantity updated for SKU: ${sku}`);
            return;
        }

        this.isSaving = true; // Visual feedback
        this.productService.searchProducts(sku).pipe(finalize(() => this.isSaving = false)).subscribe(products => {
            const match = products.find((p: any) => p.sku === sku);
            if (match) {
                this.addProductToForm(match, true); // bypassBatchDialog = true for scanner
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
                        this.addProductToForm(newProduct, true);
                        this.notification.showStatus(true, `New product created and added: ${newProduct.productName}`);
                    }
                });
            }
        });
    }

    performDirectPayment(data: any) {
        this.isSaving = true;
        this.cdr.detectChanges();

        const receiptPayload = {
            id: 0,
            customerId: Number(data.customerId),
            amount: Number(data.grandTotal),
            totalAmount: Number(data.grandTotal),
            discountAmount: 0,
            netAmount: Number(data.grandTotal),
            paymentMode: 'Cash',
            referenceNumber: `${data.soNumber}-${new Date().getTime().toString().slice(-4)}`,
            paymentDate: new Date().toISOString(),
            remarks: `Direct Receipt for Quick Sale: ${data.soNumber}`,
            createdBy: (this.authService as any).getUserName?.() || localStorage.getItem('email') || 'Admin'
        };

        // Delay to ensure SO transaction is fully committed
        setTimeout(() => {
            this.financeService.recordCustomerReceipt(receiptPayload).subscribe({
                next: () => {
                    this.isSaving = false;
                    this.dialog.open(StatusDialogComponent, {
                        width: '350px',
                        data: {
                            isSuccess: true,
                            title: 'Payment Successful',
                            message: `Receipt of ₹${data.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })} recorded. Ledger Updated.`,
                            status: 'success'
                        }
                    });
                    this.router.navigate(['/app/quick-inventory/sale/list']);
                },
                error: (err) => {
                    this.isSaving = false;
                    console.error('❌ Direct receipt failed:', err);
                    this.notification.showStatus(false, err.error?.message || 'Payment recording failed, but Sale is saved.');
                    this.router.navigate(['/app/quick-inventory/sale/list']);
                }
            });
        }, 1000);
    }
}
