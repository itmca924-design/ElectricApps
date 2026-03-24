import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs'; // Import forkJoin for parallel API calls

import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core'; // CDR add kiya
import { FormGroup, FormBuilder, Validators, FormArray, FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { MaterialModule } from '../../../../shared/material/material/material-module';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { PurchaseReturnService } from '../services/purchase-return.service';
import { StatusDialogComponent } from '../../../../shared/components/status-dialog-component/status-dialog-component';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { MatDialog } from '@angular/material/dialog';
import { CompanyService } from '../../../company/services/company.service';
import { LoadingService } from '../../../../core/services/loading.service';
import { POService } from '../../service/po.service';
import { LocationService } from '../../../master/locations/services/locations.service';
import { InventoryService } from '../../service/inventory.service';
import { LocationTrackerDialogComponent } from '../location-tracker-dialog/location-tracker-dialog.component';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { environment } from '../../../../enviornments/environment';

@Component({
  selector: 'app-purchase-return-form',
  standalone: true,
  imports: [CommonModule, MaterialModule, ReactiveFormsModule, FormsModule],
  providers: [DatePipe, CurrencyPipe],
  templateUrl: './purchase-return-form.html',
  styleUrl: './purchase-return-form.scss',
})
export class PurchaseReturnForm implements OnInit {
  returnForm!: FormGroup;
  suppliers: any[] = [];
  displayedColumns: string[] = ['product', 'rejectedQty', 'returnQty', 'rate', 'discount', 'gst', 'taxAmount', 'total', 'actions'];
  tableDataSource: any[] = [];
  minDate: Date = new Date();
  isQuick: boolean = false;
  isPolicyViolated: boolean = false;
  isFromDashboard: boolean = false;

  viewLiveLocation(item: any) {
    if (!item) return;

    // Fetch full warehouse info to get description if possible
    this.locationService.getWarehouses().subscribe((warehouses: any[]) => {
      const warehouse = warehouses.find((w: any) => w.name === item.warehouseName);

      this.dialog.open(LocationTrackerDialogComponent, {
        width: '500px',
        data: {
          warehouseName: item.warehouseName,
          rackName: item.rackName,
          description: warehouse?.description || 'No detailed instructions available for this location.',
          productId: item.productId
        },
        panelClass: 'live-location-dialog'
      });
    });
  }

  // CDR inject kiya taaki table bind ho sake [cite: 2026-02-03]
  private cdr = inject(ChangeDetectorRef);
  private inventoryService = inject(InventoryService);

  constructor(
    private fb: FormBuilder,
    private prService: PurchaseReturnService,
    private snackBar: MatSnackBar,
    public router: Router,
    private dialog: MatDialog,
    private companyService: CompanyService,
    private loadingService: LoadingService,
    private datePipe: DatePipe,
    private currencyPipe: CurrencyPipe,
    private route: ActivatedRoute,
    private poService: POService,
    private locationService: LocationService
  ) { }

  ngOnInit(): void {
    this.isQuick = (this.route as any).snapshot.data['isQuick'] || false;
    this.initForm();
    this.GetSuppliersForPurchaseReturnAndAutoSelect();
  }

  GetSuppliersForPurchaseReturnAndAutoSelect() {
    this.prService.GetSuppliersForPurchaseReturnAsync().subscribe({
      next: (data) => {
        this.suppliers = data || [];
        this.cdr.detectChanges();

        // Check if supplierId is passed via queryParams (from PO List Red Truck)
        this.route.queryParams.subscribe(params => {
          let sId = params['supplierId'];
          const poId = params['poId'];

          if (poId) {
            this.isFromDashboard = true;
            this.returnForm.get('returnDate')?.disable();
          }

          // If supplierId is "0" or missing but poId exists, fetch PO to get supplierId
          if ((!sId || sId === '0') && poId) {
            console.log('[PurchaseReturn] Supplier ID missing, fetching from PO:', poId);
            this.poService.getById(poId).subscribe({
              next: (po: any) => {
                const fetchedSId = po.supplierId || po.partyId;
                if (fetchedSId) {
                  this.autoSelectSupplier(fetchedSId);
                }
              }
            });
          } else if (sId && sId !== '0') {
            this.autoSelectSupplier(Number(sId));
          }
        });
      },
      error: (err) => console.error("Error loading suppliers", err)
    });
  }

  private autoSelectSupplier(sId: number) {
    console.log('[PurchaseReturn] Auto-selecting supplierId:', sId);
    this.returnForm.get('supplierId')?.setValue(sId);
    this.returnForm.get('supplierId')?.disable(); // Lock the supplier to prevent mismatch
    this.onSupplierChange(sId);
  }

  initForm() {
    this.returnForm = this.fb.group({
      supplierId: ['', Validators.required],
      returnDate: [new Date(), Validators.required],
      remarks: ['', Validators.required],
      items: this.fb.array([])
    });
  }

  get items() {
    return this.returnForm.get('items') as FormArray;
  }


  receivedStockItems: any[] = []; // Raw flat list
  groupedReceivedStock: any[] = []; // Hierarchy: GRN -> Items
  filteredGroupedStock: any[] = []; // For Search results
  stockSearchText: string = '';
  expandedGrn: string | null = null; // Single expand behavior
  isLoadingStock: boolean = false;
  selectedSupplierName: string = ''; // Store selected name directly

  onSupplierChange(supplierId: number) {
    if (!supplierId) return;

    // Capture Name Immediately on Selection
    const selected = this.suppliers.find(s => s.id == supplierId);
    // FIX: HTML uses 'name', not 'supplierName'
    this.selectedSupplierName = selected ? (selected.name || selected.supplierName) : '';
    console.log('[PurchaseReturn] Selected Supplier:', this.selectedSupplierName);

    this.items.clear();
    this.tableDataSource = [];
    this.receivedStockItems = [];
    this.groupedReceivedStock = [];
    this.filteredGroupedStock = [];
    this.expandedGrn = null;
    this.isLoadingStock = true;

    this.isLoadingStock = true;

    // Use forkJoin to load both rejected items and regular stock in parallel
    forkJoin({
      rejected: this.prService.getRejectedItems(supplierId),
      received: this.prService.getReceivedStock(supplierId)
    }).subscribe({
      next: (res) => {
        // Map rejected items with specific flags
        const rejected = (res.rejected || []).map((item: any) => ({
          ...item,
          availableQty: item.rejectedQty ?? item.AvailableQty ?? 0,
          isRejected: true,
          itemType: 'Rejected'
        }));

        // Map regular received stock
        const received = (res.received || []).map((item: any) => ({
          ...item,
          isRejected: false,
          itemType: 'Received'
        }));

        const combined = [...rejected, ...received];
        this.receivedStockItems = combined;
        this.isPolicyViolated = combined.some(i => !i.isReturnable && !i.IsReturnable);

        this.groupStockByGrn();
        this.isLoadingStock = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoadingStock = false;
        this.cdr.detectChanges();
      }
    });
  }

  groupStockByGrn() {
    const groups: { [key: string]: any } = {};

    // Filter out items without a product ID or name to avoid empty UI rows
    const validItems = this.receivedStockItems.filter(item => item && item.productId);

    validItems.forEach(item => {
      // Normalize properties (handle both PascalCase and camelCase from API)
      const ref = item.grnRef || item.GrnRef || 'N/A';
      const pName = item.productName || item.ProductName || '';
      const avail = item.availableQty ?? item.AvailableQty ?? 0;
      const rate = item.rate ?? item.Rate ?? 0;
      let rDate = item.receivedDate || item.ReceivedDate || item.podate || new Date();

      // UTC to Local Conversion: Append 'Z' if missing to force UTC interpretation
      if (typeof rDate === 'string' && !rDate.includes('Z') && !rDate.includes('+')) {
        rDate = rDate.replace(' ', 'T') + '+05:30';
      }

      if (!groups[ref]) {
        groups[ref] = {
          grnRef: ref,
          receivedDate: rDate,
          items: []
        };
      }

      // Update item with normalized values for UI binding
      item.grnRef = ref;
      item.productName = pName.trim() === '' ? "Product-" + item.productId.substring(0, 8) : pName;
      item.availableQty = avail;
      item.currentStock = item.currentStock ?? item.CurrentStock ?? 0;
      item.rate = rate;
      item.gstPercent = item.gstPercent ?? item.GstPercent ?? 0;
      item.discountPercent = item.discountPercent ?? item.DiscountPercent ?? 0;
      item.receivedDate = rDate;
      item.warehouseName = item.warehouseName ?? item.WarehouseName ?? 'N/A';
      item.rackName = item.rackName ?? item.RackName ?? 'N/A';
      item.isReturnable = item.isReturnable ?? item.IsReturnable ?? true;
      item.mfgDate = item.mfgDate || item.MfgDate || item.manufacturingDate;
      item.expDate = item.expDate || item.ExpDate || item.expiryDate;
      
      // Front-end validation for 72-hour window [cite: 2026-03-16]
      const now = new Date();
      const recDate = new Date(rDate);
      const diffMs = now.getTime() - recDate.getTime();
      const diffHrs = diffMs / (1000 * 60 * 60);
      const calcRemainingHrs = 72 - diffHrs;
      
      // If backend didn't send it or sent 0, use front-end calculation
      const backendHrs = item.returnWindowRemainingHours ?? item.ReturnWindowRemainingHours ?? 0;
      item.remainingHours = backendHrs > 0 ? backendHrs : (calcRemainingHrs > 0 ? calcRemainingHrs : 0);
      
      // Sync isReturnable with calculation
      if (item.remainingHours <= 0) {
        item.isReturnable = false;
      }

      item.selected = this.isItemInGrid(item);
      groups[ref].items.push(item);
    });

    // Sorting: Primary sorting by Received Date (DESC), secondary by GRN Ref (DESC)
    this.groupedReceivedStock = Object.values(groups).sort((a: any, b: any) => {
      const dateB = new Date(b.receivedDate).getTime();
      const dateA = new Date(a.receivedDate).getTime();

      if (dateB !== dateA) return dateB - dateA;
      return b.grnRef.localeCompare(a.grnRef);
    });

    this.filteredGroupedStock = [...this.groupedReceivedStock];
    this.cdr.detectChanges();
  }

  isItemInGrid(item: any): boolean {
    return this.items.controls.some(c =>
      c.get('productId')?.value === item.productId &&
      c.get('grnRef')?.value === item.grnRef &&
      c.get('itemType')?.value === item.itemType
    );
  }

  filterStock() {
    const search = this.stockSearchText.toLowerCase().trim();
    if (!search) {
      this.filteredGroupedStock = [...this.groupedReceivedStock];
    } else {
      this.filteredGroupedStock = this.groupedReceivedStock.filter(g =>
        g.grnRef.toLowerCase().includes(search) ||
        g.items.some((i: any) => i.productName.toLowerCase().includes(search))
      );
    }
    this.cdr.detectChanges();
  }

  selectAllFiltered() {
    if (this.filteredGroupedStock.length === 0) return;

    this.filteredGroupedStock.forEach(group => {
      group.items.forEach((item: any) => {
        // Skip expired items to avoid flooding the user with popups
        if (!item.selected && item.isReturnable) {
          item.selected = true;
          this.onItemToggle(item);
        }
      });
    });
    this.cdr.detectChanges();
  }

  toggleGrn(grnRef: string) {
    if (this.expandedGrn === grnRef) {
      this.expandedGrn = null; // Collapse if already open
    } else {
      this.expandedGrn = grnRef; // Expand new one, automatically collapses old one
    }
    this.cdr.detectChanges();
  }

  onItemToggle(item: any) {
    if (!item.isReturnable) {
        item.selected = false;
        this.openDialog(false, `Return Not Allowed: GRN (${item.grnRef}) was received more than 3 days ago. Returns are only accepted within 72 hours of receipt.`);
        this.cdr.detectChanges();
        return;
    }

    if (item.selected) {
      // Add to grid using its specific type (Rejected/Received)
      const isDuplicate = this.addReturnItem(item, item.itemType);
      if (isDuplicate) {
        this.openDialog(false, `${item.productName} (${item.itemType}) is already added.`);
        item.selected = true;
      }
    } else {
      // Remove specific type instance from grid
      const index = this.items.controls.findIndex(c =>
        c.get('productId')?.value === item.productId &&
        c.get('grnRef')?.value === item.grnRef &&
        c.get('itemType')?.value === item.itemType
      );
      if (index !== -1) {
        this.items.removeAt(index);
        this.tableDataSource = [...this.items.controls];
      }
    }
    this.cdr.detectChanges();
  }

  addReturnItem(item: any, type: string) {
    const existingIndex = this.items.controls.findIndex(c =>
      c.get('productId')?.value === item.productId &&
      c.get('grnRef')?.value === item.grnRef &&
      c.get('itemType')?.value === type
    );

    if (existingIndex !== -1) {
      return true; // Is duplicate
    }

    const maxQty = item.availableQty || item.rejectedQty || 0;
    // Logical Fix: Default return qty should be min of Received Qty and Physical Stock [cite: 2026-02-23]
    const physicalStock = item.currentStock || 0;
    const initialReturnQty = Math.max(0, Math.min(maxQty, physicalStock));

    const group = this.fb.group({
      productId: [item.productId],
      productName: [item.productName],
      grnRef: [item.grnRef],
      maxQty: [maxQty],
      returnQty: [initialReturnQty, [Validators.required, Validators.min(0), Validators.max(Math.min(maxQty, physicalStock))]],
      rate: [item.rate],
      currentStock: [physicalStock],
      discountPercent: [item.discountPercent || 0],
      gstPercent: [item.gstPercent || 0],
      warehouseName: [item.warehouseName || 'N/A'],
      rackName: [item.rackName || 'N/A'],
      taxAmount: [0],
      total: [0],
      limit: [Math.min(maxQty, physicalStock)],
      itemType: [type],
      warehouseId: [item.warehouseId || item.WarehouseId || null],
      rackId: [item.rackId || item.RackId || null],
      mfgDate: [item.mfgDate],
      expDate: [item.expDate]
    });

    this.items.push(group);
    this.tableDataSource = [...this.items.controls];

    // Calculate total immediately
    this.calculateTotal(this.items.length - 1);

    this.cdr.detectChanges();
    return false; // Not a duplicate
  }

  calculateTotal(index: number) {
    const item = this.items.at(index);
    const qty = item.get('returnQty')?.value || 0;
    const rate = item.get('rate')?.value || 0;
    const discPer = item.get('discountPercent')?.value || 0;
    const gstPer = item.get('gstPercent')?.value || 0;

    const baseAmount = qty * rate;
    const discountAmt = baseAmount * (discPer / 100);
    const taxableAmount = baseAmount - discountAmt;
    const taxAmt = taxableAmount * (gstPer / 100);
    const total = taxableAmount + taxAmt;

    item.get('taxAmount')?.setValue(taxAmt);
    item.get('total')?.setValue(total);
    this.cdr.detectChanges();
  }

  onSubmit() {
    if (this.returnForm.invalid) return;

    const rawData = this.returnForm.getRawValue();
    const itemsToReturn = rawData.items.filter((item: any) => item.returnQty > 0);

    if (itemsToReturn.length === 0) {
      this.openDialog(false, 'At least one item must be returned.');
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const returnDate = new Date(rawData.returnDate);
    returnDate.setHours(0, 0, 0, 0);

    if (returnDate < today) {
      this.openDialog(false, 'Return Date cannot be in the past.');
      return;
    }

    const hasMixed = this.hasMixedTypes();
    const title = hasMixed ? '⚠️ Mixed Items Warning' : 'Confirm Purchase Return';
    const message = hasMixed
      ? 'You have selected both REJECTED items and NORMAL stock. This is unusual. Are you sure you want to return both together?'
      : 'Are you sure you want to save this Purchase Return? This will generate a Debit Note.';

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '450px',
      data: {
        title: title,
        message: message,
        confirmText: 'Yes, Save Return',
        confirmColor: hasMixed ? 'warn' : 'primary'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        const payload = {
          supplierId: rawData.supplierId,
          returnDate: rawData.returnDate,
          remarks: rawData.remarks,
          items: itemsToReturn.map((item: any) => ({
            productId: item.productId,
            productName: item.productName,
            grnRef: item.grnRef,
            returnQty: item.returnQty,
            rate: item.rate,
            discountPercent: item.discountPercent,
            gstPercent: item.gstPercent,
            taxAmount: item.taxAmount,
            totalAmount: item.total,
            itemType: item.itemType, 
            isQuick: this.isQuick,
            warehouseId: item.warehouseId,
            rackId: item.rackId,
            mfgDate: item.mfgDate,
            expDate: item.expDate,
            createdBy: localStorage.getItem('email') || 'admin@admin.com',
            modifiedBy: localStorage.getItem('email') || 'admin@admin.com'
          }))
        };
        (payload as any).isQuick = this.isQuick;
        (payload as any).createdBy = localStorage.getItem('email') || 'admin@admin.com';
        (payload as any).modifiedBy = localStorage.getItem('email') || 'admin@admin.com';

        // Use the correctly stored name or fallback
        const supplierName = this.selectedSupplierName && this.selectedSupplierName.trim() !== ''
          ? this.selectedSupplierName
          : (this.suppliers.find(s => s.id == rawData.supplierId)?.name || 'Unknown Supplier');

        const totalQty = itemsToReturn.reduce((sum: number, item: any) => sum + Number(item.returnQty), 0);

        this.prService.savePurchaseReturn(payload).subscribe({
          next: (res) => {
            this.inventoryService.notifyInventoryChange();
            this.handleSuccess(res, res.returnNumber, res.id, supplierName, totalQty);
          },
          error: (err) => {
            this.cdr.detectChanges();
            this.openDialog(false, err.error?.message || 'An error occurred while saving the data.');
          }
        });
      }
    });
  }

  private handleSuccess(res: any, returnNo: string, returnId: number, supplierName: string, totalQty: number) {
    this.cdr.detectChanges();
    const dialogRef = this.dialog.open(StatusDialogComponent, {
      width: '450px',
      disableClose: true,
      data: {
        isSuccess: true,
        message: this.isQuick 
            ? `Purchase Return ${res.returnNumber} created successfully. Stock & Ledger updated.`
            : `Purchase Return ${res.returnNumber} created successfully. Stock & Ledger updated.\n\nOutward Gate Pass can be generated from the Purchase Return dashboard.`,
        actions: [
          { label: this.isQuick ? 'Go to Quick Purchase' : 'Go to Purchase Returns', role: 'ok' }
        ]
      }
    });

    dialogRef.afterClosed().subscribe(() => {
      const target = this.isQuick ? '/app/quick-inventory/purchase/list' : '/app/inventory/purchase-return';
      this.router.navigate([target]);
    });
  }

  private navigateToGatePass(returnNo: string, returnId: number, supplierName: string, totalQty: number) {
    this.loadingService.setLoading(true);
    setTimeout(() => {
      this.router.navigate(['/app/inventory/gate-pass/outward'], {
        queryParams: {
          refNo: returnNo,
          refId: returnId,
          type: 'purchase-return',
          partyName: supplierName,
          qty: totalQty
        }
      });
    }, 300);
  }

  private printAfterSave(returnId: number, existingWindow: Window, callback: () => void) {
    this.loadingService.setLoading(true);
    this.prService.getPurchaseReturnById(returnId).subscribe({
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

  private triggerPrintWithWindow(data: any, company: any, printWindow: Window) {
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
    const taxAmount = this.currencyPipe.transform(data.taxAmount || 0, 'INR');
    const grandTotal = this.currencyPipe.transform(data.grandTotal || 0, 'INR');
    const totalInWords = this.numberToWords(Math.round(data.grandTotal || 0));

    const itemsRows = data.items.map((item: any, index: number) => `
            <tr>
                <td style="text-align: center;">${index + 1}</td>
                <td>${item.productName}</td>
                <td style="text-align: center;">${item.returnQty}</td>
                <td style="text-align: right;">${this.currencyPipe.transform(item.rate, 'INR')}</td>
                <td style="text-align: center;">${item.discountPercent}%</td>
                <td style="text-align: center;">${item.gstPercent}%</td>
                <td style="text-align: right;">${this.currencyPipe.transform(item.totalAmount, 'INR')}</td>
            </tr>
        `).join('');

    const grnRef = data.items[0]?.grnRef || 'N/A';

    printWindow.document.open();
    printWindow.document.write(`
            <html>
                <head>
                    <title>Debit Note - ${data.returnNumber}</title>
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
                             <h2>PURCHASE RETURN (DEBIT NOTE)</h2>
                             <p>#${data.returnNumber}</p>
                             <div style="font-size: 13px; font-weight: 600; color: #6b7280; margin-top: 5px;">Date: ${returnDate}</div>
                        </div>
                    </div>
                    <div class="info-card">
                      <div class="info-group"><label>Supplier Name</label><div class="value">${data.supplierName}</div></div>
                      <div class="info-group"><label>Reference No (GRN)</label><div class="value">${grnRef}</div></div>
                      <div class="info-group"><label>Document Status</label><div class="value">${data.status}</div></div>
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
                            <div class="summary-row"><span class="label">Total Tax</span><span class="value">${taxAmount}</span></div>
                            <div class="summary-row grand-total"><span class="label">Grand Total</span><span class="value">${grandTotal}</span></div>
                        </div>
                    </div>
                    <div class="footer-note">
                        <div class="signature-box" style="text-align: left;"><p style="font-size: 11px; margin-bottom: 50px;">Received By / Supplier Signature</p><div class="signature-line" style="width: 180px;"></div></div>
                        <div class="signature-box"><p style="font-size: 11px; margin-bottom: 50px;">For ${companyName}</p><div class="signature-line"></div><label>Authorized Signatory</label></div>
                    </div>
                </body>
            </html>
        `);
    printWindow.document.close();
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

  openDialog(isSuccess: boolean, message: string) {
    this.dialog.open(StatusDialogComponent, {
      width: '400px',
      data: { isSuccess, message }
    });
  }

  getControl(element: any, controlName: string): FormControl {
    return element.get(controlName) as FormControl;
  }

  removeItem(index: number) {
    const itemToRemove = this.items.at(index).value;
    this.items.removeAt(index);
    this.tableDataSource = [...this.items.controls];

    // Update selection state specifically for this productId + grnRef + itemType combo
    const stockItem = this.receivedStockItems.find(i =>
      i.productId === itemToRemove.productId &&
      i.grnRef === itemToRemove.grnRef &&
      i.itemType === itemToRemove.itemType
    );
    if (stockItem) {
      stockItem.selected = false;
    }

    this.cdr.detectChanges();
  }

  hasMixedTypes(): boolean {
    const types = new Set(this.items.controls.map(c => c.get('itemType')?.value));
    return types.has('Rejected') && types.has('Received');
  }

  formatRemainingTime(hours: number): string {
    if (hours <= 0) return 'Expired';
    // Round to nearest hour for cleaner display as requested ("n hrs")
    const h = Math.round(hours);
    return `${h} hrs`;
  }
}



