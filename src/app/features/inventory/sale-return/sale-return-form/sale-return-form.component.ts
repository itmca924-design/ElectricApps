import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit, ViewChild, AfterViewInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { Router, ActivatedRoute } from '@angular/router';
import { MaterialModule } from '../../../../shared/material/material/material-module';
import { SaleReturnService } from '../services/sale-return.service';
import { customerService } from '../../../master/customer-component/customer.service';
import { SaleOrderService } from '../../service/saleorder.service';
import { InventoryService } from '../../service/inventory.service';
import { CreateSaleReturnDto, SaleReturnItem } from '../models/create-sale-return.model';
import { MatDialog } from '@angular/material/dialog';
import { StatusDialogComponent } from '../../../../shared/components/status-dialog-component/status-dialog-component';
import { NotificationService } from '../../../shared/notification.service';
import { FinanceService } from '../../../finance/service/finance.service';
import { LoadingService } from '../../../../core/services/loading.service';
import { CompanyService } from '../../../company/services/company.service';
import { LocationService } from '../../../master/locations/services/locations.service';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { SummaryStat, SummaryStatsComponent } from '../../../../shared/components/summary-stats-component/summary-stats-component';

import { environment } from '../../../../enviornments/environment';

@Component({
    selector: 'app-sale-return-form',
    standalone: true,
    imports: [CommonModule, MaterialModule, ReactiveFormsModule, SummaryStatsComponent, MatPaginatorModule],
    providers: [DatePipe, CurrencyPipe],
    templateUrl: './sale-return-form.component.html',
    styleUrl: './sale-return-form.component.scss',
})
export class SaleReturnFormComponent implements OnInit, AfterViewInit {
    private fb = inject(FormBuilder);
    @ViewChild(MatPaginator) paginator!: MatPaginator;
    private srService = inject(SaleReturnService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);
    private cdr = inject(ChangeDetectorRef);
    private customerService = inject(customerService);
    private saleOrderService = inject(SaleOrderService);
    private dialog = inject(MatDialog);
    private notification = inject(NotificationService);
    private loadingService = inject(LoadingService);
    private financeService = inject(FinanceService);
    private companyService = inject(CompanyService);
    private datePipe = inject(DatePipe);
    private currencyPipe = inject(CurrencyPipe);
    private inventoryService = inject(InventoryService);
    private locationService = inject(LocationService);

    customers: any[] = [];
    saleOrders: any[] = [];
    returnForm: FormGroup;
    isEditMode = false;
    returnId: number | null = null;
    isLoading = false;
    isLoadingCustomers = false;
    isLoadingSaleOrders = false;
    noItemsFound = false;
    isPolicyViolated = false;
    summaryStats: SummaryStat[] = [];
    minDate: Date = new Date();
    isQuick: boolean = false;
    isFromDashboard: boolean = false;

    warehouses: any[] = [];
    racks: any[] = [];

    itemsDataSource = new MatTableDataSource<AbstractControl>();
    displayedColumns: string[] = ['productName', 'grnNo', 'refNo', 'policyStatus', 'mfgDate', 'expDate', 'quantity', 'rate', 'itemCondition', 'warehouse', 'rack', 'reason', 'returnQty', 'discount', 'tax', 'total'];

    constructor() {
        this.returnForm = this.fb.group({
            returnDate: [new Date(), Validators.required],
            customerId: ['', Validators.required],
            saleOrderId: ['', Validators.required],
            remarks: [''],
            items: this.fb.array([])
        });
    }

    ngAfterViewInit(): void {
        this.itemsDataSource.paginator = this.paginator;
    }

    ngOnInit(): void {
        this.isQuick = (this.route as any).snapshot.data['isQuick'] || false;
        this.loadCustomersLookup();
        this.loadLocations();
        this.updateSummaryStats();
        
        this.route.params.subscribe(params => {
            if (params['id']) {
                this.isEditMode = true;
                this.returnId = +params['id'];
                this.loadReturnDetails(this.returnId);
            }
        });

        // Handle Auto-fill from Query Params (Standard return via SO List)
        this.route.queryParams.subscribe(params => {
            const customerId = params['customerId'];
            const saleOrderId = params['soId'] || params['sold']; // Handle both soId and sold (from dashboard)
            if (customerId && saleOrderId && !this.isEditMode) {
                this.isFromDashboard = true;
                this.returnForm.get('returnDate')?.disable();
                this.returnForm.get('customerId')?.disable();
                this.returnForm.get('saleOrderId')?.disable();
                this.returnForm.patchValue({ customerId: Number(customerId) });
                this.onCustomerChange(Number(customerId), Number(saleOrderId));
            }
        });
    }

