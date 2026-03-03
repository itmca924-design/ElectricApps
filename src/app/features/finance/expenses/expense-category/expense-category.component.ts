import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { ViewChild } from '@angular/core';
import { StatusDialogComponent } from '../../../../shared/components/status-dialog-component/status-dialog-component';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { FinanceService } from '../../service/finance.service';
import { LoadingService } from '../../../../core/services/loading.service';
import { SummaryStat, SummaryStatsComponent } from '../../../../shared/components/summary-stats-component/summary-stats-component';
import { PermissionService } from '../../../../core/services/permission.service';

@Component({
    selector: 'app-expense-category',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatTableModule,
        MatButtonModule,
        MatIconModule,
        MatInputModule,
        MatFormFieldModule,
        MatCardModule,
        MatPaginatorModule,
        SummaryStatsComponent
    ],
    templateUrl: './expense-category.component.html',
    styleUrls: ['./expense-category.component.scss']
})
export class ExpenseCategoryComponent implements OnInit {
    categoryForm: FormGroup;
    categories: any[] = [];
    dataSource = new MatTableDataSource<any>([]);
    displayedColumns: string[] = ['name', 'description', 'isActive', 'actions'];
    isEditing = false;
    editingId: number | null = null;
    summaryStats: SummaryStat[] = [];
    isLoading = false;

    @ViewChild(MatPaginator) paginator!: MatPaginator;

    constructor(
        private fb: FormBuilder,
        private financeService: FinanceService,
        private dialog: MatDialog,
        private loadingService: LoadingService,
        private cdr: ChangeDetectorRef,
        private permissionService: PermissionService
    ) {
        this.categoryForm = this.fb.group({
            name: ['', [Validators.required, Validators.maxLength(100)]],
            description: [''],
            isActive: [true]
        });
    }

    canAdd: boolean = true;
    canEdit: boolean = true;
    canDelete: boolean = true;

    ngOnInit(): void {
        this.canAdd = this.permissionService.hasPermission('CanAdd');
        this.canEdit = this.permissionService.hasPermission('CanEdit');
        this.canDelete = this.permissionService.hasPermission('CanDelete');
        this.loadCategories();
    }

    loadCategories(): void {
        this.isLoading = true;
        this.loadingService.setLoading(true);
        this.financeService.getExpenseCategories().subscribe({
            next: (data) => {
                this.categories = data || [];
                this.dataSource.data = this.categories;
                setTimeout(() => {
                    this.dataSource.paginator = this.paginator;
                });
                this.updateStats();
                this.isLoading = false;
                this.loadingService.setLoading(false);
                this.cdr.detectChanges();
            },
            error: (err) => {
                this.isLoading = false;
                this.loadingService.setLoading(false);
                this.showError('Failed to load categories');
                this.cdr.detectChanges();
            }
        });
    }

    private updateStats(): void {
        const total = this.categories.length;
        const active = this.categories.filter(c => c.isActive).length;
        const inactive = total - active;

        this.summaryStats = [
            { label: 'Total Categories', value: total, icon: 'category', type: 'info' },
            { label: 'Active', value: active, icon: 'check_circle', type: 'success' },
            { label: 'Inactive', value: inactive, icon: 'block', type: 'warning' }
        ];
    }

    onSubmit(): void {
        if (this.categoryForm.invalid) return;

        const category = this.categoryForm.value;
        const actionText = this.isEditing ? 'Update' : 'Create';

        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            width: '400px',
            data: {
                title: `Confirm ${actionText} Category`,
                message: `Are you sure you want to ${actionText.toLowerCase()} this expense category: ${category.name}?`,
                confirmText: actionText
            }
        });

        dialogRef.afterClosed().subscribe(confirm => {
            if (confirm) {
                if (this.isEditing && this.editingId) {
                    this.financeService.updateExpenseCategory(this.editingId, { ...category, id: this.editingId }).subscribe({
                        next: () => {
                            this.showSuccess('Category updated successfully');
                            this.resetForm();
                            this.loadCategories();
                        },
                        error: () => this.showError('Failed to update category')
                    });
                } else {
                    this.financeService.createExpenseCategory(category).subscribe({
                        next: () => {
                            this.showSuccess('Category created successfully');
                            this.resetForm();
                            this.loadCategories();
                        },
                        error: () => this.showError('Failed to create category')
                    });
                }
            }
            this.cdr.detectChanges();
        });
    }

    editCategory(category: any): void {
        this.isEditing = true;
        this.editingId = category.id;
        this.categoryForm.patchValue({
            name: category.name,
            description: category.description,
            isActive: category.isActive
        });
        this.cdr.detectChanges();
    }

    deleteCategory(id: number): void {
        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            width: '400px',
            data: {
                title: 'Confirm Delete',
                message: 'Are you sure you want to delete this expense category?',
                confirmText: 'Delete',
                confirmColor: 'warn'
            }
        });

        dialogRef.afterClosed().subscribe(confirmed => {
            if (confirmed) {
                this.financeService.deleteExpenseCategory(id).subscribe({
                    next: () => {
                        this.showSuccess('Category deleted successfully');
                        this.loadCategories();
                    },
                    error: () => this.showError('Failed to delete category')
                });
            }
            this.cdr.detectChanges();
        });
    }

    resetForm(): void {
        this.categoryForm.reset({ isActive: true });
        this.isEditing = false;
        this.editingId = null;
        this.cdr.detectChanges();
    }

    private showSuccess(message: string): void {
        this.dialog.open(StatusDialogComponent, {
            data: {
                isSuccess: true,
                message: message
            }
        });
    }

    private showError(message: string): void {
        this.dialog.open(StatusDialogComponent, {
            data: {
                isSuccess: false,
                message: message
            }
        });
    }
}
