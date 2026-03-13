import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { InventoryService } from '../service/inventory.service';
import { NotificationService } from '../../shared/notification.service';
import { Router, ActivatedRoute } from '@angular/router';
import { Observable, debounceTime, distinctUntilChanged, switchMap, of, catchError, map, startWith } from 'rxjs';
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


@Component({
    selector: 'app-quick-purchase',
    standalone: true,
    imports: [CommonModule, MaterialModule, ReactiveFormsModule, FormsModule],
    templateUrl: './quick-purchase.component.html',
    styleUrls: ['./quick-purchase.component.scss']
})
export class QuickPurchaseComponent implements OnInit {
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
    private poService = inject(POService);
    private route = inject(ActivatedRoute);

    purchaseForm!: FormGroup;
    suppliers: any[] = [];
    units: any[] = [];
    warehouses: any[] = [];
    racksByItem: any[][] = []; // Racks list for each item row
    priceLists: any[] = [];
    filteredUnits: Observable<any[]>[] = [];
    filteredSuppliers: any[] = [];
    isLoading = false;
    isSaving = false;
    isLoadingPriceLists = false;
    isPriceListAutoSelected = false;
    isEditMode = false;
    poId: any = null;
    currentStatus = '';

    constructor() {
        this.initForm();
    }

