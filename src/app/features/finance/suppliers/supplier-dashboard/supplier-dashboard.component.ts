import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../../shared/material/material/material-module';
import { FinanceService } from '../../service/finance.service';
import { SupplierService } from '../../../inventory/service/supplier.service';
import { RouterModule } from '@angular/router';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { LoadingService } from '../../../../core/services/loading.service';

@Component({
  selector: 'app-supplier-dashboard',
  standalone: true,
  imports: [CommonModule, MaterialModule, RouterModule],
  templateUrl: './supplier-dashboard.component.html',
  styleUrl: './supplier-dashboard.component.scss'
})
export class SupplierDashboardComponent implements OnInit {
  private financeService = inject(FinanceService);
  private supplierService = inject(SupplierService);
  private loadingService = inject(LoadingService);

  stats = {
    totalSuppliers: 0,
    totalPayables: 0,
    monthlyPurchases: 0,
    monthlyPayments: 0
  };

  topSuppliers: any[] = [];
  recentPayments: any[] = [];
  isLoading = true;

  ngOnInit() {
    this.loadDashboardData();
  }

  loadDashboardData() {
    this.isLoading = true;
    this.loadingService.setLoading(true);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const filters = {
      startDate: startOfMonth.toISOString(),
      endDate: endOfMonth.toISOString()
    };

    const requests = {
      suppliers: this.supplierService.getSuppliers(),
      payables: this.financeService.getPendingDues(),
      monthlyStats: this.financeService.getProfitAndLossReport(filters),
      recentPayments: this.financeService.getPaymentsReport({
        pageNumber: 1,
        pageSize: 5,
        sortBy: 'PaymentDate',
        sortOrder: 'desc',
        startDate: startOfMonth.toISOString(),
        endDate: endOfMonth.toISOString(),
        searchTerm: ' '
      })
    };

    forkJoin(requests).pipe(
      finalize(() => {
        this.isLoading = false;
        this.loadingService.setLoading(false);
      })
    ).subscribe({
      next: (res: any) => {
        this.stats.totalSuppliers = res.suppliers?.length || 0;
        
        const dues = res.payables || [];
        this.stats.totalPayables = dues.reduce((sum: number, d: any) => sum + (d.pendingAmount || 0), 0);
        this.topSuppliers = [...dues].sort((a, b) => b.pendingAmount - a.pendingAmount).slice(0, 5);

        this.stats.monthlyPurchases = res.monthlyStats?.totalPurchases || 0;
        this.stats.monthlyPayments = res.monthlyStats?.totalExpenses || 0; // Using totalExpenses as proxy for payments in P&L report for now
        
        this.recentPayments = res.recentPayments?.items || [];
      },
      error: (err) => console.error('Dashboard error', err)
    });
  }
}
