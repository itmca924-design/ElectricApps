import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { FinanceService } from '../service/finance.service';
import { InventoryService } from '../../inventory/service/inventory.service';
import { CompanyService } from '../../company/services/company.service';
import { forkJoin, finalize } from 'rxjs';
import { LoadingService } from '../../../core/services/loading.service';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { SummaryStatsComponent, SummaryStat } from '../../../shared/components/summary-stats-component/summary-stats-component';

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MatDialog } from '@angular/material/dialog';
import { BalanceSheetInputDialogComponent } from './balance-sheet-input-dialog.component';

@Component({
    selector: 'app-balance-sheet',
    standalone: true,
    imports: [CommonModule, RouterModule, MaterialModule, BaseChartDirective, SummaryStatsComponent],
    templateUrl: './balance-sheet.component.html',
    styleUrl: './balance-sheet.component.scss'
})
export class BalanceSheetComponent implements OnInit {
    private cdr = inject(ChangeDetectorRef);
    private loadingService = inject(LoadingService);
    private financeService = inject(FinanceService);
    private inventoryService = inject(InventoryService);
    private companyService = inject(CompanyService);
    private dialog = inject(MatDialog);

    isDashboardLoading: boolean = true;
    today: Date = new Date();

    // Assets
    totalReceivables: number = 0;
    inventoryValue: number = 0;
    bankBalance: number = 0; 
    cashInHand: number = 0;

    // Liabilities
    totalPayables: number = 0;
    otherLiabilities: number = 0;

    // Equity/Profit
    netProfit: number = 0;
    capital: number = 0; // Dynamic capital (Initial investment)
    companyName: string = 'ElectricApps';

    // Chart Data
    public assetsChartData: ChartConfiguration['data'] = {
        datasets: [{
            data: [],
            backgroundColor: ['#4caf50', '#2196f3', '#ff9800', '#f44336'],
            hoverOffset: 15
        }],
        labels: ['Inventory', 'Receivables', 'Bank', 'Cash']
    };

    public liabilitiesChartData: ChartConfiguration['data'] = {
        datasets: [{
            data: [],
            backgroundColor: ['#f44336', '#9c27b0', '#673ab7'],
            hoverOffset: 15
        }],
        labels: ['Payables', 'Equity', 'Net Profit']
    };

