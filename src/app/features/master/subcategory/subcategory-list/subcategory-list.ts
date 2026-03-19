import { ChangeDetectorRef, Component, OnChanges, OnInit, SimpleChanges, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../../shared/material/material/material-module';
import { ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SubCategoryService } from '../services/subcategory.service';
import { SubCategory } from '../modesls/subcategory.model';
import { CategoryService } from '../../category/services/category.service';
import { ServerDatagridComponent } from '../../../../shared/components/server-datagrid-component/server-datagrid-component';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { GridColumn } from '../../../../shared/models/grid-column.model';
import { GridRequest } from '../../../../shared/models/grid-request.model';
import { ApiResultDialog } from '../../../shared/api-result-dialog/api-result-dialog';
import { StatusDialogComponent } from '../../../../shared/components/status-dialog-component/status-dialog-component';
import { LoadingService } from '../../../../core/services/loading.service';
import { SummaryStat, SummaryStatsComponent } from '../../../../shared/components/summary-stats-component/summary-stats-component';
import { PermissionService } from '../../../../core/services/permission.service';
import { PermissionDirective } from '../../../../core/directives/permission.directive';


@Component({
  selector: 'app-subcategory-list',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule, RouterLink, ServerDatagridComponent, SummaryStatsComponent, PermissionDirective],

  templateUrl: './subcategory-list.html',
  styleUrl: './subcategory-list.scss',
})
export class SubcategoryList implements OnInit, OnChanges {
  summaryStats: SummaryStat[] = [];

  constructor(
    private cdr: ChangeDetectorRef,
    private router: Router, private dialog: MatDialog
  ) { }

  readonly categoryService = inject(CategoryService)
  readonly subCategoryService = inject(SubCategoryService)
  private loadingService = inject(LoadingService);
  private permissionService = inject(PermissionService);

  loading = true;
  isDashboardLoading = true;
  private isFirstLoad = true;

  canAdd: boolean = true;
  canDelete: boolean = true;

  data: SubCategory[] = [];
  totalCount = 0;

  selectedRows: any[] = [];
  lastRequest!: GridRequest;

  @ViewChild(ServerDatagridComponent)
  grid!: ServerDatagridComponent<any>;


  columns: GridColumn[] = [
    { field: 'categoryName', header: 'Category', sortable: true, width: 300, visible: true },
    { field: 'subcategoryName', header: 'Subcategory', sortable: true, width: 300, visible: true },
    { field: 'subcategoryCode', header: 'Code', sortable: true, width: 150, visible: true },
    { field: 'defaultGst', header: 'GST %', sortable: true, width: 150, visible: true },
    { field: 'description', header: 'Description', sortable: true, width: 150, visible: true },
    {
      field: 'isActive',
      header: 'Status',
      sortable: true, width: 100, visible: true,
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
    this.loadSubCategories({
      pageNumber: 1,
      pageSize: 10,
      sortDirection: 'desc'
    });

    // Safety timeout - force stop loader after 10 seconds
    setTimeout(() => {
      if (this.isDashboardLoading) {
        console.warn('[SubcategoryList] Force stopping loader after 10s timeout');
        this.isDashboardLoading = false;
        this.isFirstLoad = false;
        this.loadingService.setLoading(false);
        this.cdr.detectChanges();
      }
    }, 10000);
  }

  loadSubCategories(request: GridRequest): void {
    this.lastRequest = request; // ✅ store last state
    this.loading = true;

    this.subCategoryService.getPaged(request).subscribe({
      next: res => {
        this.data = res.items;
        console.log(this.data);
        this.totalCount = res.totalCount;

        // Update Summary Stats
        this.summaryStats = [
          { label: 'Total Subcategories', value: this.totalCount, icon: 'category', type: 'total' },
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
        title: 'Edit Subcategory',
        message: `Are you sure you want to edit subcategory: ${row.subcategoryName}?`,
        confirmText: 'Yes, Edit'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.router.navigate(['/app/master/subcategories/edit', row.id]);
      }
    });
  }

  deleteCategory(category: any): void {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Confirm Delete',
          message: 'Are you sure you want to delete this sub category?'
        }
      })
      .afterClosed()
      .subscribe(confirm => {
        if (!confirm) return;

        this.loading = true;

        this.subCategoryService.delete(category.id).subscribe({
          next: res => {
            this.loading = false;
            this.cdr.detectChanges();
            this.dialog.open(StatusDialogComponent, {
              data: {
                isSuccess: true,
                message: res.message
              }
            });

            this.loadSubCategories(this.lastRequest);
          },
          error: err => {
            this.loading = false;
            this.cdr.detectChanges();
            const message =
              err?.error?.message || 'Unable to delete sub category';

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
    this.loadSubCategories(this.lastRequest);
  }

  confirmBulkDelete(): void {
    if (!this.selectedRows.length) return;

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Delete Price List',
        message: `Are you sure you want to delete ${this.selectedRows.length} selected sub category?`
      }
    });

    dialogRef.afterClosed().subscribe(confirm => {
      if (!confirm) return;

      const ids = this.selectedRows.map(x => x.id);

      this.loading = true;

      this.subCategoryService.deleteMany(ids).subscribe({
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

          this.loadSubCategories(this.lastRequest);
        },
        error: err => {
          console.error(err);
          this.loading = false;
          const message =
            err?.error?.message || 'Unable to delete price list';

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

  onSelectionChange(rows: any[]) {
    this.selectedRows = rows;
  }
  ngOnChanges(changes: SimpleChanges): void {

  }
}