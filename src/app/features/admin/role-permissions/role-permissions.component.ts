import { ChangeDetectorRef, Component, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { FlatTreeControl } from '@angular/cdk/tree';
import { MatTreeFlatDataSource, MatTreeFlattener } from '@angular/material/tree';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { forkJoin } from 'rxjs';

import { MaterialModule } from '../../../shared/material/material/material-module';
import { RoleService } from '../../../core/services/role.service';
import { MenuService } from '../../../core/services/menu.service';
import { Role, RolePermission } from '../../../core/models/role.model';
import { MenuItem } from '../../../core/models/menu-item.model';
import { StatusDialogComponent } from '../../../shared/components/status-dialog-component/status-dialog-component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { SummaryStat, SummaryStatsComponent } from '../../../shared/components/summary-stats-component/summary-stats-component';
import { LoadingService } from '../../../core/services/loading.service';

@Component({
  selector: 'app-role-permissions',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ScrollingModule, SummaryStatsComponent],
  templateUrl: './role-permissions.component.html',
  styleUrls: ['./role-permissions.component.scss']
})
export class RolePermissionsComponent implements OnInit {
  roles: Role[] = [];
  selectedRoleId: number | null = null;
  permissions: RolePermission[] = [];
  loading = false;
  summaryStats: SummaryStat[] = [];

  displayedColumns = ['menu', 'canView', 'canAdd', 'canEdit', 'canDelete', 'additionalActions'];

  private _transformer = (node: MenuItem, level: number) => {
    return {
      expandable: !!node.children && node.children.length > 0,
      title: node.title,
      level: level,
      id: node.id,
      icon: node.icon,
      children: node.children
    };
  };

  treeControl = new FlatTreeControl<any>(
    node => node.level,
    node => node.expandable
  );

  treeFlattener = new MatTreeFlattener(
    this._transformer,
    node => node.level,
    node => node.expandable,
    node => node.children
  );

  dataSource = new MatTreeFlatDataSource(this.treeControl, this.treeFlattener);

  hasChild = (_: number, node: any) => node.expandable;

  @ViewChild(MatSort) sort!: MatSort;

  private roleService = inject(RoleService);
  private menuService = inject(MenuService);
  private cdr = inject(ChangeDetectorRef);
  private dialog = inject(MatDialog);
  private loadingService = inject(LoadingService);

  constructor() { }

  ngOnInit() {
    this.initialLoad();
  }

  initialLoad() {
    this.loading = true;
    this.loadingService.setLoading(true);

    forkJoin({
      roles: this.roleService.getAllRoles(),
      menus: this.menuService.getAllMenus()
    }).subscribe({
      next: (data) => {
        this.roles = data.roles;

        const menuTree = this.menuService.buildMenuTree(data.menus);
        this.dataSource.data = this.menuService.sortMenus(menuTree);

        if (this.roles.length > 0) {
          this.selectedRoleId = this.roles[0].id;
          this.onRoleChange();
        } else {
          this.loading = false;
          this.loadingService.setLoading(false);
          this.cdr.detectChanges();
        }
      },
      error: (err) => {
        console.error('Error loading initial data', err);
        this.loading = false;
        this.loadingService.setLoading(false);
        this.cdr.detectChanges();
      }
    });
  }

  onRoleChange() {
    if (this.selectedRoleId) {
      this.loading = true;
      this.loadingService.setLoading(true);

      this.roleService.getRolePermissions(this.selectedRoleId).subscribe({
        next: (perms) => {
          this.permissions = perms;

          // Calculate Stats
          const totalPermissions = perms.length;
          const viewableMenus = perms.filter(p => p.canView).length;
          const highPrivilege = perms.filter(p => p.canAdd || p.canDelete).length;

          this.summaryStats = [
            { label: 'Total Modules', value: totalPermissions, icon: 'apps', type: 'total' },
            { label: 'View Access', value: viewableMenus, icon: 'visibility', type: 'active' },
            { label: 'High Privileges', value: highPrivilege, icon: 'security', type: highPrivilege > 0 ? 'warning' : 'info' }
          ];

          this.loading = false;
          this.loadingService.setLoading(false);
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error(err);
          this.loading = false;
          this.loadingService.setLoading(false);
          this.cdr.detectChanges();
        }
      });
    }
  }

  getPermission(menuId: number | undefined): RolePermission {
    if (!menuId) return { roleId: 0, menuId: 0, canView: false, canAdd: false, canEdit: false, canDelete: false };

    let perm = this.permissions.find(p => p.menuId === menuId);
    if (!perm) {
      perm = { roleId: this.selectedRoleId!, menuId: menuId, canView: false, canAdd: false, canEdit: false, canDelete: false };
      this.permissions.push(perm);
    }
    return perm;
  }

  savePermissions() {
    if (this.selectedRoleId) {
      const dialogRef = this.dialog.open(ConfirmDialogComponent, {
        width: '400px',
        data: {
          title: 'Confirm Changes',
          message: 'Are you sure you want to save the updated permissions for this role?',
          confirmText: 'Yes, Save'
        }
      });

      dialogRef.afterClosed().subscribe(confirm => {
        if (confirm) {
          this.loading = true;
          this.loadingService.setLoading(true);
          this.roleService.updateRolePermissions(this.selectedRoleId!, this.permissions).subscribe({
            next: () => {
              // Clear menu cache immediately so next navigation fetches fresh permissions
              this.menuService.refreshMenu();

              this.loading = false;
              this.loadingService.setLoading(false);
              this.cdr.detectChanges();
              this.dialog.open(StatusDialogComponent, {
                width: '400px',
                data: {
                  isSuccess: true,
                  message: 'Permissions have been updated and saved successfully!'
                },
                disableClose: true
              });
            },
            error: (err) => {
              this.loading = false;
              this.loadingService.setLoading(false);
              this.cdr.detectChanges();
              let errorMessage = 'Something went wrong while saving permissions.';
              if (err.error && typeof err.error === 'string') {
                errorMessage = err.error;
              } else if (err.error && err.error.message) {
                errorMessage = err.error.message;
              } else if (err.message) {
                errorMessage = err.message;
              }

              this.dialog.open(StatusDialogComponent, {
                width: '400px',
                data: {
                  isSuccess: false,
                  message: errorMessage
                }
              });

              console.error('Permission Save Error:', err);
            }
          });
        }
      });
    }
  }