    loadCustomersLookup() {
        this.isLoadingCustomers = true;
        this.customerService.getCustomersLookup().subscribe({
                    next: (data) => {
                        this.customers = data.filter((c: any) =>
                            !c.name.includes('Proprietor') &&
                            !c.name.includes('Company Bank Account')
                        );
                        this.isLoadingCustomers = false;
                        this.cdr.detectChanges();
                    },
            error: (err) => {
                console.error("Customer load fail:", err);
                this.isLoadingCustomers = false;
                this.cdr.detectChanges();
            }
        });
    }

    onCustomerChange(customerId: number, targetSoId?: number) {
        this.saleOrders = [];
        if (!targetSoId) {
            this.returnForm.get('saleOrderId')?.setValue(null);
        }
        this.clearItems();

        if (customerId) {
            this.isLoadingSaleOrders = true;
            this.saleOrderService.getOrdersByCustomer(customerId).subscribe({
                next: (data) => {
                    this.saleOrders = data;
                    this.isLoadingSaleOrders = false;
                    
                    if (targetSoId) {
                        this.returnForm.patchValue({ saleOrderId: targetSoId });
                        this.onSOChange(targetSoId);
                    }
                    
                    this.cdr.detectChanges();
                },
                error: (err) => {
                    console.error("Orders load error:", err);
                    this.isLoadingSaleOrders = false;
                    this.cdr.detectChanges();
                }
            });
        }
    }

    onSOChange(soId: number) {
        this.clearItems();
        this.noItemsFound = false;
        this.isPolicyViolated = false;
        if (soId) {
            this.isLoading = true;
            this.saleOrderService.getSaleOrderItems(soId).subscribe({
                next: (items: any[]) => {
                    this.noItemsFound = items.length === 0;
                    this.isPolicyViolated = items.some(i => !i.isReturnable);

                    items.forEach(item => {
                        const itemGroup = this.fb.group({
                            productId: [item.productId, Validators.required],
                            productName: [item.productName || item.name, Validators.required],
                            currentStock: [item.currentStock || 0],
                            quantity: [item.soldQty || item.quantity],
                            rate: [item.rate || item.unitPrice || 0],
                            discountPercent: [item.discountPercent || 0],
                            itemCondition: [{ value: 'Good', disabled: true }, Validators.required],
                            reason: [''],
                            returnQty: [{ value: 0, disabled: !item.isReturnable }, [Validators.required, Validators.min(0), Validators.max(item.soldQty || item.quantity)]],
                            taxRate: [item.taxPercentage || item.taxRate || 0],
                            amount: [0],
                            warehouseId: [{ value: item.warehouseId || null, disabled: true }, Validators.required],
                            rackId: [{ value: item.rackId || null, disabled: true }, Validators.required],
                            warehouseName: [item.warehouseName],
                            rackName: [item.rackName],
                            isReturnable: [item.isReturnable && (item.returnWindowRemainingHours > 0)],
                            remainingHours: [item.returnWindowRemainingHours || 0],
                            manufacturingDate: [item.manufacturingDate || item.mfgDate],
                            expiryDate: [item.expiryDate || item.expDate],
                            isExpiryRequired: [item.isExpiryRequired ?? true],
                            grnNo: [item.grnNumber || item.grnNo || 'N/A'],
                            refNo: [item.refNo || item.poNumber || 'N/A']
                        });

                        this.calculateRowTotal(itemGroup);

                        itemGroup.get('returnQty')?.valueChanges.subscribe(() => {
                            this.calculateRowTotal(itemGroup);
                            this.cdr.detectChanges();
                        });

                        this.itemsFormArray.push(itemGroup);
                    });
                    this.itemsDataSource.data = this.itemsFormArray.controls;
                    this.isLoading = false;
                    this.updateSummaryStats();
                    this.cdr.detectChanges();
                },
                error: () => {
                    this.isLoading = false;
                    this.cdr.detectChanges();
                }
            });
        }
    }

