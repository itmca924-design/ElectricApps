import { Routes } from '@angular/router';
import { PermissionGuard } from '../core/gaurds/permission.guard';

export const COMPANY_ROUTES: Routes = [
    {
        path: '',
        canActivate: [PermissionGuard],
        data: { breadcrumb: 'Company' },
        children: [
            {
                path: '',
                data: { breadcrumb: 'List' },
                loadComponent: () => import('./../features/company/company-list/company-list').then(m => m.CompanyList)
            },
            {
                path: 'add',
                data: { breadcrumb: 'Add New' },
                loadComponent: () => import('./../features/company/company-form/company-form').then(m => m.CompanyForm)
            },
            {
                path: 'bulk-add',
                data: { breadcrumb: 'Bulk Add' },
                loadComponent: () => import('./../features/company/bulk-company-form/bulk-company-form').then(m => m.BulkCompanyForm)
            },
            {
                path: 'edit/:id',
                data: { breadcrumb: 'Edit' },
                loadComponent: () => import('./../features/company/company-form/company-form').then(m => m.CompanyForm)
            }
        ]
    }
];
