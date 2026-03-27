import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MaterialModule } from '../../../../shared/material/material/material-module';
import { GatePassService, VehicleSuggestion } from '../services/gate-pass.service';
import { LoadingService } from '../../../../core/services/loading.service';
import { StatusDialogComponent } from '../../../../shared/components/status-dialog-component/status-dialog-component';
import { MatDialog } from '@angular/material/dialog';
import { Router, ActivatedRoute } from '@angular/router';
import { GatePass, GatePassReferenceType, GatePassStatus } from '../models/gate-pass.model';
import { AuthService } from '../../../../core/services/auth.service';
import { SaleOrderService } from '../../service/saleorder.service';
import { PurchaseReturnService } from '../../purchase-return/services/purchase-return.service';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { Subject, Subscription, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { SharedPrintService } from '../../../../core/services/shared-print.service';

@Component({
    selector: 'app-outward-gate-pass',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, MaterialModule],
    templateUrl: './outward-gate-pass.component.html',
    styleUrls: ['./outward-gate-pass.component.scss']
})
export class OutwardGatePassComponent implements OnInit, OnDestroy {
    private fb = inject(FormBuilder);
    private gatePassService = inject(GatePassService);
    private soService = inject(SaleOrderService);
    private prService = inject(PurchaseReturnService);
    private dialog = inject(MatDialog);
    private router = inject(Router);
    private route = inject(ActivatedRoute);
    private authService = inject(AuthService);
    private loadingService = inject(LoadingService);
    private cdr = inject(ChangeDetectorRef);
    private sharedPrintService = inject(SharedPrintService);

    gatePassForm!: FormGroup;
    isSaving = false;
    isEditMode = false;
    isRedirected = false; // Flag to prevent auto-reset
    gatePassId: number | null = null;
    currentPassNo = 'Auto-Generated Pass No: GP-OUT-2026-XXXX';
    bulkBreakdown = '';

    referenceTypes = [
        { id: GatePassReferenceType.SaleOrder, name: 'Sale Order' },
        { id: GatePassReferenceType.PurchaseReturn, name: 'Purchase Return' }
    ];

    availableSOs: any[] = [];
    availablePRs: any[] = [];
    vehicleTypes = ['Truck', 'Tempo', 'LCV', 'Bike', 'Other'];

    // Vehicle Autocomplete
    vehicleSuggestions: VehicleSuggestion[] = [];
    private vehicleSearchSubject = new Subject<string>();
    private vehicleSearchSub?: Subscription;

    constructor() {
        this.initForm();
    }

    ngOnInit() {
        this.loadingService.setLoading(false);
        this.loadPendingSOs();
        this.loadPendingPRs();
        this.setupVehicleAutocomplete();

        this.gatePassForm.get('referenceType')?.valueChanges.subscribe(val => {
            // Prevent reset if we are in the middle of a redirection setup
            if (val && !this.isRedirected) {
                this.gatePassForm.patchValue({ referenceId: null, referenceNo: '', partyName: '', totalQty: 0 });
            }
        });

        this.route.queryParams.subscribe(params => {
            if (params['id'] && params['mode'] === 'edit') {
                this.isEditMode = true;
                this.gatePassId = +params['id'];
                this.loadGatePassData(this.gatePassId);
            } else if (params['type'] === 'purchase-return') {
                this.isRedirected = true;
                this.handlePurchaseReturnRedirection(params);
            } else if (params['type'] === 'sale-order') {
                this.isRedirected = true;
                this.handleSORedirection(params);
            }
        });
    }

    private handleSORedirection(params: any) {
        setTimeout(() => {
            this.gatePassForm.get('referenceType')?.setValue(GatePassReferenceType.SaleOrder, { emitEvent: false });
            this.gatePassForm.get('referenceType')?.disable({ emitEvent: false });

            const refNo = params['refNo'] || '';
            const partyName = params['partyName'] || '';
            const qty = params['qty'] || 0;
            const refId = params['refId'] || '';

            this.bulkBreakdown = params['breakdown'] || '';
            const isBulk = params['isBulk'] === 'true';

            this.gatePassForm.patchValue({
                referenceId: refId || '',
                referenceNo: refNo,
                partyName: partyName,
                totalQty: qty,
                remarks: isBulk ? 'BULK-OUTWARD DISPATCH' : ''
            });
            this.cdr.detectChanges();
        }, 0);
    }

