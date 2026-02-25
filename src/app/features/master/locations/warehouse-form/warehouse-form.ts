import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MaterialModule } from '../../../../shared/material/material/material-module';
import { LocationService } from '../services/locations.service';
import { LoadingService } from '../../../../core/services/loading.service';
import { MatDialog } from '@angular/material/dialog';
import { StatusDialogComponent } from '../../../../shared/components/status-dialog-component/status-dialog-component';
import { SummaryStat, SummaryStatsComponent } from '../../../../shared/components/summary-stats-component/summary-stats-component';
@Component({
    selector: 'app-warehouse-form',
    standalone: true,
    imports: [CommonModule, MaterialModule, ReactiveFormsModule, RouterLink, 
        SummaryStatsComponent],
    templateUrl: './warehouse-form.html',
    styleUrl: './warehouse-form.scss',
})
export class WarehouseForm implements OnInit {
    warehouseForm: FormGroup;
    isEditMode = false;
    warehouseId: string | null = null;
    isLoading = false;
    summaryStats: SummaryStat[] = [];


    constructor(
        private fb: FormBuilder,
        private locationService: LocationService,
        private route: ActivatedRoute,
        private router: Router,
        private loadingService: LoadingService,
        private dialog: MatDialog
    ) {
        this.warehouseForm = this.fb.group({
            id: [null],
            name: ['', [Validators.required, Validators.maxLength(100)]],
            city: ['', [Validators.maxLength(100)]],
            description: ['', [Validators.maxLength(500)]],
            isActive: [true]
        });
    }

    ngOnInit(): void {
        this.warehouseId = this.route.snapshot.paramMap.get('id');
        if (this.warehouseId) {
            this.isEditMode = true;
            this.loadWarehouseData(this.warehouseId);
        } else {
            this.loadStatsOnly();
        }
    }

    loadStatsOnly() {
        this.locationService.getWarehouses().subscribe({
            next: (warehouses) => {
                this.updateStats(warehouses);
            }
        });
    }



    loadWarehouseData(id: string) {
        this.isLoading = true;
        this.loadingService.setLoading(true);
        this.locationService.getWarehouses().subscribe({
            next: (warehouses) => {
                const warehouse = warehouses.find(w => w.id === id);
                if (warehouse) {
                    this.warehouseForm.patchValue(warehouse);
                }
                this.updateStats(warehouses);

                this.isLoading = false;
                this.loadingService.setLoading(false);
            },
            error: () => {
                this.isLoading = false;
                this.loadingService.setLoading(false);
            }
        });
    }



    private updateStats(warehouses: any[]): void {
        const total = warehouses.length;
        const active = warehouses.filter(u => u.isActive).length;
        const inactive = total - active;

        this.summaryStats = [
            { label: 'Total Warehouses', value: total, icon: 'warehouse', type: 'info' },
            { label: 'Active', value: active, icon: 'check_circle', type: 'success' },
            { label: 'Inactive', value: inactive, icon: 'block', type: 'warning' }
        ];
    }

    onSubmit() {
        if (this.warehouseForm.invalid) {
            return;
        }

        this.isLoading = true;
        this.loadingService.setLoading(true);

        const payload = this.warehouseForm.value;

        if (this.isEditMode) {
            this.locationService.updateWarehouse(this.warehouseId!, payload).subscribe({
                next: () => this.handleSuccess('Warehouse updated successfully'),
                error: (err) => this.handleError(err)
            });
        } else {
            this.locationService.createWarehouse(payload).subscribe({
                next: () => this.handleSuccess('Warehouse created successfully'),
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
        this.router.navigate(['/app/master/warehouses']);
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
