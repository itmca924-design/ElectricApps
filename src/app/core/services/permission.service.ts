import { Injectable } from "@angular/core";
import { Router, NavigationEnd } from "@angular/router";
import { MenuService } from "./menu.service";
import { MenuItem } from "../models/menu-item.model";
import { filter } from "rxjs/operators";
import { filter as rxFilter } from "rxjs";

@Injectable({ providedIn: 'root' })
export class PermissionService {

    private currentMenuPermissions: any = null;
    private menuItems: MenuItem[] = [];
    private menuLoaded = false;

    constructor(private router: Router, private menuService: MenuService) {
        // On every route navigation: refresh menu (respects 60s TTL cache in MenuService)
        this.router.events.pipe(
            rxFilter(event => event instanceof NavigationEnd)
        ).subscribe(() => {
            this._loadMenuAndUpdate();
        });
    }

    /**
     * Called by APP_INITIALIZER before the app renders.
     * Ensures menuItems are loaded BEFORE any component tries to read permissions.
     * Fixes the browser-refresh timing race condition.
     */
    initializePermissions(): Promise<void> {
        return new Promise((resolve) => {
            this.menuService.getMenu().subscribe({
                next: (menus) => {
                    this.menuItems = menus;
                    this.menuLoaded = true;
                    this.updateCurrentPermissions();
                    resolve();
                },
                error: () => {
                    // Don't block app even on error
                    this.menuLoaded = true;
                    resolve();
                }
            });
        });
    }

    /**
     * Called by LoginComponent after successful login.
     * Resets the loaded flag so the route resolver will force-fetch fresh permissions
     * for the newly logged-in user's role.
     */
    resetForLogin(): void {
        this.menuLoaded = false;
        this.menuItems = [];
        this.currentMenuPermissions = null;
        this.menuService.refreshMenu(); // Clear MenuService cache too
    }

    /**
     * Called by the Route Resolver on every navigation to /app.
     * On FIRST activation (after login): clears cache and fetches fresh permissions.
     * On subsequent navigations: uses MenuService cache (60s TTL) for performance.
     */
    loadForResolver(): Promise<boolean> {
        // If menu was never loaded (e.g., fresh login), force fresh fetch
        if (!this.menuLoaded) {
            this.menuService.refreshMenu();
        }
        return new Promise((resolve) => {
            this.menuService.getMenu().subscribe({
                next: (menus) => {
                    this.menuItems = menus;
                    this.menuLoaded = true;
                    this.updateCurrentPermissions();
                    resolve(true);
                },
                error: () => {
                    this.menuLoaded = true;
                    resolve(true); // Don't block navigation on error
                }
            });
        });
    }

    private _loadMenuAndUpdate(): void {
        this.menuService.getMenu().subscribe(menus => {
            this.menuItems = menus;
            this.updateCurrentPermissions();
        });
    }

    private updateCurrentPermissions() {
        const currentUrl = this.router.url;
        const menuItem = this.findMenuItemRecursive(this.menuItems, currentUrl);

        if (menuItem && menuItem.permissions) {
            this.currentMenuPermissions = menuItem.permissions;
        } else {
            this.currentMenuPermissions = null;
        }
    }

    private findMenuItemRecursive(items: MenuItem[], url: string): MenuItem | null {
        const cleanUrl = this._normalize(url);
        if (!cleanUrl) return null;
        return this._searchBestMatch(items, cleanUrl);
    }

    private _normalize(url: string | null | undefined): string {
        if (!url) return '';
        let clean = url.split('?')[0].toLowerCase().trim();

        if (clean.startsWith('/')) {
            clean = clean.substring(1);
        }
        if (clean.startsWith('app/')) {
            clean = clean.substring(4);
        }
        if (clean.endsWith('/')) {
            clean = clean.substring(0, clean.length - 1);
        }

        return clean;
    }

    private _searchBestMatch(items: MenuItem[], targetUrl: string): MenuItem | null {
        let bestMatch: MenuItem | null = null;
        let longestUrlMatchLen = -1;

        const search = (list: MenuItem[]) => {
            for (const item of list) {
                if (item.url) {
                    const itemUrl = this._normalize(item.url);

                    // Match Exact OR Parent-Child relationship
                    // Example: Menu='inventory/gate-pass', Target='inventory/gate-pass/outward' -> Match!
                    if (itemUrl !== '' && (targetUrl === itemUrl || targetUrl.startsWith(itemUrl + '/'))) {
                        if (itemUrl.length > longestUrlMatchLen) {
                            longestUrlMatchLen = itemUrl.length;
                            bestMatch = item;
                        }
                    }
                }
                if (item.children && item.children.length > 0) {
                    search(item.children);
                }
            }
        };

        search(items);
        return bestMatch;
    }

    checkPermissionWithData(menus: MenuItem[], url: string, action: 'CanView' | 'CanAdd' | 'CanEdit' | 'CanDelete'): boolean {
        const normalizedUrl = this._normalize(url);
        console.log(`[PermissionService] Checking ${action} for URL: '${url}' (Normalized: '${normalizedUrl}')`);

        const menuItem = this._searchBestMatch(menus, normalizedUrl);

        if (!menuItem) {
            console.warn(`[PermissionService] No matching menu item found for: ${normalizedUrl}`);
            return false;
        }

        if (!(menuItem as any).permissions) {
            console.warn(`[PermissionService] Menu item found (${(menuItem as any).title}) but has no permissions object.`);
            return false;
        }

        const perm = (menuItem as any).permissions;
        const hasPerm = action === 'CanView' ? perm.canView
            : action === 'CanAdd' ? perm.canAdd
                : action === 'CanEdit' ? perm.canEdit
                    : perm.canDelete;

        console.log(`[PermissionService] Found Menu: ${(menuItem as any).title} (${(menuItem as any).url}) -> ${action}: ${hasPerm}`);
        return hasPerm;
    }

    checkPermission(url: string, action: 'CanView' | 'CanAdd' | 'CanEdit' | 'CanDelete'): boolean {
        return this.checkPermissionWithData(this.menuItems, url, action);
    }

    hasPermission(action: 'CanView' | 'CanAdd' | 'CanEdit' | 'CanDelete'): boolean {
        return this.checkPermissionWithData(this.menuItems, this.router.url, action);
    }
}
