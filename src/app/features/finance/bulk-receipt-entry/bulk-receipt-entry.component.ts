import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule } from '@angular/forms';
import { FinanceService } from '../service/finance.service';
import { customerService } from '../../master/customer-component/customer.service';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { LoadingService } from '../../../core/services/loading.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterModule } from '@angular/router';
import { Observable, startWith, map } from 'rxjs';
import { MatDialogRef, MatDialog } from '@angular/material/dialog';
import { StatusDialogComponent } from '../../../shared/components/status-dialog-component/status-dialog-component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { AuthService } from '../../../core/services/auth.service';

@Component({
    selector: 'app-bulk-receipt-entry',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, MaterialModule, RouterModule],
    templateUrl: './bulk-receipt-entry.component.html',
    styleUrls: ['./bulk-receipt-entry.component.scss']
})
export class BulkReceiptEntryComponent implements OnInit {
    fb = inject(FormBuilder);
    financeService = inject(FinanceService);
    customerService = inject(customerService);
    loadingService = inject(LoadingService);
    authService = inject(AuthService); // Inject Auth Service

    // Using MatDialog for status feedback
    dialog = inject(MatDialog);

    router = inject(Router);
    dialogRef = inject(MatDialogRef<BulkReceiptEntryComponent>);

    bulkForm!: FormGroup;
    customers: any[] = [];
    filteredCustomers: Observable<any[]>[] = [];
    modes = ['Cash', 'GPay', 'PhonePe', 'Paytm', 'Bank Transfer', 'Check'];
    today = new Date();
    minDate = new Date();
    maxDate = new Date();
    isLoading = false;

    ngOnInit() {
        this.initForm();
        this.loadCustomers();
    }

    initForm() {
        this.bulkForm = this.fb.group({
            rows: this.fb.array([])
        });
        this.addRow(); // Start with one row
    }

    get rows() {
        return this.bulkForm.get('rows') as FormArray;
    }

    loadCustomers() {
        this.loadingService.setLoading(true);
        const req = {
            searchTerm: '',
            customerNameFilter: '',
            statusFilter: '', // Filter by status if needed, usually outstanding
            pageNumber: 1,
            pageSize: 1000, // Fetch a large number to cover all outstanding customers
            sortBy: 'CustomerName',
            sortOrder: 'asc'
        };

        this.financeService.getOutstandingTracker(req).subscribe({
            next: (res: any) => {
                if (res && res.items && res.items.items) {
                    // Map outstanding items to customer structure
                    this.customers = res.items.items.map((item: any) => ({
                        id: item.customerId,
                        name: item.customerName,
                        // keeping other details if necessary
                    }));
                } else {
                    this.customers = [];
                }

                // Re-initialize filters because customers loaded async
                for (let i = 0; i < this.rows.length; i++) {
                    this.setupFilter(i);
                }
                this.loadingService.setLoading(false);
            },
            error: (err) => {
                console.error(err);
                this.loadingService.setLoading(false);
            }
        });
    }

    // Checkbox selection
    allSelected = false;
    isIndeterminate = false;

    // ... existing initForm ...

    addRow() {
        const row = this.fb.group({
            selected: [true],
            customer: ['', Validators.required],
            customerId: [null, Validators.required],
            currentBalance: [{ value: 0, disabled: true }],
            amount: [null, [Validators.required, Validators.min(1)]],
            paymentMode: ['Cash', Validators.required],
            referenceBy: [''],
            date: [this.today, Validators.required],
            remarks: ['']
        });

        this.rows.push(row);
        this.setupFilter(this.rows.length - 1);
        this.updateSelectAllState();
    }

    removeRow(index: number) {
        if (this.rows.length > 1) {
            this.rows.removeAt(index);
            this.filteredCustomers.splice(index, 1);
            this.updateSelectAllState();
        }
    }

    toggleSelectAll() {
        // Toggle the state
        this.allSelected = !this.allSelected;

        // Apply to all rows
        this.rows.controls.forEach(row => {
            row.patchValue({ selected: this.allSelected });
        });
        this.isIndeterminate = false;
    }

    updateSelectAllState() {
        if (this.rows.length === 0) {
            this.allSelected = false;
            this.isIndeterminate = false;
            return;
        }

        const selectedCount = this.rows.controls.filter(row => row.get('selected')?.value === true).length;
        const total = this.rows.length;

        this.allSelected = selectedCount === total;
        this.isIndeterminate = selectedCount > 0 && selectedCount < total;
    }

    setupFilter(index: number) {
        const control = this.rows.at(index).get('customer');
        if (control) {
            const filter = control.valueChanges.pipe(
                startWith(typeof control.value === 'string' ? control.value : (control.value?.name || '')),
                map(value => {
                    const name = typeof value === 'string' ? value : value?.name;
                    return name ? this._filter(name) : this.customers.slice();
                })
            );

            if (this.filteredCustomers.length <= index) {
                this.filteredCustomers.push(filter);
            } else {
                this.filteredCustomers[index] = filter;
            }
        }
    }

    private _filter(name: string): any[] {
        const filterValue = name.toLowerCase();
        return this.customers.filter(option =>
            (option.name?.toLowerCase().includes(filterValue)) ||
            (option.id?.toString().includes(filterValue))
        );
    }

    displayFn(customer: any): string {
        return customer && customer.name ? `${customer.name} (#${customer.id})` : '';
    }

