import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { Validators, FormBuilder, FormGroup, ReactiveFormsModule, FormArray } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';

import { CompanyService } from '../services/company.service';
import { CompanyProfileDto, UpsertCompanyRequest } from '../model/company.model';
import { FormFooter } from '../../shared/form-footer/form-footer';
import { StatusDialogComponent } from '../../../shared/components/status-dialog-component/status-dialog-component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { environment } from '../../../enviornments/environment';
import { LoadingService } from '../../../core/services/loading.service';

@Component({
    selector: 'app-company-form',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, MaterialModule, FormFooter],
    templateUrl: './company-form.html',
    styleUrl: './company-form.scss',
})
export class CompanyForm implements OnInit {
    private fb = inject(FormBuilder);
    private dialog = inject(MatDialog);
    private cdr = inject(ChangeDetectorRef);
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private companyService = inject(CompanyService);
    private loadingService = inject(LoadingService);

    companyForm!: FormGroup;
    loading = false;
    companyId: string | null = null;

    ngOnInit(): void {
        this.createForm();
        this.route.paramMap.subscribe(params => {
            this.companyId = params.get('id');
            this.resetImageStates();
            if (this.companyId) {
                this.loadCompany();
            } else {
                this.companyForm.reset({
                    isActive: true,
                    address: { id: 0, country: 'India' },
                    bankInfo: { id: 0, accountType: 'Current' }
                });
                this.signatories.clear();
            }
        });
    }

    private resetImageStates() {
        this.selectedLogo = null;
        this.logoPreview = null;
        this.cdr.detectChanges();
    }

    createForm() {
        this.companyForm = this.fb.group({
            name: ['', Validators.required],
            tagline: [''],
            registrationNumber: ['', Validators.required],
            gstin: ['', [Validators.required, Validators.pattern('^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$')]],
            logoUrl: [''],
            primaryEmail: ['', [Validators.required, Validators.email]],
            primaryPhone: ['', [Validators.required]],
            website: [''],
            message: [''],
            driverWhatsAppMessage: [''],
            smtpEmail: ['', [Validators.email]],
            smtpPassword: [''],
            smtpHost: [''],
            smtpPort: [587],
            smtpUseSsl: [true],
            isActive: [true],

            // Address Nested Group
            address: this.fb.group({
                id: [0],
                addressLine1: ['', Validators.required],
                addressLine2: [''],
                city: ['', Validators.required],
                state: ['', Validators.required],
                stateCode: ['', [Validators.required, Validators.maxLength(2)]],
                pinCode: ['', [Validators.required, Validators.pattern('^[0-9]{6}$')]],
                country: ['India', Validators.required]
            }),

            // Bank Info Nested Group
            bankInfo: this.fb.group({
                id: [0],
                bankName: ['', Validators.required],
                branchName: [''],
                accountNumber: ['', Validators.required],
                ifscCode: ['', [Validators.required, Validators.pattern('^[A-Z]{4}0[A-Z0-9]{6}$')]],
                accountType: ['Current', Validators.required]
            }),

            // Authorized Signatories FormArray
            authorizedSignatories: this.fb.array([])
        });
        this.cdr.detectChanges();
    }

    get signatories(): FormArray {
        return this.companyForm.get('authorizedSignatories') as FormArray;
    }

    addSignatory() {
        const sigForm = this.fb.group({
            id: [0],
            personName: ['', Validators.required],
            designation: ['', Validators.required],
            signatureImageUrl: [''],
            isDefault: [false]
        });
        this.signatories.push(sigForm);
        this.cdr.detectChanges();
    }

    removeSignatory(index: number) {
        this.signatories.removeAt(index);
    }

    loadCompany() {
        if (!this.companyId) return;
        this.loading = true;
        this.loadingService.setLoading(true);
        this.companyService.getById(+this.companyId).subscribe({
            next: (res) => {
                // Reset form to base state before patching
                this.companyForm.reset({
                    isActive: true,
                    address: { id: 0, country: 'India' },
                    bankInfo: { id: 0, accountType: 'Current' }
                });

                // Clear and Re-populate Signatories
                this.signatories.clear();
                const sigs = res.authorizedSignatories || [];
                sigs.forEach(sig => {
                    this.signatories.push(this.fb.group({
                        id: [sig.id],
                        personName: [sig.personName, Validators.required],
                        designation: [sig.designation, Validators.required],
                        signatureImageUrl: [sig.signatureImageUrl],
                        isDefault: [sig.isDefault]
                    }));
                });

                // Patch the entire form
                this.companyForm.patchValue(res);

                // Ensure logo state is synced (especially if we want to show existing logo)
                this.logoPreview = null;

                this.loading = false;
                this.loadingService.setLoading(false);
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error('Error loading company:', err);
                this.loading = false;
                this.loadingService.setLoading(false);
                this.cdr.detectChanges();
            }
        });
    }

