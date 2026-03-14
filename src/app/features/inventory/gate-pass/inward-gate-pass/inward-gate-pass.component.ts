import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MaterialModule } from '../../../../shared/material/material/material-module';
import { GatePassService, VehicleSuggestion } from '../services/gate-pass.service';
import { LoadingService } from '../../../../core/services/loading.service';
import { StatusDialogComponent } from '../../../../shared/components/status-dialog-component/status-dialog-component';
import { MatDialog } from '@angular/material/dialog';
import { GatePass, GatePassReferenceType, GatePassStatus } from '../models/gate-pass.model';
import { AuthService } from '../../../../core/services/auth.service';
import { POService } from '../../service/po.service';
import { SaleReturnService } from '../../sale-return/services/sale-return.service';
import { PurchaseReturnService } from '../../purchase-return/services/purchase-return.service';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { Subject, Subscription, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { DialogPersistenceService } from '../../../../shared/services/dialog-persistence.service';

@Component({
    selector: 'app-inward-gate-pass',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, MaterialModule],
    templateUrl: './inward-gate-pass.component.html',
    styleUrls: ['./inward-gate-pass.component.scss']
})
export class InwardGatePassComponent implements OnInit, OnDestroy {
    fb = inject(FormBuilder);
    gatePassService = inject(GatePassService);
    dialog = inject(MatDialog);
    router = inject(Router);
    route = inject(ActivatedRoute);
    authService = inject(AuthService);
    poService = inject(POService);
    srService = inject(SaleReturnService);
    loadingService = inject(LoadingService);
    prService = inject(PurchaseReturnService);
    cdr = inject(ChangeDetectorRef);
    persistentDialog = inject(DialogPersistenceService);

    gatePassForm!: FormGroup;
    isSaving = false;
    currentDate = new Date();
    referenceLabel = 'Link With PO No';
    isExternalRef = false;
    isEditMode = false;
    gatePassId: number | null = null;
    currentPassNo = 'Auto-Generated Pass No: GP-IN-2026-XXXX';
    bulkBreakdown: string = '';
    isReplacement: boolean = false;

    // Reference Selection
    referenceTypes = [
        { id: GatePassReferenceType.PurchaseOrder, name: 'Purchase Order' },
        { id: GatePassReferenceType.PurchaseReturn, name: 'Purchase Return' }, // Added PR
        { id: GatePassReferenceType.SaleReturn, name: 'Sale Return' }
    ];

    // Dynamic Data from API
    availablePOs: any[] = [];
    availablePRs: any[] = []; // Added PR list
    availableSaleReturns: any[] = [];

    vehicleTypes = ['Truck', 'Tempo', 'LCV', 'Other'];

    // Vehicle Autocomplete
    vehicleSuggestions: VehicleSuggestion[] = [];
    private vehicleSearchSubject = new Subject<string>();
    private vehicleSearchSub?: Subscription;

    constructor() {
        this.initForm();
    }

    ngOnInit() {
        this.loadingService.setLoading(false);
        this.loadPendingData();
        this.setupVehicleAutocomplete();

        this.gatePassForm.get('referenceType')?.valueChanges.subscribe(val => {
            if (!this.isExternalRef) {
                this.gatePassForm.patchValue({ referenceId: '', referenceNo: '', partyName: '', expectedQty: 0 });
                // Dynamic label update
                if (val === GatePassReferenceType.PurchaseOrder) this.referenceLabel = 'Link With PO No';
                else if (val === GatePassReferenceType.PurchaseReturn) this.referenceLabel = 'Purchase Return No';
                else if (val === GatePassReferenceType.SaleReturn) this.referenceLabel = 'Sale Return No';
            }
        });

        this.route.queryParams.subscribe(params => {
            // Mode & ID handling
            if (params['id'] && params['mode'] === 'edit') {
                this.isEditMode = true;
                this.gatePassId = Number(params['id']);
                this.loadGatePassData(this.gatePassId);
            }
            // Sale Return Redirection Flow
            else if (params['refNo'] && params['type'] === 'sale-return') {
                this.handleSaleReturnRedirection(params);
            }
            // Purchase Order Redirection Flow
            else if (params['refNo'] && params['type'] === 'po') {
                this.handlePORedirection(params);
            }
        });
    }

