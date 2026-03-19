import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { FinanceService } from '../service/finance.service';
import { forkJoin, finalize } from 'rxjs';
import { LoadingService } from '../../../core/services/loading.service';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { SummaryStatsComponent, SummaryStat } from '../../../shared/components/summary-stats-component/summary-stats-component';

@Component({
    selector: 'app-expense-analysis',
    standalone: true,
    imports: [CommonModule, RouterModule, MaterialModule, BaseChartDirective, SummaryStatsComponent],
    templateUrl: './expense-analysis.component.html',
    styleUrl: './expense-analysis.component.scss'
})
export class ExpenseAnalysisComponent implements OnInit {
    private cdr = inject(ChangeDetectorRef);
    private loadingService = inject(LoadingService);
    private financeService = inject(FinanceService);

    totalExpense: number = 0;
    lastMonthExpense: number = 0;
    highestCategory: string = 'None';
    highestCategoryAmount: number = 0;
    totalEntries: number = 0;
    isDashboardLoading: boolean = true;

    // Chart Data: Category Breakdown (Donut)
    public donutChartData: ChartConfiguration<'doughnut'>['data'] = {
        datasets: [{
            data: [],
            backgroundColor: [
                '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
                '#f97316', '#eab308', '#84cc16', '#22c55e', '#10b981', '#06b6d4'
            ],
            hoverOffset: 20,
            borderWidth: 2,
            borderColor: '#ffffff'
        }],
        labels: []
    };

    // Chart Data: Monthly Trends (Area Chart)
    public trendChartData: ChartConfiguration<'line'>['data'] = {
        datasets: [
            {
                data: [],
                label: 'Monthly Expenses',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                borderColor: '#6366f1',
                pointBackgroundColor: '#6366f1',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: '#6366f1',
                fill: 'origin',
                tension: 0.4
            }
        ],
        labels: []
    };