    onSave(): void {
        if (this.companyForm.invalid) {
            console.error('Form Validation Errors:', this.getFormValidationErrors());
            this.companyForm.markAllAsTouched();
            return;
        }

        const action = this.companyId ? 'Update' : 'Create';
        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            data: {
                title: `Confirm ${action}`,
                message: `Are you sure you want to ${action.toLowerCase()} this company?`
            }
        });

        dialogRef.afterClosed().subscribe(confirm => {
            if (!confirm) return;

            this.loading = true;
            this.loadingService.setLoading(true);
            const payload: UpsertCompanyRequest = this.companyForm.value;

            const request = this.companyId
                ? this.companyService.updateCompany(+this.companyId, payload)
                : this.companyService.insertCompany(payload);

            request.subscribe({
                next: (res: any) => {
                    this.loading = false;
                    this.loadingService.setLoading(false);
                    // Handle both object {id: 1} and primitive integer responses
                    const newId = (res && typeof res === 'object') ? res.id : res;

                    this.dialog.open(StatusDialogComponent, {
                        data: {
                            isSuccess: true,
                            message: (res && res.message) || 'Company saved successfully'
                        }
                    }).afterClosed().subscribe(() => {
                        if (this.selectedLogo) {
                            this.uploadLogo(newId || +this.companyId!);
                        }
                        this.router.navigate(['/app/company']);
                    });
                },
                error: (err) => {
                    this.loading = false;
                    this.loadingService.setLoading(false);
                    this.dialog.open(StatusDialogComponent, {
                        data: {
                            isSuccess: false,
                            message: err.error?.message ?? 'Something went wrong'
                        }
                    });
                    this.cdr.detectChanges();
                }
            });
        });
    }

    onCancel() {
        this.router.navigate(['/app/company']);
    }

    // --- Image Helpers ---
    getImgUrl(url: string | null | undefined): string {
        if (!url) return '';
        if (url.startsWith('data:image') || url.startsWith('http')) {
            return url;
        }
        // Normalize URL - ensure no double slashes when joining with base URL
        const cleanUrl = url.startsWith('/') ? url.substring(1) : url;
        return `${environment.CompanyRootUrl}/${cleanUrl}`;
    }

    // --- Logo Upload Logic ---
    selectedLogo: File | null = null;
    logoPreview: string | null = null;

    onLogoSelected(event: any): void {
        const file = event.target.files[0];
        if (file) {
            this.selectedLogo = file;
            const reader = new FileReader();
            reader.onload = (e) => (this.logoPreview = e.target?.result as string);
            reader.readAsDataURL(file);
        }
    }

    onSignatureSelected(event: any, index: number): void {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.signatories.at(index).get('signatureImageUrl')?.setValue(e.target?.result as string);
                this.cdr.detectChanges();
            };
            reader.readAsDataURL(file);
        }
    }

    uploadLogo(id: number): void {
        if (!this.selectedLogo) return;

        this.companyService.uploadLogo(id, this.selectedLogo).subscribe({
            next: (res) => {
                console.log('Logo uploaded successfully', res);
            },
            error: (err) => {
                console.error('Logo upload failed', err);
            }
        });
    }

    private getFormValidationErrors() {
        const errors: any = {};
        const calculateErrors = (group: FormGroup | FormArray, name: string) => {
            Object.keys(group.controls).forEach(key => {
                const control = group.get(key);
                const controlName = name ? `${name}.${key}` : key;
                if (control instanceof FormGroup || control instanceof FormArray) {
                    calculateErrors(control, controlName);
                } else {
                    const controlErrors = control?.errors;
                    if (controlErrors) {
                        errors[controlName] = controlErrors;
                    }
                }
            });
        };
        calculateErrors(this.companyForm, '');
        return errors;
    }

}
