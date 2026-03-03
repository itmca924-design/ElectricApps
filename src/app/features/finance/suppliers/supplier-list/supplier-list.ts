import { ChangeDetectorRef, Component, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { MaterialModule } from '../../../../shared/material/material/material-module';
import { ServerDatagridComponent } from '../../../../shared/components/server-datagrid-component/server-datagrid-component';
import { SupplierModalComponent } from '../../../../features/inventory/supplier-modal/supplier-modal';
import { GridColumn } from '../../../../shared/models/grid-column.model';
import { GridRequest } from '../../../../shared/models/grid-request.model';
import { SupplierService } from '../../../../features/inventory/service/supplier.service';
import { LoadingService } from '../../../../core/services/loading.service';
import { SummaryStat, SummaryStatsComponent } from '../../../../shared/components/summary-stats-component/summary-stats-component';
import { PermissionService } from '../../../../core/services/permission.service';

@Component({
  selector: 'app-supplier-list',
  standalone: true,
  imports: [CommonModule, MaterialModule, ServerDatagridComponent, SummaryStatsComponent],
  templateUrl: './supplier-list.html',
  styleUrl: './supplier-list.scss',
})
export class SupplierList implements OnInit {
  private router = inject(Router);
  private supplierService = inject(SupplierService);
  private cdr = inject(ChangeDetectorRef);
  private dialog = inject(MatDialog);
  private permissionService = inject(PermissionService);

  canAdd: boolean = true;

  loading = false;
  isDashboardLoading = true;
  private isFirstLoad = true;
  private loadingService = inject(LoadingService);
  data: any[] = [];
  totalCount = 0;
  lastRequest!: GridRequest;
  summaryStats: SummaryStat[] = [];

  columns: GridColumn[] = [
    { field: 'name', header: 'Supplier Name', sortable: true, width: 250, visible: true },
    { field: 'phone', header: 'Phone', sortable: true, width: 150, visible: true },
    { field: 'email', header: 'Email', sortable: true, width: 220, visible: true },
    { field: 'gstIn', header: 'GSTIN', sortable: true, width: 180, visible: true },
    {
      field: 'isActive',
      header: 'Status',
      width: 120,
      visible: true,
      cell: (row: any) => row.isActive ? 'Active' : 'Inactive'
    }
  ];

  ngOnInit(): void {
    this.canAdd = this.permissionService.hasPermission('CanAdd');

    // Global loader ON
    this.isDashboardLoading = true;
    this.isFirstLoad = true;
    this.loadingService.setLoading(true);
    this.cdr.detectChanges();

    this.loadSuppliers({
      pageNumber: 1,
      pageSize: 10,
      sortDirection: 'desc'
    });

    // Safety timeout - force stop loader after 10 seconds
    setTimeout(() => {
      if (this.isDashboardLoading) {
        console.warn('[SupplierList] Force stopping loader after 10s timeout');
        this.isDashboardLoading = false;
        this.isFirstLoad = false;
        this.loadingService.setLoading(false);
        this.cdr.detectChanges();
      }
    }, 10000);
  }

  loadSuppliers(request: GridRequest): void {
    this.lastRequest = request;
    this.loading = true;
    this.loadingService.setLoading(true); // Ensure global loader is active
    this.supplierService.getPaged(request).subscribe({
      next: (res) => {
        this.data = res.items;
        this.totalCount = res.totalCount;

        // Calculate Stats (Page-based assumption for now as per CompanyList pattern)
        const activeCount = this.data.filter(s => s.isActive).length;
        const inactiveCount = this.data.filter(s => !s.isActive).length;

        this.summaryStats = [
          { label: 'Total Suppliers', value: this.totalCount, icon: 'inventory', type: 'total' },
          { label: 'Active (Page)', value: activeCount, icon: 'check_circle', type: 'active' },
          { label: 'Inactive (Page)', value: inactiveCount, icon: 'cancel', type: 'warning' }
        ];

        this.loading = false;
        this.loadingService.setLoading(false);
        this.isDashboardLoading = false;
        this.isFirstLoad = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error(err);
        this.loading = false;
        this.loadingService.setLoading(false);
        this.isDashboardLoading = false;
        this.isFirstLoad = false;
        this.cdr.detectChanges();
      }
    });
  }

  addSupplier() {
    const dialogRef = this.dialog.open(SupplierModalComponent, {
      width: '600px',
      disableClose: true
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadSuppliers(this.lastRequest);
      }
    });
  }

  onEdit(row: any) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Edit Supplier',
        message: `Are you sure you want to edit supplier: ${row.name}?`,
        confirmText: 'Yes, Edit'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        const editDialog = this.dialog.open(SupplierModalComponent, {
          width: '600px',
          data: { supplier: row },
          disableClose: true
        });

        editDialog.afterClosed().subscribe(editResult => {
          if (editResult) {
            this.loadSuppliers(this.lastRequest);
          }
        });
      }
    });
  }

  onDelete(rows: any[]) {
    if (!rows || rows.length === 0) return;
    const row = rows[0];

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Delete Supplier',
        message: `Are you sure you want to delete supplier: ${row.name}? This action cannot be undone.`,
        confirmText: 'Yes, Delete',
        confirmColor: 'warn'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadingService.setLoading(true);
        this.supplierService.deleteSupplier(row.id).subscribe({
          next: () => {
            this.loadSuppliers(this.lastRequest);
            this.loadingService.setLoading(false);
          },
          error: (err) => {
            console.error('Delete failed', err);
            this.loadingService.setLoading(false);
          }
        });
      }
    });
  }
}