    loadLocations() {
        this.locationService.getWarehouses().subscribe(res => {
            this.warehouses = res;
            this.cdr.detectChanges();
        });
        this.locationService.getRacks().subscribe(res => {
            this.racks = res;
            this.cdr.detectChanges();
        });
    }

    onWarehouseChange(wId: number, element: AbstractControl) {
        element.get('rackId')?.setValue(null);
        if (wId) {
            this.locationService.getRacksByWarehouse(wId).subscribe(racks => {
                // We'll store racks in a local map to avoid cross-row conflicts if needed, 
                // but for now, we'll just use the globally fetched ones which is simpler for Quick mode
                this.racks = racks;
                this.cdr.detectChanges();
            });
        }
    }

    get itemsFormArray(): FormArray {
        return this.returnForm.get('items') as FormArray;
    }

    clearItems() {
        while (this.itemsFormArray.length !== 0) {
            this.itemsFormArray.removeAt(0);
        }
        this.itemsDataSource.data = [];
    }

    populateItems(items: any[]) { // Used for Edit Mode
        items.forEach(item => {
            const itemGroup = this.fb.group({
                productId: [item.productId],
                productName: [item.productName],
                currentStock: [item.currentStock || 0],
                quantity: [item.quantity],
                rate: [item.unitPrice || item.rate],
                discountPercent: [item.discountPercent || 0], // Capture Discount
                itemCondition: [{ value: item.itemCondition || 'Good', disabled: true }, Validators.required],
                reason: [''],
                returnQty: [0, [Validators.required, Validators.min(0), Validators.max(item.quantity)]],
                taxRate: [item.taxPercentage || item.taxRate || 0],
                amount: [0],
                warehouseId: [{ value: item.warehouseId || null, disabled: true }],
                rackId: [{ value: item.rackId || null, disabled: true }],
                warehouseName: [item.warehouseName],
                rackName: [item.rackName],
                manufacturingDate: [item.manufacturingDate],
                expiryDate: [item.expiryDate],
                grnNo: [item.grnNumber || item.grnNo || 'N/A'],
                refNo: [item.refNo || item.poNumber || 'N/A'],
            });

            itemGroup.get('returnQty')?.valueChanges.subscribe(() => {
                this.calculateRowTotal(itemGroup);
                this.cdr.detectChanges();
            });

            this.itemsFormArray.push(itemGroup);
        });

        this.itemsDataSource.data = [...this.itemsFormArray.controls];
        this.cdr.detectChanges();
    }

    calculateRowTotal(group: FormGroup) {
        const qty = +group.get('returnQty')?.value || 0;
        const rate = +group.get('rate')?.value || 0;
        const taxRate = +group.get('taxRate')?.value || 0;
        const discountPercent = +group.get('discountPercent')?.value || 0;

        // 1. Calculate Discount
        const discountAmountPerUnit = rate * (discountPercent / 100);
        const netRate = rate - discountAmountPerUnit;
        const totalDiscountAmount = qty * discountAmountPerUnit;

        // 2. Calculate Base Amount (Taxable Value) - GST fits on Transaction Value
        const taxableAmount = qty * netRate;

        // 3. Calculate Tax on Taxable Amount
        const taxAmount = taxableAmount * (taxRate / 100);

        // 4. Final Total
        const total = taxableAmount + taxAmount;

        // Debug Log
        // console.log(`Rate: ${rate}, Qty: ${qty}, Disc%: ${discountPercent}, NetRate: ${netRate}, Taxable: ${taxableAmount}, Tax: ${taxAmount}, Total: ${total}`);

        group.patchValue({ amount: total }, { emitEvent: false });
        this.updateSummaryStats();
    }

