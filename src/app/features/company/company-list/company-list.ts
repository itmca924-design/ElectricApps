import { ChangeDetectorRef, Component, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { Router, RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { CompanyService } from '../services/company.service';
import { CompanyProfileDto } from '../model/company.model';
import { GridColumn } from '../../../shared/models/grid-column.model';
import { GridRequest } from '../../../shared/models/grid-request.model';
import { ServerDatagridComponent } from '../../../shared/components/server-datagrid-component/server-datagrid-component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { StatusDialogComponent } from '../../../shared/components/status-dialog-component/status-dialog-component';
import { LoadingService } from '../../../core/services/loading.service';
import { SummaryStat, SummaryStatsComponent } from '../../../shared/components/summary-stats-component/summary-stats-component';
import { PermissionService } from '../../../core/services/permission.service';

@Component({
    selector: 'app-company-list',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MaterialModule,
        ServerDatagridComponent,
        RouterLink,
        SummaryStatsComponent
    ],
    templateUrl: './company-list.html',
    styleUrl: './company-list.scss',
})
export class CompanyList implements OnInit {
    private cdr = inject(ChangeDetectorRef);
    private router = inject(Router);
    private dialog = inject(MatDialog);
    private companyService = inject(CompanyService);
    private loadingService = inject(LoadingService);
    private permissionService = inject(PermissionService);

    loading = false;
    data: CompanyProfileDto[] = [];
    totalCount = 0;
    selectedRows: any[] = [];
    lastRequest!: GridRequest;
    summaryStats: SummaryStat[] = [];

    canAdd: boolean = true;
    canDelete: boolean = true;

    @ViewChild(ServerDatagridComponent)
    grid!: ServerDatagridComponent<any>;

    columns: GridColumn[] = [
        { field: 'name', header: 'Company Name', sortable: true, width: 250, visible: true },
        { field: 'registrationNumber', header: 'Reg. No.', sortable: true, width: 150, visible: true },
        { field: 'gstin', header: 'GSTIN', sortable: true, width: 150, visible: true },
        { field: 'primaryEmail', header: 'Email', sortable: true, width: 200, visible: true },
        { field: 'primaryPhone', header: 'Phone', sortable: true, width: 150, visible: true },
        {
            field: 'isActive',
            header: 'Status',
            width: 100,
            visible: true,
            cell: (row: any) => row.isActive ? 'Active' : 'Inactive'
        }
    ];

    ngOnInit(): void {
        this.canAdd = this.permissionService.hasPermission('CanAdd');
        this.canDelete = this.permissionService.hasPermission('CanDelete');

        this.loadCompanies({
            pageNumber: 1,
            pageSize: 10,
            sortDirection: 'desc'
        });
    }

    loadCompanies(request: GridRequest): void {
        this.lastRequest = request;
        this.loading = true;
        this.loadingService.setLoading(true);
        this.companyService.getPaged(request).subscribe({
            next: (res) => {
                this.data = res.items;
                this.totalCount = res.totalCount;

                // Calculate Stats (Note: Active/Inactive currently based on page data, ideally should be from backend)
                const activeCount = this.data.filter(c => c.isActive).length;
                const inactiveCount = this.data.filter(c => !c.isActive).length;

                this.summaryStats = [
                    { label: 'Total Companies', value: this.totalCount, icon: 'business', type: 'total' },
                    { label: 'Active (Page)', value: activeCount, icon: 'check_circle', type: 'active' },
                    { label: 'Inactive (Page)', value: inactiveCount, icon: 'cancel', type: 'warning' }
                ];

                this.loading = false;
                this.loadingService.setLoading(false);
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error(err);
                this.loading = false;
                this.loadingService.setLoading(false);
                this.cdr.detectChanges();
            }
        });
    }

    onEdit(row: any): void {
        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            width: '400px',
            data: {
                title: 'Edit Company',
                message: `Are you sure you want to edit company: ${row.name}?`,
                confirmText: 'Yes, Edit'
            }
        });

        dialogRef.afterClosed().subscribe(confirm => {
            if (confirm) {
                this.router.navigate(['/app/company/edit', row.id]);
            }
        });
    }

    deleteCompany(company: any): void {
        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            data: {
                title: 'Confirm Delete',
                message: 'Are you sure you want to delete this company?'
            }
        });

        dialogRef.afterClosed().subscribe(confirm => {
            if (!confirm) return;

            this.loading = true;
            this.loadingService.setLoading(true);
            this.cdr.detectChanges();
            this.companyService.deleteCompany(company.id).subscribe({
                next: (res: any) => {
                    this.loading = false;
                    this.loadingService.setLoading(false);
                    this.cdr.detectChanges();
                    this.dialog.open(StatusDialogComponent, {
                        data: {
                            isSuccess: true,
                            message: res.message || 'Company deleted successfully'
                        }
                    });
                    this.loadCompanies(this.lastRequest);
                },
                error: (err) => {
                    this.loading = false;
                    this.loadingService.setLoading(false);
                    const message = err?.error?.message || 'Unable to delete company';
                    this.dialog.open(StatusDialogComponent, {
                        data: {
                            isSuccess: false,
                            message
                        }
                    });
                    this.cdr.detectChanges();
                }
            });
        });
    }

    confirmBulkDelete(): void {
        if (!this.selectedRows.length) return;

        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            width: '420px',
            data: {
                title: 'Delete Companies',
                message: `Are you sure you want to delete ${this.selectedRows.length} selected companies?`
            }
        });

        dialogRef.afterClosed().subscribe(confirm => {
            if (!confirm) return;

            const ids = this.selectedRows.map(x => x.id);
            this.loading = true;
            this.loadingService.setLoading(true);
            this.companyService.deleteMany(ids).subscribe({
                next: (res: any) => {
                    this.loading = false;
                    this.loadingService.setLoading(false);
                    this.cdr.detectChanges();
                    this.grid.clearSelection();
                    this.dialog.open(StatusDialogComponent, {
                        data: {
                            isSuccess: true,
                            message: res.message || 'Companies deleted successfully'
                        }
                    });
                    this.loadCompanies(this.lastRequest);
                },
                error: (err) => {
                    this.loading = false;
                    this.loadingService.setLoading(false);
                    const message = err?.error?.message || 'Unable to delete companies';
                    this.dialog.open(StatusDialogComponent, {
                        data: {
                            isSuccess: false,
                            message
                        }
                    });
                    this.cdr.detectChanges();
                }
            });
        });
    }

    onSelectionChange(rows: any[]): void {
        this.selectedRows = rows;
    }
}
