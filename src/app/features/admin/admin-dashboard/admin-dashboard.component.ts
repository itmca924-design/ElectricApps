
import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { Router } from '@angular/router';
import { UserService } from '../../../core/services/user.service';
import { RoleService } from '../../../core/services/role.service';
import { MenuService } from '../../../core/services/menu.service';
import { LoadingService } from '../../../core/services/loading.service';
import { forkJoin } from 'rxjs';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { User } from '../../../core/models/user.model';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, MaterialModule, BaseChartDirective],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss'
})
export class AdminDashboardComponent implements OnInit {
  private userService = inject(UserService);
  private roleService = inject(RoleService);
  private menuService = inject(MenuService);
  private loadingService = inject(LoadingService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  totalUsers = 0;
  activeUsers = 0;
  totalRoles = 0;
  totalMenus = 0;
  recentUsers: User[] = [];
  isLoading = true;

  public chartData: ChartConfiguration['data'] = {
    datasets: [
      {
        data: [12, 19, 15, 25, 22, 30, 45],
        label: 'User Logins',
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4
      },
      {
        data: [5, 10, 8, 15, 12, 20, 25],
        label: 'New Registrations',
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4
      }
    ],
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  };

  public chartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          usePointStyle: true,
          padding: 20,
          font: { family: 'Outfit', size: 12 }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        titleColor: '#1e293b',
        bodyColor: '#475569',
        borderColor: '#e2e8f0',
        borderWidth: 1,
        padding: 12,
        displayColors: true,
        usePointStyle: true
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { family: 'Outfit' } } },
      y: { grid: { color: '#f1f5f9' }, ticks: { font: { family: 'Outfit' } } }
    }
  };

  ngOnInit(): void {
    this.loadAdminData();
  }

  loadAdminData(): void {
    this.isLoading = true;
    this.loadingService.setLoading(true);

    forkJoin({
      users: this.userService.getAllUsers(),
      roles: this.roleService.getAllRoles(),
      menus: this.menuService.getAllMenus()
    }).subscribe({
      next: (res: any) => {
        this.totalUsers = res.users.length;
        this.activeUsers = (res.users || []).filter((u: User) => u.isActive).length;
        this.totalRoles = (res.roles || []).length;
        this.totalMenus = (res.menus || []).length;
        
        // Sort by joined date (descending) and take top 5
        this.recentUsers = [...(res.users || [])]
          .sort((a: User, b: User) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 5);

        this.isLoading = false;
        this.loadingService.setLoading(false);
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to load admin dashboard data', err);
        this.isLoading = false;
        this.loadingService.setLoading(false);
        this.cdr.detectChanges();
      }
    });
  }

  navigate(url: string): void {
    this.router.navigate([url]);
  }

  showSystemLogs(): void {
    // Placeholder for system logs implementation
    console.log('Opening system logs...');
  }
}