    updateSummaryStats() {
        const totalAmount = this.totalReturnAmount;
        const totalQty = this.totalReturnQty;
        const itemsCount = this.itemsFormArray.length;

        this.summaryStats = [
            {
                label: 'Total Refund Value',
                value: this.currencyPipe.transform(totalAmount, 'INR') || '₹0.00',
                icon: 'payments',
                type: 'success'
            },
            {
                label: 'Total Return Qty',
                value: `${totalQty} PCS`,
                icon: 'move_to_inbox',
                type: 'active',
                badge: 'ITEMS'
            },
            {
                label: 'Items Count',
                value: itemsCount,
                icon: 'inventory',
                type: 'total'
            },
            {
                label: 'Return Status',
                value: this.isEditMode ? 'Editing' : 'New Draft',
                icon: 'edit_note',
                type: 'info'
            }
        ];
    }

    get totalReturnAmount(): number {
        return this.itemsFormArray.controls
            .reduce((sum, control) => sum + (control.get('amount')?.value || 0), 0);
    }

    get totalReturnQty(): number {
        return this.itemsFormArray.controls
            .reduce((sum, control) => sum + (Number(control.get('returnQty')?.value) || 0), 0);
    }

    loadReturnDetails(id: number) {
        this.isLoading = true;
        this.srService.getSaleReturnById(id).subscribe(res => {
            this.returnForm.patchValue({
                returnDate: res.returnDate,
                customerId: res.customerId,
                saleOrderId: res.saleOrderId,
                remarks: res.remarks
            });
            // Populate Items needs to handle existing return items structure
            // Assuming res.returnItems contains necessary fields
            // this.populateItems(res.returnItems); 
            // Note: Currently populateItems is not called in loadReturnDetails in original code, 
            // but if it were, it needs to be updated. The original code didn't call it.
            this.isLoading = false;
            this.cdr.detectChanges();
        });
    }

    // ==========================================
    // SAVE LOGIC (Updated as requested)
    // ==========================================
    onSubmit() {
        if (this.returnForm.invalid) {
            this.returnForm.markAllAsTouched();
            return;
        }

        const userId = localStorage.getItem('email') || 'admin@admin.com';
        const rawValue = this.returnForm.getRawValue();

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const returnDate = new Date(rawValue.returnDate);
        returnDate.setHours(0, 0, 0, 0);

        if (returnDate < today) {
            this.dialog.open(StatusDialogComponent, {
                width: '400px',
                data: { isSuccess: false, message: 'Sale Return Date cannot be in the past.' }
            });
            return;
        }

        // Backend ko wahi naam chahiye jo SaleReturnItem interface mein hain
        const mappedItems: SaleReturnItem[] = rawValue.items
            .filter((i: any) => i.returnQty > 0)
            .map((i: any) => {
                const qty = i.returnQty;
                const rate = i.rate;
                const discountPct = i.discountPercent || 0;
                // Calculate Discount Amount for the returned quantity
                const discountAmount = (rate * qty) * (discountPct / 100);

                return {
                    productId: i.productId,
                    returnQty: qty,
                    unitPrice: rate,
                    discountPercent: discountPct,
                    discountAmount: discountAmount,
                    taxPercentage: i.taxRate,
                    totalAmount: i.amount,
                    reason: i.reason || 'No Reason',
                    itemCondition: i.itemCondition || 'Good',
                    warehouseId: i.warehouseId,
                    rackId: i.rackId,
                    manufacturingDate: i.manufacturingDate,
                    expiryDate: i.expiryDate,
                    mfgDate: i.manufacturingDate,
                    expDate: i.expiryDate,
                    createdBy: userId,
                    modifiedBy: userId
                };
            });

        if (mappedItems.length === 0) {
            this.dialog.open(StatusDialogComponent, {
                width: '400px',
                data: { isSuccess: false, message: 'Please enter return quantity for at least one item.' }
            });
            return;
        }

        const payload: CreateSaleReturnDto = {
            returnDate: rawValue.returnDate,
            saleOrderId: Number(rawValue.saleOrderId),
            customerId: Number(rawValue.customerId),
            remarks: rawValue.remarks,
            createdBy: userId,
            modifiedBy: userId, // Added for audit consistency
            items: mappedItems,
            isQuick: this.isQuick
        };

        this.isLoading = true;
        console.log('Final Payload to Backend:', payload);

        this.srService.saveSaleReturn(payload).subscribe({
            next: (res: any) => {
                const returnNo = res?.returnNumber || res?.returnNo || `SR-${Date.now()}`;
                const returnId = res?.saleReturnHeaderId || res?.id || 0;

                this.financeService.recordCustomerReceipt({
                    customerId: Number(rawValue.customerId),
                    amount: this.totalReturnAmount,
                    paymentMode: 'Sales Return',
                    referenceNumber: returnNo,
                    paymentDate: new Date().toISOString(),
                    remarks: `Sales Return Adjustment: ${returnNo}`,
                    createdBy: userId
                }).subscribe({
                    next: () => {
                        this.inventoryService.notifyInventoryChange();
                        this.handleSuccess(res, returnNo, returnId);
                    },
                    error: () => this.handleSuccess(res, returnNo, returnId, true)
                });
            },
            error: (err) => {
                this.isLoading = false;
                this.cdr.detectChanges();
                this.dialog.open(StatusDialogComponent, {
                    width: '400px',
                    data: { isSuccess: false, message: err.error?.message || "Save failed." }
                });
            }
        });
    }