    private handlePurchaseReturnRedirection(params: any) {
        setTimeout(() => {
            // 1. Set Type explicitly
            this.gatePassForm.get('referenceType')?.setValue(GatePassReferenceType.PurchaseReturn, { emitEvent: false });
            this.gatePassForm.get('referenceType')?.disable({ emitEvent: false });

            // 2. Extract Values safely
            const refNo = params['refNo'] || '';
            const partyName = params['partyName'] || '';
            const qty = params['qty'] || 0;
            const refId = params['refId'] || '';

            // 3. Patch Values
            this.gatePassForm.patchValue({
                referenceId: refId || '',
                referenceNo: refNo,
                partyName: partyName,
                totalQty: qty,
                remarks: params['isBulk'] === 'true' ? 'BULK-OUTWARD DISPATCH' : ''
            });

            this.cdr.detectChanges();
        }, 0);
    }

    initForm() {
        this.gatePassForm = this.fb.group({
            referenceType: [GatePassReferenceType.SaleOrder, Validators.required],
            referenceNo: ['', Validators.required],
            referenceId: [null],
            partyName: [{ value: '', disabled: true }, Validators.required],
            vehicleNo: ['', [Validators.required, Validators.pattern(/^[A-Z]{2}[-\s]?[0-9]{1,4}[-\s]?[A-Z]{0,3}[-\s]?[0-9]{4}$/i)]],
            vehicleType: ['Truck', Validators.required],
            driverName: ['', Validators.required],
            driverPhone: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
            transporterName: [''],
            totalQty: [{ value: 0, disabled: true }, [Validators.required, Validators.min(0.01)]],
            totalWeight: [0],
            securityGuard: [this.authService.getUserName() || '', Validators.required],
            gateEntryTime: [{ value: new Date(), disabled: true }],
            remarks: [''],
            securitySign: [false, Validators.requiredTrue]
        });
    }

    private loadPendingSOs() {
        this.soService.getPendingSOs().subscribe({
            next: (data) => {
                this.availableSOs = data;
                this.cdr.detectChanges();
            },
            error: (err) => console.error('Error fetching pending SOs', err)
        });
    }

    private loadPendingPRs() {
        this.prService.getPendingPRs().subscribe({
            next: (data) => {
                this.availablePRs = data;
                this.cdr.detectChanges();
            },
            error: (err) => console.error('Error fetching pending PRs', err)
        });
    }

    private loadGatePassData(id: number) {
        this.gatePassService.getGatePass(id).subscribe({
            next: (data: any) => {
                this.currentPassNo = `Pass No: ${data.passNo}`;
                this.gatePassForm.patchValue({
                    ...data,
                    gateEntryTime: new Date(data.gateEntryTime),
                    securitySign: true // Assume signed if editing
                });
                this.gatePassForm.get('referenceType')?.disable();
                this.cdr.detectChanges();
            },
            error: (err) => console.error('Error loading gate pass', err)
        });
    }

    onSOSelected(soId: number) {
        const selectedSO = this.availableSOs.find(s => s.id === soId);
        if (selectedSO) {
            this.gatePassForm.patchValue({
                referenceNo: selectedSO.soNumber,
                referenceId: selectedSO.id.toString(),
                partyName: selectedSO.customerName,
                totalQty: selectedSO.totalQty
            });
        }
    }

    onPRSelected(prId: string) {
        const selectedPR = this.availablePRs.find(p => p.id === prId);
        if (selectedPR) {
            this.gatePassForm.patchValue({
                referenceNo: selectedPR.returnNumber,
                referenceId: selectedPR.id, // ID is likely GUID
                partyName: selectedPR.supplierName,
                totalQty: selectedPR.totalQty
            });
        }
    }