    public chartOptions: ChartConfiguration['options'] = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom', labels: { padding: 15, usePointStyle: true } }
        }
    };

    ngOnInit() {
        this.capital = Number(localStorage.getItem('company_initial_capital')) || 0;
        this.bankBalance = Number(localStorage.getItem('company_bank_balance')) || 0;
        this.loadBalanceSheet();
        this.companyService.getCompanyProfile().subscribe((p: any) => this.companyName = p?.name || 'ElectricApps');
    }

    loadBalanceSheet() {
        this.isDashboardLoading = true;
        this.loadingService.setLoading(true);
        this.cdr.detectChanges();

        const filters = {
            startDate: '2000-01-01', // Get all time for balance sheet
            endDate: new Date().toISOString()
        };

        forkJoin({
            pl: this.financeService.getProfitAndLossReport(filters),
            receivables: this.financeService.getTotalReceivables(),
            payables: this.financeService.getTotalPayables(),
            stock: this.inventoryService.getCurrentStock('', '', 0, 1000, '') // We'll calculate valuation from this for now
        }).subscribe({
            next: (results) => {
                // 1. Map P&L / Net Profit
                if (results.pl) {
                    const income = results.pl.totalIncome || results.pl.TotalReceipts || 0;
                    const expenses = results.pl.totalExpenses || results.pl.TotalPayments || 0;
                    this.netProfit = income - expenses;
                }

                // 2. Map Assets
                this.totalReceivables = results.receivables?.totalOutstanding || results.receivables?.TotalOutstanding || 0;
                
                // Calculate Inventory Valuation: sum of (quantity * cost rate)
                // Standardizing extraction from different API response formats
                let stockItems = [];
                if (Array.isArray(results.stock)) {
                    stockItems = results.stock;
                } else if (results.stock?.data && Array.isArray(results.stock.data)) {
                    stockItems = results.stock.data;
                } else if (results.stock?.items && Array.isArray(results.stock.items)) {
                    stockItems = results.stock.items;
                } else if (results.stock?.Data && Array.isArray(results.stock.Data)) {
                    stockItems = results.stock.Data;
                }

                this.inventoryValue = stockItems.reduce((sum: number, item: any) => {
                    // Using investigated fields from CurrentStockComponent: availableStock and lastRate
                    const qty = item.availableStock ?? item.currentStock ?? item.totalStock ?? item.Quantity ?? item.qty ?? 0;
                    const rate = item.lastRate ?? item.unitRate ?? item.purchaseRate ?? item.basePurchasePrice ?? item.lastPurchaseRate ?? item.PurchaseRate ?? item.AverageCost ?? item.rate ?? 0;
                    
                    return sum + (Number(qty) * Number(rate));
                }, 0);

                // 3. Map Liabilities
                this.totalPayables = results.payables?.totalPending || results.payables?.TotalPending || 0;

                // 4. SMART CASH & BANK CALCULATION
                // Current Discrepancy Fix: Cash should be (Net Profit + Capital)
                // The implied cash should only be the REMAINING cash after buying stock on credit.
                const equity = (this.capital || 0) + (this.netProfit || 0);
                
                // If we have Payables, it means we have Assets (Stock) we haven't paid for yet.
                // Balancing Equation: Cash + Inventory + Receivables = Equity + Payables
                const totalLiabAndEq = equity + this.totalPayables + (this.otherLiabilities || 0);
                const nonCashAssets = this.inventoryValue + (this.totalReceivables || 0);
                
                const calculatedTotalCash = totalLiabAndEq - nonCashAssets;
                
                // We have a stored bank balance, the rest is physical cash
                if (calculatedTotalCash > 0) {
                    // Safety check: Bank balance cannot exceed total available cash
                    const availableBank = Math.min(this.bankBalance, calculatedTotalCash);
                    this.bankBalance = availableBank;
                    this.cashInHand = calculatedTotalCash - availableBank;
                } else {
                    this.cashInHand = 0;
                    this.bankBalance = 0;
                }

                // Update charts
                this.updateCharts();

                this.isDashboardLoading = false;
                this.loadingService.setLoading(false);
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error('Error loading balance sheet:', err);
                this.isDashboardLoading = false;
                this.loadingService.setLoading(false);
                this.cdr.detectChanges();
            }
        });
    }

    updateCharts() {
        this.assetsChartData.datasets[0].data = [this.inventoryValue, this.totalReceivables, this.bankBalance, this.cashInHand];
        this.liabilitiesChartData.datasets[0].data = [this.totalPayables, this.capital, this.netProfit];
        
        this.assetsChartData = { ...this.assetsChartData };
        this.liabilitiesChartData = { ...this.liabilitiesChartData };
    }

    get totalAssets(): number {
        const total = this.inventoryValue + this.totalReceivables + this.bankBalance + this.cashInHand;
        return Math.round(total * 100) / 100;
    }

    get totalLiabilitiesAndEquity(): number {
        const total = this.totalPayables + this.otherLiabilities + this.capital + this.netProfit;
        return Math.round(total * 100) / 100;
    }

    setInitialCapital() {
        const dialogRef = this.dialog.open(BalanceSheetInputDialogComponent, {
            width: '400px',
            data: {
                title: 'Proprietor Capital',
                message: 'Update the initial investment made by the proprietor.',
                label: 'Capital Amount',
                amount: this.capital
            }
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result !== undefined) {
                this.capital = Number(result);
                localStorage.setItem('company_initial_capital', this.capital.toString());
                this.loadBalanceSheet();
            }
        });
    }

    setBankBalance() {
        const equity = (this.capital || 0) + (this.netProfit || 0);
        const totalLiabAndEq = equity + this.totalPayables + (this.otherLiabilities || 0);
        const nonCashAssets = this.inventoryValue + (this.totalReceivables || 0);
        const totalAvailable = Math.round((totalLiabAndEq - nonCashAssets) * 100) / 100;

        const dialogRef = this.dialog.open(BalanceSheetInputDialogComponent, {
            width: '400px',
            data: {
                title: 'Bank Balance',
                message: `Set how much cash to keep in the Bank.`,
                label: 'Bank Amount',
                amount: this.bankBalance,
                max: totalAvailable
            }
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result !== undefined) {
                this.bankBalance = Number(result);
                localStorage.setItem('company_bank_balance', this.bankBalance.toString());
                this.loadBalanceSheet();
            }
        });
    }

    get summaryStats(): any[] {
        return [
            { label: 'Total Assets', value: this.totalAssets, icon: 'account_balance', type: 'success' },
            { label: 'Total Liab. & Eq.', value: this.totalLiabilitiesAndEquity, icon: 'account_balance_wallet', type: 'warning' },
            { label: 'Net Profit', value: Math.round(this.netProfit * 100) / 100, icon: 'trending_up', type: this.netProfit >= 0 ? 'success' : 'overdue' },
            { label: 'Bank', value: Math.round(this.bankBalance * 100) / 100, icon: 'account_balance', type: 'info' },
            { label: 'Cash', value: Math.round(this.cashInHand * 100) / 100, icon: 'payments', type: 'warning' }
        ];
    }

    exportToPDF() {
        const doc = new jsPDF();
        const dateStr = this.today.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        
        doc.setFontSize(22);
        doc.setTextColor(30, 41, 59); 
        doc.text('Balance Sheet', 14, 22);
        
        doc.setFontSize(11);
        doc.setTextColor(100, 116, 139);
        doc.text(`${this.companyName} Finance Report | As of: ${dateStr}`, 14, 30);
        
        autoTable(doc, {
            startY: 40,
            head: [['ASSETS', 'Amount (Rs.)']],
            body: [
                ['Closing Stock (Inventory)', this.inventoryValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })],
                ['Customer Receivables', this.totalReceivables.toLocaleString('en-IN', { minimumFractionDigits: 2 })],
                ['Bank Balance', this.bankBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })],
                ['Cash In Hand', this.cashInHand.toLocaleString('en-IN', { minimumFractionDigits: 2 })],
                [{ content: 'TOTAL ASSETS', styles: { fontStyle: 'bold', fillColor: [240, 253, 244] } }, 
                 { content: this.totalAssets.toLocaleString('en-IN', { minimumFractionDigits: 2 }), styles: { fontStyle: 'bold', fillColor: [240, 253, 244] } }]
            ],
            theme: 'grid',
            headStyles: { fillColor: [16, 185, 129] },
            columnStyles: { 1: { halign: 'right' } }
        });

        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 10,
            head: [['LIABILITIES & EQUITY', 'Amount (Rs.)']],
            body: [
                ['Supplier Payables', this.totalPayables.toLocaleString('en-IN', { minimumFractionDigits: 2 })],
                ['Proprietor Capital', this.capital.toLocaleString('en-IN', { minimumFractionDigits: 2 })],
                ['Net Profit / Loss', this.netProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })],
                [{ content: 'TOTAL LIABILITIES & EQUITY', styles: { fontStyle: 'bold', fillColor: [255, 251, 235] } }, 
                 { content: this.totalLiabilitiesAndEquity.toLocaleString('en-IN', { minimumFractionDigits: 2 }), styles: { fontStyle: 'bold', fillColor: [255, 251, 235] } }]
            ],
            theme: 'grid',
            headStyles: { fillColor: [245, 158, 11] },
            columnStyles: { 1: { halign: 'right' } }
        });

        const finalY = (doc as any).lastAutoTable.finalY + 15;
        const isBalanced = Math.abs(this.totalAssets - this.totalLiabilitiesAndEquity) < 1;
        doc.setFontSize(14);
        doc.setTextColor(isBalanced ? 16 : 239, isBalanced ? 185 : 68, isBalanced ? 129 : 68);
        doc.text(isBalanced ? 'Status: Sheet is Balanced' : `Status: Unbalanced (Diff: Rs. ${Math.abs(this.totalAssets - this.totalLiabilitiesAndEquity).toLocaleString()})`, 14, finalY);

        doc.save(`Balance_Sheet_${dateStr.replace(/ /g, '_')}.pdf`);
    }

    shareOnWhatsApp() {
        const dateStr = this.today.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        const isBalanced = Math.abs(this.totalAssets - this.totalLiabilitiesAndEquity) < 1;
        
        const message = `*Balance Sheet Summary (${dateStr})*
----------------------------
💰 *Total Assets:* ₹${this.totalAssets.toLocaleString('en-IN')}
📉 *Total Liab. & Eq.:* ₹${this.totalLiabilitiesAndEquity.toLocaleString('en-IN')}
📈 *Net Profit:* ₹${this.netProfit.toLocaleString('en-IN')}
----------------------------
🏦 *Bank:* ₹${this.bankBalance.toLocaleString('en-IN')}
💵 *Cash:* ₹${this.cashInHand.toLocaleString('en-IN')}
----------------------------
✅ *Status:* ${isBalanced ? 'Balanced' : 'Unbalanced'}

Generated via ${this.companyName}`;

        const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    }
}