    public donutChartOptions: ChartConfiguration<'doughnut'>['options'] = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    padding: 20,
                    usePointStyle: true,
                    font: { size: 12, family: "'Inter', sans-serif" }
                }
            },
            tooltip: {
                backgroundColor: '#1e293b',
                padding: 12,
                titleFont: { size: 14 },
                bodyFont: { size: 13 },
                displayColors: true
            }
        },
        cutout: '70%'
    };

    public trendChartOptions: ChartConfiguration<'line'>['options'] = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: '#1e293b',
                padding: 12,
                callbacks: {
                    label: (context) => `₹${(context.parsed.y || 0).toLocaleString('en-IN')}`
                }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                grid: { color: 'rgba(0, 0, 0, 0.05)' },
                ticks: {
                    callback: (value) => `₹${Number(value).toLocaleString('en-IN')}`,
                    font: { size: 11 }
                }
            },
            x: {
                grid: { display: false },
                ticks: { font: { size: 11 } }
            }
        }
    };

    topExpenses: any[] = [];
    
    filters = {
        startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
        endDate: new Date().toISOString()
    };

    ngOnInit() {
        this.loadAnalysis();
    }

    loadAnalysis() {
        this.isDashboardLoading = true;
        this.loadingService.setLoading(true);
        this.cdr.detectChanges();

        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        
        // Month-on-Month comparison logic
        const lastMonthStart = new Date(currentYear, currentMonth - 1, 1).toISOString();
        const lastMonthEnd = new Date(currentYear, currentMonth, 0).toISOString();

        forkJoin({
            currentExpenses: this.financeService.getExpenseChartData(this.filters),
            lastMonthExpenses: this.financeService.getExpenseChartData({ startDate: lastMonthStart, endDate: lastMonthEnd }),
            currentPurchases: this.financeService.getPurchaseOrders(this.filters),
            lastMonthPurchases: this.financeService.getPurchaseOrders({ startDate: lastMonthStart, endDate: lastMonthEnd }),
            trends: this.financeService.getMonthlyTrends(12),
            recentEntries: this.financeService.getExpenseEntries(1, 10)
        }).subscribe({
            next: (results) => {
                let currentExpenseSum = 0;
                let lastExpenseSum = 0;

                // 1. Process Category Breakdown (Donut)
                if (results.currentExpenses && Array.isArray(results.currentExpenses)) {
                    const sorted = [...results.currentExpenses].sort((a, b) => (b.amount || 0) - (a.amount || 0));
                    currentExpenseSum = sorted.reduce((sum, x) => sum + (x.amount || 0), 0);
                    
                    const labels = sorted.map(x => x.category || x.Category);
                    const data = sorted.map(x => x.amount || x.Amount);

                    // Add POs as a category if available
                    const poItems = results.currentPurchases?.data || results.currentPurchases?.items || [];
                    const poTotal = poItems.reduce((sum: number, p: any) => sum + (p.grandTotal || p.GrandTotal || 0), 0);
                    
                    if (poTotal > 0) {
                        labels.push('Purchases (PO)');
                        data.push(poTotal);
                        currentExpenseSum += poTotal;
                    }

                    this.totalExpense = currentExpenseSum;
                    
                    // Re-sort everything for the chart labels
                    const combined = labels.map((l, i) => ({ label: l, value: data[i] }))
                                         .sort((a, b) => b.value - a.value);

                    this.donutChartData.labels = combined.map(x => x.label);
                    this.donutChartData.datasets[0].data = combined.map(x => x.value);
                    this.donutChartData = { ...this.donutChartData };

                    if (combined.length > 0) {
                        this.highestCategory = combined[0].label;
                        this.highestCategoryAmount = combined[0].value;
                    }
                }

                // 2. Process Last Month
                if (results.lastMonthExpenses && Array.isArray(results.lastMonthExpenses)) {
                    lastExpenseSum = results.lastMonthExpenses.reduce((sum, x) => sum + (x.amount || x.Amount || 0), 0);
                }
                
                const lastPoItems = results.lastMonthPurchases?.data || results.lastMonthPurchases?.items || [];
                const lastPoTotal = lastPoItems.reduce((sum: number, p: any) => sum + (p.grandTotal || p.GrandTotal || 0), 0);
                this.lastMonthExpense = lastExpenseSum + lastPoTotal;

                // 3. Process Trends
                if (results.trends) {
                    const expensesArr = results.trends.expenses || results.trends.Expenses || [];
                    
                    // Get last 12 months labels
                    const monthsLabels: string[] = [];
                    for (let i = 11; i >= 0; i--) {
                        const d = new Date();
                        d.setMonth(d.getMonth() - i);
                        monthsLabels.push(d.toLocaleString('default', { month: 'short', year: 'numeric' }));
                    }

                    this.trendChartData.labels = monthsLabels;
                    this.trendChartData.datasets[0].data = monthsLabels.map(m => {
                        const row = expensesArr.find((e: any) => (e.month || e.Month) === m);
                        return row ? (row.amount || row.Amount || 0) : 0;
                    });
                    this.trendChartData = { ...this.trendChartData };
                }

                // 4. Recent Entries
                if (results.recentEntries) {
                    const data = results.recentEntries.items || results.recentEntries.Items || results.recentEntries.data || [];
                    this.topExpenses = Array.isArray(data) ? data : (data.items || []);
                    this.totalEntries = results.recentEntries.totalCount || results.recentEntries.TotalCount || this.topExpenses.length;
                }

                this.isDashboardLoading = false;
                this.loadingService.setLoading(false);
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error('Error loading expense analysis:', err);
                this.isDashboardLoading = false;
                this.loadingService.setLoading(false);
                this.cdr.detectChanges();
            }
        });
    }

    get expenseDiff(): number {
        if (this.lastMonthExpense === 0) return 100; // If first activity, show 100% growth
        return ((this.totalExpense - this.lastMonthExpense) / this.lastMonthExpense) * 100;
    }

    get summaryStats(): SummaryStat[] {
        const diff = this.expenseDiff;
        return [
            { 
                label: 'Total Expenses', 
                value: '₹' + this.totalExpense.toLocaleString('en-IN', { minimumFractionDigits: 2 }), 
                icon: 'payments', 
                type: 'warning', 
                badge: 'This Month' 
            },
            { 
                label: 'vs Last Month', 
                value: (diff > 0 ? '+' : '') + diff.toFixed(1) + '%', 
                icon: diff > 0 ? 'trending_up' : 'trending_down', 
                type: diff > 0 ? 'overdue' : 'success', 
                badge: 'Growth' 
            },
            { 
                label: 'Top Category', 
                value: this.highestCategory, 
                icon: 'category', 
                type: 'active', 
                badge: '₹' + this.highestCategoryAmount.toLocaleString('en-IN') 
            },
            { 
                label: 'Total Entries', 
                value: this.totalEntries.toString(), 
                icon: 'list_alt', 
                type: 'success', 
                badge: 'Total Volume' 
            }
        ];
    }
}
