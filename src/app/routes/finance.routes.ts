import { Routes } from '@angular/router';
import { PermissionGuard } from '../core/gaurds/permission.guard';

export const FINANCE_ROUTES: Routes = [
    {
        path: 'suppliers',
        data: { breadcrumb: 'Suppliers' },
        children: [
            { path: 'list', data: { breadcrumb: 'List' }, loadComponent: () => import('../features/finance/suppliers/supplier-list/supplier-list').then(m => m.SupplierList) },
            {
                path: 'ledger',
                canActivate: [PermissionGuard],
                data: { breadcrumb: 'Supplier Ledger' },
                loadComponent: () => import('../features/finance/supplier-ledger/supplier-ledger.component').then(m => m.SupplierLedgerComponent)
            },
            {
                path: 'payment',
                canActivate: [PermissionGuard],
                data: { breadcrumb: 'Payment Entry' },
                loadComponent: () => import('../features/finance/payment-entry/payment-entry.component').then(m => m.PaymentEntryComponent)
            },
            {
                path: 'dues',
                canActivate: [PermissionGuard],
                data: { breadcrumb: 'Pending Dues' },
                loadComponent: () => import('../features/finance/report/pending-dues.component').then(m => m.PendingDuesComponent)
            },
            {
                path: 'payments-report',
                canActivate: [PermissionGuard],
                data: { breadcrumb: 'Payments Report' },
                loadComponent: () => import('../features/finance/report/payment-report.component').then(m => m.PaymentReportComponent)
            },
        ]
    },
    {
        path: 'customers',
        data: { breadcrumb: 'Customers' },
        children: [
            { path: 'list', data: { breadcrumb: 'List' }, loadComponent: () => import('../features/master/customer-list/customer-list').then(m => m.CustomerList) },
            {
                path: 'ledger',
                canActivate: [PermissionGuard],
                data: { breadcrumb: 'Customer Ledger' },
                loadComponent: () => import('../features/finance/customer-ledger/customer-ledger.component').then(m => m.CustomerLedgerComponent)
            },
            {
                path: 'receipt',
                canActivate: [PermissionGuard],
                data: { breadcrumb: 'Receipt Entry' },
                loadComponent: () => import('../features/finance/receipt-entry/receipt-entry.component').then(m => m.ReceiptEntryComponent)
            },
            {
                path: 'outstanding',
                canActivate: [PermissionGuard],
                data: { breadcrumb: 'Outstanding Tracker' },
                loadComponent: () => import('../features/finance/report/outstanding-tracker.component').then(m => m.OutstandingTrackerComponent)
            },
            {
                path: 'bulk-receipt',
                data: { breadcrumb: 'Bulk Receipt' },
                loadComponent: () => import('../features/finance/bulk-receipt-entry/bulk-receipt-entry.component').then(m => m.BulkReceiptEntryComponent)
            },
            {
                path: 'receipts-report',
                canActivate: [PermissionGuard],
                data: { breadcrumb: 'Receipts Report' },
                loadComponent: () => import('../features/finance/report/receipt-report.component').then(m => m.ReceiptReportComponent)
            },
            {
                path: 'day-book',
                canActivate: [PermissionGuard],
                data: { breadcrumb: 'Day Book' },
                loadComponent: () => import('../features/finance/report/day-book.component').then(m => m.DayBookComponent)
            },
            {
                path: 'consolidated-financials',
                canActivate: [PermissionGuard],
                data: { breadcrumb: 'Group Summary' },
                loadComponent: () => import('../features/finance/report/consolidated-balance-sheet.component').then(m => m.ConsolidatedBalanceSheetComponent)
            },
            {
                path: 'gst-reconciliation',
                canActivate: [PermissionGuard],
                data: { breadcrumb: 'GST Reconciliation' },
                loadComponent: () => import('../features/finance/report/gst-reconciliation.component').then(m => m.GstReconciliationComponent)
            },
            {
                path: 'inter-company-ledger',
                canActivate: [PermissionGuard],
                data: { breadcrumb: 'Inter-Company Ledger' },
                loadComponent: () => import('../features/finance/report/inter-company-ledger.component').then(m => m.InterCompanyLedgerComponent)
            },
        ]
    },
    {
        path: 'p-and-l',
        canActivate: [PermissionGuard],
        data: { breadcrumb: 'P&L Dashboard' },
        loadComponent: () => import('../features/finance/pl-dashboard/pl-dashboard.component').then(m => m.PLDashboardComponent)
    },
    {
        path: 'balance-sheet',
        canActivate: [PermissionGuard],
        data: { breadcrumb: 'Balance Sheet' },
        loadComponent: () => import('../features/finance/balance-sheet/balance-sheet.component').then(m => m.BalanceSheetComponent)
    },
    {
        path: 'expenses',
        data: { breadcrumb: 'Expenses' },
        children: [
            {
                path: 'categories',
                data: { breadcrumb: 'Expense Categories' },
                loadComponent: () => import('../features/finance/expenses/expense-category/expense-category.component').then(m => m.ExpenseCategoryComponent)
            },
            {
                path: 'entry',
                data: { breadcrumb: 'Expense Entry' },
                loadComponent: () => import('../features/finance/expenses/expense-entry/expense-entry.component').then(m => m.ExpenseEntryComponent)
            }
        ]
    },
    {
        path: 'sales-invoice',
        data: { breadcrumb: 'Tax Invoice' },
        loadComponent: () => import('../features/sales-invoice/sales-invoice/sales-invoice').then(m => m.SalesInvoice)
    }
];
