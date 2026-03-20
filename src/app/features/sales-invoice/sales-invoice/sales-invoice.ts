import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { CompanyService } from '../../company/services/company.service';
import { environment } from '../../../enviornments/environment';
import { MatDialog } from '@angular/material/dialog';
import { InventoryService } from '../../inventory/service/inventory.service';
import { NotificationService } from '../../shared/notification.service';
import { ProductSelectionDialogComponent } from '../../../shared/components/product-selection-dialog/product-selection-dialog';
import { BatchSelectionDialogComponent } from '../../../shared/components/batch-selection-dialog/batch-selection-dialog';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { StatusDialogComponent } from '../../../shared/components/status-dialog-component/status-dialog-component';
import { QuickPaymentDialogComponent } from '../../../shared/components/quick-payment-dialog/quick-payment-dialog';
import { SaleOrderService } from '../../inventory/service/saleorder.service';
import { FinanceService } from '../../finance/service/finance.service';
import { AuthService } from '../../../core/services/auth.service';
import { customerService } from '../../master/customer-component/customer.service';
import { Observable, map, startWith } from 'rxjs';
import { FormControl } from '@angular/forms';

@Component({
  selector: 'app-sales-invoice',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MaterialModule],
  templateUrl: './sales-invoice.html',
  styleUrl: './sales-invoice.scss',
})
export class SalesInvoice implements OnInit {
  private fb = inject(FormBuilder);
  private companyService = inject(CompanyService);
  private dialog = inject(MatDialog);
  private inventoryService = inject(InventoryService);
  private notification = inject(NotificationService);
  private soService = inject(SaleOrderService);
  private financeService = inject(FinanceService);
  private authService = inject(AuthService);
  private customerService = inject(customerService);

  signatureImageUrl: string | null = null;
  isSaving = false;
  
  customers: any[] = [];
  filteredCustomers!: Observable<any[]>;
  customerSearchCtrl = new FormControl<any>('');

  invoiceForm = this.fb.group({
    documentType: ['Tax Invoice'], // 'Tax Invoice' or 'Bill of Supply'
    companyName: [''],
    companyAddress: [''],
    companyGSTIN: [''],
    companyPAN: [''],
    companyCIN: [''],
    authorizedSignatoryName: [''],
    
    orderId: ['OD' + Math.floor(Math.random() * 1000000000000)],
    orderDate: [new Date()],
    invoiceNo: ['INV-' + Math.floor(Math.random() * 10000).toString().padStart(4, '0')],
    invoiceDate: [new Date()],
    
    customerName: ['', Validators.required],
    customerPhone: ['', Validators.required],
    customerId: [0], // Cash Customer by default
    billingAddress: [''],
    shippingAddress: [''],
    customerPAN: [''],

    // GTA / Transport Details
    isTransportEnabled: [false],
    natureOfTransaction: ['INTRA'],
    natureOfSupply: ['Service'],
    grossWeight: [''],
    registrationNo: [''], // Vehicle No
    placeOfOrigin: [''],
    destination: [''],
    
    items: this.fb.array([]),
    subTotal: [{ value: 0, disabled: true }],
    totalTax: [{ value: 0, disabled: true }],
    total: [{ value: 0, disabled: true }]
  });

  constructor() {
    this.addItem();
  }

  ngOnInit(): void {
    this.loadCompanyProfile();
    this.loadCustomers();
    
    // Listen for Document Type changes
    this.invoiceForm.get('documentType')?.valueChanges.subscribe(val => {
      this.items.controls.forEach(control => {
        const taxCtrl = control.get('taxRate');
        if (val === 'Bill of Supply') {
          taxCtrl?.setValue(0);
          taxCtrl?.disable();
        } else {
          taxCtrl?.enable();
        }
        this.update(this.items.controls.indexOf(control));
      });
    });
  }

  loadCustomers(): void {
    this.customerService.getAllCustomers().subscribe((res: any) => {
      this.customers = res;
      this.filteredCustomers = this.customerSearchCtrl.valueChanges.pipe(
        startWith(''),
        map(value => {
          const name = typeof value === 'string' ? value : value?.customerName;
          return name ? this._filterCustomers(name) : this.customers.slice();
        })
      );
    });
  }