  resetPermissions() {
    if (this.selectedRoleId) {
      const dialogRef = this.dialog.open(ConfirmDialogComponent, {
        width: '400px',
        data: {
          title: 'Reset Permissions',
          message: 'Are you sure you want to reset all changes? Any unsaved changes will be lost.',
          confirmText: 'Yes, Reset',
          confirmColor: 'warn'
        }
      });

      dialogRef.afterClosed().subscribe(confirm => {
        if (confirm) {
          this.onRoleChange(); // Reload from DB
          this.cdr.detectChanges();

          this.dialog.open(StatusDialogComponent, {
            width: '400px',
            data: {
              isSuccess: true,
              message: 'Permissions reset to last saved state.'
            }
          });
        }
      });
    }
  }

  // --- Data Table Features ---

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value.trim().toLowerCase();
    this.menuService.getAllMenus().subscribe(menus => {
      if (!filterValue) {
        this.dataSource.data = menus;
      } else {
        this.dataSource.data = this.filterRecursive(menus, filterValue);
        this.treeControl.expandAll();
      }
      this.cdr.detectChanges();
    });
  }

  private filterRecursive(nodes: MenuItem[], filterValue: string): MenuItem[] {
    return nodes.map(node => ({ ...node }))
      .filter(node => {
        if (node.children) {
          node.children = this.filterRecursive(node.children, filterValue);
        }
        const matches = node.title.toLowerCase().includes(filterValue);
        const childMatches = node.children && node.children.length > 0;
        return matches || childMatches;
      });
  }

  // --- Bulk Actions ---

  isAllSelected(column: 'canView' | 'canAdd' | 'canEdit' | 'canDelete'): boolean {
    const allItems = this.getFlatItems(this.dataSource.data);
    if (allItems.length === 0) return false;
    return allItems.every(row => this.getPermission(row.id)[column]);
  }

  isSomeSelected(column: 'canView' | 'canAdd' | 'canEdit' | 'canDelete'): boolean {
    const allItems = this.getFlatItems(this.dataSource.data);
    if (allItems.length === 0) return false;
    return allItems.some(row => this.getPermission(row.id)[column]);
  }

  private getFlatItems(nodes: MenuItem[]): MenuItem[] {
    let result: MenuItem[] = [];
    nodes.forEach(node => {
      result.push(node);
      if (node.children) {
        result = result.concat(this.getFlatItems(node.children));
      }
    });
    return result;
  }

  toggleAll(column: 'canView' | 'canAdd' | 'canEdit' | 'canDelete', checked: boolean) {
    const allItems = this.getFlatItems(this.dataSource.data);
    allItems.forEach(row => {
      const perm = this.getPermission(row.id);
      perm[column] = checked;
    });
  }

  handlePermissionChange(node: any, column: 'canView' | 'canAdd' | 'canEdit' | 'canDelete', checked: boolean) {
    const perm = this.getPermission(node.id);
    perm[column] = checked;

    // 1. Cascade down: If it's a folder, update all children
    if (node.children && node.children.length > 0) {
      this.toggleChildrenRecursive(node.children, column, checked);
    }

    // 2. Cascade up
    if (checked) {
      // If we check an item, its parents must be checked to reach it
      this.updateParentsRecursive(this.dataSource.data, node.id, column);
    } else {
      // If we uncheck an item, check if its parent should also be unchecked (if no other children are checked)
      this.uncheckParentsRecursive(this.dataSource.data, node.id, column);
    }

    this.cdr.detectChanges();
  }

  private updateParentsRecursive(nodes: MenuItem[], targetId: number, column: 'canView' | 'canAdd' | 'canEdit' | 'canDelete'): boolean {
    for (const node of nodes) {
      if (node.id === targetId) return true;

      if (node.children && node.children.length > 0) {
        const found = this.updateParentsRecursive(node.children, targetId, column);
        if (found) {
          this.getPermission(node.id)[column] = true;
          return true;
        }
      }
    }
    return false;
  }

  private uncheckParentsRecursive(nodes: MenuItem[], targetId: number, column: 'canView' | 'canAdd' | 'canEdit' | 'canDelete'): boolean {
    for (const node of nodes) {
      if (node.id === targetId) return true;

      if (node.children && node.children.length > 0) {
        const found = this.uncheckParentsRecursive(node.children, targetId, column);
        if (found) {
          // If the target was found in this node's branch, check if any child is still checked
          const anyChildChecked = node.children.some(child => this.getPermission(child.id)[column]);
          if (!anyChildChecked) {
            this.getPermission(node.id)[column] = false;
          }
          return true;
        }
      }
    }
    return false;
  }

  private toggleChildrenRecursive(nodes: MenuItem[], column: 'canView' | 'canAdd' | 'canEdit' | 'canDelete', checked: boolean) {
    nodes.forEach(node => {
      const perm = this.getPermission(node.id);
      perm[column] = checked;
      if (node.children && node.children.length > 0) {
        this.toggleChildrenRecursive(node.children, column, checked);
      }
    });
  }
}
