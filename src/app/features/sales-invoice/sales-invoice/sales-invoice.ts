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
  
  signatureImageUrl: string | null = null;

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
      qty: [1, Validators.required],
      unitPrice: [0, Validators.required], // Inclusive of Tax
      discount: [0],
      taxRate: [18], // Percentage
      taxableValue: [{ value: 0, disabled: true }],
      taxAmount: [{ value: 0, disabled: true }],
      amount: [{ value: 0, disabled: true }] // Gross amount
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
      width: '1100px',
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
              description: `${productName} (Batch: ${selectedBatch.grnNumber || 'N/A'})`,
              sacHsn: product.hsnCode || productItem.hsnCode || product.sacHsn || '',
              unitPrice: product.saleRate || product.rate || product.salePrice || product.price || product.mrp || 0,
              taxRate: product.gstPercent || product.defaultGst || 18
            });
            this.update(index);
          }
        });
      } else {
        // No batches, just fill basic info
        row.patchValue({
          description: productName,
          sacHsn: product.hsnCode || product.sacHsn || '',
          unitPrice: product.saleRate || product.rate || product.salePrice || product.price || product.mrp || 0,
          taxRate: product.gstPercent || product.defaultGst || 18
        });
        this.update(index);
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