  private _filterCustomers(name: string): any[] {
    const filterValue = name.toLowerCase();
    return this.customers.filter(c => 
      (c.customerName || '').toLowerCase().includes(filterValue) || 
      (c.phone || '').includes(filterValue)
    );
  }

  displayCustomerFn(customer: any): string {
    return customer && customer.customerName ? customer.customerName : '';
  }

  onCustomerSelected(event: any): void {
    const customer = event.option.value;
    this.invoiceForm.patchValue({
      customerId: customer.id,
      customerName: customer.customerName,
      customerPhone: customer.phone,
      billingAddress: customer.billingAddress,
      shippingAddress: customer.shippingAddress
    });
  }

  loadCompanyProfile(): void {
    this.companyService.getCompanyProfile().subscribe({
      next: (profile) => {
        if (profile) {
          const fullAddress = `${profile.address.addressLine1}, ${profile.address.addressLine2 ? profile.address.addressLine2 + ', ' : ''}${profile.address.city}, ${profile.address.state} - ${profile.address.pinCode}`;
          
          // Extract PAN from GSTIN (Indian standard: chars 3 to 12)
          let pan = '';
          if (profile.gstin && profile.gstin.length >= 12) {
            pan = profile.gstin.substring(2, 12);
          }

          // Fetch Default Signatory
          const signatory = profile.authorizedSignatories?.find(s => s.isDefault) || profile.authorizedSignatories?.[0];
          if (signatory?.signatureImageUrl) {
            if (signatory.signatureImageUrl.startsWith('http')) {
              this.signatureImageUrl = signatory.signatureImageUrl;
            } else {
              const cleanUrl = signatory.signatureImageUrl.startsWith('/') ? signatory.signatureImageUrl.substring(1) : signatory.signatureImageUrl;
              this.signatureImageUrl = `${environment.CompanyRootUrl}/${cleanUrl}`;
            }
          }

          this.invoiceForm.patchValue({
            companyName: profile.name,
            companyAddress: fullAddress,
            companyGSTIN: profile.gstin,
            companyPAN: pan,
            companyCIN: profile.registrationNumber,
            authorizedSignatoryName: signatory?.personName || profile.name
          });
        }
      },
      error: (err) => console.error('Error loading company profile:', err)
    });
  }

  get items(): FormArray {
    return this.invoiceForm.get('items') as FormArray;
  }

  createItem() {
    return this.fb.group({
      description: ['', Validators.required],
      sacHsn: [''],
      qty: [1, [Validators.required, Validators.min(0.01)]],
      availableStock: [0], // Tracks available stock for this batch
      unitPrice: [0, Validators.required], // Inclusive of Tax
      discount: [0],
      taxRate: [{ 
        value: this.invoiceForm?.get('documentType')?.value === 'Bill of Supply' ? 0 : 18, 
        disabled: this.invoiceForm?.get('documentType')?.value === 'Bill of Supply' 
      }], // Percentage
      taxableValue: [{ value: 0, disabled: true }],
      taxAmount: [{ value: 0, disabled: true }],
      amount: [{ value: 0, disabled: true }], // Gross amount
      
      // Hidden Backend Fields
      productId: [null, Validators.required],
      warehouseId: [null],
      rackId: [null],
      mfgDate: [null],
      expDate: [null],
      unit: ['PCS']
    });
  }

  addItem(): void {
    this.items.push(this.createItem());
  }

  removeItem(i: number): void {
    this.items.removeAt(i);
    this.calculate();
  }

  update(i: number): void {
    const row = this.items.at(i);
    const qty = row.get('qty')?.value ?? 0;
    const unitPrice = row.get('unitPrice')?.value ?? 0;
    const discount = row.get('discount')?.value ?? 0;
    const taxRate = row.get('taxRate')?.value ?? 0;

    // Gross Amount (Price * Qty)
    const grossAmount = qty * unitPrice;
    
    // Total after discount
    const amountAfterDiscount = grossAmount - discount;
    
    // Calculate Taxable Value (Reverse from inclusive price)
    // Formula: Total / (1 + TaxRate/100)
    const taxableValue = amountAfterDiscount / (1 + (taxRate / 100));
    const taxAmount = amountAfterDiscount - taxableValue;

    row.get('taxableValue')?.setValue(Number(taxableValue.toFixed(2)), { emitEvent: false });
    row.get('taxAmount')?.setValue(Number(taxAmount.toFixed(2)), { emitEvent: false });
    row.get('amount')?.setValue(Number(amountAfterDiscount.toFixed(2)), { emitEvent: false });
    
    this.calculate();
  }

