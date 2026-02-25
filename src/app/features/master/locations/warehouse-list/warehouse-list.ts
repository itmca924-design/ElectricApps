import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { MaterialModule } from '../../../../shared/material/material/material-module';
import { ReactiveFormsModule } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import { MatSort } from '@angular/material/sort';
import { LocationService } from '../services/locations.service';
import { Warehouse } from '../models/locations.model';
import { SummaryStat, SummaryStatsComponent } from '../../../../shared/components/summary-stats-component/summary-stats-component';
import { LoadingService } from '../../../../core/services/loading.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { StatusDialogComponent } from '../../../../shared/components/status-dialog-component/status-dialog-component';

@Component({
    selector: 'app-warehouse-list',
    standalone: true,
    imports: [CommonModule, MaterialModule, ReactiveFormsModule, RouterLink, SummaryStatsComponent],
    templateUrl: './warehouse-list.html',
    styleUrl: './warehouse-list.scss',
})
export class WarehouseList implements OnInit {
    displayedColumns: string[] = ['index', 'name', 'description', 'status', 'actions'];
    dataSource = new MatTableDataSource<Warehouse>();
    isLoading = true;
    summaryStats: SummaryStat[] = [];

    @ViewChild(MatPaginator) paginator!: MatPaginator;
    @ViewChild(MatSort) sort!: MatSort;

    constructor(
        private locationService: LocationService,
        private cdr: ChangeDetectorRef,
        private router: Router,
        private loadingService: LoadingService,
        private snackBar: MatSnackBar,
        private dialog: MatDialog
    ) { }

    ngOnInit(): void {
        this.loadWarehouses();
    }

    loadWarehouses() {
        this.isLoading = true;
        this.loadingService.setLoading(true);
        this.locationService.getWarehouses().subscribe({
            next: (data) => {
                this.dataSource.data = data || [];
                this.dataSource.paginator = this.paginator;
                this.dataSource.sort = this.sort;
                this.updateStats();
                this.isLoading = false;
                this.loadingService.setLoading(false);
                this.cdr.detectChanges();
            },
            error: () => {
                this.isLoading = false;
                this.loadingService.setLoading(false);
                this.cdr.detectChanges();
            }
        });
    }

    private updateStats(): void {
        const total = this.dataSource.data.length;
        const active = this.dataSource.data.filter(u => u.isActive).length;
        const inactive = total - active;

        this.summaryStats = [
            { label: 'Total Warehouses', value: total, icon: 'warehouse', type: 'info' },
            { label: 'Active', value: active, icon: 'check_circle', type: 'success' },
            { label: 'Inactive', value: inactive, icon: 'block', type: 'warning' }
        ];
    }

    applyFilter(event: Event) {
        const filterValue = (event.target as HTMLInputElement).value;
        this.dataSource.filter = filterValue.trim().toLowerCase();
    }

    editWarehouse(warehouse: Warehouse) {
        this.router.navigate(['/app/master/warehouses/edit', warehouse.id]);
    }

    deleteWarehouse(warehouse: Warehouse) {
        const dialogRef = this.dialog.open(StatusDialogComponent, {
            width: '400px',
            data: {
                isSuccess: false,
                title: 'Delete Warehouse',
                message: `Are you sure you want to delete ${warehouse.name}?`,
                status: 'warning',
                showCancel: true,
                confirmText: 'Delete',
                cancelText: 'Cancel'
            }
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                this.isLoading = true;
                this.loadingService.setLoading(true);
                this.locationService.deleteWarehouse(warehouse.id).subscribe({
                    next: () => {
                        this.isLoading = false;
                        this.loadingService.setLoading(false);
                        this.dialog.open(StatusDialogComponent, {
                            width: '400px',
                            data: {
                                isSuccess: true,
                                status: 'success',
                                title: 'Deleted',
                                message: 'Warehouse deleted successfully'
                            }
                        });
                        this.loadWarehouses();
                    },
                    error: (err) => {
                        this.isLoading = false;
                        this.loadingService.setLoading(false);
                        this.dialog.open(StatusDialogComponent, {
                            width: '400px',
                            data: {
                                isSuccess: false,
                                status: 'error',
                                title: 'Error',
                                message: 'Failed to delete warehouse'
                            }
                        });
                        this.cdr.detectChanges();
                    }
                });
            }
        });
    }
}
