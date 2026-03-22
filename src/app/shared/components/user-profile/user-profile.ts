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
  lastLogin: string = '';
  userLocation: string = 'Main Office';

  ngOnInit(): void {
    this.userEmail = localStorage.getItem('email');
    this.userName = localStorage.getItem('userName') || 'Super Admin';
    this.userRole = this.authService.getUserRole() || 'Administrator';
    
    // Dynamic Last Login (using current date/time if not stored)
    const storedLastLogin = localStorage.getItem('lastLogin');
    if (storedLastLogin) {
      this.lastLogin = storedLastLogin;
    } else {
      const now = new Date();
      this.lastLogin = `Today, ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    // Dynamic Location
    this.userLocation = localStorage.getItem('userLocation') || 'Warehouse Unit 4';
  }

  close(): void {
    this.dialogRef.close();
  }

  onLogout(): void {
    this.dialogRef.close();
    this.authService.logout();
  }
}
