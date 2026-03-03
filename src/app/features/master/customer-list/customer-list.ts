import { ChangeDetectorRef, Component, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { Router } from '@angular/router';
import { customerService } from '../customer-component/customer.service';
import { GridColumn } from '../../../shared/models/grid-column.model';
import { GridRequest } from '../../../shared/models/grid-request.model';
import { ServerDatagridComponent } from '../../../shared/components/server-datagrid-component/server-datagrid-component';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { CustomerComponent } from '../customer-component/customer-component';
import { LoadingService } from '../../../core/services/loading.service';
import { SummaryStat, SummaryStatsComponent } from '../../../shared/components/summary-stats-component/summary-stats-component';
import { PermissionService } from '../../../core/services/permission.service';

@Component({
  selector: 'app-customer-list',
  standalone: true,
  imports: [CommonModule, MaterialModule, ServerDatagridComponent, SummaryStatsComponent],
  templateUrl: './customer-list.html',
  styleUrl: './customer-list.scss',
})
export class CustomerList implements OnInit {
  private router = inject(Router);
  private customerService = inject(customerService);
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
    { field: 'customerName', header: 'Customer Name', sortable: true, width: 250, visible: true },
    { field: 'phone', header: 'Phone', sortable: true, width: 150, visible: true },
    { field: 'email', header: 'Email', sortable: true, width: 220, visible: true },
    { field: 'customerType', header: 'Type', sortable: true, width: 150, visible: true },
    { field: 'status', header: 'Status', sortable: true, width: 120, visible: true }
  ];

  ngOnInit(): void {
    this.canAdd = this.permissionService.hasPermission('CanAdd');

    // Global loader ON
    this.isDashboardLoading = true;
    this.isFirstLoad = true;
    this.loadingService.setLoading(true);
    this.cdr.detectChanges();

    this.loadCustomers({
      pageNumber: 1,
      pageSize: 10,
      sortDirection: 'desc'
    });

    // Safety timeout
    setTimeout(() => {
      if (this.isDashboardLoading) {
        console.warn('[CustomerList] Force stopping loader after 10s timeout');
        this.isDashboardLoading = false;
        this.isFirstLoad = false;
        this.loadingService.setLoading(false);
        this.cdr.detectChanges();
      }
    }, 10000);
  }

  loadCustomers(request: GridRequest): void {
    this.lastRequest = request;
    this.loading = true;
    this.loadingService.setLoading(true);
    this.customerService.getPaged(request).subscribe({
      next: (res) => {
        this.data = res.items;
        this.totalCount = res.totalCount;

        // Calculate Stats
        // "Status" field might be string based on column def. Often "Active" / "Inactive".
        // Let's assume the API returns a status string or boolean.
        // If the column uses 'status', I'll monitor what values it has. 
        // For now, I'll count based on a text check if I can, or ignore status stats if unknown.
        // Wait, current column uses 'status', no cell renderer in snippet.
        // I'll show Total and maybe Customer Types stats. Or simple Total.
        // Let's check column data for Customer Type.

        // Let's just do Total + Recent (Page count) for now to be safe.
        // Or if I can guess 'status' enum.

        this.summaryStats = [
          { label: 'Total Customers', value: this.totalCount, icon: 'people', type: 'total' },
          { label: 'On Page', value: this.data.length, icon: 'list', type: 'info' }
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

  addCustomer() {
    const dialogRef = this.dialog.open(CustomerComponent, {
      width: '600px',
      disableClose: true
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadCustomers(this.lastRequest);
      }
    });
  }

  onEdit(row: any) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Edit Customer',
        message: `Are you sure you want to edit customer: ${row.customerName}?`,
        confirmText: 'Yes, Edit'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        const editDialog = this.dialog.open(CustomerComponent, {
          width: '600px',
          data: { id: row.id },
          disableClose: true
        });

        editDialog.afterClosed().subscribe(editResult => {
          if (editResult) {
            this.loadCustomers(this.lastRequest);
          }
        });
      }
    });
  }

  onDelete(rows: any[]) {
    if (!rows || rows.length === 0) return;
    const row = rows[0]; // Grid single row delete bhejta hai [row] format mein

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Delete Customer',
        message: `Are you sure you want to delete customer: ${row.customerName || row.name}? This action cannot be undone.`,
        confirmText: 'Yes, Delete',
        confirmColor: 'warn'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadingService.setLoading(true);
        this.customerService.delete(row.id).subscribe({
          next: () => {
            this.loadCustomers(this.lastRequest);
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