    ngOnInit() {
        this.loadSuppliers();
        this.loadUnits();
        this.loadWarehouses();
        this.bindDropdownPriceList();

        const id = this.route.snapshot.paramMap.get('id');
        if (id && id !== '0') {
            this.poId = id;
            this.isEditMode = true;
            this.loadPODetails(id);
        } else {
            this.loadNextPoNumber();
            // Handle refill data from Quick Current Stock using history.state
            // Wait longer to ensure all async operations are complete
            setTimeout(() => {
                const state = window.history.state;
                if (state?.refillData) {
                    console.log('🔄 Adding refillData:', state.refillData);
                    this.addProductToForm(state.refillData);
                    this.cdr.detectChanges();
                } else if (state?.refillItems) {
                    console.log('🔄 Adding refillItems:', state.refillItems);
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
            expectedDeliveryDate: [new Date(), Validators.required],
            poNumber: [{ value: '', disabled: true }],
            items: this.fb.array([], Validators.required)
        });

        // Add initial item
        // this.addItem();
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
            availableStock: [item.currentStock || 0],
            rackName: [item.rackName || 'NA'],
            warehouseId: [item.warehouseId || null],
            rackId: [item.rackId || null],
            qty: [item.qty, [Validators.required, Validators.min(0.01)]],
            unit: [{ value: item.unit || 'PCS', disabled: true }],
            rate: [item.rate, [Validators.required, Validators.min(0)]],
            discountPercent: [item.discountPercent || 0],
            gstPercent: [item.gstPercent || 0],
            total: [{ value: item.total, disabled: true }],
            id: [item.id || 0],
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
            width: '1100px',
            maxWidth: '96vw'
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
                        // Auto-populate rack list for this item's default warehouse
                        const idx = this.items.length - 1;
                        if (mappedProduct.defaultWarehouseId) {
                            this.locationService.getRacksByWarehouse(mappedProduct.defaultWarehouseId).subscribe((racks: any[]) => {
                                this.racksByItem[idx] = racks;
                                // Auto-select the default rack if available
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
        // Handle both product.id and product.productId for refill data compatibility
        const productId = product.id || product.productId;
        
        console.log('➕ addProductToForm called with:', { 
            productId, 
            productName: product.productName, 
            qty: product.suggestedQty, 
            availableStock: product.currentStock || product.availableStock,
            mfgDate: product.manufacturingDate,
            expDate: product.expiryDate,
            isExpiryRequired: product.isExpiryRequired
        });
        
        // Format dates if they exist
        const formatDate = (dt: any) => {
            if (!dt || dt === 'NA') return null;
            if (typeof dt === 'string' && dt.length >= 10) return dt.substring(0, 10);
            try { return new Date(dt).toISOString().substring(0, 10); } catch { return null; }
        };

        const mfgDate = formatDate(product.manufacturingDate);
        const expDate = formatDate(product.expiryDate);

        const itemForm = this.fb.group({
            productId: [productId, Validators.required],
            productName: [product.productName || product.name, Validators.required],
            availableStock: [product.currentStock || product.availableStock || 0],
            rackName: [product.rackName || 'NA'],
            warehouseId: [product.defaultWarehouseId || null],
            rackId: [product.defaultRackId || null],
            qty: [product.suggestedQty || 1, [Validators.required, Validators.min(0.01)]],
            unit: [{ value: product.unit || 'PCS', disabled: true }],
            rate: [product.basePurchasePrice || product.purchasePrice || product.basePrice || product.rate || 0, [Validators.required, Validators.min(0)]],
            discountPercent: [0],
            gstPercent: [product.gstPercent || 18],
            taxAmount: [0],
            total: [{ value: 0, disabled: true }],
            manufacturingDate: [mfgDate, product.isExpiryRequired ? Validators.required : []],
            expiryDate: [expDate, product.isExpiryRequired ? Validators.required : []],
            isExpiryRequired: [product.isExpiryRequired || false]
        }, { validators: [this.dateRangeValidator] });

        console.log('✅ Form created with isExpiryRequired:', product.isExpiryRequired, 'mfgDate:', mfgDate, 'expDate:', expDate);

        const index = this.items.length;
        this.items.push(itemForm);
        console.log('✅ Product added to form. Current items count:', this.items.length);
        
        this.setupItemCalculations(index);
        this.calculateItemTotal(index);
        this.setupUnitFilter(index);
        this.cdr.detectChanges();

        // If we have productId, try to fetch full product details and update price list rate
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
            availableStock: [0],
            rackName: ['NA'],
            warehouseId: [null],
            rackId: [null],
            unit: ['PCS', Validators.required],
            rate: [0, [Validators.required, Validators.min(0)]],
            discountPercent: [0],
            gstPercent: [18],
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

        const mfgCtrl = group.get('manufacturingDate');
        const expCtrl = group.get('expiryDate');
        const mfg = mfgCtrl?.value;
        const exp = expCtrl?.value;

        if (mfg && exp) {
            const mfgDate = new Date(mfg);
            const expDate = new Date(exp);
            
            // Check if dates are valid
            if (isNaN(mfgDate.getTime()) || isNaN(expDate.getTime())) return null;

            // Reset hours to compare only dates
            mfgDate.setHours(0, 0, 0, 0);
            expDate.setHours(0, 0, 0, 0);
            
            if (expDate < mfgDate) {
                if (!expCtrl.hasError('dateRangeInvalid')) {
                    expCtrl.setErrors({ ...expCtrl.errors, dateRangeInvalid: true });
                }
                return { dateRangeInvalid: true };
            } else {
                // Clear the error if now valid, but keep other errors like 'required'
                if (expCtrl.hasError('dateRangeInvalid')) {
                    const errors = { ...expCtrl.errors };
                    delete errors['dateRangeInvalid'];
                    expCtrl.setErrors(Object.keys(errors).length ? errors : null);
                }
            }
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
        return this.units.filter(unit =>
            (unit.unitName || unit.name || '').toLowerCase().includes(filterValue)
        );
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
        item.get('taxAmount')?.patchValue((qty * tax).toFixed(2), { emitEvent: false });
    }

    get grandTotal(): number {
        return this.items.controls.reduce((sum, ctrl) => {
            const val = parseFloat(ctrl.get('total')?.value) || 0;
            return sum + val;
        }, 0);
    }

    // Total items quantity across all rows
    get totalQty(): number {
        return this.items.controls.reduce((sum, ctrl) => {
            return sum + (Number(ctrl.get('qty')?.value) || 0);
        }, 0);
    }

    // Sub Total = before GST (qty * rate after discount)
    get subTotal(): number {
        return this.items.controls.reduce((sum, ctrl) => {
            const qty  = Number(ctrl.get('qty')?.value)  || 0;
            const rate = Number(ctrl.get('rate')?.value) || 0;
            const disc = Number(ctrl.get('discountPercent')?.value) || 0;
            return sum + qty * rate * (1 - disc / 100);
        }, 0);
    }

    // Total Tax = GST amount only
    get totalTax(): number {
        return this.items.controls.reduce((sum, ctrl) => {
            const qty  = Number(ctrl.get('qty')?.value)  || 0;
            const rate = Number(ctrl.get('rate')?.value) || 0;
            const disc = Number(ctrl.get('discountPercent')?.value) || 0;
            const gst  = Number(ctrl.get('gstPercent')?.value) || 0;
            const netRate = rate * (1 - disc / 100);
            return sum + qty * netRate * (gst / 100);
        }, 0);
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
                // If res is the new supplier object or true, reload and select
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
            console.error('❌ Form Invalid Fields:', this.getInvalidControls());
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
            grandTotal: this.grandTotal,
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
                this.notification.showStatus(true, `Quick Purchase Draft ${this.isEditMode ? 'Updated' : 'Saved'}! PO: ${formValue.poNumber}`);
                this.router.navigate(['/app/quick-inventory/purchase/list']);
            },
            error: (err) => {
                this.notification.showStatus(false, err.error?.message || 'Failed to save draft.');
                this.isSaving = false;
            }
        });
    }

    private getInvalidControls() {
        const invalid = [];
        const controls = this.purchaseForm.controls;
        for (const name in controls) {
            if (controls[name].invalid) {
                invalid.push(name);
            }
        }
        
        const itemArray = this.items;
        itemArray.controls.forEach((group: any, index: number) => {
            for (const name in group.controls) {
                if (group.controls[name].invalid) {
                    invalid.push(`Item ${index + 1}: ${name}`);
                }
            }
            if (group.errors) {
                invalid.push(`Item ${index + 1} Group: ${JSON.stringify(group.errors)}`);
            }
        });
        
        return invalid;
    }

    private cdr = inject(ChangeDetectorRef);
}
