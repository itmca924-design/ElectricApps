import { Injectable, inject } from "@angular/core";
import { Observable, map, of, catchError, shareReplay } from "rxjs";
import { environment } from "../../enviornments/environment";
import { MenuItem } from "../models/menu-item.model";
import { AuthService } from "./auth.service";
import { RoleService } from "./role.service";
import { switchMap } from "rxjs";
import { ApiService } from "../../shared/api.service";

@Injectable({ providedIn: 'root' })
export class MenuService {
  private api = inject(ApiService);
  private authService = inject(AuthService);
  private roleService = inject(RoleService);

  private readonly baseUrl = environment.api.identity;

  // --- Smart TTL Cache (60 seconds) ---
  private readonly CACHE_TTL_MS = 60_000;
  private cachedMenu$: Observable<MenuItem[]> | null = null;
  private cacheTimestamp = 0;

  /**
   * Returns menu with permissions for current user.
   * Uses 60-second TTL cache to avoid excessive API calls on every navigation.
   * Cache is automatically invalidated after 60s — admin permission changes
   * reflect within 60 seconds without requiring user to logout.
   */
  getMenu(): Observable<MenuItem[]> {
    const now = Date.now();

    // Return cached observable if still fresh
    if (this.cachedMenu$ && (now - this.cacheTimestamp) < this.CACHE_TTL_MS) {
      return this.cachedMenu$;
    }

    // Fetch fresh — shareReplay(1) ensures single API execution even for concurrent subscribers
    this.cachedMenu$ = this._fetchMenu().pipe(shareReplay(1));
    this.cacheTimestamp = now;
    return this.cachedMenu$;
  }

  /**
   * Force-clears the cache. Call this after an admin saves role/permission changes
   * so the very next getMenu() call fetches fresh data immediately.
   */
  refreshMenu(): void {
    this.cachedMenu$ = null;
    this.cacheTimestamp = 0;
  }

