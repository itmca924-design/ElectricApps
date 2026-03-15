import { Routes } from '@angular/router';
import { PermissionGuard } from '../core/gaurds/permission.guard';

export const INVENTORY_ROUTES: Routes = [

  {
    path: 'polist',
    canActivate: [PermissionGuard],
    data: { breadcrumb: 'Purchase Orders' },
    children: [
      { path: '', data: { breadcrumb: 'List' }, loadComponent: () => import('./../features/inventory/po-list/po-list').then(m => m.PoList) },
      { path: 'add', data: { breadcrumb: 'Add New' }, loadComponent: () => import('./../features/inventory/po-form/po-form').then(m => m.PoForm) },
      { path: 'edit/:id', data: { breadcrumb: 'Edit' }, loadComponent: () => import('./../features/inventory/po-form/po-form').then(m => m.PoForm) }
    ]
  },

  {
    path: 'grn-list',
    canActivate: [PermissionGuard],
    data: { breadcrumb: 'GRN' },
    children: [
      { path: '', data: { breadcrumb: 'List' }, loadComponent: () => import('../features/inventory/grn-list-component/grn-list-component').then(m => m.GrnListComponent) },
      { path: 'add', data: { breadcrumb: 'Add New' }, loadComponent: () => import('../features/inventory/grn-form-component/grn-form-component').then(m => m.GrnFormComponent) },
      { path: 'edit/:id', data: { breadcrumb: 'Edit' }, loadComponent: () => import('../features/inventory/grn-form-component/grn-form-component').then(m => m.GrnFormComponent) },
      { path: 'view/:id', data: { breadcrumb: 'View' }, loadComponent: () => import('../features/inventory/grn-form-component/grn-form-component').then(m => m.GrnFormComponent) }
    ]
  },
  {
    path: 'current-stock',
    canActivate: [PermissionGuard],
    data: { breadcrumb: 'Current Stock' },
    children: [
      { path: '', data: { breadcrumb: 'List' }, loadComponent: () => import('../features/inventory/current-stock-component/current-stock-component').then(m => m.CurrentStockComponent) },

    ]
  },

  {
    path: 'purchase-return',
    canActivate: [PermissionGuard],
    data: { breadcrumb: 'Purchase Return' },
    children: [
      { path: '', data: { breadcrumb: 'List' }, loadComponent: () => import('../features/inventory/purchase-return/purchase-return-list/purchase-return-list').then(m => m.PurchaseReturnList) },
      { path: 'add', data: { breadcrumb: 'New Purchase Return' }, loadComponent: () => import('../features/inventory/purchase-return/purchase-return-form/purchase-return-form').then(m => m.PurchaseReturnForm) },

      { path: 'debit-note/:id', data: { breadcrumb: 'Debit Note' }, loadComponent: () => import('../features/inventory/purchase-return/debit-note-view/debit-note-view').then(m => m.DebitNoteView) }
    ]
  },

  {
    path: 'solist',
    canActivate: [PermissionGuard],
    data: { breadcrumb: 'Sale Orders' },
    children: [
      { path: '', data: { breadcrumb: 'List' }, loadComponent: () => import('./../features/inventory/so-list/so-list').then(m => m.SoList) },
      { path: 'add', data: { breadcrumb: 'Add New' }, loadComponent: () => import('./../features/inventory/so-form/so-form').then(m => m.SoForm) },
      { path: 'edit/:id', data: { breadcrumb: 'Edit' }, loadComponent: () => import('./../features/inventory/so-form/so-form').then(m => m.SoForm) }
    ]
  },
  {
    path: 'sale-return',
    canActivate: [PermissionGuard],
    data: { breadcrumb: 'Sale Return' },
    children: [
      { path: '', data: { breadcrumb: 'List' }, loadComponent: () => import('../features/inventory/sale-return/sale-return-list/sale-return-list.component').then(m => m.SaleReturnListComponent) },
      { path: 'add', data: { breadcrumb: 'New Return' }, loadComponent: () => import('../features/inventory/sale-return/sale-return-form/sale-return-form.component').then(m => m.SaleReturnFormComponent) },
      { path: 'edit/:id', data: { breadcrumb: 'Edit Return' }, loadComponent: () => import('../features/inventory/sale-return/sale-return-form/sale-return-form.component').then(m => m.SaleReturnFormComponent) },
      { path: 'credit-note/:id', data: { breadcrumb: 'Credit Note' }, loadComponent: () => import('../features/inventory/sale-return/credit-note-view/credit-note-view.component').then(m => m.CreditNoteViewComponent) }
    ]
  },
  {
    path: 'gate-pass',
    canActivate: [PermissionGuard],
    data: { breadcrumb: 'Gate Pass' },
    children: [
      { path: '', data: { breadcrumb: 'List' }, loadComponent: () => import('../features/inventory/gate-pass/gate-pass-list/gate-pass-list.component').then(m => m.GatePassListComponent) },
      { path: 'outward', data: { breadcrumb: 'Outward' }, loadComponent: () => import('../features/inventory/gate-pass/outward-gate-pass/outward-gate-pass.component').then(m => m.OutwardGatePassComponent) },
      { path: 'inward', data: { breadcrumb: 'Inward' }, loadComponent: () => import('../features/inventory/gate-pass/inward-gate-pass/inward-gate-pass.component').then(m => m.InwardGatePassComponent) },
    ]
  },
  {
    path: 'disposed-stock',
    canActivate: [PermissionGuard],
    data: { breadcrumb: 'Disposed Stock' },
    loadComponent: () => import('../features/inventory/disposed-stock-component/disposed-stock-component').then(m => m.DisposedStockComponent)
  }
];
