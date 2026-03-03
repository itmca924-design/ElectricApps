import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { PermissionService } from '../services/permission.service';
import { from } from 'rxjs';

/**
 * Global Permissions Resolver
 * 
 * Runs BEFORE any component is created when navigating to `/app` routes.
 * Ensures menuItems are loaded from API before ngOnInit of any list component runs.
 * This fixes the race condition: ngOnInit → hasPermission() → menu not ready → false.
 * 
 * Angular Lifecycle: Guard → Resolver → Component Created → ngOnInit → NavigationEnd
 *                                ↑ permissions guaranteed loaded here ↑
 */
export const permissionsResolver: ResolveFn<boolean> = () => {
    const permissionService = inject(PermissionService);
    // Convert Promise to Observable (ResolveFn supports both)
    return from(permissionService.loadForResolver());
};
