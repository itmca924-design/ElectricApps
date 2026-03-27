import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { RoleService } from '../../../core/services/role.service';
import { Role, RolePrintSetting } from '../../../core/models/role.model';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { StatusDialogComponent } from '../../../shared/components/status-dialog-component/status-dialog-component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { LoadingService } from '../../../core/services/loading.service';

export interface ModuleGroup {
  name: string;
  icon: string;
  color: string;
  pages: string[];
}

@Component({
  selector: 'app-print-settings',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule],
  templateUrl: './print-settings.html',
  styleUrls: ['./print-settings.scss']
})
export class PrintSettings implements OnInit {
  roles: Role[] = [];
  selectedRoleId: number | null = null;
  settings: RolePrintSetting[] = [];
  loading = false;

  readonly modules: ModuleGroup[] = [
    {
      name: 'Quick Inventory',
      icon: 'flash_on',
      color: '#f59e0b',
      pages: ['Quick Purchase Order', 'Quick Sale Order', 'Quick Purchase Return', 'Quick Sale Return']
    },
    {
      name: 'Standard Inventory',
      icon: 'inventory_2',
      color: '#3b82f6',
      pages: ['Purchase Order', 'Standard Sale Order', 'Purchase Return', 'Standard Sale Return']
    }
  ];

  // Flat list for backend operations
  readonly pages = this.modules.flatMap(m => m.pages);

  private roleService = inject(RoleService);
  private cdr = inject(ChangeDetectorRef);
  private dialog = inject(MatDialog);
  private loadingService = inject(LoadingService);

  ngOnInit() {
    this.initialLoad();
  }

  initialLoad() {
    this.loading = true;
    this.loadingService.setLoading(true);

    this.roleService.getAllRoles().subscribe({
      next: (roles) => {
        this.roles = roles;
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
        console.error('Error loading roles', err);
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

      this.roleService.getRolePrintSettings(this.selectedRoleId).subscribe({
        next: (settings) => {
          this.settings = settings;

          // Ensure all pages have a setting object
          this.pages.forEach(page => {
            const existing = this.settings.find(s => s.pageName === page);
            if (!existing) {
              this.settings.push({
                roleId: this.selectedRoleId!,
                pageName: page,
                printFormat: 'A4'
              });
            }
          });

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

  getSetting(pageName: string): RolePrintSetting {
    return this.settings.find(s => s.pageName === pageName) || { roleId: this.selectedRoleId || 0, pageName, printFormat: 'A4' };
  }

  setFormat(pageName: string, format: string) {
    const setting = this.settings.find(s => s.pageName === pageName);
    if (setting) {
      setting.printFormat = format;
    }
  }

  setAllInModule(module: ModuleGroup, format: string) {
    module.pages.forEach(page => {
      const setting = this.settings.find(s => s.pageName === page);
      if (setting) {
        setting.printFormat = format;
      }
    });
    this.cdr.detectChanges();
  }

  getPageLabel(page: string): string {
    return page.replace('Quick ', '').replace('Standard ', '');
  }

  saveSettings() {
    if (this.selectedRoleId) {
      const dialogRef = this.dialog.open(ConfirmDialogComponent, {
        width: '400px',
        data: {
          title: 'Confirm Changes',
          message: 'Are you sure you want to save the print settings for this role?',
          confirmText: 'Yes, Save'
        }
      });

      dialogRef.afterClosed().subscribe(confirm => {
        if (confirm) {
          this.loading = true;
          this.loadingService.setLoading(true);
          this.roleService.updateRolePrintSettings(this.selectedRoleId!, this.settings).subscribe({
            next: () => {
              this.loading = false;
              this.loadingService.setLoading(false);
              this.cdr.detectChanges();
              this.dialog.open(StatusDialogComponent, {
                width: '400px',
                data: { isSuccess: true, message: 'Print settings saved successfully!' },
                disableClose: true
              });
            },
            error: () => {
              this.loading = false;
              this.loadingService.setLoading(false);
              this.cdr.detectChanges();
              this.dialog.open(StatusDialogComponent, {
                width: '400px',
                data: { isSuccess: false, message: 'Failed to save print settings.' }
              });
            }
          });
        }
      });
    }
  }
}
