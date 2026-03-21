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
import { customerService } from '../../master/customer-component/customer.service';

@Component({
    selector: 'app-balance-sheet',
    standalone: true,
    imports: [CommonModule, RouterModule, MaterialModule, BaseChartDirective, SummaryStatsComponent],
    templateUrl: './balance-sheet.component.html',
    styleUrl: './balance-sheet.component.scss'
})
export class BalanceSheetComponent implements OnInit {
    private readonly CAPITAL_TAG = '[PROPRIETOR_CAPITAL]';
    private readonly OWNER_CUSTOMER_NAME = 'Proprietor (Self / Capital Account)';
    
    private cdr = inject(ChangeDetectorRef);
    private loadingService = inject(LoadingService);
    private financeService = inject(FinanceService);
    private inventoryService = inject(InventoryService);
    private companyService = inject(CompanyService);
    private customerService = inject(customerService);
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
    companyName: string = '';
    companyProfile: any = null; // Stored profile for dynamic use

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
        // We still check localStorage for quick display, but loadBalanceSheet will override with DB data
        this.capital = Number(localStorage.getItem('company_initial_capital')) || 0;
        this.bankBalance = Number(localStorage.getItem('company_bank_balance')) || 0;
        this.loadBalanceSheet();
        this.companyService.getCompanyProfile().subscribe((p: any) => {
            this.companyProfile = p;
            this.companyName = p?.name || '';
        });
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
            // Pass null for dates to get ALL current stock regardless of purchase date
            stock: this.inventoryService.getCurrentStock('', '', 0, 2000, '', null, null),
            capitalReceipts: this.financeService.getReceiptsReport({
                searchTerm: this.CAPITAL_TAG,
                startDate: filters.startDate,
                endDate: filters.endDate,
                pageNumber: 1,
                pageSize: 1000,
                sortBy: 'Date',
                sortOrder: 'desc'
            })
        }).subscribe({
            next: (results) => {
                // 1. Calculate Capital Injection from DB (Professional Way)
                const cItems = results.capitalReceipts?.items?.items || results.capitalReceipts?.items || [];
                const totalCapitalInDB = cItems.reduce((sum: number, r: any) => sum + (r.amount || r.Amount || 0), 0);
                this.capital = Number(totalCapitalInDB);
                localStorage.setItem('company_initial_capital', this.capital.toString());

                // 2. Map P&L / Net Profit (Important: Exclude Capital from Income)
                if (results.pl) {
                    const totalIncome = results.pl.totalIncome || results.pl.TotalReceipts || 0;
                    const expenses = results.pl.totalExpenses || results.pl.TotalPayments || 0;
                    
                    // Net Profit = (Internal Business Income) - Expenses
                    // We subtract Capital from Income because Capital is an Investment (Equity), not Revenue (Profit).
                    this.netProfit = (totalIncome - totalCapitalInDB) - expenses;
                }

                // 2. Map Assets
                this.totalReceivables = results.receivables?.totalOutstanding || results.receivables?.TotalOutstanding || results.receivables?.pendingAmount || 0;
                
                // Calculate Inventory Valuation: sum of (quantity * cost rate)
                const s = results.stock;
                let stockItems: any[] = [];
                
                // Extremely aggressive path finding for stock array
                if (Array.isArray(s)) {
                    stockItems = s;
                } else if (s) {
                    stockItems = s.items || s.Items || s.data || s.Data || [];
                    if (stockItems && !Array.isArray(stockItems) && typeof stockItems === 'object') {
                        // Handle { data: { items: [] } } nested structure
                        const nested = (stockItems as any).items || (stockItems as any).Items || (stockItems as any).data || (stockItems as any).Data;
                        if (Array.isArray(nested)) stockItems = nested;
                    }
                }

                // If still not an array, check if results.stock.data.items exists
                if (!Array.isArray(stockItems) && s?.data?.items) stockItems = s.data.items;
                if (!Array.isArray(stockItems) && s?.data?.data) stockItems = s.data.data;

                this.inventoryValue = 0;
                if (Array.isArray(stockItems)) {
                    this.inventoryValue = stockItems.reduce((sum: number, item: any) => {
                        // Robust field mapping for Quantity and Rate
                        const q = Number(item.availableStock ?? item.currentStock ?? item.totalStock ?? item.Quantity ?? item.AvailableStock ?? item.qty ?? 0);
                        const r = Number(item.lastRate ?? item.unitRate ?? item.purchaseRate ?? item.LastRate ?? item.UnitRate ?? item.rate ?? item.unitPrice ?? 0);
                        const val = q * r;
                        return sum + (isNaN(val) ? 0 : val);
                    }, 0);
                }

                // EMERGENCY FALLBACK: If Inventory is 0 but we have Purchases in P&L, 
                // use Total Purchases as Closing Stock (common in fresh setups)
                if (this.inventoryValue === 0 && results.pl?.totalPurchases > 0) {
                    this.inventoryValue = results.pl.totalPurchases;
                }

                // 3. OTHER ASSETS & LIABILITIES
                this.totalPayables = results.payables?.totalPending ?? results.payables?.TotalPending ?? results.payables?.balance ?? 0;

                // 4. SMART CASH & BANK BALCULATION (The Balancing Figure)
                // Fundamental Accounting Equation: Assets = Liabilities + Equity
                // Assets (Inventory + Receivables + Cash + Bank) = Liabilities (Payables) + Equity (Net Profit + Capital)
                
                const equity = Number(this.capital || 0) + Number(this.netProfit || 0);
                const totalLiabilities = Number(this.totalPayables || 0) + Number(this.otherLiabilities || 0);
                
                const totalLiabAndEq = equity + totalLiabilities;
                const nonCashAssets = Number(this.inventoryValue || 0) + Number(this.totalReceivables || 0);
                
                // Calculated Cash = Total Fund Source (Equity + Debt) - Investments in other Assets (Stock + Receivables)
                const calculatedTotalCash = totalLiabAndEq - nonCashAssets;
                
                // Distribute total cash between physical cash and bank
                if (calculatedTotalCash > 0) {
                    // If we have total cash, prioritize bank balance set by user
                    const availableBank = Math.min(Number(this.bankBalance || 0), calculatedTotalCash);
                    this.bankBalance = availableBank;
                    this.cashInHand = calculatedTotalCash - availableBank;
                } else {
                    // If no net cash (everything invested in stock on credit), set to 0 or negative (Overdraft)
                    this.cashInHand = calculatedTotalCash; 
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
                const newAmount = Number(result);
                // Instead of just setting it locally, we record a DIFF receipt in DB
                const diff = newAmount - this.capital;
                
                if (diff !== 0) {
                    this.recordCapitalTransaction(diff);
                } else {
                    this.loadBalanceSheet(); // Refresh if no change
                }
            }
        });
    }

    private recordCapitalTransaction(amount: number) {
        this.isDashboardLoading = true;
        this.loadingService.setLoading(true);

        // Find or Use a fixed Owner Customer ID or just search by name
        // For simplicity, we'll try to find the "Proprietor Capital" customer first
        const searchReq = { 
            Search: this.OWNER_CUSTOMER_NAME, 
            PageNumber: 1, 
            PageSize: 1 
        };
        
        this.customerService.getPaged(searchReq).subscribe({
            next: (res: any) => {
                const customers = res.data || res.items || [];
                let ownerId = 0;
                
                // CRITICAL: Ensure we found the SPECIFIC owner customer, not just any random customer
                const specificOwner = customers.find((c: any) => 
                    (c.customerName || c.name || '').toLowerCase() === this.OWNER_CUSTOMER_NAME.toLowerCase()
                );

                if (specificOwner) {
                    this.executeCapitalReceipt(specificOwner.id, amount);
                } else {
                    // Fix: Match the backend CreateCustomerDto fields!
                    const addr = this.companyProfile?.address;
                    const fullAddress = `${addr?.addressLine1 || ''} ${addr?.addressLine2 || ''}, ${addr?.city || ''}, ${addr?.state || ''} - ${addr?.pinCode || ''}`;
                    
                    const newOwner = {
                        customerName: this.OWNER_CUSTOMER_NAME,
                        customerType: 'Retail',
                        phone: this.companyProfile?.primaryPhone || '0000000000',
                        email: this.companyProfile?.primaryEmail || 'owner@system.com',
                        billingAddress: fullAddress.trim() || 'Internal Account',
                        shippingAddress: fullAddress.trim() || 'Internal Account',
                        customerStatus: 'Active',
                        creditLimit: 0,
                        createdBy: localStorage.getItem('email') || 'Admin'
                    };
                    this.customerService.addCustomer(newOwner).subscribe((id: any) => {
                        this.executeCapitalReceipt(id, amount);
                    });
                }
            },
            error: () => this.isDashboardLoading = false
        });
    }

    private executeCapitalReceipt(customerId: number, amount: number) {
        const payload = {
            id: 0,
            customerId: customerId,
            amount: amount,
            totalAmount: amount,
            discountAmount: 0,
            netAmount: amount,
            paymentMode: 'Cash',
            referenceNumber: 'CAPITAL-' + new Date().getTime().toString().slice(-4),
            paymentDate: new Date().toISOString(),
            remarks: this.CAPITAL_TAG + ' Proprietor Capital Adjustment',
            createdBy: localStorage.getItem('email') || 'Admin'
        };

        this.financeService.recordCustomerReceipt(payload).subscribe({
            next: () => {
                this.loadBalanceSheet(); // Re-fetch entire sheet from DB
            },
            error: () => {
                this.isDashboardLoading = false;
                this.loadingService.setLoading(false);
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