    private loadGatePassData(id: number) {
        this.loadingService.setLoading(true);
        this.gatePassService.getGatePass(id).subscribe({
            next: (data) => {
                this.loadingService.setLoading(false);
                if (data) {
                    this.isExternalRef = true; // Use readonly input for edit mode
                    this.currentPassNo = `Pass No: ${data.passNo}`;

                    // Logic to show correct label
                    if (data.referenceType === GatePassReferenceType.PurchaseOrder) this.referenceLabel = 'Link With PO No';
                    else if (data.referenceType === GatePassReferenceType.PurchaseReturn) this.referenceLabel = 'Purchase Return No';
                    else this.referenceLabel = 'Sale Return No';

                    this.gatePassForm.patchValue({
                        referenceId: data.referenceId,
                        referenceNo: data.referenceNo,
                        partyName: data.partyName,
                        vehicleNo: data.vehicleNo,
                        driverName: data.driverName,
                        driverPhone: data.driverPhone,
                        vehicleType: data.vehicleType,
                        expectedQty: data.totalQty,
                        invoiceNo: data.invoiceNo,
                        totalWeight: data.totalWeight,
                        securityGuard: data.securityGuard,
                        remarks: data.remarks
                    });

                    this.gatePassForm.get('referenceType')?.disable();
                    this.cdr.detectChanges();
                }
            },
            error: (err) => {
                this.loadingService.setLoading(false);
                console.error('Error loading gate pass:', err);
                this.notificationShow(false, 'Failed to load Gate Pass data');
            }
        });
    }

    private handlePORedirection(params: any) {
        setTimeout(() => {
            // If a persistent success dialog is pending (page refresh scenario),
            // skip ALL checks — the success dialog will restore itself via App.ngOnInit.
            if (this.persistentDialog.hasPendingDialog()) return;

            this.isExternalRef = true;
            this.referenceLabel = 'Link With PO No';
            const refNo = params['refNo'];
            const refId = params['refId'];
            const isBulk = params['isBulk'] === 'true';
            this.isReplacement = params['isReplacement'] === 'true';

            if (!refId || !refNo) return;

            // --- CHECK FOR DUPLICATE GATE PASS ---
            this.loadingService.setLoading(true);
            this.gatePassService.checkDuplicateGatePass(refNo, 'Inward').subscribe({
                next: (dupRes) => {
                    if (dupRes.isDuplicate && !this.isEditMode) {
                        this.loadingService.setLoading(false);
                        this.dialog.open(StatusDialogComponent, {
                            width: '450px',
                            data: {
                                title: 'Duplicate Gate Pass Found',
                                message: `An Inward Gate Pass (${dupRes.passNo}) already exists for ${refNo}. \n\nYou cannot create another gate pass for the same PO until the previous one is completed (GRN created). \n\nPlease use the existing gate pass to create the GRN.`,
                                status: 'warning',
                                isSuccess: false
                            }
                        }).afterClosed().subscribe(() => {
                            this.router.navigate(['/app/inventory/gate-pass']);
                        });
                        return;
                    }

                    // Continue with normal flow if not duplicate
                    this.continuePORedirection(params, refNo, refId, isBulk);
                },
                error: (err) => {
                    console.error('Error checking duplicate GP:', err);
                    this.continuePORedirection(params, refNo, refId, isBulk); // Proceed anyway if check fails
                }
            });
        }, 0);
    }