    onSubmit() {
        if (this.gatePassForm.invalid) {
            this.gatePassForm.markAllAsTouched();
            return;
        }

        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            data: {
                title: this.isEditMode ? 'Update Gate Pass' : 'Generate Gate Pass',
                message: `Are you sure you want to ${this.isEditMode ? 'update' : 'generate'} this outward gate pass?`
            }
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                this.saveGatePass();
            }
        });
    }

    saveGatePass() {
        const formValue = this.gatePassForm.getRawValue();
        const gatePassData: GatePass = {
            ...formValue,
            referenceId: String(formValue.referenceId || ''), // Ensure String for GUID support
            id: this.gatePassId || 0,
            passType: 'Outward',
            status: GatePassStatus.Completed,
            createdBy: this.authService.getUserName()
        };

        // Append breakdown to remarks if bulk
        if (this.bulkBreakdown && !gatePassData.remarks?.includes('Breakdown:')) {
            gatePassData.remarks = gatePassData.remarks ? `${gatePassData.remarks} | Breakdown: ${this.bulkBreakdown}` : `Breakdown: ${this.bulkBreakdown}`;
        }

        this.isSaving = true;
        this.loadingService.setLoading(true);
        const request = this.gatePassService.createGatePass(gatePassData);

        request.subscribe({
            next: (res: any) => {
                this.isSaving = false;
                this.loadingService.setLoading(false);
                const msg = this.isEditMode ? 'Gate Pass updated!' : `Outward Pass Generated! No: ${res.passNo || 'GP-OUT-XXXX'}`;

                this.dialog.open(StatusDialogComponent, {
                    data: { title: 'Success', message: msg, status: 'success', isSuccess: true }
                }).afterClosed().subscribe(() => {
                    // Auto-print associated Invoice / Credit Note logic
                    if (formValue.referenceType === GatePassReferenceType.SaleOrder && formValue.referenceId) {
                        this.soService.getSaleOrderById(formValue.referenceId).subscribe({
                            next: (fullOrder) => {
                                this.sharedPrintService.printDocument('Standard Sale Order', 'SO', fullOrder);
                                this.router.navigate(['/app/inventory/gate-pass']);
                            },
                            error: () => this.router.navigate(['/app/inventory/gate-pass'])
                        });
                    } else if (formValue.referenceType === GatePassReferenceType.PurchaseReturn && formValue.referenceId) {
                        this.prService.getPurchaseReturnById(formValue.referenceId).subscribe({
                            next: (fullData) => {
                                this.sharedPrintService.printDocument('Standard Purchase Return', 'PR', fullData);
                                this.router.navigate(['/app/inventory/purchase-return']);
                            },
                            error: () => this.router.navigate(['/app/inventory/purchase-return'])
                        });
                    } else {
                        // Default Fallback
                        if (formValue.referenceType === GatePassReferenceType.PurchaseReturn) {
                            this.router.navigate(['/app/inventory/purchase-return']);
                        } else {
                            this.router.navigate(['/app/inventory/gate-pass']);
                        }
                    }
                });
            },
            error: (err: any) => {
                this.isSaving = false;
                this.loadingService.setLoading(false);
                this.dialog.open(StatusDialogComponent, {
                    data: { title: 'Error', message: 'Failed to save Gate Pass', status: 'error', isSuccess: false }
                });
            }
        });
    }

    goBack() {
        // Intelligent back button: Go back to source if available
        const type = this.route.snapshot.queryParams['type'];
        if (type === 'purchase-return') {
            this.router.navigate(['/app/inventory/purchase-return']);
        } else if (type === 'sale-order') {
            this.router.navigate(['/app/inventory/sale-order']);
        } else {
            this.router.navigate(['/app/inventory/gate-pass']);
        }
    }

    private setupVehicleAutocomplete() {
        this.vehicleSearchSub = this.vehicleSearchSubject.pipe(
            debounceTime(300),
            distinctUntilChanged(),
            switchMap(term => {
                if (!term || term.trim().length === 0) {
                    return of([]);
                }
                return this.gatePassService.getVehicleSuggestions(term);
            })
        ).subscribe({
            next: (results) => {
                this.vehicleSuggestions = results;
                this.cdr.detectChanges();
            },
            error: () => { this.vehicleSuggestions = []; }
        });
    }

    onVehicleSearch(event: Event) {
        const value = (event.target as HTMLInputElement).value;
        this.vehicleSearchSubject.next(value);
    }

    onVehicleBlur() {
        setTimeout(() => {
            this.vehicleSuggestions = [];
            this.cdr.detectChanges();
        }, 200);
    }

    onVehicleSelected(suggestion: VehicleSuggestion) {
        this.gatePassForm.patchValue({
            vehicleNo: suggestion.vehicleNo,
            driverName: suggestion.driverName,
            driverPhone: suggestion.driverPhone,
            transporterName: suggestion.transporterName,
            vehicleType: suggestion.vehicleType || this.gatePassForm.get('vehicleType')?.value
        });
        this.vehicleSuggestions = [];
    }

    ngOnDestroy() {
        this.vehicleSearchSub?.unsubscribe();
    }

    resetForm() {
        this.vehicleSuggestions = [];
        this.initForm();
        this.isEditMode = false;
        this.gatePassId = null;
        this.currentPassNo = 'Auto-Generated Pass No: GP-OUT-2026-XXXX';
    }
}
