import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { CompanyService } from '../../company/services/company.service';
import { FinanceService } from '../service/finance.service';
import { InventoryService } from '../../inventory/service/inventory.service';
import { forkJoin, map, Observable, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { LoadingService } from '../../../core/services/loading.service';
import { SummaryStatsComponent } from '../../../shared/components/summary-stats-component/summary-stats-component';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { StatusDialogComponent } from '../../../shared/components/status-dialog-component/status-dialog-component';

export interface CompanyFinancialSummary {
    companyId: number;
    companyName: string;
    totalAssets: number;
    totalLiabilities: number;
    netProfit: number;
    inventoryValue: number;
    receivables: number;
    payables: number;
    taxPayable: number;
    isBalanced: boolean;
}

@Component({
    selector: 'app-consolidated-balance-sheet',
    standalone: true,
    imports: [
        CommonModule, MaterialModule, SummaryStatsComponent, 
        MatDatepickerModule, MatFormFieldModule, MatInputModule, 
        FormsModule, MatDialogModule
    ],
    templateUrl: './consolidated-balance-sheet.component.html',
    styleUrl: './consolidated-balance-sheet.component.scss'
})
export class ConsolidatedBalanceSheetComponent implements OnInit {
    private companyService = inject(CompanyService);
    private financeService = inject(FinanceService);
    private inventoryService = inject(InventoryService);
    private loadingService = inject(LoadingService);
    private cdr = inject(ChangeDetectorRef);
    private router = inject(Router);
    private dialog = inject(MatDialog);

    companySummaries: CompanyFinancialSummary[] = [];
    isLoading = false;
    
    startDate: Date;
    endDate: Date = new Date();

    constructor() {
        // Indian Financial Year: Starts April 1st.
        const today = new Date();
        const currentYear = today.getFullYear();
        const startYear = today.getMonth() < 3 ? currentYear - 1 : currentYear;
        this.startDate = new Date(startYear, 3, 1);
    }

    totalGroupAssets = 0;
    totalGroupLiabilities = 0;
    totalGroupProfit = 0;
    totalGroupTaxPayable = 0;
    totalGroupITC = 0;
    interCompanyBalances: any[] = [];
    companyName = 'ElectricApps';

    displayedColumns: string[] = ['companyName', 'inventoryValue', 'receivables', 'payables', 'netProfit', 'totalAssets', 'actions'];

    ngOnInit() {
        this.loadConsolidatedData();
        this.companyService.getCompanyProfile().subscribe(p => this.companyName = p?.name || 'ElectricApps');
    }

    loadConsolidatedData() {
        this.isLoading = true;
        this.loadingService.setLoading(true);

        this.companyService.getPaged({ pageNumber: 1, pageSize: 50 }).subscribe({
            next: (res: any) => {
                const companies = res?.items || [];
                if (companies.length === 0) {
                    this.isLoading = false;
                    this.loadingService.setLoading(false);
                    return;
                }

                this.companySummaries = companies.map((c: any) => ({
                    companyId: c.id,
                    companyName: c.name,
                    totalAssets: 0,
                    totalLiabilities: 0,
                    netProfit: 0,
                    inventoryValue: 0,
                    receivables: 0,
                    payables: 0,
                    taxPayable: 0,
                    isBalanced: true
                }));

                this.interCompanyBalances = [];
                // Fetch financials for all companies
                const financialRequests = companies.map((c: any) => this.fetchFinancialsForCompany(c));
                
                forkJoin(financialRequests).subscribe({
                    next: () => {
                        this.calculateGroupTotals();
                        this.isLoading = false;
                        this.loadingService.setLoading(false);
                        this.cdr.detectChanges();
                    },
                    error: () => {
                        this.isLoading = false;
                        this.loadingService.setLoading(false);
                    }
                });

                this.interCompanyBalances = [];
                this.totalGroupTaxPayable = 0;
            },
            error: () => {
                this.isLoading = false;
                this.loadingService.setLoading(false);
            }
        });
    }

    fetchFinancialsForCompany(company: any): Observable<any> {
        const filters = { 
            startDate: this.startDate.toISOString(), 
            endDate: this.endDate.toISOString() 
        };

        return forkJoin({
            pl: this.financeService.getProfitAndLossReport(filters),
            receivables: this.financeService.getOutstandingTracker({ pageNumber: 1, pageSize: 100, sortBy: 'PendingAmount', sortOrder: 'desc' }),
            payables: this.financeService.getTotalPayables(),
            stock: this.inventoryService.getCurrentStock('', '', 0, 1000, ''),
            sales: this.inventoryService.getQuickPagedSales(1, 1000, 'Date', 'desc', '', this.startDate, this.endDate),
            purchases: this.inventoryService.getPagedOrders({ ...filters, pageSize: 1000 })
        }).pipe(
            map(results => {
                const summary = this.companySummaries.find(s => s.companyId === company.id);
                if (summary) {
                    // Mapping Net Profit with fallbacks
                    const income = results.pl.totalIncome || results.pl.TotalIncome || results.pl.totalReceipts || results.pl.TotalReceipts || 0;
                    const expenses = results.pl.totalExpenses || results.pl.TotalExpenses || results.pl.totalPayments || results.pl.TotalPayments || 0;
                    summary.netProfit = income - expenses;
                    
                    // Mapping Inventory Value
                    const stockItems = results.stock?.items || results.stock?.data || [];
                    summary.inventoryValue = stockItems.reduce((sum: number, item: any) => {
                        const qty = item.availableStock || item.currentStock || item.qty || 0;
                        const rate = item.lastRate || item.unitRate || item.purchaseRate || item.rate || 0;
                        return sum + (qty * rate);
                    }, 0);

                    // Mapping Tax
                    const sales = results.sales?.items || results.sales?.data || [];
                    const purchases = results.purchases?.items || results.purchases?.data || [];
                    const outputGst = sales.reduce((sum: number, s: any) => sum + (s.totalTax || s.taxAmount || s.TaxAmount || 0), 0);
                    const inputGst = purchases.reduce((sum: number, p: any) => sum + (p.taxAmount || p.totalTax || p.TaxAmount || 0), 0);
                    
                    summary.taxPayable = Math.max(0, outputGst - inputGst);
                    (summary as any).itcBalance = Math.max(0, inputGst - outputGst);

                    // Identify Inter-Company Balances
                    const companyNames = this.companySummaries.map(c => c.companyName.toLowerCase());
                    const currentCompany = company.name.toLowerCase();

                    // Check Receivables for other company names
                    const receivablesItems = results.receivables?.items?.items || results.receivables?.items || [];
                    receivablesItems.forEach((item: any) => {
                        const custName = (item.customerName || item.CustomerName || '').toLowerCase();
                        if (companyNames.includes(custName) && custName !== currentCompany) {
                            this.interCompanyBalances.push({
                                fromCompany: company.name,
                                toCompany: item.customerName || item.CustomerName,
                                amount: item.pendingAmount || item.PendingAmount || 0,
                                type: 'Receivable'
                            });
                        }
                    });

                    // Mapping Receivables from Tracker response total
                    summary.receivables = results.receivables?.totalOutstandingAmount || results.receivables?.TotalOutstandingAmount || 
                                          results.receivables?.totalOutstanding || results.receivables?.TotalOutstanding || 0;
                    
                    // Mapping Payables
                    summary.payables = results.payables?.totalPending || results.payables?.TotalPending || 
                                       results.payables?.totalPendingAmount || results.payables?.TotalPendingAmount || 
                                       results.payables?.amount || 0;

                    summary.totalAssets = summary.inventoryValue + summary.receivables;
                    summary.totalLiabilities = summary.payables;
                    summary.isBalanced = true;
                }
                return summary;
            }),
            catchError(err => {
                console.error(`Error fetching financials for ${company.name}:`, err);
                return of(null);
            })
        );
    }

    calculateGroupTotals() {
        this.totalGroupAssets = this.companySummaries.reduce((sum, c) => sum + c.totalAssets, 0);
        this.totalGroupLiabilities = this.companySummaries.reduce((sum, c) => sum + c.totalLiabilities, 0);
        this.totalGroupProfit = this.companySummaries.reduce((sum, c) => sum + c.netProfit, 0);
        this.totalGroupTaxPayable = this.companySummaries.reduce((sum, c) => sum + c.taxPayable, 0);
        this.totalGroupITC = this.companySummaries.reduce((sum, c) => sum + (c as any).itcBalance || 0, 0);
    }

    exportToPDF() {
        const doc = new jsPDF();
        const dateRange = `${this.startDate.toLocaleDateString()} to ${this.endDate.toLocaleDateString()}`;

        doc.setFontSize(22);
        doc.text('Consolidated Group Balance Sheet', 14, 20);
        
        doc.setFontSize(10);
        doc.text(`Period: ${dateRange}`, 14, 28);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 33);

        autoTable(doc, {
            startY: 40,
            head: [['Company Name', 'Inventory', 'Receivables', 'Payables', 'Net Profit', 'Total Assets']],
            body: this.companySummaries.map(c => [
                c.companyName,
                c.inventoryValue.toLocaleString(),
                c.receivables.toLocaleString(),
                c.payables.toLocaleString(),
                c.netProfit.toLocaleString(),
                c.totalAssets.toLocaleString()
            ]),
            theme: 'striped',
            headStyles: { fillColor: [63, 81, 181] }
        });

        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 10,
            head: [['GROUP TOTALS', 'Amount (Rs.)']],
            body: [
                ['Total Group Assets', this.totalGroupAssets.toLocaleString()],
                ['Total Group Liabilities', this.totalGroupLiabilities.toLocaleString()],
                ['Total Net Profit', this.totalGroupProfit.toLocaleString()]
            ],
            theme: 'grid',
            headStyles: { fillColor: [45, 55, 72] }
        });

        doc.save(`Consolidated_Financials_${new Date().getTime()}.pdf`);
    }

    shareOnWhatsApp() {
        const status = this.totalGroupProfit >= 0 ? 'PROFIT' : 'LOSS';
        const message = `*Consolidated Group Financial Summary*
----------------------------
🏢 *Companies:* ${this.companySummaries.length}
🗓️ *Period:* ${this.startDate.toLocaleDateString()} - ${this.endDate.toLocaleDateString()}
----------------------------
📂 *Group Assets:* ₹${this.totalGroupAssets.toLocaleString('en-IN')}
📉 *Group Liabilities:* ₹${this.totalGroupLiabilities.toLocaleString('en-IN')}
📈 *Group ${status}:* ₹${Math.abs(this.totalGroupProfit).toLocaleString('en-IN')}
----------------------------
_${this.companyName} Multi-Company ERP_`;

        const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
        this.dialog.open(StatusDialogComponent, { data: { isSuccess: true, message: 'Group Summary shared via WhatsApp.' } });
    }

    viewCompanyDetails(summary: CompanyFinancialSummary) {
        // Navigate to Profit & Loss Dashboard for the specific company
        // Passing companyId as query param for future multi-tenant filtering support
        this.router.navigate(['/finance/p-and-l'], { 
            queryParams: { 
                companyId: summary.companyId,
                startDate: this.startDate.toISOString(),
                endDate: this.endDate.toISOString()
            } 
        });

        this.dialog.open(StatusDialogComponent, { 
            data: { isSuccess: true, message: `Opening P&L Dashboard for ${summary.companyName}` } 
        });
    }

    get groupStats(): any[] {
        return [
            { label: 'Group Assets', value: '₹' + this.totalGroupAssets.toLocaleString('en-IN', { minimumFractionDigits: 2 }), icon: 'location_city', type: 'success' },
            { label: 'Group Liabilities', value: '₹' + this.totalGroupLiabilities.toLocaleString('en-IN', { minimumFractionDigits: 2 }), icon: 'account_balance', type: 'warning' },
            { label: 'Group Net Profit', value: '₹' + this.totalGroupProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 }), icon: 'trending_up', type: 'info' },
            { label: 'Group Tax Payable', value: '₹' + this.totalGroupTaxPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 }), icon: 'receipt_long', type: 'warning' }
        ];
    }
}
