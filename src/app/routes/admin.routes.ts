import { Routes } from '@angular/router';
import { PermissionGuard } from '../core/gaurds/permission.guard';

export const ADMIN_ROUTES: Routes = [
    {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
    },
    {
        path: 'dashboard',
        canActivate: [PermissionGuard],
        loadComponent: () => import('../features/admin/admin-dashboard/admin-dashboard.component').then(m => m.AdminDashboardComponent),
        data: { breadcrumb: 'Dashboard' }
    },
    {
        path: 'role-permissions',
        canActivate: [PermissionGuard],
        loadComponent: () => import('../features/admin/role-permissions/role-permissions.component').then(m => m.RolePermissionsComponent),
        data: { breadcrumb: 'Role Permissions' }
    },
    {
        path: 'users',
        canActivate: [PermissionGuard],
        loadComponent: () => import('../features/admin/user-list/user-list.component').then(m => m.UserListComponent),
        data: { breadcrumb: 'Users' }
    },
    {
        path: 'menus',
        canActivate: [PermissionGuard],
        loadComponent: () => import('../features/admin/menu-management/menu-management.component').then(m => m.MenuManagementComponent),
        data: { breadcrumb: 'Menus' }
    },
    {
        path: 'print-settings',
        canActivate: [PermissionGuard],
        loadComponent: () => import('../features/admin/print-settings/print-settings').then(m => m.PrintSettings),
        data: { breadcrumb: 'Print Settings' }
    }
];
