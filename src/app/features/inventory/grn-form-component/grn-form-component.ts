import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
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

@Component({
  selector: 'app-grn-form-component',
  standalone: true,
  imports: [CommonModule, MaterialModule, ReactiveFormsModule, FormsModule],
  templateUrl: './grn-form-component.html',
  styleUrl: './grn-form-component.scss',
})
export class GrnFormComponent implements OnInit {
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

  warehouses: Warehouse[] = [];
  racks: Rack[] = [];
  filteredRacksMap: { [productId: string]: Rack[] } = {};

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
        // Testing both camelCase and PascalCase to be safe
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

      // LOGIC FIX: If backend says 0 pending but total accepted < ordered, 
      // it means some quantity was rejected/returned and needs replacement inwarding.
      let pending = Number(item.pendingQty || item.PendingQty || 0);
      if (pending === 0 && acceptedSoFar < ordered) {
        pending = ordered - acceptedSoFar;
      }

      // BACKEND NOW HANDLES THIS: Logic is moved to repository for multi-item accuracy

      const rate = Number(item.unitRate || item.unitPrice || item.UnitPrice || 0);

      // LOGIC: Naya GRN banate waqt default receivedQty backend se aayi hui value honi chahiye
      const received = this.isViewMode
        ? Number(item.receivedQty || item.ReceivedQty || 0)
        : Number(item.receivedQty || 0); // Backend suggests 0 for items not in GP

      const rejected = 0; // Fresh receive mein 0 reject maan ke chalte hain

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
        rackId: item.rackId || item.RackId || null
      };
    });

    // Initialize filtered racks for each item
    this.items.forEach(item => {
      if (item.warehouseId) {
        this.onWarehouseChange(item);
      }
    });

    this.calculateGrandTotal();
    this.cdr.detectChanges();
  }

  onQtyChange(item: any) {
    if (this.isViewMode) return;

    const enteredQty = Number(item.receivedQty || 0);
    const pendingQty = Number(item.pendingQty || 0);
    const rejectedQty = Number(item.rejectedQty || 0);
    const unitRate = Number(item.unitRate || 0);

    // VALIDATION: Pending se zyada received nahi ho sakta
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

    // Financial Calculations
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

    // Show confirmation dialog first
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
      if (!confirmed) return; // User cancelled

      // User confirmed, proceed with save
      this.performGRNSave();
    });
  }

  performGRNSave() {
    const currentUserId = localStorage.getItem('email') || 'Admin';

    // BULK FLOW: If poId contains multiple IDs
    if (this.poId && this.poId.includes(',')) {
      const ids = this.poId.split(',').map(id => Number(id.trim())).filter(id => id > 0);
      const formValue = this.grnForm.getRawValue();

      const bulkRequest = {
        purchaseOrderIds: ids,
        createdBy: currentUserId,
        receivedDate: formValue.receivedDate,
        gatePassNo: formValue.gatePassNo,
        remarks: formValue.remarks,
        items: this.items.map(i => ({
          poId: i.poId, // Backend DTO expected POId
          productId: i.productId,
          receivedQty: i.receivedQty,
          rejectedQty: i.rejectedQty,
          unitRate: i.unitRate,
          warehouseId: i.warehouseId,
          rackId: i.rackId
        }))
      };

      this.inventoryService.createBulkGrn(bulkRequest).subscribe({
        next: (response: any) => {
          this.dialog.open(StatusDialogComponent, {
            width: '350px',
            data: {
              title: 'Bulk Success',
              message: `${ids.length} GRNs processed successfully from the Bulk Gate Pass!`,
              status: 'success',
              isSuccess: true
            }
          }).afterClosed().subscribe(() => {
            this.router.navigate(['/app/inventory/grn-list']);
          });
        },
        error: (err) => {
          console.error('Error saving Bulk GRN:', err);
          this.showValidationError('Bulk processing failed. Please check if all POs are Approved.');
        }
      });
      return;
    }

    // SINGLE PO FLOW (Existing)

    const grnData = {
      poHeaderId: Number(this.poId),
      supplierId: this.supplierId,
      gatePassNo: this.grnForm.getRawValue().gatePassNo, // Linking the Gate Pass
      receivedDate: this.grnForm.getRawValue().receivedDate,
      remarks: this.grnForm.value.remarks,
      totalAmount: this.calculateGrandTotal(),
      status: 'Received',
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
        rackId: item.rackId
      }))
    };

    this.inventoryService.saveGRN({ data: grnData }).subscribe({
      next: (response: any) => {
        const grnNumber = response?.grnNumber || 'AUTO-GEN';

        // Show success dialog with payment option
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
            // Navigate to GRN List
            this.router.navigate(['/app/inventory/grn-list']);
          }
        });
      },
      error: (err) => {
        console.error('Error saving GRN:', err);
        this.dialog.open(StatusDialogComponent, {
          width: '350px',
          data: {
            title: 'Error',
            message: 'Failed to save GRN. Please try again.',
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
      console.error('❌ Cannot perform direct payment: Supplier ID is invalid:', data.supplierId);
      this.dialog.open(StatusDialogComponent, {
        width: '400px',
        data: {
          isSuccess: false,
          title: 'Payment Error',
          message: `Cannot process payment. Supplier ID is missing or invalid (${data.supplierId}). Please try Recording Payment from the GRN list.`,
          status: 'error'
        }
      });
      this.router.navigate(['/app/inventory/grn-list']);
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
      // Adding a unique suffix to avoid "Duplicate Reference" error if user re-tries
      referenceNumber: `${data.grnNumber}-${new Date().getTime().toString().slice(-4)}`,
      paymentDate: new Date().toISOString(),
      remarks: `Direct Payment for GRN: ${data.grnNumber}`,
      createdBy: localStorage.getItem('email') || 'Admin'
    };

    console.log('💰 Sending Payment Payload:', paymentPayload);

    // Add a small delay to ensure Purchase transaction is fully committed
    setTimeout(() => {
      this.financeService.recordSupplierPayment(paymentPayload).subscribe({
        next: () => {
          console.log('✅ Direct Payment Successful');
          this.dialog.open(StatusDialogComponent, {
            width: '350px',
            data: {
              isSuccess: true,
              title: 'Payment Successful',
              message: `Direct payment of ₹${data.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })} recorded for GRN ${data.grnNumber}.`,
              status: 'success'
            }
          });
          this.router.navigate(['/app/inventory/grn-list']);
        },
        error: (err) => {
          console.group('❌ Direct Payment Error Details');
          console.error('Raw Error Object:', err);
          const serverMsg = err.error?.message || err.message || 'Unknown server error';
          console.error('Server Message:', serverMsg);
          console.groupEnd();

          this.dialog.open(StatusDialogComponent, {
            width: '400px',
            data: {
              isSuccess: false,
              title: 'Payment Failed',
              message: `GRN saved but direct payment failed.\n\nReason: ${serverMsg}\n\nYou can record it manually from the GRN list.`,
              status: 'error'
            }
          });
          this.router.navigate(['/app/inventory/grn-list']);
        }
      });
    }, 800);
  }

  goBack() { this.router.navigate(['/app/inventory/grn-list']); }
  onCancel() { this.goBack(); }
}