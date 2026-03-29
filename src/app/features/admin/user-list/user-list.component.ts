import { Component, Inject, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { MatDialog } from '@angular/material/dialog';
import { UserService } from '../../../core/services/user.service';
import { User, RegisterUserDto } from '../../../core/models/user.model';
import { UserFormComponent } from './user-form.component';
import { RoleService } from '../../../core/services/role.service';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { StatusDialogComponent } from '../../../shared/components/status-dialog-component/status-dialog-component';

import { SummaryStat, SummaryStatsComponent } from '../../../shared/components/summary-stats-component/summary-stats-component';
import { LoadingService } from '../../../core/services/loading.service';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule, SummaryStatsComponent],
  template: `
    <div class="list-container" [class.disabled-content]="loading">
      <div class="header-actions">
        <h1>User Management</h1>
        <button mat-raised-button class="main-add-btn" (click)="createUser()">
           <mat-icon>add</mat-icon> Create User
        </button>
      </div>

      <app-summary-stats [stats]="summaryStats" [isLoading]="loading"></app-summary-stats>
      
      <div class="table-container-wrapper">
        <div class="grid-wrapper">
          <table mat-table [dataSource]="dataSource">
            <!-- Username Column -->
            <ng-container matColumnDef="userName">
              <th mat-header-cell *matHeaderCellDef> Username </th>
              <td mat-cell *matCellDef="let element" class="username-cell"> {{element.userName}} </td>
            </ng-container>

            <!-- Email Column -->
            <ng-container matColumnDef="email">
              <th mat-header-cell *matHeaderCellDef> Email </th>
              <td mat-cell *matCellDef="let element"> {{element.email}} </td>
            </ng-container>

            <!-- Roles Column -->
            <ng-container matColumnDef="roles">
              <th mat-header-cell *matHeaderCellDef> Roles </th>
              <td mat-cell *matCellDef="let element"> 
                <div class="role-chips">
                   <span *ngFor="let role of element.roles" class="role-badge">{{role}}</span>
                </div>
              </td>
            </ng-container>

            <!-- Status Column -->
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef> Status </th>
              <td mat-cell *matCellDef="let element">
                <div class="status-wrapper">
                  <mat-slide-toggle [checked]="element.isActive" (change)="toggleStatus(element, $event.checked)" color="primary">
                    <span class="status-text" [class.active]="element.isActive">{{element.isActive ? 'Active' : 'Inactive'}}</span>
                  </mat-slide-toggle>
                </div>
              </td>
            </ng-container>
            
            <!-- Actions Column -->
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef> Actions </th>
              <td mat-cell *matCellDef="let element">
                <div class="action-buttons">
                  <button mat-icon-button (click)="editUser(element)" matTooltip="Edit User">
                    <mat-icon color="accent">edit</mat-icon>
                  </button>
                  <button mat-icon-button (click)="deleteUser(element)" matTooltip="Delete User">
                    <mat-icon color="warn">delete</mat-icon>
                  </button>
                </div>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns" sticky></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns;" class="user-row"></tr>
          </table>
        </div>
        <mat-paginator [pageSizeOptions]="[10, 20, 50]" 
                       showFirstLastButtons 
                       class="user-paginator">
        </mat-paginator>
      </div>
    </div>
  `,
  styles: [`
    .disabled-content {
      pointer-events: none;
      user-select: none;
      opacity: 0.5;
      filter: blur(2px);
    }

    :host {
      display: flex;
      flex-direction: column;
      height: calc(100vh - 64px); 
      overflow: hidden;
      padding: 4px 20px 20px 20px;
      box-sizing: border-box;
      background-color: #f8fafc;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }

    .list-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }

    .header-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      flex-shrink: 0;

      h1 {
        font-size: 1.5rem;
        font-weight: 700;
        color: #1e293b;
        letter-spacing: -0.5px;
        margin: 0;
      }
    }

    .main-add-btn {
      background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%) !important;
      color: white !important;
      box-shadow: 0 4px 14px 0 rgba(59, 130, 246, 0.3) !important;
      border-radius: 10px !important;
      font-weight: 600 !important;
      height: 40px !important;
      padding: 0 16px !important;
      transition: all 0.3s ease !important;

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4) !important;
      }
      
      mat-icon {
        margin-right: 8px;
      }
    }

    .table-container-wrapper {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
      background: white;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }

    .grid-wrapper {
      flex: 1;
      overflow: auto;
      
      table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;

        th.mat-header-cell {
          background-color: #f8fafc;
          color: #475569;
          font-weight: 600;
          font-size: 11px;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          padding: 16px;
          border-bottom: 2px solid #e2e8f0;
          position: sticky;
          top: 0;
          z-index: 10;
        }

        td.mat-cell {
          padding: 16px;
          font-size: 13px;
          color: #1e293b;
          border-bottom: 1px solid #f1f5f9;
        }

        .user-row {
          transition: background-color 0.2s;
          cursor: pointer;
          &:hover { background-color: #f8fafc; }
        }

        .username-cell {
          font-weight: 600;
          color: #4f46e5;
        }
      }
    }

    .role-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .role-badge {
      background: #f1f5f9;
      color: #475569;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      text-transform: capitalize;
    }

    .status-wrapper {
      display: flex;
      align-items: center;
    }

    .status-text {
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
      margin-left: 8px;
      &.active { color: #10b981; }
    }

    .user-paginator {
      border-top: 1px solid #e2e8f0;
    }

    .action-buttons {
      display: flex;
      gap: 4px;
    }

    /* ==========================================================================
       USER LIST DARK MODE POLISH
       ========================================================================== */
    :host-context(.dark-mode) {
      background-color: #0f172a !important;

      .header-actions h1 {
        color: #f8fafc !important;
      }

      .table-container-wrapper {
        background-color: #1e293b !important;
        border-color: rgba(255, 255, 255, 0.05) !important;
        box-shadow: 0 10px 30px rgba(0,0,0,0.2) !important;
        
        ::ng-deep {
          .mat-mdc-table {
            background-color: #1e293b !important;
          }
          .mat-mdc-row {
            background-color: #1e293b !important;
            &:hover { background-color: rgba(255, 255, 255, 0.03) !important; }
          }
          .mat-mdc-cell {
            color: #ffffff !important;
            border-bottom-color: rgba(255, 255, 255, 0.05) !important;
          }
        }
      }

      .grid-wrapper table {
        th.mat-header-cell {
          background-color: #0f172a !important;
          color: rgba(255, 255, 255, 0.5) !important;
          border-bottom-color: rgba(255, 255, 255, 0.1) !important;
        }

        .username-cell {
          color: #818cf8 !important;
        }
      }

      .role-badge {
        background: rgba(255, 255, 255, 0.05) !important;
        color: rgba(255, 255, 255, 0.7) !important;
        border: 1px solid rgba(255, 255, 255, 0.1) !important;
      }

      .status-text {
        color: rgba(255, 255, 255, 0.5) !important;
        &.active { color: #10b981 !important; }
      }

      .user-paginator {
        background-color: #1e293b !important;
        color: #ffffff !important;
        border-top-color: rgba(255, 255, 255, 0.05) !important;
        
        ::ng-deep {
          .mat-mdc-paginator-range-label,
          .mat-mdc-paginator-navigation-next,
          .mat-mdc-paginator-navigation-previous,
          .mat-mdc-paginator-icon,
          .mat-mdc-select-value-text,
          .mat-mdc-select-arrow svg {
            color: #ffffff !important;
            fill: #ffffff !important;
          }
        }
      }

      ::ng-deep .mat-mdc-button-base .mat-mdc-button-touch-target {
        color: #ffffff !important;
      }
    }
  `]
})
export class UserListComponent implements OnInit {
  displayedColumns: string[] = ['userName', 'email', 'roles', 'status', 'actions'];
  dataSource = new MatTableDataSource<User>();

