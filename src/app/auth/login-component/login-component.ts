import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit, ViewChild, ElementRef } from '@angular/core';
import { finalize } from 'rxjs';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MaterialModule } from '../../shared/material/material/material-module';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { LoginDto } from '../../core/models/user.model';
import { MatDialog } from '@angular/material/dialog';
import { StatusDialogComponent } from '../../shared/components/status-dialog-component/status-dialog-component';
import { PermissionService } from '../../core/services/permission.service';

@Component({
  selector: 'app-login',
  imports: [CommonModule, ReactiveFormsModule, MaterialModule],
  templateUrl: './login-component.html',
  styleUrl: './login-component.scss',
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  forgotPasswordMode = false;
  resetPasswordMode = false;
  forgotPasswordForm: FormGroup;
  resetPasswordForm: FormGroup;

  @ViewChild('emailInputField') emailInputField!: ElementRef;

  // existing
  changePasswordMode = false;
  changePasswordForm: FormGroup;
  loading = false;
  errorMessage = '';

  private dialog = inject(MatDialog);
  private cdr = inject(ChangeDetectorRef);
  private permissionService = inject(PermissionService);

  constructor(private fb: FormBuilder, private auth: AuthService, private router: Router) {
    this.loginForm = this.fb.group({
      Email: ['', [Validators.required, Validators.email]],
      Password: ['', [Validators.required]],
      rememberMe: [false]
    });

    this.changePasswordForm = this.fb.group({
      Email: ['', [Validators.required, Validators.email]],
      OldPassword: ['', Validators.required],
      NewPassword: ['', [Validators.required, Validators.minLength(6)]]
    });

    this.forgotPasswordForm = this.fb.group({
      Email: ['', [Validators.required, Validators.email]]
    });

    this.resetPasswordForm = this.fb.group({
      Email: ['', [Validators.required, Validators.email]],
      ResetToken: ['', Validators.required],
      NewPassword: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  ngOnInit() {
    // Check for saved email from Remember Me
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
      this.loginForm.patchValue({
        Email: savedEmail,
        rememberMe: true
      });
    }
  }

  toggleChangePasswordMode() {
    this.changePasswordMode = !this.changePasswordMode;
    this.errorMessage = '';
    this.loginForm.reset();
    this.changePasswordForm.reset();
  }

  Login() {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const loginData: LoginDto = {
      Email: this.loginForm.value.Email,
      Password: this.loginForm.value.Password
    };

    this.auth.login(loginData).pipe(
      finalize(() => {
        setTimeout(() => {
          this.loading = false;
          this.cdr.markForCheck();
        });
      })
    ).subscribe({
      next: (res) => {
        console.log('Login successful:', res);

        // Handle Remember Me
        if (this.loginForm.value.rememberMe) {
          localStorage.setItem('rememberedEmail', this.loginForm.value.Email);
        } else {
          localStorage.removeItem('rememberedEmail');
        }

        // Reset permission cache so resolver fetches fresh data for this user's role
        this.permissionService.resetForLogin();

        this.router.navigate(['/app/dashboard']);
      },
      error: err => {
        console.error('Login error:', err);
        const msg = err?.error?.message || 'Invalid credentials or server error. Please try again.';
        setTimeout(() => {
          this.showErrorDialog(msg);
        }, 150);
      }
    });
  }

  ChangePassword() {
    if (this.changePasswordForm.invalid) {
      this.changePasswordForm.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const data = this.changePasswordForm.value;

    this.auth.changePassword(data).pipe(
      finalize(() => {
        setTimeout(() => {
          this.loading = false;
          this.cdr.markForCheck();
        });
      })
    ).subscribe({
      next: () => {
        this.dialog.open(StatusDialogComponent, {
          data: { isSuccess: true, message: 'Password changed successfully. Please login.' }
        });
        this.toggleChangePasswordMode();
      },
      error: err => {
        const msg = err?.error?.message || 'Failed to change password.';
        setTimeout(() => {
          this.showErrorDialog(msg);
        }, 150);
      }
    });
  }

  private showErrorDialog(message: string) {
    this.dialog.open(StatusDialogComponent, {
      data: { isSuccess: false, message: message },
      disableClose: true
    });
  }

  toggleForgotPasswordMode() {
    this.forgotPasswordMode = !this.forgotPasswordMode;
    this.resetPasswordMode = false;
    this.changePasswordMode = false;
    this.errorMessage = '';
    this.forgotPasswordForm.reset();
    this.resetPasswordForm.reset();
  }

  onForgotPassword() {
    if (this.forgotPasswordForm.invalid) {
      this.forgotPasswordForm.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const email = this.forgotPasswordForm.value.Email;

    this.auth.forgotPassword(email).pipe(
      finalize(() => {
        setTimeout(() => {
          this.loading = false;
          this.cdr.markForCheck();
        });
      })
    ).subscribe({
      next: (res) => {
        console.log('Forgot Password response:', res);
        // For dev: show token
        if (res.token) {
          this.dialog.open(StatusDialogComponent, {
            data: { isSuccess: true, message: `Token generated (Dev Mode): ${res.token}` }
          });
          // pre-fill email and token
          this.resetPasswordForm.patchValue({
            Email: email,
            ResetToken: res.token
          });
        } else {
          this.dialog.open(StatusDialogComponent, {
            data: { isSuccess: true, message: 'If the email exists, a reset link has been sent.' }
          });
        }

        this.forgotPasswordMode = false;
        this.resetPasswordMode = true; // Switch to reset password
      },
      error: err => {
        console.error('Forgot Password Error:', err);
        let msg = 'Failed to request password reset.';

        if (err.error) {
          if (typeof err.error === 'string') {
            msg = err.error;
          } else if (err.error.errors) {
            // Validation errors (ProblemDetails)
            const errors = err.error.errors;
            const firstError = Object.keys(errors)[0];
            msg = errors[firstError][0] || 'Validation error';
          } else if (err.error.title) {
            msg = err.error.title;
          } else if (err.error.message) {
            msg = err.error.message;
          }
        }

        setTimeout(() => { this.showErrorDialog(msg); }, 150);
      }
    });
  }

  onResetPassword() {
    if (this.resetPasswordForm.invalid) {
      this.resetPasswordForm.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const data = this.resetPasswordForm.value;

    this.auth.resetPassword(data).pipe(
      finalize(() => {
        setTimeout(() => {
          this.loading = false;
          this.cdr.markForCheck();
        });
      })
    ).subscribe({
      next: () => {
        const userEmail = this.resetPasswordForm.value.Email;
        this.dialog.open(StatusDialogComponent, {
          data: { isSuccess: true, message: 'Password reset successfully. Please login.' }
        });
        this.resetPasswordMode = false;
        this.forgotPasswordMode = false;

        // Pre-fill login form with the reset email
        this.loginForm.reset({
          Email: userEmail,
          Password: '',
          rememberMe: this.loginForm.value.rememberMe
        });

        // Focus the email field after a short delay to allow UI to switch
        setTimeout(() => {
          if (this.emailInputField) {
            this.emailInputField.nativeElement.focus();
          }
        }, 500);
      },
      error: err => {
        console.error('Reset Password Error:', err);
        let msg = 'Failed to reset password.';
        if (err.error && typeof err.error === 'string') {
          msg = err.error;
        } else if (err.error?.message) {
          msg = err.error.message;
        }
        setTimeout(() => { this.showErrorDialog(msg); }, 150);
      }
    });
  }

  cancelReset() {
    this.resetPasswordMode = false;
    this.forgotPasswordMode = false;
  }
}
