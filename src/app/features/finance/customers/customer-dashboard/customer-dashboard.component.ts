import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../../shared/material/material/material-module';
import { FinanceService } from '../../service/finance.service';
import { RouterModule } from '@angular/router';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { LoadingService } from '../../../../core/services/loading.service';

@Component({
  selector: 'app-customer-dashboard',
  standalone: true,
  imports: [CommonModule, MaterialModule, RouterModule],
  templateUrl: './customer-dashboard.component.html',
  styleUrl: './customer-dashboard.component.scss'
})
export class CustomerDashboardComponent implements OnInit {
  private financeService = inject(FinanceService);
  private loadingService = inject(LoadingService);

  stats = {
    totalReceivables: 0,
    monthlySales: 0,
    monthlyReceipts: 0,
    pendingCustomersCount: 0
  };

  topReceivables: any[] = [];
  recentReceipts: any[] = [];
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
      receivables: this.financeService.getPendingCustomerDues(),
      monthlyStats: this.financeService.getProfitAndLossReport(filters),
      recentReceipts: this.financeService.getReceiptsReport({
        pageNumber: 1,
        pageSize: 5,
        sortBy: 'Date',
        sortOrder: 'desc',
        startDate: startOfMonth.toISOString(),
        endDate: endOfMonth.toISOString()
      }),
      totalReceivables: this.financeService.getTotalReceivables()
    };

    forkJoin(requests).pipe(
      finalize(() => {
        this.isLoading = false;
        this.loadingService.setLoading(false);
      })
    ).subscribe({
      next: (res: any) => {
        // Handle Pending Dues
        const dues = res.receivables || [];
        this.stats.pendingCustomersCount = dues.length;
        this.topReceivables = [...dues]
          .filter(d => d.pendingAmount > 0)
          .sort((a, b) => (b.pendingAmount || 0) - (a.pendingAmount || 0))
          .slice(0, 5);

        // Robust mapping for totalReceivables to avoid passing objects to the number pipe
        const totalRec = res.totalReceivables?.totalAmount !== undefined 
          ? res.totalReceivables.totalAmount 
          : res.totalReceivables;
        this.stats.totalReceivables = Number(totalRec) || 0;

        // Map Monthly Stats
        this.stats.monthlySales = Number(res.monthlyStats?.totalSales) || 0;
        this.stats.monthlyReceipts = Number(res.monthlyStats?.totalIncome) || 0;
        
        // Map Recent Receipts
        this.recentReceipts = (res.recentReceipts?.items || []).map((r: any) => ({
          ...r,
          amount: Number(r.amount) || 0
        }));
      },
      error: (err) => console.error('Customer dashboard error', err)
    });
  }
}
