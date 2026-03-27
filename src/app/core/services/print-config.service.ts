import { Injectable, inject } from '@angular/core';
import { Observable, of, map, switchMap, catchError } from 'rxjs';
import { RoleService } from './role.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class PrintConfigService {
    private formatCache: { [pageName: string]: string } = {};

    private roleService = inject(RoleService);
    private authService = inject(AuthService);

    getPrintFormat(pageName: string): Observable<string> {
        if (this.formatCache[pageName]) {
            return of(this.formatCache[pageName]);
        }

        const roleName = this.authService.getUserRole();
        
        return this.roleService.getAllRoles().pipe(
            switchMap(roles => {
                const role = roles.find(r => r.roleName === roleName);
                if (!role) {
                    this.formatCache[pageName] = 'A4';
                    return of('A4');
                }
                return this.roleService.getRolePrintSettings(role.id).pipe(
                    map(settings => {
                        const setting = settings.find(s => s.pageName === pageName);
                        const format = setting ? setting.printFormat : 'A4';
                        this.formatCache[pageName] = format;
                        return format;
                    })
                );
            }),
            catchError(() => {
                this.formatCache[pageName] = 'A4';
                return of('A4');
            })
        );
    }
    
    // Auto-detects the page name from the router url if not explicitly provided
    detectPageName(url: string): string {
        if (url.includes('/quick-inventory/purchase-order')) return 'Quick Purchase Order';
        if (url.includes('/inventory/po-list')) return 'Purchase Order';
        if (url.includes('/quick-inventory/sale-order')) return 'Quick Sale Order';
        if (url.includes('/inventory/solist')) return 'Standard Sale Order';
        if (url.includes('/quick-inventory/purchase-return')) return 'Quick Purchase Return';
        if (url.includes('/inventory/purchase-return')) return 'Purchase Return';
        if (url.includes('/quick-inventory/sale-return')) return 'Quick Sale Return';
        if (url.includes('/inventory/sale-return')) return 'Standard Sale Return';
        return 'Standard Sale Order'; // Default wrapper
    }
}
