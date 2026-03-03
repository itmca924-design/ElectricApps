import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCardModule } from '@angular/material/card';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { ViewChild } from '@angular/core';
import { StatusDialogComponent } from '../../../../shared/components/status-dialog-component/status-dialog-component';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { FinanceService } from '../../service/finance.service';
import { LoadingService } from '../../../../core/services/loading.service';
import { SummaryStat, SummaryStatsComponent } from '../../../../shared/components/summary-stats-component/summary-stats-component';
import { PermissionService } from '../../../../core/services/permission.service';

@Component({
    selector: 'app-expense-entry',
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
        MatSelectModule,
        MatDatepickerModule,
        MatNativeDateModule,
        MatPaginatorModule,
        SummaryStatsComponent
    ],
    templateUrl: './expense-entry.component.html',
    styleUrls: ['./expense-entry.component.scss']
})
export class ExpenseEntryComponent implements OnInit {
    expenseForm: FormGroup;
    categories: any[] = [];
    expenses: any[] = [];
    paymentModes = ['Cash', 'Bank', 'UPI', 'Credit Card', 'Cheque'];
    displayedColumns: string[] = ['date', 'category', 'amount', 'mode', 'refNo', 'actions'];
    isEditing = false;
    editingId: number | null = null;
    summaryStats: SummaryStat[] = [];
    isLoading = false;

    // Pagination
    totalCount = 0;
    pageSize = 10;
    pageNumber = 1;

    @ViewChild(MatPaginator) paginator!: MatPaginator;

    constructor(
        private fb: FormBuilder,
        private financeService: FinanceService,
        private dialog: MatDialog,
        private loadingService: LoadingService,
        private cdr: ChangeDetectorRef,
        private permissionService: PermissionService
    ) {
        this.expenseForm = this.fb.group({
            categoryId: [null, Validators.required],
            amount: [null, [Validators.required, Validators.min(0)]],
            expenseDate: [new Date(), Validators.required],
            paymentMode: ['Cash', Validators.required],
            referenceNo: [''],
            remarks: ['']
        });
    }

    canAdd: boolean = true;
    canEdit: boolean = true;
    canDelete: boolean = true;

    ngOnInit(): void {
        this.canAdd = this.permissionService.hasPermission('CanAdd');
        this.canEdit = this.permissionService.hasPermission('CanEdit');
        this.canDelete = this.permissionService.hasPermission('CanDelete');
        this.loadInitialData();
    }

    loadInitialData(): void {
        this.loadingService.setLoading(true);
        this.financeService.getExpenseCategories().subscribe(data => {
            this.categories = data;
            this.loadExpenses();
            this.cdr.detectChanges();
        });
    }

    loadExpenses(): void {
        this.isLoading = true;
        this.financeService.getExpenseEntries(this.pageNumber, this.pageSize).subscribe({
            next: (res) => {
                this.expenses = res.items || [];
                this.totalCount = res.totalCount || 0;
                this.updateStats();
                this.isLoading = false;
                this.loadingService.setLoading(false);
                this.cdr.detectChanges();
            },
            error: () => {
                this.isLoading = false;
                this.loadingService.setLoading(false);
                this.showError('Failed to load expenses');
                this.cdr.detectChanges();
            }
        });
    }

    private updateStats(): void {
        const totalAmount = this.expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

        // This Month
        const now = new Date();
        const thisMonth = this.expenses
            .filter(e => {
                const d = new Date(e.expenseDate);
                return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            })
            .reduce((sum, e) => sum + (e.amount || 0), 0);

        // Today
        const today = this.expenses
            .filter(e => {
                const d = new Date(e.expenseDate);
                return d.getDate() === now.getDate() &&
                    d.getMonth() === now.getMonth() &&
                    d.getFullYear() === now.getFullYear();
            })
            .reduce((sum, e) => sum + (e.amount || 0), 0);

        this.summaryStats = [
            { label: 'Total Volume', value: `₹${totalAmount.toLocaleString('en-IN')}`, icon: 'receipt_long', type: 'info' },
            { label: 'This Month', value: `₹${thisMonth.toLocaleString('en-IN')}`, icon: 'calendar_month', type: 'primary' as any },
            { label: 'Today', value: `₹${today.toLocaleString('en-IN')}`, icon: 'today', type: 'success' }
        ];
    }

    onSubmit(): void {
        if (this.expenseForm.invalid) return;

        const entry = this.expenseForm.value;
        const actionText = this.isEditing ? 'Update' : 'Record';

        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            width: '400px',
            data: {
                title: `Confirm Expense ${actionText}`,
                message: `Are you sure you want to ${actionText.toLowerCase()} this expense entry?\n\nAmount: ₹${entry.amount}`,
                confirmText: actionText
            }
        });

        dialogRef.afterClosed().subscribe(confirm => {
            if (confirm) {
                if (this.isEditing && this.editingId) {
                    this.financeService.updateExpenseEntry(this.editingId, { ...entry, id: this.editingId }).subscribe({
                        next: () => {
                            this.showSuccess('Expense updated successfully');
                            this.resetForm();
                            this.loadExpenses();
                        },
                        error: () => this.showError('Failed to update expense')
                    });
                } else {
                    this.financeService.createExpenseEntry(entry).subscribe({
                        next: () => {
                            this.showSuccess('Expense recorded successfully');
                            this.resetForm();
                            this.loadExpenses();
                        },
                        error: () => this.showError('Failed to record expense')
                    });
                }
            }
            this.cdr.detectChanges();
        });
    }

    editExpense(expense: any): void {
        this.isEditing = true;
        this.editingId = expense.id;
        this.expenseForm.patchValue({
            categoryId: expense.categoryId,
            amount: expense.amount,
            expenseDate: new Date(expense.expenseDate),
            paymentMode: expense.paymentMode,
            referenceNo: expense.referenceNo,
            remarks: expense.remarks
        });
        this.cdr.detectChanges();
    }

    deleteExpense(id: number): void {
        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            width: '400px',
            data: {
                title: 'Confirm Delete',
                message: 'Are you sure you want to delete this expense record?',
                confirmText: 'Delete',
                confirmColor: 'warn'
            }
        });

        dialogRef.afterClosed().subscribe(confirmed => {
            if (confirmed) {
                this.financeService.deleteExpenseEntry(id).subscribe({
                    next: () => {
                        this.showSuccess('Record deleted successfully');
                        this.loadExpenses();
                    },
                    error: () => this.showError('Failed to delete record')
                });
            }
            this.cdr.detectChanges();
        });
    }

    onPageChange(event: PageEvent): void {
        this.pageNumber = event.pageIndex + 1;
        this.pageSize = event.pageSize;
        this.loadExpenses();
    }

    resetForm(): void {
        this.expenseForm.reset({ expenseDate: new Date(), paymentMode: 'Cash' });
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
