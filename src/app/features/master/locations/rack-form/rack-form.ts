import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MaterialModule } from '../../../../shared/material/material/material-module';
import { LocationService } from '../services/locations.service';
import { Warehouse, Rack } from '../models/locations.model';
import { LoadingService } from '../../../../core/services/loading.service';
import { MatDialog } from '@angular/material/dialog';
import { StatusDialogComponent } from '../../../../shared/components/status-dialog-component/status-dialog-component';

@Component({
    selector: 'app-rack-form',
    standalone: true,
    imports: [CommonModule, MaterialModule, ReactiveFormsModule, RouterLink],
    templateUrl: './rack-form.html',
    styleUrl: './rack-form.scss',
})
export class RackForm implements OnInit {
    rackForm: FormGroup;
    isEditMode = false;
    rackId: string | null = null;
    isLoading = false;
    warehouses: Warehouse[] = [];

    constructor(
        private fb: FormBuilder,
        private locationService: LocationService,
        private route: ActivatedRoute,
        private router: Router,
        private loadingService: LoadingService,
        private dialog: MatDialog
    ) {
        this.rackForm = this.fb.group({
            id: [null],
            warehouseId: ['', [Validators.required]],
            name: ['', [Validators.required, Validators.maxLength(100)]],
            description: ['', [Validators.maxLength(500)]],
            isActive: [true]
        });
    }

    ngOnInit(): void {
        this.loadWarehouses();
        this.rackId = this.route.snapshot.paramMap.get('id');
        if (this.rackId) {
            this.isEditMode = true;
            this.loadRackData(this.rackId);
        }
    }

    loadWarehouses() {
        this.locationService.getWarehouses().subscribe({
            next: (data) => this.warehouses = data.filter(w => w.isActive),
            error: () => console.error('Failed to load warehouses')
        });
    }

    loadRackData(id: string) {
        this.isLoading = true;
        this.loadingService.setLoading(true);
        this.locationService.getRacks().subscribe({
            next: (racks) => {
                const rack = racks.find(r => r.id === id);
                if (rack) {
                    this.rackForm.patchValue(rack);
                }
                this.isLoading = false;
                this.loadingService.setLoading(false);
            },
            error: () => {
                this.isLoading = false;
                this.loadingService.setLoading(false);
            }
        });
    }

    onSubmit() {
        if (this.rackForm.invalid) {
            return;
        }

        this.isLoading = true;
        this.loadingService.setLoading(true);

        const payload = this.rackForm.value;

        if (this.isEditMode) {
            // Update logic can be added later if needed
            this.isLoading = false;
            this.loadingService.setLoading(false);
        } else {
            this.locationService.createRack(payload).subscribe({
                next: () => this.handleSuccess('Rack created successfully'),
                error: (err) => this.handleError(err)
            });
        }
    }

    private handleSuccess(message: string) {
        this.isLoading = false;
        this.loadingService.setLoading(false);
        this.dialog.open(StatusDialogComponent, {
            width: '400px',
            data: {
                isSuccess: true,
                status: 'success',
                title: 'Success',
                message: message
            }
        });
        this.router.navigate(['/app/master/racks']);
    }

    private handleError(err: any) {
        this.isLoading = false;
        this.loadingService.setLoading(false);
        this.dialog.open(StatusDialogComponent, {
            width: '400px',
            data: {
                isSuccess: false,
                status: 'error',
                title: 'Error',
                message: err.error?.message || 'Something went wrong'
            }
        });
    }
}