  calculate(): void {
    let subTotal = 0;
    let totalTax = 0;
    let total = 0;

    this.items.controls.forEach(control => {
      subTotal += control.get('taxableValue')?.value ?? 0;
      totalTax += control.get('taxAmount')?.value ?? 0;
      total += control.get('amount')?.value ?? 0;
    });

    this.invoiceForm.get('subTotal')?.setValue(Number(subTotal.toFixed(2)));
    this.invoiceForm.get('totalTax')?.setValue(Number(totalTax.toFixed(2)));
    this.invoiceForm.get('total')?.setValue(Number(total.toFixed(2)));
  }

  openProductPopup(i: number): void {
    const dialogRef = this.dialog.open(ProductSelectionDialogComponent, {
      width: '1250px',
      maxWidth: '96vw',
      data: { allowOutOfStock: false }
    });

    dialogRef.afterClosed().subscribe((selectedProducts: any[]) => {
      // If single selection returned
      const product = Array.isArray(selectedProducts) ? selectedProducts[0] : selectedProducts;
      if (product) {
        this.selectProductItem(i, product);
      }
    });
  }

  private selectProductItem(index: number, product: any): void {
    const row = this.items.at(index);
    const productName = product.productName || product.name || '';
    const productId = product.id || product.productId;

    this.inventoryService.getCurrentStock('', '', 0, 100, productName).subscribe((res: any) => {
      const itemsArray = res?.data?.items || res?.items || res?.Items || res?.data?.Items || [];
      const productItem = itemsArray.find((x: any) => {
        const xId = String(x.productId || x.ProductId || x.id || x.Id).toLowerCase();
        const targetId = String(productId).toLowerCase();
        return xId === targetId || (x.productName === productName && productName.length > 0);
      });

      if (!productItem || productItem.availableStock <= 0) {
        this.notification.showStatus(false, `Attention: Product "${productName}" is OUT OF STOCK and cannot be added to the invoice.`);
        return;
      }

      // Handle Batch Selection
      const allBatches = (productItem.history || []).map((h: any) => ({
        grnNumber: h.grnNumber || 'N/A',
        manufacturingDate: h.manufacturingDate,
        expiryDate: h.expiryDate,
        availableStock: h.availableQty ?? h.AvailableQty ?? 0,
        warehouseName: h.warehouseName, warehouseId: productItem.warehouseId,
        rackName: h.rackName, rackId: productItem.rackId,
        isExpired: this.checkIfExpired(h.expiryDate)
      }));

      const selectableBatches = allBatches.filter((b: any) => b.availableStock > 0 || b.isExpired);

      if (selectableBatches.length > 0) {
        const batchDialogRef = this.dialog.open(BatchSelectionDialogComponent, {
          width: '620px',
          data: {
            productName: productName,
            batches: selectableBatches,
            validCount: selectableBatches.filter((b: any) => !b.isExpired && b.availableStock > 0).length
          }
        });

        batchDialogRef.afterClosed().subscribe((selectedBatch: any) => {
          if (selectedBatch) {
            row.patchValue({
              productId: productId,
              warehouseId: selectedBatch.warehouseId,
              rackId: selectedBatch.rackId,
              mfgDate: selectedBatch.manufacturingDate,
              expDate: selectedBatch.expiryDate,
              unit: product.unit || productItem.unit || 'PCS',
              description: `${productName} (Batch: ${selectedBatch.grnNumber || 'N/A'})`,
              sacHsn: product.hsnCode || productItem.hsnCode || product.sacHsn || '',
              unitPrice: product.saleRate || product.rate || product.salePrice || product.price || product.mrp || 0,
              taxRate: this.invoiceForm.get('documentType')?.value === 'Bill of Supply' ? 0 : (product.gstPercent || product.defaultGst || 18),
              availableStock: selectedBatch.availableStock || 0
            });
            
            // Add max validation to qty based on available stock
            const qtyControl = this.items.at(index).get('qty');
            qtyControl?.setValidators([Validators.required, Validators.min(0.01), Validators.max(selectedBatch.availableStock || 0)]);
            qtyControl?.updateValueAndValidity();

            this.update(index);
          }
        });
      } else {
        // No batches, just fill basic info
        row.patchValue({
          productId: productId,
          unit: product.unit || productItem.unit || 'PCS',
          description: productName,
          sacHsn: product.hsnCode || product.sacHsn || '',
          unitPrice: product.saleRate || product.rate || product.salePrice || product.price || product.mrp || 0,
          taxRate: this.invoiceForm.get('documentType')?.value === 'Bill of Supply' ? 0 : (product.gstPercent || product.defaultGst || 18),
          availableStock: product.availableStock || product.currentStock || 0
        });

        // Add max validation to qty based on available stock
        const qtyControl = this.items.at(index).get('qty');
        const maxStock = product.availableStock || product.currentStock || 0;
        qtyControl?.setValidators([Validators.required, Validators.min(0.01), Validators.max(maxStock)]);
        qtyControl?.updateValueAndValidity();

        this.update(index);
      }
    });
  }

