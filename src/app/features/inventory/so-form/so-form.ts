import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, ChangeDetectorRef, OnDestroy, AfterViewInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { Observable, of, Subject } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, finalize, switchMap, takeUntil } from 'rxjs/operators';
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

  soForm!: FormGroup;
  isLoading = false;
  filteredProducts: Observable<any[]>[] = [];
  isProductLoading: boolean[] = [];

  subTotal = 0;
  totalTax = 0;
  grandTotal = 0;
  allUnits: any[] = [];
  customers: any = [];
  public generatedSoNumber: string = 'NEW ORDER';
  minDate: Date = new Date();

  ngOnInit(): void {
    this.initForm();
    this.loadCustomers();
    this.loadUnits();
    this.addRow();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  initForm() {
    this.soForm = this.fb.group({
      customerId: [null, [Validators.required]],
      soDate: [new Date(), Validators.required],
      expectedDeliveryDate: [new Date(), Validators.required],
      remarks: [''],
      status: ['Draft'],
      subTotal: [0],
      totalTax: [0],
      grandTotal: [0],
      items: this.fb.array([])
    });
  }

  loadCustomers(): void {
    this.isLoading = true;
    this.customerService.getAllCustomers().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.customers = res;
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoading = false;
      }
    });
  }

  loadUnits() {
    this.unitService.getAll().pipe(takeUntil(this.destroy$)).subscribe(data => this.allUnits = data || []);
  }

  get items(): FormArray {
    return this.soForm.get('items') as FormArray;
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
      rackName: [''] // Added Rack Name
    });

    this.items.push(row);
    this.setupFilter(this.items.length - 1);
  }

  openBulkAddDialog() {
    const dialogRef = this.dialog.open(ProductSelectionDialogComponent, {
      width: '1000px',
      height: '600px',
      disableClose: true
    });

    dialogRef.afterClosed().subscribe((selectedProducts: any[]) => {
      if (selectedProducts && selectedProducts.length > 0) {
        selectedProducts.forEach(product => {
          // Check if product already exists in the list
          const exists = this.items.controls.some(control => control.get('productId')?.value === product.id);

          if (!exists) {
            const row = this.fb.group({
              productSearch: [product, Validators.required],
              productId: [product.id, Validators.required],
              qty: [1, [Validators.required, Validators.min(1)]],
              unit: [product.unit || 'PCS'],
              rate: [product.rate || product.saleRate || 0, [Validators.required, Validators.min(0.01)]],
              discountPercent: [product.discount || product.discountPercent || 0],
              gstPercent: [product.defaultGst || product.gstPercent || 0],
              taxAmount: [0],
              total: [{ value: 0, disabled: true }],
              availableStock: [product.currentStock || product.availableStock || 0],
              rackName: [product.defaultRackName || '']
            });
            this.items.push(row);
            const index = this.items.length - 1;
            this.setupFilter(index);
            this.updateTotal(index);
          }
        });

        // Remove the first empty row if it was not used
        if (this.items.length > 1) {
          const firstRow = this.items.at(0);
          if (!firstRow.get('productId')?.value) {
            this.items.removeAt(0);
          }
        }

        this.calculateGrandTotal();
        this.cdr.detectChanges();
      }
    });
  }

  private setupFilter(index: number): void {
    const control = this.items.at(index).get('productSearch');
    if (!control) return;

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
      row.patchValue({
        productId: p.id,
        unit: p.unit || 'PCS',
        rate: p.rate || p.saleRate || p.price || 0,
        discountPercent: p.discount || p.discountPercent || 0,
        gstPercent: p.defaultGst || p.gstPercent || 0,
        availableStock: p.currentStock || 0,
        rackName: p.defaultRackName || ''
      });
      this.updateTotal(index);
    }
  }

  updateTotal(index: number): void {
    const row = this.items.at(index);
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

  removeItem(index: number): void {
    if (this.items.length > 1) {
      this.items.removeAt(index);
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
          : 'Sale Order saved as Draft. Inventory was not affected.';

        const payload = {
          customerId: formValues.customerId,
          status: currentStatus,
          soDate: formValues.soDate,
          expectedDeliveryDate: formValues.expectedDeliveryDate,
          remarks: formValues.remarks || '',
          subTotal: Number(formValues.subTotal) || 0,
          totalTax: Number(formValues.totalTax) || 0,
          grandTotal: Number(formValues.grandTotal) || 0,
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
              total: Number(val.total) || 0
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
                customerName: customerName
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

  goBack() {
    this.router.navigate(['/app/inventory/solist']);
  }
}