    onCustomerSelected(event: any, index: number) {
        const customer = event.option.value;

        // Check for duplicates
        const isDuplicate = this.rows.controls.some((row, i) => {
            if (i === index) return false;
            const existingId = row.get('customerId')?.value;
            return existingId === customer.id;
        });

        if (isDuplicate) {
            this.dialog.open(StatusDialogComponent, {
                data: {
                    title: 'Duplicate Customer',
                    message: 'This customer is already added to the list.',
                    status: 'warning',
                    isSuccess: false
                }
            });
            this.rows.at(index).get('customer')?.setValue(''); // Clear input
            return;
        }

        const row = this.rows.at(index);
        row.patchValue({
            customerId: customer.id,
            customer: customer
        });

        this.fetchBalance(customer, index);
    }

    fetchBalance(customer: any, index: number) {
        // Use Outstanding Tracker API to get the correct current balance
        // We filter by the customer's name to narrow it down

        const req = {
            searchTerm: customer.name,
            customerNameFilter: customer.name,
            statusFilter: '',
            pageNumber: 1,
            pageSize: 10,
            sortBy: 'CustomerName',
            sortOrder: 'asc'
        };

        this.financeService.getOutstandingTracker(req).subscribe({
            next: (res: any) => {
                // The response structure matches OutstandingPagedResultDto having Items -> Items list
                if (res && res.items && res.items.items) {
                    // Find accurate match by ID
                    const match = res.items.items.find((c: any) => c.customerId === customer.id);
                    if (match) {
                        const balance = match.pendingAmount;
                        const row = this.rows.at(index);

                        row.patchValue({ currentBalance: balance });

                        if (balance > 0) {
                            row.patchValue({ amount: balance });

                            // For now, populate a dummy SO number or fetch from backend if available
                            // Making it read-only as requested
                            const soNumber = `SO-2026-00${10 + index}`;
                            const refControl = row.get('referenceBy');
                            if (refControl) {
                                refControl.setValue(soNumber);
                                refControl.disable();
                            }
                        }
                    }
                }
            },
            error: (err) => console.error('Error fetching balance:', err)
        });
    }

    // ... rest of the code ...
    saveAll() {
        // Filter only selected rows
        const selectedControls = this.rows.controls.filter(control => control.get('selected')?.value === true);

        if (selectedControls.length === 0) {
            this.dialog.open(StatusDialogComponent, {
                data: {
                    title: 'No Selection',
                    message: 'Please select at least one entry to save.',
                    status: 'warning',
                    isSuccess: false
                }
            });
            return;
        }

        // Validate selected rows
        const invalidControl = selectedControls.find(control => control.invalid);
        if (invalidControl) {
            invalidControl.markAllAsTouched(); // Mark fields in the invalid row
            this.dialog.open(StatusDialogComponent, {
                data: {
                    title: 'Validation Error',
                    message: 'Please fill all required fields for selected entries.',
                    status: 'warning',
                    isSuccess: false
                }
            });
            return;
        }

        const rawValues = selectedControls.map(c => c.getRawValue());
        const references = rawValues
            .map((v: any) => v.referenceBy?.trim())
            .filter((v: any) => v && v.length > 0);

        // Check for duplicates in selected batch
        const uniqueRefs = new Set(references);
        if (uniqueRefs.size !== references.length) {
            this.dialog.open(StatusDialogComponent, {
                data: {
                    title: 'Duplicate References',
                    message: 'Duplicate Reference Numbers found in selected entries.',
                    status: 'warning',
                    isSuccess: false
                }
            });
            return;
        }

        // Prepare payload first
        const payload = rawValues.map(val => {
            return {
                customerId: val.customerId,
                amount: Number(val.amount),
                paymentMode: val.paymentMode,
                referenceNumber: val.referenceBy,
                paymentDate: val.date ? new Date(val.date).toISOString() : new Date().toISOString(),
                remarks: val.remarks || '',
                createdBy: this.authService.getUserName()
            };
        });

        // Show Confirmation Dialog
        const confirmRef = this.dialog.open(ConfirmDialogComponent, {
            width: '400px',
            data: {
                title: 'Confirm Save',
                message: `Are you sure you want to save ${payload.length} receipt(s)?`,
                confirmText: 'Yes, Save'
            }
        });

        confirmRef.afterClosed().subscribe(result => {
            if (result) {
                this.performSave(payload);
            }
        });
    }

    private performSave(payload: any[]) {
        this.isLoading = true;
        this.financeService.recordBulkCustomerReceipts(payload).subscribe({
            next: () => {
                this.isLoading = false;
                const ref = this.dialog.open(StatusDialogComponent, {
                    data: {
                        title: 'Success',
                        message: 'Selected receipts saved successfully!',
                        status: 'success',
                        isSuccess: true
                    }
                });

                ref.afterClosed().subscribe(() => {
                    this.dialogRef.close(true);
                });
            },
            error: (err) => {
                this.isLoading = false;
                console.error(err);

                let errorMsg = 'Failed to save receipts. Please check input data.';
                if (err.error && err.error.errors) {
                    // Try to extract first validation error
                    const keys = Object.keys(err.error.errors);
                    if (keys.length > 0) {
                        const firstError = err.error.errors[keys[0]];
                        if (Array.isArray(firstError)) {
                            errorMsg = firstError[0] as string;
                        } else {
                            errorMsg = String(firstError);
                        }
                    }
                } else if (err.error && err.error.message) {
                    errorMsg = err.error.message;
                } else if (err.status === 400) {
                    errorMsg = 'Bad Request: Missing required fields or invalid data.';
                }

                this.dialog.open(StatusDialogComponent, {
                    data: {
                        title: 'Error',
                        message: errorMsg,
                        status: 'error',
                        isSuccess: false
                    }
                });
            }
        });
    }

    goBack() {
        this.dialogRef.close(false);
    }
}
