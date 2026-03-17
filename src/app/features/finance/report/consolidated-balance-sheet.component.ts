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
    interCompanyBalances: any[] = [];
    isLoading = false;
    
    startDate: Date = new Date(new Date().getFullYear(), 3, 1); // Financial Year Start (April 1st)
    endDate: Date = new Date();

    totalGroupAssets = 0;
    totalGroupLiabilities = 0;
    totalGroupProfit = 0;
    totalGroupTaxPayable = 0;
    companyName = 'ElectricApps';

    displayedColumns: string[] = ['companyName', 'inventoryValue', 'receivables', 'payables', 'netProfit', 'totalAssets', 'actions'];

    ngOnInit() {
        this.loadConsolidatedData();
        this.companyService.getCompanyProfile().subscribe(p => this.companyName = p?.name || 'ElectricApps');
    }

    loadConsolidatedData() {
        this.isLoading = true;
        this.loadingService.setLoading(true);

        // 1. Fetch all companies
        this.companyService.getPaged({ pageNumber: 1, pageSize: 50 }).subscribe({
            next: (res: any) => {
                const companies = res?.items || [];
                if (companies.length === 0) {
                    this.isLoading = false;
                    this.loadingService.setLoading(false);
                    return;
                }

                // Note: In a real multi-tenant app, the backend should provide a bulk API.
                // Here we'll simulate by fetching data. 
                // Since APIs currently don't take companyId, we'll map existing data 
                // but structure it so it's ready for future multi-company API support.
                
                this.companySummaries = companies.map((c: any, index: number) => ({
                    companyId: c.id,
                    companyName: c.name,
                    totalAssets: 0,
                    totalLiabilities: 0,
                    netProfit: 0,
                    inventoryValue: 0,
                    receivables: 0,
                    payables: 0,
                    isBalanced: true
                }));

                // Fetch real-time data for the current active company
                this.fetchFinancialsForCompany(companies[0]);

                // Inter-Company Outstandings (Should come from API ideally)
                this.interCompanyBalances = [];

                this.totalGroupTaxPayable = 0;
            },
            error: () => {
                this.isLoading = false;
                this.loadingService.setLoading(false);
            }
        });
    }

    fetchFinancialsForCompany(company: any) {
        const filters = { 
            startDate: this.startDate.toISOString(), 
            endDate: this.endDate.toISOString() 
        };

        forkJoin({
            pl: this.financeService.getProfitAndLossReport(filters),
            receivables: this.financeService.getTotalReceivables(),
            payables: this.financeService.getTotalPayables(),
            stock: this.inventoryService.getCurrentStock('', '', 0, 1000, '')
        }).pipe(
            finalize(() => {
                this.isLoading = false;
                this.loadingService.setLoading(false);
                this.calculateGroupTotals();
                this.cdr.detectChanges();
            })
        ).subscribe({
            next: (results) => {
                const summary = this.companySummaries.find(s => s.companyId === company.id);
                if (summary) {
                    const income = results.pl.totalIncome || 0;
                    const expenses = results.pl.totalExpenses || 0;
                    summary.netProfit = income - expenses;
                    summary.receivables = results.receivables?.totalOutstanding || 0;
                    summary.payables = results.payables?.totalPending || 0;

                    const stockItems = results.stock?.data || [];
                    summary.inventoryValue = stockItems.reduce((sum: number, item: any) => {
                        return sum + ((item.currentStock || 0) * (item.purchaseRate || 0));
                    }, 0);

                    // Simplistic calculation for this view
                    summary.totalAssets = summary.inventoryValue + summary.receivables;
                    summary.totalLiabilities = summary.payables;
                    summary.isBalanced = true;
                }
            }
        });
    }

    calculateGroupTotals() {
        this.totalGroupAssets = this.companySummaries.reduce((sum, c) => sum + c.totalAssets, 0);
        this.totalGroupLiabilities = this.companySummaries.reduce((sum, c) => sum + c.totalLiabilities, 0);
        this.totalGroupProfit = this.companySummaries.reduce((sum, c) => sum + c.netProfit, 0);
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
            { label: 'Group Assets', value: this.totalGroupAssets, icon: 'location_city', type: 'success' },
            { label: 'Group Liabilities', value: this.totalGroupLiabilities, icon: 'account_balance', type: 'warning' },
            { label: 'Group Net Profit', value: this.totalGroupProfit, icon: 'trending_up', type: 'info' },
            { label: 'Group Tax Payable', value: this.totalGroupTaxPayable, icon: 'receipt_long', type: 'warning' }
        ];
    }
}
