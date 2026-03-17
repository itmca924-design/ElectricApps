import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { Validators, FormBuilder, FormGroup, ReactiveFormsModule, FormArray } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { MatDialog } from '@angular/material/dialog';
import { Router, RouterModule } from '@angular/router';
import { CompanyService } from '../services/company.service';
import { LoadingService } from '../../../core/services/loading.service';
import { StatusDialogComponent } from '../../../shared/components/status-dialog-component/status-dialog-component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Component({
    selector: 'app-bulk-company-form',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, MaterialModule, RouterModule],
    templateUrl: './bulk-company-form.html',
    styleUrl: './bulk-company-form.scss',
})
export class BulkCompanyForm implements OnInit {
    private fb = inject(FormBuilder);
    private dialog = inject(MatDialog);
    private cdr = inject(ChangeDetectorRef);
    private router = inject(Router);
    private companyService = inject(CompanyService);
    private loadingService = inject(LoadingService);

    bulkForm!: FormGroup;
    loading = false;
    defaultAddress: any = null;
    defaultBank: any = null;

    // GSTIN Pattern used in Standard Form
    gstinPattern = '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$';

    ngOnInit(): void {
        this.createForm();
        this.loadDefaultsAndAddRow();
    }

    loadDefaultsAndAddRow() {
        this.loading = true;
        this.loadingService.setLoading(true);
        this.companyService.getCompanyProfile().subscribe({
            next: (profile) => {
                if (profile) {
                    this.defaultAddress = profile.address;
                    this.defaultBank = profile.bankInfo;
                }
                this.loading = false;
                this.loadingService.setLoading(false);
                this.addRow();
                this.cdr.detectChanges();
            },
            error: () => {
                this.loading = false;
                this.loadingService.setLoading(false);
                this.addRow();
            }
        });
    }

    createForm() {
        this.bulkForm = this.fb.group({
            companies: this.fb.array([])
        });
    }

    get companies(): FormArray {
        return this.bulkForm.get('companies') as FormArray;
    }

    createCompanyGroup(): FormGroup {
        return this.fb.group({
            name: ['', Validators.required],
            registrationNumber: ['REG-' + Math.floor(Math.random() * 10000)], // Auto-generate if empty
            gstin: ['', [Validators.required, Validators.pattern(this.gstinPattern)]],
            primaryEmail: ['', [Validators.email]], // Optional
            primaryPhone: [''], // Optional
            tagline: [''],
            website: [''],
            // Dynamic Address from Primary Company - Removed strict requirements for Bulk skip
            address: this.fb.group({
                addressLine1: [this.defaultAddress?.addressLine1 || 'Main Office'],
                city: [this.defaultAddress?.city || 'Mumbai'],
                state: [this.defaultAddress?.state || 'Maharashtra'],
                stateCode: [this.defaultAddress?.stateCode || '27'],
                pinCode: [this.defaultAddress?.pinCode || '400001', [Validators.pattern('^[0-9]{6}$')]],
                country: [this.defaultAddress?.country || 'India']
            }),
            // Dynamic Bank Info from Primary Company - Removed strict requirements for Bulk skip
            bankInfo: this.fb.group({
                bankName: [this.defaultBank?.bankName || 'N/A'],
                accountNumber: [this.defaultBank?.accountNumber || '000000000000'],
                ifscCode: [this.defaultBank?.ifscCode || 'BANK0000000'],
                accountType: [this.defaultBank?.accountType || 'Current']
            }),
            authorizedSignatories: this.fb.array([]),
            isActive: [true]
        });
    }

    addRow() {
        this.companies.push(this.createCompanyGroup());
        this.cdr.detectChanges();
    }

    removeRow(index: number) {
        if (this.companies.length > 1) {
            this.companies.removeAt(index);
        }
    }

    duplicateRow(index: number) {
        const rowData = this.companies.at(index).value;
        const newGroup = this.createCompanyGroup();
        newGroup.patchValue(rowData);
        this.companies.push(newGroup);
        this.cdr.detectChanges();
    }

    onSave() {
        if (this.bulkForm.invalid) {
            this.bulkForm.markAllAsTouched();
            this.dialog.open(StatusDialogComponent, {
                data: { isSuccess: false, message: 'Please correct highlighting errors in the form.' }
            });
            return;
        }

        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            data: {
                title: 'Confirm Bulk Add',
                message: `Are you sure you want to add ${this.companies.length} companies?`
            }
        });

        dialogRef.afterClosed().subscribe(confirm => {
            if (!confirm) return;

            this.loading = true;
            this.loadingService.setLoading(true);

            const payloads = this.companies.value;
            const requests = payloads.map((p: any) => 
                this.companyService.insertCompany(p).pipe(
                    catchError(err => of({ error: true, name: p.name, message: err?.error?.message }))
                )
            );

            forkJoin(requests).subscribe({
                next: (results: unknown) => {
                    const data = results as any[];
                    this.loading = false;
                    this.loadingService.setLoading(false);

                    const errors = data.filter(r => r && r.error);
                    const successCount = data.length - errors.length;

                    if (errors.length === 0) {
                        this.dialog.open(StatusDialogComponent, {
                            data: { isSuccess: true, message: `Successfully added ${successCount} companies.` }
                        }).afterClosed().subscribe(() => this.router.navigate(['/app/company']));
                    } else {
                        const errorMsg = errors.map(e => `${e.name}: ${e.message}`).join(', ');
                        this.dialog.open(StatusDialogComponent, {
                            data: { 
                                isSuccess: successCount > 0, 
                                message: `Added ${successCount} companies. ${errors.length} failed: ${errorMsg}` 
                            }
                        }).afterClosed().subscribe(() => {
                            if (successCount > 0) this.router.navigate(['/app/company']);
                        });
                    }
                    this.cdr.detectChanges();
                },
                error: (err) => {
                    this.loading = false;
                    this.loadingService.setLoading(false);
                    console.error('Bulk add failed', err);
                    this.cdr.detectChanges();
                }
            });
        });
    }
}
