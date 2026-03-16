import { Routes } from '@angular/router';
import { PermissionGuard } from '../core/gaurds/permission.guard';

export const FINANCE_ROUTES: Routes = [
    {
        path: 'suppliers',
        children: [
            { path: 'list', data: { breadcrumb: 'List' }, loadComponent: () => import('../features/finance/suppliers/supplier-list/supplier-list').then(m => m.SupplierList) },
            {
                path: 'ledger',
                canActivate: [PermissionGuard],
                loadComponent: () => import('../features/finance/supplier-ledger/supplier-ledger.component').then(m => m.SupplierLedgerComponent)
            },
            {
                path: 'payment',
                canActivate: [PermissionGuard],
                loadComponent: () => import('../features/finance/payment-entry/payment-entry.component').then(m => m.PaymentEntryComponent)
            },
            {
                path: 'dues',
                canActivate: [PermissionGuard],
                loadComponent: () => import('../features/finance/report/pending-dues.component').then(m => m.PendingDuesComponent)
            },
            {
                path: 'payments-report',
                canActivate: [PermissionGuard],
                loadComponent: () => import('../features/finance/report/payment-report.component').then(m => m.PaymentReportComponent)
            },
        ]
    },
    {
        path: 'customers',
        children: [
            { path: 'list', data: { breadcrumb: 'List' }, loadComponent: () => import('../features/master/customer-list/customer-list').then(m => m.CustomerList) },
            {
                path: 'ledger',
                canActivate: [PermissionGuard],
                loadComponent: () => import('../features/finance/customer-ledger/customer-ledger.component').then(m => m.CustomerLedgerComponent)
            },
            {
                path: 'receipt',
                canActivate: [PermissionGuard],
                loadComponent: () => import('../features/finance/receipt-entry/receipt-entry.component').then(m => m.ReceiptEntryComponent)
            },
            {
                path: 'outstanding',
                canActivate: [PermissionGuard],
                loadComponent: () => import('../features/finance/report/outstanding-tracker.component').then(m => m.OutstandingTrackerComponent)
            },
            {
                path: 'bulk-receipt',
                loadComponent: () => import('../features/finance/bulk-receipt-entry/bulk-receipt-entry.component').then(m => m.BulkReceiptEntryComponent)
            },
            {
                path: 'receipts-report',
                canActivate: [PermissionGuard],
                loadComponent: () => import('../features/finance/report/receipt-report.component').then(m => m.ReceiptReportComponent)
            },
        ]
    },
    {
        path: 'p-and-l',
        canActivate: [PermissionGuard],
        loadComponent: () => import('../features/finance/pl-dashboard/pl-dashboard.component').then(m => m.PLDashboardComponent)
    },
    {
        path: 'expenses',
        children: [
            {
                path: 'categories',
                loadComponent: () => import('../features/finance/expenses/expense-category/expense-category.component').then(m => m.ExpenseCategoryComponent)
            },
            {
                path: 'entry',
                loadComponent: () => import('../features/finance/expenses/expense-entry/expense-entry.component').then(m => m.ExpenseEntryComponent)
            }
        ]
    },
    {
        path: 'sales-invoice',
        loadComponent: () => import('../features/sales-invoice/sales-invoice/sales-invoice').then(m => m.SalesInvoice)
    }
];
