import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit, ViewChild } from '@angular/core';
import { MaterialModule } from '../../../../shared/material/material/material-module';
import { ReactiveFormsModule } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import { MatSort } from '@angular/material/sort';
import { LocationService } from '../services/locations.service';
import { Rack } from '../models/locations.model';
import { SummaryStat, SummaryStatsComponent } from '../../../../shared/components/summary-stats-component/summary-stats-component';
import { LoadingService } from '../../../../core/services/loading.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { StatusDialogComponent } from '../../../../shared/components/status-dialog-component/status-dialog-component';
import { PermissionService } from '../../../../core/services/permission.service';

@Component({
    selector: 'app-rack-list',
    standalone: true,
    imports: [CommonModule, MaterialModule, ReactiveFormsModule, RouterLink, SummaryStatsComponent],
    templateUrl: './rack-list.html',
    styleUrl: './rack-list.scss',
})
export class RackList implements OnInit {
    displayedColumns: string[] = ['index', 'warehouse', 'name', 'description', 'status', 'actions'];
    dataSource = new MatTableDataSource<Rack>();
    isLoading = true;
    isDashboardLoading = true;
    private isFirstLoad = true;
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

    private permissionService = inject(PermissionService);
    canAdd: boolean = true;
    canEdit: boolean = true;
    canDelete: boolean = true;

    ngOnInit(): void {
        this.canAdd = this.permissionService.hasPermission('CanAdd');
        this.canEdit = this.permissionService.hasPermission('CanEdit');
        this.canDelete = this.permissionService.hasPermission('CanDelete');

        this.isDashboardLoading = true;
        this.isFirstLoad = true;
        this.loadingService.setLoading(true);
        this.cdr.detectChanges();

        this.loadRacks();

        // Safety timeout - force stop loader after 10 seconds
        setTimeout(() => {
            if (this.isDashboardLoading) {
                console.warn('[RackList] Force stopping loader after 10s timeout');
                this.isDashboardLoading = false;
                this.isFirstLoad = false;
                this.loadingService.setLoading(false);
                this.cdr.detectChanges();
            }
        }, 10000);
    }

    loadRacks() {
        this.isLoading = true;
        this.locationService.getRacks().subscribe({
            next: (data) => {
                this.dataSource.data = data || [];
                this.dataSource.paginator = this.paginator;
                this.dataSource.sort = this.sort;
                this.updateStats();
                this.isLoading = false;

                if (this.isFirstLoad) {
                    this.isFirstLoad = false;
                    this.isDashboardLoading = false;
                    this.loadingService.setLoading(false);
                }
                this.cdr.detectChanges();
            },
            error: () => {
                this.isLoading = false;
                if (this.isFirstLoad) {
                    this.isFirstLoad = false;
                    this.isDashboardLoading = false;
                    this.loadingService.setLoading(false);
                }
                this.cdr.detectChanges();
            }
        });
    }

    private updateStats(): void {
        const total = this.dataSource.data.length;
        const active = this.dataSource.data.filter(u => u.isActive).length;
        const inactive = total - active;

        this.summaryStats = [
            { label: 'Total Racks', value: total, icon: 'view_module', type: 'info' },
            { label: 'Active', value: active, icon: 'check_circle', type: 'success' },
            { label: 'Inactive', value: inactive, icon: 'block', type: 'warning' }
        ];
    }

    applyFilter(event: Event) {
        const filterValue = (event.target as HTMLInputElement).value;
        this.dataSource.filter = filterValue.trim().toLowerCase();
    }

    editRack(rack: Rack) {
        this.router.navigate(['/app/master/racks/edit', rack.id]);
    }

    deleteRack(rack: Rack) {
        const dialogRef = this.dialog.open(StatusDialogComponent, {
            width: '400px',
            data: {
                isSuccess: false,
                title: 'Delete Rack',
                message: `Are you sure you want to delete ${rack.name}?`,
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
                this.locationService.deleteRack(rack.id).subscribe({
                    next: () => {
                        this.isLoading = false;
                        this.loadingService.setLoading(false);
                        this.dialog.open(StatusDialogComponent, {
                            width: '400px',
                            data: {
                                isSuccess: true,
                                status: 'success',
                                title: 'Deleted',
                                message: 'Rack deleted successfully'
                            }
                        });
                        this.loadRacks();
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
                                message: err.error?.message || 'Failed to delete rack'
                            }
                        });
                        this.cdr.detectChanges();
                    }
                });
            }
        });
    }
}
