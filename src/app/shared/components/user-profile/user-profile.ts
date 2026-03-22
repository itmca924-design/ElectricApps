import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../material/material/material-module';
import { MatDialogRef } from '@angular/material/dialog';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './user-profile.html',
  styleUrl: './user-profile.scss'
})
export class UserProfileComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<UserProfileComponent>);
  private authService = inject(AuthService);

  userEmail: string | null = '';
  userName: string = 'Super Admin';
  userRole: string = 'Administrator';
  joinedDate: string = 'March 2026';

  ngOnInit(): void {
    this.userEmail = localStorage.getItem('email');
    if (this.userEmail) {
       // Extracting name from email if needed, or keeping it static for now
       const namePart = this.userEmail.split('@')[0];
       this.userName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
    }
  }

  close(): void {
    this.dialogRef.close();
  }

  onLogout(): void {
    this.dialogRef.close();
    this.authService.logout();
  }
}
