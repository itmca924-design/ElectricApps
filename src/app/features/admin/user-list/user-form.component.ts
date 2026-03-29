import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { RegisterUserDto } from '../../../core/models/user.model';
import { RoleService } from '../../../core/services/role.service';
import { UserService } from '../../../core/services/user.service';
import { Role } from '../../../core/models/role.model';
import { NotificationService } from '../../shared/notification.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { MatDialog } from '@angular/material/dialog';

@Component({
  selector: 'app-user-form',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="dialog-header">
      <h2 mat-dialog-title>{{ isEdit ? 'Edit User' : 'Create New User' }}</h2>
      <button mat-icon-button mat-dialog-close class="close-btn">
        <mat-icon>close</mat-icon>
      </button>
    </div>
    
    <mat-dialog-content>
      <form [formGroup]="userForm" class="user-form">
        
        <mat-form-field appearance="outline">
          <mat-label>Username</mat-label>
          <input matInput formControlName="UserName" placeholder="pappu_singh">
          <mat-icon matPrefix>person_outline</mat-icon>
          <mat-error *ngIf="userForm.get('UserName')?.hasError('required')">Username is required</mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Email</mat-label>
          <input matInput formControlName="Email" placeholder="admin@admin.com">
          <mat-icon matPrefix>mail_outline</mat-icon>
          <mat-error *ngIf="userForm.get('Email')?.hasError('required')">Email is required</mat-error>
          <mat-error *ngIf="userForm.get('Email')?.hasError('email')">Invalid email</mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Password</mat-label>
          <input matInput [type]="hidePassword ? 'password' : 'text'" formControlName="Password" placeholder="••••••••">
          <mat-icon matPrefix>lock_outline</mat-icon>
          <button mat-icon-button matSuffix (click)="hidePassword = !hidePassword">
            <mat-icon>{{hidePassword ? 'visibility_off' : 'visibility'}}</mat-icon>
          </button>
          <mat-error *ngIf="userForm.get('Password')?.hasError('required')">Password is required</mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Roles (Multi-Select)</mat-label>
          <mat-select formControlName="RoleIds" multiple>
            <mat-option *ngFor="let role of roles" [value]="role.id">{{role.roleName}}</mat-option>
          </mat-select>
          <mat-icon matPrefix>admin_panel_settings</mat-icon>
          <mat-error *ngIf="userForm.get('RoleIds')?.hasError('required')">At least one role is required</mat-error>
        </mat-form-field>

      </form>
    </mat-dialog-content>
    
    <mat-dialog-actions align="end">
      <button mat-raised-button mat-dialog-close class="cancel-btn">CANCEL</button>
      <button mat-raised-button class="main-add-btn" [disabled]="userForm.invalid" (click)="save()">{{ isEdit ? 'UPDATE USER' : 'CREATE USER' }}</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 20px;
      border-bottom: 1px solid #f1f5f9;
      h2 { margin: 0; font-weight: 700; color: #1e293b; font-size: 20px; }
      
      .close-btn { 
        color: #ef4444 !important; 
        background: #fef2f2 !important;
        border-radius: 50% !important;
        width: 32px !important;
        height: 32px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.12) !important;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        padding: 0 !important;
        min-width: 32px !important;

        mat-icon {
          font-size: 18px;
          width: 18px;
          height: 18px;
          margin: 0 !important;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        &:hover {
          background: #fee2e2 !important;
          transform: rotate(90deg) scale(1.1);
        }
      }
    }

    mat-dialog-content {
      padding: 12px 20px 0 20px !important;
      max-height: 70vh;
    }

    .user-form { 
      display: flex; 
      flex-direction: column; 
      gap: 8px; 
    }

    mat-form-field { width: 100%; }
    
    ::ng-deep .mat-mdc-dialog-container { 
      border-radius: 20px !important; 
      overflow: hidden !important;
    }
    
    mat-dialog-actions {
      padding: 16px 20px !important;
      border-top: 1px solid #f1f5f9;
      gap: 12px;
      background: #fafafa;
    }

    .cancel-btn {
      color: #64748b !important;
      font-weight: 600 !important;
      letter-spacing: 0.5px !important;
      padding: 0 20px !important;
      height: 40px !important;
      border-radius: 12px !important;
      text-transform: uppercase;
      font-size: 13px;
    }

    .main-add-btn {
      background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%) !important;
      color: white !important;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3) !important;
      border-radius: 12px !important;
      font-weight: 600 !important;
      letter-spacing: 0.5px !important;
      height: 40px !important;
      padding: 0 28px !important;
      transition: all 0.3s ease !important;
      border: none;
      text-transform: uppercase;
      font-size: 13px;

      &:hover:not([disabled]) {
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4) !important;
      }

      &[disabled] {
        background: #e2e8f0 !important;
        color: #94a3b8 !important;
        box-shadow: none !important;
      }
    }

    /* Responsive */
    @media (max-width: 600px) {
      ::ng-deep .mat-mdc-dialog-container {
        width: 100vw !important;
        max-width: none !important;
        border-radius: 0 !important;
        height: auto !important; /* Fix: Let it be sized by content */
      }
      mat-dialog-content {
        padding-bottom: 20px !important; /* Ensure some space before buttons */
      }
      mat-dialog-actions {
        padding-bottom: 24px !important;
      }
    }

    /* ==========================================================================
       USER FORM DIALOG DARK MODE POLISH
       ========================================================================== */
    :host-context(.dark-mode) {
      .dialog-header {
        background-color: #1e293b !important;
        border-bottom-color: rgba(255, 255, 255, 0.05) !important;
        h2 { color: #ffffff !important; }
        
        .close-btn {
          background: rgba(255, 255, 255, 0.05) !important;
          color: rgba(255, 255, 255, 0.6) !important;
          &:hover { background: rgba(255, 255, 255, 0.1) !important; color: #ffffff !important; }
        }
      }

      mat-dialog-content {
        background-color: #1e293b !important;
      }

      ::ng-deep {
        .mat-mdc-form-field-wrapper {
          background-color: rgba(255, 255, 255, 0.03) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          border-radius: 12px !important;
        }
        .mat-mdc-form-field {
          .mat-mdc-floating-label { color: rgba(255, 255, 255, 0.6) !important; }
          .mat-mdc-input-element { color: #ffffff !important; }
          mat-icon { color: rgba(255, 255, 255, 0.5) !important; }
          .mat-mdc-select-value-text { color: #ffffff !important; }
          .mat-mdc-select-arrow svg { fill: #ffffff !important; }
        }
      }

      mat-dialog-actions {
        background-color: #1e293b !important;
        border-top-color: rgba(255, 255, 255, 0.05) !important;
        .cancel-btn { color: rgba(255, 255, 255, 0.5) !important; }
      }
    }
  `]
})
export class UserFormComponent implements OnInit {
  userForm: FormGroup;
  roles: Role[] = [];
  hidePassword = true;
  isEdit = false;

  constructor(
    private fb: FormBuilder,
    private roleService: RoleService,
    private userService: UserService,
    private dialog: MatDialog,
    public dialogRef: MatDialogRef<UserFormComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private notificationService: NotificationService
  ) {
    this.isEdit = !!data;
    this.userForm = this.fb.group({
      UserName: [{ value: '', disabled: false }, Validators.required],
      Email: [{ value: '', disabled: false }, [Validators.required, Validators.email]],
      Password: ['', this.isEdit ? [] : [Validators.required]],
      RoleIds: [[], Validators.required]
    });
  }

  ngOnInit() {
    this.roleService.getAllRoles().subscribe(roles => {
      this.roles = roles;
      if (this.isEdit && this.data) {
        // Map role names from data.roles to role IDs from this.roles
        const selectedRoleIds = this.roles
          .filter(r => this.data.roles.includes(r.roleName))
          .map(r => r.id);

        this.userForm.patchValue({
          UserName: this.data.userName,
          Email: this.data.email,
          RoleIds: selectedRoleIds
        });
      }
    });
  }

  save() {
    if (this.userForm.valid) {
      const dialogRef = this.dialog.open(ConfirmDialogComponent, {
        width: '400px',
        data: {
          title: this.isEdit ? 'Confirm Update User' : 'Confirm Create User',
          message: `Are you sure you want to ${this.isEdit ? 'update' : 'create'} user: ${this.isEdit ? this.data.userName : this.userForm.get('UserName')?.value}?`,
          confirmText: this.isEdit ? 'Yes, Update' : 'Yes, Create'
        }
      });

      dialogRef.afterClosed().subscribe(confirm => {
        if (confirm) {
          const formValue = this.userForm.getRawValue();
          const dto: any = {
            UserName: formValue.UserName,
            Email: formValue.Email,
            RoleIds: formValue.RoleIds
          };
          if (formValue.Password) {
            dto.Password = formValue.Password;
          }

          if (this.isEdit) {
            dto.Id = this.data.id;
            dto.IsActive = this.data.isActive;
            this.userService.updateUser(this.data.id, dto).subscribe({
              next: () => {
                this.notificationService.showStatus(true, 'User Updated Successfully');
                this.dialogRef.close(true);
              },
              error: (err) => {
                console.error(err);
                this.notificationService.showStatus(false, err.error?.message || 'Failed to update user');
              }
            });
          } else {
            // Before save, check for duplicates
            this.userService.checkDuplicate(dto.UserName, dto.Email).subscribe({
              next: (res) => {
                if (res.exists) {
                  this.notificationService.showStatus(false, res.message);
                } else {
                  // Proceed to create
                  this.userService.createUser(dto).subscribe({
                    next: () => {
                      this.notificationService.showStatus(true, 'User Created Successfully');
                      this.dialogRef.close(true);
                    },
                    error: (err) => {
                      console.error(err);
                      this.notificationService.showStatus(false, err.error?.message || 'Failed to create user');
                    }
                  });
                }
              },
              error: (err) => {
                console.error(err);
                this.notificationService.showStatus(false, 'Error checking duplicate user');
              }
            });
          }
        }
      });
    }
  }
}
