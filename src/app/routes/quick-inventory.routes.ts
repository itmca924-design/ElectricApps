import { Routes } from '@angular/router';
import { PermissionGuard } from '../core/gaurds/permission.guard';

export const QUICK_INVENTORY_ROUTES: Routes = [
    {
        path: 'purchase',
        canActivate: [PermissionGuard],
        data: { breadcrumb: 'Quick Purchase' },
        children: [
            { path: '', redirectTo: 'list', pathMatch: 'full' },
            {
                path: 'list',
                data: { breadcrumb: 'List' },
                loadComponent: () => import('../features/inventory/quick-purchase/quick-purchase-list/quick-purchase-list.component').then(m => m.QuickPurchaseListComponent)
            },
            {
                path: 'add',
                data: { breadcrumb: 'Add New' },
                loadComponent: () => import('../features/inventory/quick-purchase/quick-purchase.component').then(m => m.QuickPurchaseComponent)
            },
            {
                path: 'edit/:id',
                data: { breadcrumb: 'Edit' },
                loadComponent: () => import('../features/inventory/quick-purchase/quick-purchase.component').then(m => m.QuickPurchaseComponent)
            }
        ]
    },
    {
        path: 'sale',
        canActivate: [PermissionGuard],
        data: { breadcrumb: 'Quick Sale' },
        children: [
            { path: '', redirectTo: 'list', pathMatch: 'full' },
            {
                path: 'list',
                data: { breadcrumb: 'List' },
                loadComponent: () => import('../features/inventory/quick-sale/quick-sale-list/quick-sale-list.component').then(m => m.QuickSaleListComponent)
            },
            {
                path: 'add',
                data: { breadcrumb: 'Add New', module: 'Inventory', action: 'Add' },
                loadComponent: () => import('../features/inventory/quick-sale/quick-sale.component').then(m => m.QuickSaleComponent)
            },
            {
                path: 'edit/:id',
                data: { breadcrumb: 'Edit', isEdit: true },
                loadComponent: () => import('../features/inventory/quick-sale/quick-sale.component').then(m => m.QuickSaleComponent)
            }
        ]
    },
    {
        path: 'grn-list',
        canActivate: [PermissionGuard],
        data: { breadcrumb: 'Quick GRN List', isQuick: true },
        children: [
            { 
                path: '', 
                data: { isQuick: true },
                loadComponent: () => import('../features/inventory/grn-list-component/grn-list-component').then(m => m.GrnListComponent) 
            },
            { 
                path: 'add', 
                data: { breadcrumb: 'Receive Stock', isQuick: true },
                loadComponent: () => import('../features/inventory/grn-form-component/grn-form-component').then(m => m.GrnFormComponent) 
            },
            { 
                path: 'edit/:id', 
                data: { breadcrumb: 'Edit GRN', isQuick: true },
                loadComponent: () => import('../features/inventory/grn-form-component/grn-form-component').then(m => m.GrnFormComponent) 
            },
            { 
                path: 'view/:id', 
                data: { breadcrumb: 'View GRN', isQuick: true },
                loadComponent: () => import('../features/inventory/grn-form-component/grn-form-component').then(m => m.GrnFormComponent) 
            }
        ]
    },
    {
        path: 'current-stock',
        canActivate: [PermissionGuard],
        data: { breadcrumb: 'Quick Current Stock' },
        loadComponent: () => import('../features/inventory/current-stock-component/current-stock-component').then(m => m.CurrentStockComponent)
    },
    {
        path: 'po-return',
        canActivate: [PermissionGuard],
        data: { breadcrumb: 'Quick PO Return', isQuick: true },
        loadComponent: () => import('../features/inventory/purchase-return/purchase-return-list/purchase-return-list').then(m => m.PurchaseReturnList)
    },
    {
        path: 'po-return/add',
        canActivate: [PermissionGuard],
        data: { breadcrumb: 'Add Quick PO Return', isQuick: true },
        loadComponent: () => import('../features/inventory/purchase-return/purchase-return-form/purchase-return-form').then(m => m.PurchaseReturnForm)
    },
    {
        path: 'so-return',
        canActivate: [PermissionGuard],
        data: { breadcrumb: 'Quick SO Return', isQuick: true },
        loadComponent: () => import('../features/inventory/sale-return/sale-return-list/sale-return-list.component').then(m => m.SaleReturnListComponent)
    },
    {
        path: 'so-return/add',
        canActivate: [PermissionGuard],
        data: { breadcrumb: 'Add Quick SO Return', isQuick: true },
        loadComponent: () => import('../features/inventory/sale-return/sale-return-form/sale-return-form.component').then(m => m.SaleReturnFormComponent)
    },
    {
        path: 'disposed-stock',
        canActivate: [PermissionGuard],
        data: { breadcrumb: 'Quick Disposed Stock' },
        loadComponent: () => import('../features/inventory/disposed-stock-component/disposed-stock-component').then(m => m.DisposedStockComponent)
    }
];
