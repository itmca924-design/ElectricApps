import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit, OnDestroy } from '@angular/core';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { FormGroup, FormBuilder, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { InventoryService } from '../service/inventory.service';
import { StatusDialogComponent } from '../../../shared/components/status-dialog-component/status-dialog-component';
import { MatDialog } from '@angular/material/dialog';
import { GrnSuccessDialogComponent } from '../grn-success-dialog/grn-success-dialog.component';
import { FinanceService } from '../../finance/service/finance.service';
import { LocationService } from '../../master/locations/services/locations.service';
import { Warehouse, Rack } from '../../master/locations/models/locations.model';
import { LoadingService } from '../../../core/services/loading.service';
import { DateHelper } from '../../../shared/models/date-helper';

@Component({
  selector: 'app-grn-form-component',
  standalone: true,
  imports: [CommonModule, MaterialModule, ReactiveFormsModule, FormsModule],
  templateUrl: './grn-form-component.html',
  styleUrl: './grn-form-component.scss',
})
export class GrnFormComponent implements OnInit, OnDestroy {
  grnForm!: FormGroup;
  items: any[] = [];
  poId: string = '';
  supplierId: number = 0;
  supplierName: string = '';
  isFromPopup: boolean = false;
  isViewMode: boolean = false;
  private dialog = inject(MatDialog);
  private financeService = inject(FinanceService);
  private locationService = inject(LocationService);
  private loadingService = inject(LoadingService);

  warehouses: Warehouse[] = [];
  racks: Rack[] = [];
  filteredRacksMap: { [productId: string]: Rack[] } = {};

  // Auto-save countdown (active only in gate pass flow)
  countdown: number = 30;
  private countdownInterval: any = null;
  showCountdown: boolean = false;
  isQuick: boolean = false;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private inventoryService: InventoryService
  ) {
    // Initialize form here IMMEDIATELY to prevent validator errors in template
    this.grnForm = this.fb.group({
      grnNumber: [{ value: 'AUTO-GEN', disabled: true }],
      receivedDate: [new Date(), Validators.required],
      supplierName: [{ value: '', disabled: true }],
      poNumber: [{ value: '', disabled: true }],
      gatePassNo: [{ value: '', disabled: true }],
      remarks: ['']
    });
  }

  ngOnInit(): void {
    this.isViewMode = this.router.url.includes('/view');

    // Read isQuick flag from route data (check current route + parent routes)
    let currentRoute = this.route;
    while (currentRoute) {
      if (currentRoute.snapshot.data['isQuick'] === true) {
        this.isQuick = true;
        break;
      }
      currentRoute = currentRoute.parent as any;
    }
    console.log('📍 GRN Form Init - isQuick:', this.isQuick, 'URL:', this.router.url);

    this.route.params.subscribe(params => {
      if (params['id']) {
        this.resetFormBeforeLoad();
        this.poId = params['id'].toString();
        if (this.isViewMode) {
          this.loadPOData("0", +this.poId); // View mode uses grnHeaderId
        } else {
          this.loadPOData(this.poId);
        }
      }
    });

    this.loadLocations();

    this.route.queryParams.subscribe(params => {
      if (params['poId']) {
        this.resetFormBeforeLoad();
        this.poId = params['poId'].toString();
        this.isFromPopup = true;
        // Check query params as fallback (for backward compatibility)
        if (params['isQuick']) {
          const isQuickParam = params['isQuick'] === 'true' || params['isQuick'] === true;
          console.log('📍 Query param isQuick:', isQuickParam);
          this.isQuick = this.isQuick || isQuickParam; // Merge with route data
        }

        if (params['poNo']) {
          this.grnForm.patchValue({ poNumber: params['poNo'] });
        }
        if (params['gatePassNo']) {
          this.grnForm.patchValue({ gatePassNo: params['gatePassNo'] });
          this.gatePassNo = params['gatePassNo'];
        }
        if (params['qty']) {
          this.gatePassQty = Number(params['qty']);
        }
        this.loadPOData(this.poId, null, this.gatePassNo);
      }
    });
  }

  gatePassQty: number | null = null;
  gatePassNo: string | null = null;

  private resetFormBeforeLoad() {
    this.items = [];
    if (this.grnForm) {
      this.grnForm.patchValue({ supplierName: '', poNumber: '' });
    }
  }

  initForm() {
    this.grnForm = this.fb.group({
      grnNumber: [{ value: 'AUTO-GEN', disabled: true }],
      receivedDate: [new Date(), Validators.required],
      supplierName: [{ value: '', disabled: true }],
      poNumber: [{ value: '', disabled: true }],
      gatePassNo: [{ value: '', disabled: true }],
      remarks: ['']
    });
  }

  loadLocations() {
    this.locationService.getWarehouses().subscribe(data => this.warehouses = data.filter(w => w.isActive));
    this.locationService.getRacks().subscribe(data => this.racks = data.filter(r => r.isActive));
  }

  onWarehouseChange(item: any) {
    this.filteredRacksMap[item.productId] = this.racks.filter(r => r.warehouseId === item.warehouseId);
    // Reset rack if it's not in the new filtered list
    if (item.rackId && !this.filteredRacksMap[item.productId].some(r => r.id === item.rackId)) {
      item.rackId = null;
    }
  }

  loadPOData(id: string, grnHeaderId: number | null = null, gatePassNo: string | null = null) {
    this.inventoryService.getPODataForGRN(id, grnHeaderId, gatePassNo).subscribe({
      next: (res) => {
        if (!res) return;
        console.log('pendingqtycheck:', res);

        // Capture supplier details for payment navigation
        this.supplierId = res.supplierId || res.SupplierId || 0;
        this.supplierName = res.supplierName || res.SupplierName || '';

        console.log('✅ PO Data Loaded. Supplier Info:', {
          id: this.supplierId,
          name: this.supplierName,
          originalRes: res
        });

        this.grnForm.patchValue({
          grnNumber: res.grnNumber || 'AUTO-GEN',
          poNumber: res.poNumber,
          supplierName: this.supplierName,
          remarks: res.remarks || ''
        });

        if (res.items && res.items.length > 0) {
          this.mapItems(res.items);
        }
        this.forceLockTable();
      }
    });
  }

  forceLockTable() {
    if (this.isViewMode) {
      this.grnForm.disable();
      this.cdr.detectChanges();
    }
  }

  mapItems(incomingItems: any[]) {
    this.items = incomingItems.map((item: any) => {
      const ordered = Number(item.orderedQty || item.OrderedQty || 0);
      const acceptedSoFar = Number(item.acceptedQty || item.AcceptedQty || 0);

      let pending = Number(item.pendingQty || item.PendingQty || 0);
      if (pending === 0 && acceptedSoFar < ordered) {
        pending = ordered - acceptedSoFar;
      }

      const rate = Number(item.unitRate || item.unitPrice || item.UnitPrice || 0);
      const received = this.isViewMode
        ? Number(item.receivedQty || item.ReceivedQty || 0)
        : Number(item.receivedQty || 0);

      const rejected = 0;
      const accepted = received - rejected;
      const discPer = Number(item.discountPercent || item.DiscountPercent || 0);
      const gstPer = Number(item.gstPercent || item.GstPercent || 0);

      const baseAmt = accepted * rate;
      const discAmt = baseAmt * (discPer / 100);
      const taxableAmt = baseAmt - discAmt;
      const taxAmt = taxableAmt * (gstPer / 100);

      return {
        ...item,
        productId: item.productId || item.ProductId,
        productName: item.productName || item.ProductName,
        orderedQty: ordered,
        pendingQty: pending,
        receivedQty: received,
        isReplacement: !!(item.isReplacement || item.IsReplacement),
        rejectedQty: rejected,
        acceptedQty: accepted,
        unitRate: rate,
        discountPercent: discPer,
        gstPercent: gstPer,
        taxAmount: taxAmt,
        total: taxableAmt + taxAmt,
        warehouseId: item.warehouseId || item.WarehouseId || null,
        rackId: item.rackId || item.RackId || null,
        isExpiryRequired: !!(item.isExpiryRequired || item.IsExpiryRequired),
        manufacturingDate: DateHelper.toShortDisplayDate(item.manufacturingDate || item.ManufacturingDate),
        expiryDate: DateHelper.toShortDisplayDate(item.expiryDate || item.ExpiryDate)
      };
    });

    this.items.forEach(item => {
      if (item.warehouseId) {
        this.onWarehouseChange(item);
      }
    });

    this.calculateGrandTotal();
    this.cdr.detectChanges();

    // Start auto-save countdown only for REAL gate pass flow (isFromPopup AND NOT isQuick)
    if (this.isFromPopup && !this.isViewMode && !this.isQuick) {
      this.startAutoSaveCountdown();
    }
  }

  private startAutoSaveCountdown() {
    this.countdown = 30;
    this.showCountdown = true;
    this.cdr.detectChanges();

    this.countdownInterval = setInterval(() => {
      this.countdown--;
      this.cdr.detectChanges();

      if (this.countdown <= 0) {
        this.clearCountdown();
        this.performGRNSave(); // Auto-save on timeout
      }
    }, 1000);
  }

  private clearCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    this.showCountdown = false;
    this.cdr.detectChanges();
  }

  ngOnDestroy() {
    this.clearCountdown();
  }

  onQtyChange(item: any) {
    if (this.isViewMode) return;

    const enteredQty = Number(item.receivedQty || 0);
    const pendingQty = Number(item.pendingQty || 0);
    const rejectedQty = Number(item.rejectedQty || 0);
    const unitRate = Number(item.unitRate || 0);

    if (enteredQty > pendingQty) {
      item.receivedQty = pendingQty;
      this.showValidationError(`Received quantity cannot exceed the pending quantity (${pendingQty}).`);
      this.onQtyChange(item);
      return;
    }

    if (rejectedQty > enteredQty) {
      item.rejectedQty = 0;
      this.showValidationError(`Rejected quantity cannot exceed the received quantity (${enteredQty}).`);
      this.onQtyChange(item);
      return;
    }

    item.acceptedQty = Math.max(0, enteredQty - rejectedQty);

    const discPer = Number(item.discountPercent || 0);
    const gstPer = Number(item.gstPercent || 0);

    const baseAmt = item.acceptedQty * unitRate;
    const discAmt = baseAmt * (discPer / 100);
    const taxableAmt = baseAmt - discAmt;
    const taxAmt = taxableAmt * (gstPer / 100);

    item.taxAmount = taxAmt;
    item.total = taxableAmt + taxAmt;

    this.calculateGrandTotal();
  }

  showValidationError(message: string) {
    this.dialog.open(StatusDialogComponent, {
      width: '350px',
      data: { title: 'Validation Error', message: message, status: 'error', isSuccess: false }
    });
  }

  calculateGrandTotal(): number {
    return this.items.reduce((acc, item) => acc + (Number(item.total || 0)), 0);
  }

  saveGRN() {
    if (this.grnForm.invalid || this.items.length === 0 || this.isViewMode) return;
    this.clearCountdown(); // Cancel auto-save — user is saving manually

    const confirmDialog = this.dialog.open(StatusDialogComponent, {
      width: '400px',
      data: {
        title: 'Confirm GRN Save',
        message: `Are you sure you want to save this GRN and update stock?\n\nGrand Total: ₹${this.calculateGrandTotal().toFixed(2)}`,
        status: 'warning',
        isSuccess: false,
        showCancel: true
      }
    });

    confirmDialog.afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      this.performGRNSave();
    });
  }

  performGRNSave() {
    console.log('🚀 GRN Save Initiated - isQuick:', this.isQuick);
    
    const currentUserId = localStorage.getItem('email') || 'Admin';

    if (this.poId && this.poId.includes(',')) {
      const ids = this.poId.split(',').map(id => Number(id.trim())).filter(id => id > 0);
      const formValue = this.grnForm.getRawValue();

      const itemsByPo = new Map<number, any[]>();
      this.items.forEach(item => {
        const pId = Number(item.poId || ids[0]);
        if (!itemsByPo.has(pId)) itemsByPo.set(pId, []);
        itemsByPo.get(pId)?.push(item);
      });

      this.loadingService.setLoading(true);
      let completedCount = 0;
      const totalToProcess = itemsByPo.size;

      itemsByPo.forEach((poItems, pId) => {
        const firstItem = poItems[0];
        const poTotal = poItems.reduce((sum, i) => sum + Number(i.total || 0), 0);
        const grnData = {
          poHeaderId: pId,
          supplierId: firstItem.supplierId || firstItem.SupplierId || 0,
          gatePassNo: formValue.gatePassNo,
          receivedDate: formValue.receivedDate,
          remarks: formValue.remarks,
          totalAmount: poTotal,  // ✅ was missing — caused ₹0.00 bug
          status: 'Received',
          isQuick: this.isQuick,
          createdBy: currentUserId,
          items: poItems.map(i => ({
            productId: i.productId,
            orderedQty: Number(i.orderedQty),
            receivedQty: Number(i.receivedQty),
            pendingQty: Number(i.pendingQty),
            rejectedQty: Number(i.rejectedQty),
            acceptedQty: Number(i.acceptedQty),
            unitRate: Number(i.unitRate),
            discountPercent: Number(i.discountPercent),
            gstPercent: Number(i.gstPercent),
            taxAmount: Number(i.taxAmount),
            totalAmount: Number(i.total),
            warehouseId: i.warehouseId,
            rackId: i.rackId,
            manufacturingDate: i.manufacturingDate || null,
            expiryDate: i.expiryDate || null
          }))
        };

        this.inventoryService.saveGRN({ data: grnData }).subscribe({
          next: () => {
            completedCount++;
            if (completedCount === totalToProcess) {
              this.loadingService.setLoading(false);
              this.dialog.open(StatusDialogComponent, {
                width: '350px',
                data: {
                  title: 'Success',
                  message: `All ${totalToProcess} POs processed and counters updated correctly!`,
                  status: 'success',
                  isSuccess: true
                }
              }).afterClosed().subscribe(() => {
                this.navigateBack();
              });
            }
          },
          error: (err) => {
            this.loadingService.setLoading(false);
            console.error(`Error saving PO ${pId}:`, err);
            this.showValidationError(`Failed to process PO ${pId}. Please check data.`);
          }
        });
      });
      return;
    }

    const grnData = {
      poHeaderId: Number(this.poId),
      supplierId: this.supplierId,
      gatePassNo: this.grnForm.getRawValue().gatePassNo,
      receivedDate: new Date(this.grnForm.getRawValue().receivedDate).toISOString(),
      remarks: this.grnForm.value.remarks,
      totalAmount: this.calculateGrandTotal(),
      status: 'Received',
      isQuick: this.isQuick,
      createdBy: currentUserId,
      items: this.items.map(item => ({
        productId: item.productId,
        orderedQty: Number(item.orderedQty),
        receivedQty: Number(item.receivedQty),
        pendingQty: Number(item.pendingQty),
        rejectedQty: Number(item.rejectedQty),
        acceptedQty: Number(item.acceptedQty),
        unitRate: Number(item.unitRate),
        discountPercent: Number(item.discountPercent),
        gstPercent: Number(item.gstPercent),
        taxAmount: Number(item.taxAmount),
        totalAmount: Number(item.total),
        warehouseId: item.warehouseId,
        rackId: item.rackId,
        manufacturingDate: DateHelper.parseToISO(item.manufacturingDate),
        expiryDate: DateHelper.parseToISO(item.expiryDate)
      }))
    };

    console.log('� Full GRN Payload State:', { isQuick: this.isQuick, grnData });
    console.log('�🚀 Saving GRN Payload:', grnData);
    this.inventoryService.saveGRN({ Data: grnData }).subscribe({
      next: (response: any) => {
        console.log('✅ GRN Save Success:', response);
        const grnNumber = response?.grnNumber || 'AUTO-GEN';

        const dialogRef = this.dialog.open(GrnSuccessDialogComponent, {
          width: '500px',
          disableClose: true,
          data: {
            grnNumber: grnNumber,
            grandTotal: this.calculateGrandTotal(),
            supplierId: this.supplierId,
            supplierName: this.supplierName
          }
        });

        dialogRef.afterClosed().subscribe(result => {
          if (result === 'make-payment') {
            this.performDirectPayment({
              grnNumber: grnNumber,
              grandTotal: this.calculateGrandTotal(),
              supplierId: this.supplierId
            });
          } else {
            this.navigateBack();
          }
        });
      },
      error: (err) => {
        console.group('❌ GRN Save Failure');
        console.error('Error Details:', err);
        console.error('Status:', err.status);
        console.error('Message:', err.error?.message || err.message);
        console.groupEnd();

        this.dialog.open(StatusDialogComponent, {
          width: '350px',
          data: {
            title: 'Error',
            message: 'Failed to save GRN. Please check console for technical details.',
            status: 'error',
            isSuccess: false
          }
        });
      }
    });
  }

  performDirectPayment(data: any) {
    console.log('🚀 Initiating Direct Payment with data:', data);

    if (!data.supplierId || data.supplierId <= 0) {
      this.dialog.open(StatusDialogComponent, {
        width: '400px',
        data: {
          isSuccess: false,
          title: 'Payment Error',
          message: `Cannot process payment. Supplier ID is missing or invalid.`,
          status: 'error'
        }
      });
      this.navigateBack();
      return;
    }

    const paymentPayload = {
      id: 0,
      supplierId: Number(data.supplierId),
      amount: Number(data.grandTotal),
      totalAmount: Number(data.grandTotal),
      discountAmount: 0,
      netAmount: Number(data.grandTotal),
      paymentMode: 'Cash',
      referenceNumber: `${data.grnNumber}-${new Date().getTime().toString().slice(-4)}`,
      paymentDate: new Date().toISOString(),
      remarks: `Direct Payment for GRN: ${data.grnNumber}`,
      createdBy: localStorage.getItem('email') || 'Admin'
    };

    console.log('💰 Sending Payment Payload:', paymentPayload);

    setTimeout(() => {
      this.financeService.recordSupplierPayment(paymentPayload).subscribe({
        next: () => {
          console.log('✅ Direct Payment Successful');
          const statusDialog = this.dialog.open(StatusDialogComponent, {
            width: '350px',
            data: {
              isSuccess: true,
              title: 'Payment Successful',
              message: `Direct payment recorded for GRN ${data.grnNumber}.`,
              status: 'success'
            }
          });

          statusDialog.afterClosed().subscribe(() => {
            this.navigateBack();
          });
        },
        error: (err) => {
          console.group('❌ Direct Payment Error');
          console.error(err);
          console.groupEnd();

          this.dialog.open(StatusDialogComponent, {
            width: '400px',
            data: {
              isSuccess: false,
              title: 'Payment Failed',
              message: `GRN saved but direct payment failed.`,
              status: 'error'
            }
          });
          this.navigateBack();
        }
      });
    }, 800);
  }

  navigateBack() {
    if (this.isQuick) {
      this.router.navigate(['/app/quick-inventory/grn-list']);
    } else {
      this.router.navigate(['/app/inventory/grn-list']);
    }
  }

  goBack() { this.navigateBack(); }
  onCancel() {
    this.clearCountdown();
    this.goBack();
  }
}