  saveAndPrint(): void {
    if (this.invoiceForm.invalid) {
      this.notification.showStatus(false, 'Please fill all required fields before printing.');
      this.invoiceForm.markAllAsTouched();
      return;
    }

    // 1. Confirmation Dialog
    const confirmRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Confirm Tax Invoice',
        message: 'Are you sure you want to generate this Tax Invoice? This will deduct stock from the respective batches.',
        confirmText: 'Yes, Save & Deduct',
        confirmColor: 'primary'
      }
    });

    confirmRef.afterClosed().subscribe(result => {
      if (result) {
        this.executeSave();
      }
    });
  }

  private executeSave(): void {
    this.isSaving = true;
    const formVal = this.invoiceForm.getRawValue();
    
    const payload = {
      customerId: formVal.customerId || 0,
      soDate: formVal.invoiceDate,
      expectedDeliveryDate: formVal.invoiceDate,
      remarks: `Tax Invoice generated from Designer. Invoice No: ${formVal.invoiceNo}`,
      subTotal: formVal.subTotal,
      totalTax: formVal.totalTax,
      grandTotal: formVal.total,
      taxType: 'local',
      status: 'Confirmed',
      createdBy: this.authService.getUserName(),
      isQuick: true,
      items: formVal.items.map((item: any) => ({
        productId: item.productId,
        productName: item.description,
        qty: item.qty,
        unit: item.unit || 'PCS',
        rate: item.unitPrice,
        discountPercent: 0,
        gstPercent: item.taxRate,
        taxAmount: item.taxAmount,
        total: item.amount,
        warehouseId: item.warehouseId,
        rackId: item.rackId,
        manufacturingDate: item.mfgDate,
        expiryDate: item.expDate
      }))
    };

    this.soService.saveSaleOrder(payload).subscribe({
      next: (res: any) => {
        this.isSaving = false;
        const generatedNo = res.soNumber || res.SONumber;
        if (generatedNo) {
          this.invoiceForm.get('invoiceNo')?.setValue(generatedNo);
        }
        
        // 2. Success Dialog
        const statusRef = this.dialog.open(StatusDialogComponent, {
          width: '380px',
          data: {
            title: 'Success',
            message: 'Invoice saved and stock deducted successfully!',
            isSuccess: true,
            confirmText: 'OK'
          }
        });

        // 3. Optional Payment Dialog after Success Dialog close
        statusRef.afterClosed().subscribe(() => {
          const paymentRef = this.dialog.open(QuickPaymentDialogComponent, {
            width: '450px',
            disableClose: true,
            data: {
              amount: formVal.total,
              customerId: formVal.customerId || 0,
              customerName: formVal.customerName,
              invoiceNo: generatedNo
            }
          });

          paymentRef.afterClosed().subscribe((isPaid) => {
            // Trigger print preview regardless of paid or not (as per business flow)
            setTimeout(() => window.print(), 300);
          });
        });
      },
      error: (err) => {
        this.isSaving = false;
        this.notification.showStatus(false, 'Failed to save invoice. ' + (err.error?.message || err.message));
      }
    });
  }

  private checkIfExpired(expDate: any): boolean {
    if (!expDate) return false;
    const exp = new Date(expDate);
    exp.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return exp <= today;
  }
}