    private handleSuccess(res: any, returnNo: string, returnId: number, isFail: boolean = false) {
        this.isLoading = false;
        this.cdr.detectChanges();

        const dialogRef = this.dialog.open(StatusDialogComponent, {
            width: '450px',
            data: {
                isSuccess: !isFail,
                title: 'Sale Return Saved!',
                message: isFail
                    ? 'Return Saved, but Ledger update failed. Please check manually.'
                    : this.isQuick
                        ? 'Sale Return saved successfully. Stock Re-filled & Ledger updated.'
                        : 'Sale Return saved successfully. Stock Re-filled & Ledger updated.\n\nInward Gate Pass can be generated from the Sale Returns dashboard.',
                actions: [
                    { label: this.isQuick ? 'Go to Quick Returns' : 'Go to Sale Returns', role: 'ok' }
                ]
            }
        });

        dialogRef.afterClosed().subscribe(() => {
            const target = this.isQuick ? '/app/quick-inventory/so-return' : '/app/inventory/sale-return';
            this.router.navigate([target]);
        });
    }

    private navigateToGatePass(returnNo: string, returnId: number, delay: number = 300) {
        this.loadingService.setLoading(true);
        const customerName = this.customers.find(c => c.id === Number(this.returnForm.get('customerId')?.value))?.name || '';
        setTimeout(() => {
            this.router.navigate(['/app/inventory/gate-pass/inward'], {
                queryParams: { refNo: returnNo, refId: returnId, type: 'sale-return', partyName: customerName, qty: this.totalReturnQty }
            });
        }, delay);
    }

    private printAfterSave(returnId: number, existingWindow: Window, callback: () => void) {
        this.loadingService.setLoading(true);
        // Fetch full print data
        this.srService.getSaleReturnById(returnId).subscribe({
            next: (data) => {
                this.companyService.getCompanyProfile().subscribe(company => {
                    this.triggerPrintWithWindow(data, company, existingWindow);
                    this.loadingService.setLoading(false);
                    callback();
                });
            },
            error: () => {
                this.loadingService.setLoading(false);
                existingWindow.close();
                callback();
            }
        });
    }