  /** Internal: does the actual 3-API-call chain */
  private _fetchMenu(): Observable<MenuItem[]> {
    const roleName = this.authService.getUserRole();

    return this.roleService.getAllRoles().pipe(
      switchMap(roles => {
        const userRole = (roles as any[]).find((r: any) => r.roleName === roleName);
        const roleId = userRole ? userRole.id : 0;

        return this.roleService.getRolePermissions(roleId).pipe(
          switchMap(permissions => {
            return this.getAllMenus().pipe(
              map(flatMenus => {
                if (!flatMenus || flatMenus.length === 0) return [];

                // 1. Build Tree
                const menuTree = this.buildMenuTree(flatMenus);

                // 2. Sort Tree (Recursive) - Dynamic based on Order column
                const sortedTree = this.sortMenus(menuTree);

                // 3. Filter by Permissions
                const filtered = this.filterMenusByPermissions(sortedTree, permissions);

                // 🎯 4. HACK: Inject "Quick Disposed" item for quick access
                const quickInv = filtered.find(m => m.title.includes('Quick Inventory'));
                if (quickInv && quickInv.children) {
                    const alreadyHas = quickInv.children.some(c => c.title === 'Quick Disposed');
                    if (!alreadyHas) {
                         quickInv.children.push({
                            id: 9991, // Dummy ID
                            title: 'Quick Disposed',
                            url: '/app/quick-inventory/disposed-stock',
                            icon: 'delete_sweep',
                            order: 100,
                            children: [],
                            permissions: { canView: true, canAdd: false, canEdit: false, canDelete: false }
                        });
                    }
                }

                // Inject "Disposed Stock" into standard Inventory menu
                const stdInv = filtered.find(m => m.title === 'Inventory' || m.title === 'Standard Inventory');
                if (stdInv && stdInv.children) {
                    const alreadyHas = stdInv.children.some(c => c.title === 'Disposed Stock');
                    if (!alreadyHas) {
                        stdInv.children.push({
                            id: 9992, // Dummy ID
                            title: 'Disposed Stock',
                            url: '/app/inventory/disposed-stock',
                            icon: 'delete_sweep',
                            order: 100,
                            children: [],
                            permissions: { canView: true, canAdd: false, canEdit: false, canDelete: false }
                        });
                    }
                }

                // 🎯 Inject "Tax Invoice" and "Balance Sheet" into Finance menu
                const financeMenu = filtered.find(m => m.title === 'Finance');
                if (financeMenu && financeMenu.children) {
                    const alreadyHasDash = financeMenu.children.some(c => c.title === 'Finance Dashboard' || c.url === '/app/finance');
                    if (!alreadyHasDash) {
                        financeMenu.children.unshift({
                            id: 9989, // Dummy ID
                            title: 'Finance Dashboard',
                            url: '/app/finance',
                            icon: 'dashboard',
                            order: 0,
                            children: [],
                            permissions: { canView: true, canAdd: false, canEdit: false, canDelete: false }
                        });
                    }

                    const alreadyHasTax = financeMenu.children.some(c => c.title === 'Tax Invoice');
                    if (!alreadyHasTax) {
                        financeMenu.children.push({
                            id: 9993, // Dummy ID
                            title: 'Tax Invoice',
                            url: '/app/finance/sales-invoice',
                            icon: 'description',
                            order: 90,
                            children: [],
                            permissions: { canView: true, canAdd: false, canEdit: false, canDelete: false }
                        });
                    }

                    const alreadyHasBS = financeMenu.children.some(c => c.title === 'Balance Sheet');
                    if (!alreadyHasBS) {
                        financeMenu.children.push({
                            id: 9994, // Dummy ID
                            title: 'Balance Sheet',
                            url: '/app/finance/balance-sheet',
                            icon: 'account_balance',
                            order: 85,
                            children: [],
                            permissions: { canView: true, canAdd: false, canEdit: false, canDelete: false }
                        });
                    }

                    const alreadyHasDB = financeMenu.children.some(c => c.title === 'Day Book');
                    if (!alreadyHasDB) {
                        financeMenu.children.push({
                            id: 9995, // Dummy ID
                            title: 'Day Book',
                            url: '/app/finance/customers/day-book',
                            icon: 'event_note',
                            order: 80,
                            children: [],
                            permissions: { canView: true, canAdd: false, canEdit: false, canDelete: false }
                        });
                    }

                    const alreadyHasConsolidated = financeMenu.children.some(c => c.title === 'Group Summary');
                    if (!alreadyHasConsolidated) {
                        financeMenu.children.push({
                            id: 9996, // Dummy ID
                            title: 'Group Summary',
                            url: '/app/finance/customers/consolidated-financials',
                            icon: 'location_city',
                            order: 90,
                            children: [],
                            permissions: { canView: true, canAdd: false, canEdit: false, canDelete: false }
                        });
                    }

                    const alreadyHasGst = financeMenu.children.some(c => c.title === 'GST Reconciliation');
                    if (!alreadyHasGst) {
                        financeMenu.children.push({
                            id: 9997, // Dummy ID
                            title: 'GST Reconciliation',
                            url: '/app/finance/customers/gst-reconciliation',
                            icon: 'assignment_turned_in',
                            order: 100,
                            children: [],
                            permissions: { canView: true, canAdd: false, canEdit: false, canDelete: false }
                        });
                    }

                    const alreadyHasIC = financeMenu.children.some(c => c.title === 'Inter-Company Ledger');
                    if (!alreadyHasIC) {
                        financeMenu.children.push({
                            id: 9998, // Dummy ID
                            title: 'Inter-Company Ledger',
                            url: '/app/finance/customers/inter-company-ledger',
                            icon: 'swap_horiz',
                            order: 110,
                            children: [],
                            permissions: { canView: true, canAdd: false, canEdit: false, canDelete: false }
                        });
                    }

                    const alreadyHasEA = financeMenu.children.some(c => c.title === 'Expense Analysis');
                    if (!alreadyHasEA) {
                        financeMenu.children.push({
                            id: 9999, // Dummy ID
                            title: 'Expense Analysis',
                            url: '/app/finance/expenses/analysis',
                            icon: 'analytics',
                            order: 120,
                            children: [],
                            permissions: { canView: true, canAdd: false, canEdit: false, canDelete: false }
                        });
                    }
                }

                // 🎯 5. Inject "Admin Dashboard" if not exists in Admin menu
                const adminMenu = filtered.find(m => m.title === 'Admin' || m.url?.includes('/admin'));
                if (adminMenu) {
                    // Force ensure children array
                    if (!adminMenu.children) adminMenu.children = [];

                    const alreadyHasAdminDash = adminMenu.children.some(c => 
                        c.title === 'Admin Dashboard' || c.url === '/app/admin/dashboard'
                    );

                    if (!alreadyHasAdminDash) {
                        adminMenu.children.unshift({
                            id: 9990, // Dummy ID
                            title: 'Admin Dashboard',
                            url: '/app/admin/dashboard',
                            icon: 'admin_panel_settings',
                            order: -1, // First in list
                            children: [],
                            permissions: { canView: true, canAdd: true, canEdit: true, canDelete: true }
                        });
                    }
                }

                return filtered;
              })
            );
          })
        );
      }),
      catchError(err => {
        console.error('Error loading menu:', err);
        return of([]);
      })
    );
  }