    private continuePORedirection(params: any, refNo: string, refId: any, isBulk: boolean) {
        // --- BULK FLOW ---
        if (isBulk) {
            this.loadingService.setLoading(false);
            this.bulkBreakdown = params['breakdown'] || '';
            this.gatePassForm.patchValue({
                referenceType: GatePassReferenceType.PurchaseOrder,
                referenceId: String(refId),
                referenceNo: 'BULK-INWARD',
                partyName: 'Multiple Suppliers',
                expectedQty: params['qty'] || 0,
                invoiceNo: 'BULK-INWARD'
            });
            this.gatePassForm.get('referenceType')?.disable();
            this.cdr.detectChanges();
            return;
        }

        // --- SINGLE PO FLOW ---
        // Call the new backend endpoint for accurate replacement quantity
        this.poService.getReplacementQty(Number(refId)).subscribe({
            next: (resp) => {
                this.loadingService.setLoading(false);
                const dbQty = resp?.replacementQty || params['qty'] || 0;

                this.gatePassForm.patchValue({
                    referenceType: GatePassReferenceType.PurchaseOrder,
                    referenceId: String(refId),
                    referenceNo: refNo,
                    partyName: params['partyName'] || '',
                    expectedQty: dbQty,
                    invoiceNo: `CH-${refNo.replace(/\//g, '-')}`
                });

                this.gatePassForm.get('referenceType')?.disable();
                this.gatePassForm.updateValueAndValidity();
                this.cdr.detectChanges();
            },
            error: (err) => {
                this.loadingService.setLoading(false);
                console.error('Error fetching replacement qty:', err);
                // Fallback to URL params
                this.gatePassForm.patchValue({
                    referenceType: GatePassReferenceType.PurchaseOrder,
                    referenceId: String(refId),
                    referenceNo: refNo,
                    partyName: params['partyName'] || '',
                    expectedQty: params['qty'] || 0,
                    invoiceNo: `CH-${refNo.replace(/\//g, '-')}`
                });
            }
        });
    }

    private handleSaleReturnRedirection(params: any) {
        setTimeout(() => {
            this.isExternalRef = true;
            this.referenceLabel = 'Sale Return No';
            this.isReplacement = false;
            const refNo = params['refNo'];

            const refIdControl = this.gatePassForm.get('referenceId');
            if (refIdControl) {
                refIdControl.setValidators([]);
                refIdControl.setErrors(null);
            }

            this.bulkBreakdown = params['breakdown'] || '';
            this.gatePassForm.patchValue({
                referenceId: params['refId'] ? String(params['refId']) : '',
                referenceNo: refNo,
                partyName: params['partyName'] || '',
                expectedQty: params['qty'] || 0,
                referenceType: GatePassReferenceType.SaleReturn,
                invoiceNo: params['isBulk'] === 'true' ? 'BULK-INWARD' : `CH-${refNo}`,
                remarks: '' // Keep empty for user to fill voluntarily
            });

            this.gatePassForm.get('referenceType')?.disable();
            this.gatePassForm.updateValueAndValidity();
            this.cdr.detectChanges();
        });
    }

    private notificationShow(success: boolean, message: string) {
        this.dialog.open(StatusDialogComponent, {
            data: {
                title: success ? 'Success' : 'Error',
                message: message,
                status: success ? 'success' : 'error',
                isSuccess: success
            }
        });
    }

    initForm() {
        // Current User as Guard
        const currentUser = this.authService.getUserName() || 'Security Guard';

        this.gatePassForm = this.fb.group({
            // 1. Reference Selection
            referenceType: [GatePassReferenceType.PurchaseOrder, Validators.required],
            referenceId: ['', Validators.required], // Holds internal ID of PO (String/GUID)
            referenceNo: ['', Validators.required], // Display No
            partyName: [{ value: '', disabled: true }], // Supplier Name

            // 2. Physical Vehicle Details
            vehicleNo: ['', [Validators.required, Validators.pattern(/^[A-Z]{2}[-\s]?[0-9]{1,4}[-\s]?[A-Z]{0,3}[-\s]?[0-9]{4}$/i)]],
            driverName: [''],
            driverPhone: ['', [Validators.pattern(/^[0-9]{10}$/)]],
            vehicleType: ['Tempo', Validators.required], // Default to Tempo

            // 3. Material Summary
            expectedQty: [{ value: 0, disabled: true }],
            invoiceNo: [{ value: '', disabled: true }, Validators.required], // Mandatory Challan No
            totalWeight: [''], // Approx Weight

            // 4. Security Controls
            securityGuard: [{ value: currentUser, disabled: true }], // Auto-filled
            inTime: [{ value: this.currentDate, disabled: true }], // Auto-Capture
            remarks: ['']
        });
    }