    private triggerPrintWithWindow(data: any, company: any, WindowPrt: Window) {
        const companyName = company?.name || 'Electric Inventory System';
        const logoUrl = company?.logoUrl ? this.getImgUrl(company.logoUrl) : '';
        let addressStr = '';
        if (company?.address) {
            const addr = company.address;
            addressStr = `${addr.addressLine1}, ${addr.addressLine2 ? addr.addressLine2 + ', ' : ''}${addr.city}, ${addr.state} - ${addr.pinCode}`;
        }
        const contactInfo = `Contact: ${company?.primaryPhone || ''} | Email: ${company?.primaryEmail || ''}`;

        const returnDate = this.datePipe.transform(data.returnDate, 'dd MMM yyyy');
        const subTotal = this.currencyPipe.transform(data.subTotal || 0, 'INR');
        const totalTax = this.currencyPipe.transform(data.totalTax || 0, 'INR');
        const grandTotal = this.currencyPipe.transform(data.grandTotal || 0, 'INR');
        const totalInWords = this.numberToWords(Math.round(data.grandTotal || 0));

        const itemsRows = data.items.map((item: any, index: number) => `
            <tr>
                <td style="text-align: center;">${index + 1}</td>
                <td>${item.productName}</td>
                <td style="text-align: center;">${item.qty}</td>
                <td style="text-align: right;">${this.currencyPipe.transform(item.rate, 'INR')}</td>
                <td style="text-align: center;">${item.discountPercent || 0}%</td>
                <td style="text-align: center;">${item.taxPercent}%</td>
                <td style="text-align: right;">${this.currencyPipe.transform(item.total, 'INR')}</td>
            </tr>
        `).join('');

        WindowPrt.document.open();
        WindowPrt.document.write(`
            <html>
                <head>
                    <title>Credit Note - ${data.returnNumber}</title>
                    <style>
                        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; line-height: 1.4; }
                        .header { display: flex; justify-content: space-between; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
                        .logo-section { display: flex; align-items: center; gap: 15px; }
                        .company-logo { width: 70px; height: 70px; object-fit: contain; }
                        .company-name h1 { margin: 0; font-size: 26px; color: #1a56db; font-weight: 800; }
                        .company-name p { margin: 2px 0; font-size: 13px; color: #4b5563; }
                        .doc-title { text-align: right; }
                        .doc-title h2 { margin: 0; color: #1f2937; font-size: 22px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }
                        .doc-title p { margin: 5px 0 0 0; font-size: 16px; font-weight: 700; color: #4b5563; }
                        .info-card { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 30px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
                        .info-group { display: flex; flex-direction: column; }
                        .info-group label { font-size: 11px; color: #6b7280; text-transform: uppercase; font-weight: 700; margin-bottom: 4px; }
                        .info-group .value { font-weight: 700; font-size: 15px; color: #111827; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; border: 1px solid #e5e7eb; }
                        th { background: #f3f4f6; padding: 12px 10px; border: 1px solid #e5e7eb; text-align: left; font-size: 11px; text-transform: uppercase; color: #374151; font-weight: 800; }
                        td { padding: 12px 10px; border: 1px solid #e5e7eb; font-size: 13px; color: #1f2937; }
                        .bottom-section { display: flex; justify-content: space-between; margin-top: 40px; }
                        .words-section { flex: 1; padding-right: 40px; }
                        .words-section .value { font-weight: 700; color: #111827; text-transform: capitalize; font-style: italic; font-size: 14px; margin-top: 5px; }
                        .invoice-summary { width: 300px; }
                        .summary-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; border-bottom: 1px dashed #e5e7eb; }
                        .summary-row.grand-total { font-weight: 900; font-size: 18px; color: #1a56db; border-top: 2px solid #1a56db; margin-top: 10px; padding-top: 10px; border-bottom: none; }
                        .footer-note { margin-top: 80px; display: flex; justify-content: space-between; border-top: 1px solid #eee; padding-top: 40px; }
                        .signature-box { text-align: center; min-width: 200px; }
                        .signature-line { border-top: 1px solid #333; margin-bottom: 8px; margin-top: 50px; }
                    </style>
                </head>
                <body onload="window.print()">
                    <div class="header">
                        <div class="logo-section">
                            ${logoUrl ? `<img src="${logoUrl}" class="company-logo" alt="Logo">` : ''}
                            <div class="company-name">
                                <h1>${companyName}</h1>
                                <p>${addressStr}</p>
                                <p>${contactInfo}</p>
                            </div>
                        </div>
                        <div class="doc-title">
                             <h2>CREDIT NOTE</h2>
                             <p>#${data.returnNumber}</p>
                             <div style="font-size: 13px; font-weight: 600; color: #6b7280; margin-top: 5px;">Date: ${returnDate}</div>
                        </div>
                    </div>
                    <div class="info-card">
                      <div class="info-group"><label>Customer Name</label><div class="value">${data.customerName || 'N/A'}</div></div>
                      <div class="info-group"><label>Reference No (SO)</label><div class="value">${data.soNumber || 'N/A'}</div></div>
                      <div class="info-group"><label>Document Status</label><div class="value">${data.status || 'Confirmed'}</div></div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th style="text-align: center; width: 30px;">#</th>
                                <th>Product Name / Description</th>
                                <th style="text-align: center; width: 60px;">Qty</th>
                                <th style="text-align: right; width: 100px;">Rate</th>
                                <th style="text-align: center; width: 60px;">Disc%</th>
                                <th style="text-align: center; width: 60px;">Tax%</th>
                                <th style="text-align: right; width: 120px;">Total</th>
                            </tr>
                        </thead>
                        <tbody>${itemsRows}</tbody>
                    </table>
                    <div class="bottom-section">
                        <div class="words-section"><p>Amount in Words:</p><div class="value">Rupees ${totalInWords}</div></div>
                        <div class="invoice-summary">
                            <div class="summary-row"><span class="label">Sub Total</span><span class="value">${subTotal}</span></div>
                            <div class="summary-row" style="color: #ef4444;"><span class="label">Total Discount</span><span class="value">- ${this.currencyPipe.transform(data.totalDiscount, 'INR')}</span></div>
                            <div class="summary-row"><span class="label">Total Tax</span><span class="value">${totalTax}</span></div>
                            <div class="summary-row grand-total"><span class="label">Grand Total</span><span class="value">${grandTotal}</span></div>
                        </div>
                    </div>
                    <div class="footer-note">
                        <div class="signature-box" style="text-align: left;"><p style="font-size: 11px; margin-bottom: 50px;">Customer Signature & Seal</p><div class="signature-line" style="width: 180px;"></div></div>
                        <div class="signature-box"><p style="font-size: 11px; margin-bottom: 50px;">For ${companyName}</p><div class="signature-line"></div><label>Authorized Signatory</label></div>
                    </div>
                </body>
            </html>
        `);
        WindowPrt.document.close();
    }