  buildMenuTree(flatMenus: MenuItem[]): MenuItem[] {
    const menuMap = new Map<number, MenuItem>();
    const rootMenus: MenuItem[] = [];

    // 1. Initialize map and sort flat list by order first
    const sortedFlat = [...flatMenus].sort((a, b) => (a.order || 0) - (b.order || 0));

    sortedFlat.forEach(menu => {
      menu.children = [];
      if (menu.id) {
        menuMap.set(menu.id, menu);
      }
    });

    // 2. Link children to parents
    sortedFlat.forEach(menu => {
      if (menu.parentId) {
        const parent = menuMap.get(menu.parentId);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(menu);
        }
      } else {
        rootMenus.push(menu);
      }
    });

    return rootMenus;
  }

  // Generic sorting by order property
  sortMenus(menus: MenuItem[]): MenuItem[] {
    if (!menus) return [];

    // Sort current level
    menus.sort((a, b) => (a.order || 0) - (b.order || 0));

    // Recursively sort children
    menus.forEach(menu => {
      if (menu.children && menu.children.length > 0) {
        this.sortMenus(menu.children);
      }
    });

    return menus;
  }

  private filterMenusByPermissions(menus: MenuItem[], permissions: any[]): MenuItem[] {
    return menus.map(menu => {
      const perm = permissions.find((p: any) => p.menuId === menu.id);
      const canView = perm ? !!perm.canView : false;

      let children: MenuItem[] = [];
      if (menu.children && menu.children.length > 0) {
        children = this.filterMenusByPermissions(menu.children, permissions);
      }

      if (canView) {
        return {
          ...menu,
          children: children,
          permissions: perm ? {
            canView: !!perm.canView,
            canAdd: !!perm.canAdd,
            canEdit: !!perm.canEdit,
            canDelete: !!perm.canDelete,
            additionalActions: perm.additionalActions
          } : undefined
        };
      }
      return null;
    }).filter(m => m !== null) as MenuItem[];
  }

  getAllMenus(): Observable<MenuItem[]> {
    return this.api.get<MenuItem[]>('menus', this.baseUrl).pipe(
      catchError(() => of([]))
    );
  }

  createMenu(menu: MenuItem): Observable<MenuItem> {
    return this.api.post<MenuItem>('menus', menu, this.baseUrl);
  }

  updateMenu(id: number, menu: MenuItem): Observable<MenuItem> {
    return this.api.put<MenuItem>(`menus/${id}`, menu, this.baseUrl);
  }

  deleteMenu(id: number): Observable<void> {
    return this.api.delete<void>(`menus/${id}`, this.baseUrl);
  }
}