    private loadPendingData() {
        this.poService.getPendingPOs().subscribe({
            next: (data) => {
                this.availablePOs = data;
                this.cdr.detectChanges();
            },
            error: (err) => console.error('Error fetching pending POs', err)
        });

        // Load Pending Purchase Returns (Items sent out, waiting to come back)
        this.prService.getPendingPRs().subscribe({
            next: (data: any) => {
                this.availablePRs = data;
                this.cdr.detectChanges();
            },
            error: (err: any) => console.error('Error fetching pending PRs', err)
        });

        this.srService.getPendingSaleReturns().subscribe({
            next: (data) => {
                this.availableSaleReturns = data;
                this.cdr.detectChanges();
            },
            error: (err) => console.error('Error fetching pending Sale Returns', err)
        });
    }

    onSRSelected(srId: any) {
        const selectedSR = this.availableSaleReturns.find(s => String(s.id) === String(srId));
        if (selectedSR) {
            this.gatePassForm.patchValue({
                referenceNo: selectedSR.returnNumber,
                partyName: selectedSR.customerName,
                expectedQty: selectedSR.totalQty,
                invoiceNo: selectedSR.returnNumber // For Sale Return, Return No is often the reference
            });
            this.isReplacement = false; // Usually sale return is not called "replacement" here
        }
    }

    onPOSelected(poId: any) {
        const selectedPO = this.availablePOs.find(p => String(p.id) === String(poId));
        if (selectedPO) {
            // Check for duplicate
            this.gatePassService.checkDuplicateGatePass(selectedPO.poNumber, 'Inward').subscribe(dupRes => {
                if (dupRes.isDuplicate) {
                    this.dialog.open(StatusDialogComponent, {
                        width: '450px',
                        data: {
                            title: 'Duplicate Gate Pass Found',
                            message: `An Inward Gate Pass (${dupRes.passNo}) already exists for ${selectedPO.poNumber}. \n\nYou cannot create another gate pass for the same PO until the previous one is completed (GRN created). \n\nPlease use the existing gate pass to create the GRN.`,
                            status: 'warning',
                            isSuccess: false
                        }
                    }).afterClosed().subscribe(() => {
                        this.gatePassForm.patchValue({ referenceId: '', referenceNo: '', partyName: '', expectedQty: 0 });
                        this.router.navigate(['/app/inventory/gate-pass']);
                    });
                    return;
                }

                this.gatePassForm.patchValue({
                    referenceNo: selectedPO.poNumber,
                    partyName: selectedPO.supplierName,
                    expectedQty: selectedPO.expectedQty,
                    invoiceNo: `CH-${selectedPO.poNumber.replace(/\//g, '-')}`
                });
                this.isReplacement = false;
            });
        }
    }