  @ViewChild(MatPaginator) paginator!: MatPaginator;

  constructor(
    private userService: UserService,
    private dialog: MatDialog,
    private roleService: RoleService,
    private loadingService: LoadingService
  ) { }

  summaryStats: SummaryStat[] = [];
  loading = true;

  ngOnInit() {
    this.loadUsers();
  }

  loadUsers() {
    this.loading = true;
    this.loadingService.setLoading(true);
    this.userService.getAllUsers().subscribe({
      next: (users) => {
        this.dataSource.data = users;

        // Calculate Stats
        const totalUsers = users.length;
        const activeUsers = users.filter(u => u.isActive).length;
        const adminUsers = users.filter(u => u.roles.includes('Admin')).length;

        this.summaryStats = [
          { label: 'Total Users', value: totalUsers, icon: 'group', type: 'total' },
          { label: 'Active Users', value: activeUsers, icon: 'how_to_reg', type: 'active' },
          { label: 'Admins', value: adminUsers, icon: 'admin_panel_settings', type: 'info' }
        ];

        this.loading = false;
        this.loadingService.setLoading(false);
        setTimeout(() => {
          this.dataSource.paginator = this.paginator;
        });
      },
      error: () => {
        this.loading = false;
        this.loadingService.setLoading(false);
      }
    });
  }

  createUser() {
    const dialogRef = this.dialog.open(UserFormComponent, {
      width: '500px'
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadUsers();
      }
    });
  }

  toggleStatus(user: User, isChecked: boolean) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: isChecked ? 'Activate User' : 'Deactivate User',
        message: `Are you sure you want to ${isChecked ? 'activate' : 'deactivate'} user: ${user.userName}?`,
        confirmText: isChecked ? 'Activate' : 'Deactivate',
        confirmColor: isChecked ? 'primary' : 'warn'
      }
    });

    dialogRef.afterClosed().subscribe(confirm => {
      if (confirm) {
        this.userService.updateStatus(user.id, isChecked).subscribe({
          next: () => {
            user.isActive = isChecked;
            this.dialog.open(StatusDialogComponent, {
              data: { isSuccess: true, message: `User ${user.userName} ${isChecked ? 'activated' : 'deactivated'} successfully.` }
            });
          },
          error: () => {
            this.loadUsers(); // Reload to revert visually
            this.dialog.open(StatusDialogComponent, {
              data: { isSuccess: false, message: 'Failed to update user status.' }
            });
          }
        });
      } else {
        // Revert the toggle visually if cancelled
        this.loadUsers();
      }
    });
  }

  editUser(user: User) {
    const dialogRef = this.dialog.open(UserFormComponent, {
      width: '500px',
      data: user
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadUsers();
      }
    });
  }

  deleteUser(user: User) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Confirm Delete User',
        message: `Are you sure you want to delete user: ${user.userName}? This action cannot be undone.`,
        confirmText: 'Delete',
        confirmColor: 'warn'
      }
    });

    dialogRef.afterClosed().subscribe(confirm => {
      if (confirm) {
        this.userService.deleteUser(user.id).subscribe({
          next: () => {
            this.dialog.open(StatusDialogComponent, {
              data: { isSuccess: true, message: `User ${user.userName} deleted successfully.` }
            });
            this.loadUsers();
          },
          error: (err) => {
            this.dialog.open(StatusDialogComponent, {
              data: { isSuccess: false, message: err.error?.message || 'Failed to delete user.' }
            });
          }
        });
      }
    });
  }
}