    private getImgUrl(url: string | null | undefined): string {
        if (!url) return '';
        if (url.startsWith('data:image') || url.startsWith('http')) return url;
        const cleanUrl = url.startsWith('/') ? url.substring(1) : url;
        return `${environment.CompanyRootUrl}/${cleanUrl}`;
    }

    private numberToWords(num: number): string {
        const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
        const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        const n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
        if (!n) return '';
        let str = '';
        str += Number(n[1]) != 0 ? (a[Number(n[1])] || b[Number(n[1].toString().charAt(0))] + ' ' + a[Number(n[1].toString().charAt(1))]) + 'Crore ' : '';
        str += Number(n[2]) != 0 ? (a[Number(n[2])] || b[Number(n[2].toString().charAt(0))] + ' ' + a[Number(n[2].toString().charAt(1))]) + 'Lakh ' : '';
        str += Number(n[3]) != 0 ? (a[Number(n[3])] || b[Number(n[3].toString().charAt(0))] + ' ' + a[Number(n[3].toString().charAt(1))]) + 'Thousand ' : '';
        str += Number(n[4]) != 0 ? (a[Number(n[4])] || b[Number(n[4].toString().charAt(0))] + ' ' + a[Number(n[4].toString().charAt(1))]) + 'Hundred ' : '';
        str += Number(n[5]) != 0 ? (str != '' ? 'and ' : '') + (a[Number(n[5])] || b[Number(n[5].toString().charAt(0))] + ' ' + a[Number(n[5].toString().charAt(1))]) + 'only' : '';
        return str;
    }

    exportPdf() {
        if (!this.returnId) return;
        this.isLoading = true;
        // Assuming service has a download method, otherwise placeholder
        // this.srService.downloadReturnPdf(this.returnId).subscribe(...)
        console.log('Exporting PDF for Return ID:', this.returnId);

        // Mocking download for now
        setTimeout(() => {
            this.isLoading = false;
            this.cdr.detectChanges();
            this.notification.showStatus(true, 'PDF Exported Successfully (Mock)');
        }, 1000);
    }

    formatRemainingTime(hours: number): string {
        if (hours <= 0) return 'Expired';
        // Round to nearest hour for cleaner display as requested ("n hrs")
        const h = Math.round(hours);
        return `${h} hrs`;
    }

    goBack() {
        this.router.navigate(['/app/inventory/sale-return']);
    }
}