    onPRSelected(prId: any) {
        const selectedPR = this.availablePRs.find(p => String(p.id) === String(prId));
        if (selectedPR) {
            this.gatePassForm.patchValue({
                referenceNo: selectedPR.returnNumber,
                partyName: selectedPR.supplierName,
                expectedQty: selectedPR.totalQty,
                invoiceNo: `REPLACEMENT-${selectedPR.returnNumber}`
            });
            this.isReplacement = true;
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
        // Using timeout to allow mousedown event on suggestions to trigger before suggestions are cleared
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
    }

    onSubmit() {
        if (this.gatePassForm.invalid) {
            this.gatePassForm.markAllAsTouched();
            return;
        }

        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            data: {
                title: this.isEditMode ? 'Update Inward Pass' : 'Generate Inward Pass',
                message: `Are you sure you want to ${this.isEditMode ? 'update' : 'generate'} this inward gate pass?`
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
        let finalRemarks = formValue.remarks || '';

        // Append breakdown if available and not already present
        if (this.bulkBreakdown && !finalRemarks.includes('Breakdown:')) {
            finalRemarks = finalRemarks ? `${finalRemarks} | Breakdown: ${this.bulkBreakdown}` : `Breakdown: ${this.bulkBreakdown}`;
        }

        // Create Inward Gate Pass Payload
        const gatePassData: any = {
            id: this.gatePassId || 0,
            passType: 'Inward',
            referenceType: formValue.referenceType,
            referenceId: formValue.referenceId && formValue.referenceId !== '0' ? String(formValue.referenceId) : '', // Ensure valid string or empty
            referenceNo: formValue.referenceNo,
            invoiceNo: formValue.invoiceNo,
            partyName: formValue.partyName,
            vehicleNo: formValue.vehicleNo,
            vehicleType: formValue.vehicleType,
            driverName: formValue.driverName,
            driverPhone: formValue.driverPhone,
            transporterName: '',
            totalQty: Number(formValue.expectedQty) || 0,
            totalWeight: Number(formValue.totalWeight) || 0,
            gateEntryTime: this.isEditMode ? undefined : new Date(), // Don't overwrite entry time on edit
            securityGuard: formValue.securityGuard,
            status: Number(formValue.referenceType) === GatePassReferenceType.SaleReturn ? GatePassStatus.Completed : GatePassStatus.Entered,
            remarks: finalRemarks,
            createdBy: this.authService.getUserName()
        };

        this.isSaving = true;
        this.loadingService.setLoading(true);
        const request = this.gatePassService.createGatePass(gatePassData);

        request.subscribe({
            next: (res: any) => {
                this.isSaving = false;
                this.loadingService.setLoading(false);

                // Defensive check for Pass No
                const generatedPassNo = res.passNo || res.PassNo || res.data?.passNo || res.data?.PassNo || '';
                const isPOFlow = !this.isEditMode && formValue.referenceType === GatePassReferenceType.PurchaseOrder;

                const baseMessage = this.isEditMode
                    ? 'Gate Pass updated successfully!'
                    : `Inward Gate Pass Generated! Pass No: ${generatedPassNo || 'GP-IN-2026-XXXX'}`;

                // PO flow: hint that auto-redirect will happen
                const displayMessage = isPOFlow
                    ? `${baseMessage}\n\n⏱ Auto-redirecting to GRN form in 10 seconds...`
                    : baseMessage;

                const navigateAfterClose = () => {
                    if (isPOFlow) {
                        this.router.navigate(['/app/inventory/grn-list/add'], {
                            queryParams: {
                                poId: formValue.referenceId,
                                gatePassNo: generatedPassNo,
                                qty: formValue.expectedQty
                            }
                        });
                    } else if (formValue.referenceType === GatePassReferenceType.SaleReturn) {
                        this.router.navigate(['/app/inventory/sale-return']);
                    } else if (formValue.referenceType === GatePassReferenceType.PurchaseReturn) {
                        this.router.navigate(['/app/inventory/purchase-return']);
                    } else {
                        this.router.navigate(['/app/inventory/gate-pass']);
                    }
                };

                const dialogRef = this.persistentDialog.openPersistent({
                    title: 'Success',
                    message: displayMessage,
                    status: 'success',
                    isSuccess: true
                }, '/app/inventory/gate-pass');

                // Auto-redirect to GRN after 10s (PO flow only)
                let autoTimer: any = null;
                if (isPOFlow) {
                    autoTimer = setTimeout(() => {
                        this.persistentDialog.clearState();
                        this.dialog.closeAll();
                        navigateAfterClose();
                    }, 10000);
                }

                dialogRef.afterClosed().subscribe(() => {
                    if (autoTimer) clearTimeout(autoTimer); // User clicked OK — cancel auto-redirect
                    navigateAfterClose();
                });

            },
            error: (err) => {
                this.isSaving = false;
                this.loadingService.setLoading(false);
                console.error(err);
                const errorMessage = err.error?.message || err.message || `Failed to ${this.isEditMode ? 'update' : 'generate'} Inward Pass.`;
                this.dialog.open(StatusDialogComponent, {
                    data: {
                        title: 'Error',
                        message: errorMessage,
                        status: 'error',
                        isSuccess: false
                    }
                });
            }
        });
    }

    goBack() {
        // Intelligent back button: Go back to source if available
        const type = this.route.snapshot.queryParams['type'];
        if (type === 'sale-return') {
            this.router.navigate(['/app/inventory/sale-return']);
        } else if (type === 'po') {
            this.router.navigate(['/app/inventory/polist']);
        } else if (type === 'purchase-return') {
            this.router.navigate(['/app/inventory/purchase-return']);
        } else {
            this.router.navigate(['/app/inventory/gate-pass']);
        }
    }
}
