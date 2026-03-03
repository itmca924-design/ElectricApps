import { ChangeDetectorRef, Component, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { MaterialModule } from '../../../../shared/material/material/material-module';
import { Router, RouterLink } from '@angular/router';
import { CategoryService } from '../services/category.service';
import { GridColumn } from '../../../../shared/models/grid-column.model';
import { GridRequest } from '../../../../shared/models/grid-request.model';
import { ServerDatagridComponent } from '../../../../shared/components/server-datagrid-component/server-datagrid-component';
import { CategoryGridDto } from '../models/category-grid-response.model';
import { ApiResultDialog } from '../../../shared/api-result-dialog/api-result-dialog';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { StatusDialogComponent } from '../../../../shared/components/status-dialog-component/status-dialog-component';
import { LoadingService } from '../../../../core/services/loading.service';
import { SummaryStat, SummaryStatsComponent } from '../../../../shared/components/summary-stats-component/summary-stats-component';
import { PermissionService } from '../../../../core/services/permission.service';

@Component({
  selector: 'app-category-list',
  imports: [CommonModule,
    ReactiveFormsModule, MaterialModule, ServerDatagridComponent, RouterLink,
    SummaryStatsComponent
  ],
  templateUrl: './category-list.html',
  styleUrl: './category-list.scss',
})
export class CategoryList implements OnInit {
  summaryStats: SummaryStat[] = [];

  constructor(private cdr: ChangeDetectorRef,
    private router: Router, private dialog: MatDialog) { }

  readonly categoryService = inject(CategoryService)
  private loadingService = inject(LoadingService);
  private permissionService = inject(PermissionService);

  loading = false;
  isDashboardLoading = true;
  private isFirstLoad = true;
  filteredColumns: GridColumn[] = [];
  data: CategoryGridDto[] = [];
  totalCount = 0;

  canAdd: boolean = true;
  canDelete: boolean = true;

  // Summary Stats
  totalCategories = 0;
  activeCategories = 0;
  inactiveCategories = 0;

  selectedRows: any[] = [];
  lastRequest!: GridRequest;

  @ViewChild(ServerDatagridComponent)
  grid!: ServerDatagridComponent<any>;


  columns: GridColumn[] = [
    { field: 'categoryName', header: 'Category', sortable: true, width: 300, visible: true },
    { field: 'categoryCode', header: 'Code', sortable: true, width: 250, visible: true },
    { field: 'defaultGst', header: 'GST %', sortable: true, width: 150, visible: true },
    { field: 'description', header: 'Description', sortable: true, width: 200, visible: true },
    {
      field: 'isActive',
      header: 'Status',
      width: 150,
      visible: true,
      cell: (row: any) => row.isActive ? 'Yes' : 'No'

    }
  ];


  ngOnInit(): void {
    this.canAdd = this.permissionService.hasPermission('CanAdd');
    this.canDelete = this.permissionService.hasPermission('CanDelete');

    // Global loader ON
    this.isDashboardLoading = true;
    this.isFirstLoad = true;
    this.loadingService.setLoading(true);
    this.cdr.detectChanges();

    // Initial load
    this.loadCategories({
      pageNumber: 1,
      pageSize: 10,
      sortDirection: 'desc'
    });

    // Safety timeout - force stop loader after 10 seconds
    setTimeout(() => {
      if (this.isDashboardLoading) {
        console.warn('[CategoryList] Force stopping loader after 10s timeout');
        this.isDashboardLoading = false;
        this.isFirstLoad = false;
        this.loadingService.setLoading(false);
        this.cdr.detectChanges();
      }
    }, 10000);
  }

  loadCategories(request: GridRequest): void {
    this.lastRequest = request; // ✅ store last state
    this.loading = true;

    this.categoryService.getPaged(request).subscribe({
      next: res => {
        this.data = res.items;
        this.totalCount = res.totalCount;

        // Update Summary Stats
        this.summaryStats = [
          { label: 'Total Categories', value: this.totalCount, icon: 'category', type: 'total' },
          { label: 'Active Status', value: this.totalCount > 0 ? 'Managed' : 'None', icon: 'verified', type: 'active' },
          { label: 'Organization', value: 'Master Data', icon: 'inventory_2', type: 'info' }
        ];

        this.loading = false;

        // Turn off global loader on first load
        if (this.isFirstLoad) {
          this.isFirstLoad = false;
          this.isDashboardLoading = false;
          this.loadingService.setLoading(false);
        }
        this.cdr.detectChanges();
      },
      error: err => {
        console.error(err);
        this.loading = false;

        // Turn off global loader on first load
        if (this.isFirstLoad) {
          this.isFirstLoad = false;
          this.isDashboardLoading = false;
          this.loadingService.setLoading(false);
        }
        this.cdr.detectChanges();
      }
    });
  }


  onEdit(row: any): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Edit Category',
        message: `Are you sure you want to edit category: ${row.categoryName}?`,
        confirmText: 'Yes, Edit'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.router.navigate(['/app/master/categories/edit', row.id]);
      }
    });
  }

  deleteCategory(category: any): void {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Confirm Delete',
          message: 'Are you sure you want to delete this category?'
        }
      })
      .afterClosed()
      .subscribe(confirm => {
        if (!confirm) return;

        this.loading = true;
        this.cdr.detectChanges();
        this.categoryService.delete(category.id).subscribe({
          next: res => {
            this.loading = false;
            this.cdr.detectChanges();

            this.dialog.open(StatusDialogComponent, {
              data: {
                isSuccess: true,
                message: res.message
              }
            });

            this.loadCategories(this.lastRequest);
          },
          error: err => {
            this.loading = false;

            const message =
              err?.error?.message || 'Unable to delete category';
            this.cdr.detectChanges();

            this.dialog.open(StatusDialogComponent, {
              data: {
                isSuccess: false,
                message
              }
            });
          }
        });
      });
  }

  reloadGrid(): void {
    this.loadCategories(this.lastRequest);
  }

  confirmBulkDelete(): void {
    if (!this.selectedRows.length) return;

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Delete Categories',
        message: `Are you sure you want to delete ${this.selectedRows.length} selected categories?`
      }
    });

    dialogRef.afterClosed().subscribe(confirm => {
      if (!confirm) return;

      const ids = this.selectedRows.map(x => x.id);

      this.loading = true;


      this.categoryService.deleteMany(ids).subscribe({
        next: (res) => {
          this.loading = false;
          this.cdr.detectChanges();
          this.grid.clearSelection();

          this.dialog.open(StatusDialogComponent, {
            data: {
              isSuccess: true,
              message: res.message
            }
          });

          this.loadCategories(this.lastRequest);
        },
        error: err => {
          console.error(err);
          this.loading = false;
          const message =
            err?.error?.message || 'Unable to delete category';

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