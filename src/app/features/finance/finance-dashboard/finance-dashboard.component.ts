
import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { Router, RouterModule } from '@angular/router';
import { FinanceService } from '../service/finance.service';
import { LoadingService } from '../../../core/services/loading.service';
import { forkJoin, finalize } from 'rxjs';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartType } from 'chart.js';

@Component({
  selector: 'app-finance-dashboard',
  standalone: true,
  imports: [CommonModule, MaterialModule, RouterModule, BaseChartDirective],
  templateUrl: './finance-dashboard.component.html',
  styleUrl: './finance-dashboard.component.scss'
})
export class FinanceDashboardComponent implements OnInit {
  private financeService = inject(FinanceService);
  private loadingService = inject(LoadingService);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);

  isLoading = true;
  today = new Date();
  
  // Stats
  totalReceivables = 0;
  totalPayables = 0;
  monthlyRevenue = 0;
  monthlyExpenses = 0;
  netCashFlow = 0;

  // Chart: Cash Flow (Line)
  public lineChartData: ChartConfiguration['data'] = {
    datasets: [
      {
        data: [],
        label: 'Inflow (Receipts)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderColor: '#10b981',
        pointBackgroundColor: '#10b981',
        pointBorderColor: '#fff',
        fill: 'origin',
        tension: 0.4
      },
      {
        data: [],
        label: 'Outflow (Payments)',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderColor: '#ef4444',
        pointBackgroundColor: '#ef4444',
        pointBorderColor: '#fff',
        fill: 'origin',
        tension: 0.4
      }
    ],
    labels: []
  };

  public lineChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { grid: { color: '#f1f5f9' }, ticks: { font: { family: 'Outfit' } } },
      x: { grid: { display: false }, ticks: { font: { family: 'Outfit' } } }
    },
    plugins: {
      legend: { display: true, position: 'top', labels: { usePointStyle: true, font: { family: 'Outfit' } } },
      tooltip: { padding: 12, backgroundColor: 'rgba(30, 41, 59, 0.9)', titleFont: { family: 'Outfit' }, bodyFont: { family: 'Outfit' } }
    }
  };

  // Chart: Expense Breakdown (Doughnut)
  public doughnutChartData: ChartConfiguration['data'] = {
    datasets: [{
      data: [],
      backgroundColor: ['#6366f1', '#8b5cf6', '#d946ef', '#f43f5e', '#f97316'],
      hoverOffset: 15,
      borderWidth: 0
    }],
    labels: []
  };

  public doughnutChartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '75%',
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20, font: { family: 'Outfit', size: 12 } } }
    }
  };

  recentTransactions: any[] = [];

  ngOnInit(): void {
    this.loadDashboardData();
  }

  loadDashboardData(): void {
    this.isLoading = true;
    this.loadingService.setLoading(true);

    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endDate = now.toISOString();

    forkJoin({
      receivables: this.financeService.getTotalReceivables(),
      payables: this.financeService.getTotalPayables(),
      plReport: this.financeService.getProfitAndLossReport({ startDate, endDate }),
      trends: this.financeService.getMonthlyTrends(6),
      recentReceipts: this.financeService.getReceiptsReport({ startDate, endDate, pageNumber: 1, pageSize: 5, sortBy: 'ReceiptDate', sortOrder: 'desc', searchTerm: '' }),
      recentPayments: this.financeService.getPaymentsReport({ startDate, endDate, pageNumber: 1, pageSize: 5, sortBy: 'PaymentDate', sortOrder: 'desc', searchTerm: '' }),
      purchaseData: this.financeService.getProfitAndLossReport({ startDate, endDate }) // We reuse P&L logic or call it here
    }).pipe(
      finalize(() => {
        this.isLoading = false;
        this.loadingService.setLoading(false);
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (res: any) => {
        // Stats - Handling both camelCase and PascalCase
        this.totalReceivables = res.receivables?.totalReceivable || res.receivables?.TotalReceivable || 
                               res.receivables?.totalReceivables || res.receivables?.TotalReceivables || 
                               res.receivables?.totalOutstanding || res.receivables?.TotalOutstanding ||
                               (typeof res.receivables === 'number' ? res.receivables : 0);

        this.totalPayables = res.payables?.totalPayable || res.payables?.TotalPayable || 
                            res.payables?.totalPayables || res.payables?.TotalPayables || 
                            res.payables?.totalPending || res.payables?.TotalPending ||
                             (typeof res.payables === 'number' ? res.payables : 0);

        this.monthlyRevenue = res.plReport?.totalIncome || res.plReport?.TotalIncome || 0;
        this.monthlyExpenses = res.plReport?.totalExpenses || res.plReport?.TotalExpenses || 0;
        this.netCashFlow = this.monthlyRevenue - this.monthlyExpenses;

        // Trends Line Chart
        if (res.trends) {
            const months = this.getLastMonths(6);
            this.lineChartData.labels = months;
            
            this.lineChartData.datasets[0].data = months.map(m => {
                const match = (res.trends.receipts || []).find((r: any) => 
                    (r.month || r.Month || '').toLowerCase() === m.toLowerCase()
                );
                return match ? (match.amount || match.Amount || 0) : 0;
            });

            this.lineChartData.datasets[1].data = months.map(m => {
                const pMatch = (res.trends.payments || []).find((p: any) => 
                    (p.month || p.Month || '').toLowerCase() === m.toLowerCase()
                );
                const eMatch = (res.trends.expenses || []).find((e: any) => 
                    (e.month || e.Month || '').toLowerCase() === m.toLowerCase()
                );
                const pAmount = pMatch ? (pMatch.amount || pMatch.Amount || 0) : 0;
                const eAmount = eMatch ? (eMatch.amount || eMatch.Amount || 0) : 0;
                return pAmount + eAmount;
            });
            this.lineChartData = { ...this.lineChartData };
        }

        // Recent Transactions
        const getItems = (r: any) => r?.items?.items || r?.items || r?.data || r?.Items || r?.Data || [];
        
        const receipts = getItems(res.recentReceipts).map((x: any) => ({ 
            ...x, 
            type: 'Inflow', 
            color: 'success',
            customerName: x.customerName || x.CustomerName,
            referenceNumber: x.referenceNumber || x.ReferenceNumber,
            date: x.receiptDate || x.ReceiptDate || x.date || x.Date,
            amount: x.amount || x.Amount,
            paymentMode: x.receiptMode || x.ReceiptMode
        }));

        const payments = getItems(res.recentPayments).map((x: any) => ({ 
            ...x, 
            type: 'Outflow', 
            color: 'danger',
            supplierName: x.supplierName || x.SupplierName,
            referenceNumber: x.referenceNumber || x.ReferenceNumber,
            date: x.paymentDate || x.PaymentDate || x.date || x.Date,
            amount: x.amount || x.Amount,
            paymentMode: x.paymentMode || x.PaymentMode
        }));
        
        this.recentTransactions = [...receipts, ...payments]
            .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
            .slice(0, 8);
      },
      error: (err) => console.error('Finance Dashboard Error', err)
    });
  }

  private getLastMonths(count: number): string[] {
    const months = [];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    for (let i = count - 1; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        // Manually format to "MMM YYYY" to be locale-independent and match backend
        const monthLabel = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
        months.push(monthLabel);
    }
    return months;
  }

  navigate(url: string): void {
    this.router.navigate([url]);
  }
}
