import { Routes } from '@angular/router';
import { PermissionGuard } from '../core/gaurds/permission.guard';

export const MASTER_ROUTES: Routes = [

  {
    path: 'categories',
    canActivate: [PermissionGuard],
    data: { breadcrumb: 'Categories' },
    children: [
      { path: '', data: { breadcrumb: 'List' }, loadComponent: () => import('./../features/master/category/category-list/category-list').then(m => m.CategoryList) },
      { path: 'add', data: { breadcrumb: 'Add New' }, loadComponent: () => import('./../features/master/category/category-form/category-form').then(m => m.CategoryForm) },
      { path: 'edit/:id', data: { breadcrumb: 'Edit' }, loadComponent: () => import('./../features/master/category/category-form/category-form').then(m => m.CategoryForm) }
    ]
  },

  {
    path: 'subcategories',
    canActivate: [PermissionGuard],
    data: { breadcrumb: 'Subcategories' },
    children: [
      { path: '', data: { breadcrumb: 'List' }, loadComponent: () => import('./../features/master/subcategory/subcategory-list/subcategory-list').then(m => m.SubcategoryList) },
      { path: 'add', data: { breadcrumb: 'Add New' }, loadComponent: () => import('./../features/master/subcategory/subcategory-form/subcategory-form').then(m => m.SubcategoryForm) },
      { path: 'edit/:id', data: { breadcrumb: 'Edit' }, loadComponent: () => import('./../features/master/subcategory/subcategory-form/subcategory-form').then(m => m.SubcategoryForm) }
    ]
  },

  {
    path: 'products',
    canActivate: [PermissionGuard],
    data: { breadcrumb: 'Products' },
    children: [
      { path: '', data: { breadcrumb: 'Dashboard' }, loadComponent: () => import('./../features/master/product/product-dashboard/product-dashboard').then(m => m.ProductDashboard) },
      { path: 'list', data: { breadcrumb: 'List' }, loadComponent: () => import('./../features/master/product/product-list/product-list').then(m => m.ProductList) },
      { path: 'add', data: { breadcrumb: 'Add New' }, loadComponent: () => import('./../features/master/product/product-form/product-form').then(m => m.ProductForm) },
      { path: 'edit/:id', data: { breadcrumb: 'Edit' }, loadComponent: () => import('./../features/master/product/product-form/product-form').then(m => m.ProductForm) }
    ]
  },

  {
    path: 'pricelists',
    canActivate: [PermissionGuard],
    data: { breadcrumb: 'Price Lists' },
    children: [
      { path: '', data: { breadcrumb: 'List' }, loadComponent: () => import('./../features/master/pricelist/pricelist-list/pricelist-list').then(m => m.PricelistList) },
      { path: 'add', data: { breadcrumb: 'Add New' }, loadComponent: () => import('./../features/master/pricelist/pricelist-form/pricelist-form').then(m => m.PricelistForm) },
      { path: 'edit/:id', data: { breadcrumb: 'Edit' }, loadComponent: () => import('./../features/master/pricelist/pricelist-form/pricelist-form').then(m => m.PricelistForm) }
    ]
  },

  {
    path: 'units',
    canActivate: [PermissionGuard],
    data: { breadcrumb: 'Units' },
    children: [
      { path: '', data: { breadcrumb: 'List' }, loadComponent: () => import('../features/master/units/unitslist-component/unitslist-component').then(m => m.UnitslistComponent) },
      { path: 'add', data: { breadcrumb: 'Add New' }, loadComponent: () => import('../features/master/units/units-component/units-component').then(m => m.UnitsComponent) },
      { path: 'edit/:id', data: { breadcrumb: 'Edit' }, loadComponent: () => import('../features/master/units/units-component/units-component').then(m => m.UnitsComponent) }
    ]
  },

  {
    path: 'warehouses',
    canActivate: [PermissionGuard],
    data: { breadcrumb: 'Warehouses' },
    children: [
      { path: '', data: { breadcrumb: 'List' }, loadComponent: () => import('../features/master/locations/warehouse-list/warehouse-list').then(m => m.WarehouseList) },
      { path: 'add', data: { breadcrumb: 'Add New' }, loadComponent: () => import('../features/master/locations/warehouse-form/warehouse-form').then(m => m.WarehouseForm) },
      { path: 'edit/:id', data: { breadcrumb: 'Edit' }, loadComponent: () => import('../features/master/locations/warehouse-form/warehouse-form').then(m => m.WarehouseForm) }
    ]
  },

  {
    path: 'racks',
    canActivate: [PermissionGuard],
    data: { breadcrumb: 'Racks' },
    children: [
      { path: '', data: { breadcrumb: 'List' }, loadComponent: () => import('../features/master/locations/rack-list/rack-list').then(m => m.RackList) },
      { path: 'add', data: { breadcrumb: 'Add New' }, loadComponent: () => import('../features/master/locations/rack-form/rack-form').then(m => m.RackForm) },
      { path: 'edit/:id', data: { breadcrumb: 'Edit' }, loadComponent: () => import('../features/master/locations/rack-form/rack-form').then(m => m.RackForm) }
    ]
  },

];
