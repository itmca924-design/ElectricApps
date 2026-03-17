import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { CompanyService } from '../../company/services/company.service';
import { FinanceService } from '../service/finance.service';
import { finalize } from 'rxjs';
import { LoadingService } from '../../../core/services/loading.service';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
    selector: 'app-inter-company-ledger',
    standalone: true,
    imports: [CommonModule, MaterialModule, FormsModule],
    templateUrl: './inter-company-ledger.component.html',
    styleUrl: './inter-company-ledger.component.scss'
})
export class InterCompanyLedgerComponent implements OnInit {
    private companyService = inject(CompanyService);
    private financeService = inject(FinanceService);
    private loadingService = inject(LoadingService);
    private cdr = inject(ChangeDetectorRef);

    isLoading = false;
    companies: any[] = [];
    
    selectedFromCompany: number | null = null;
    selectedToCompany: number | null = null;

    startDate: Date = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    endDate: Date = new Date();

    transactions: any[] = [];
    displayedColumns: string[] = ['date', 'voucherno', 'type', 'description', 'amount', 'balance'];

    totalBalance = 0;
    companyName = 'ElectricApps';

    ngOnInit() {
        this.loadCompanies();
        this.companyService.getCompanyProfile().subscribe((p: any) => this.companyName = p?.name || 'ElectricApps');
    }

    loadCompanies() {
        this.companyService.getPaged({ pageNumber: 1, pageSize: 50 }).subscribe(res => {
            this.companies = (res?.items || []).map((c: any, index: number) => ({
                ...c,
                gstin: `27AAACR${1000 + index}B1Z${index % 9}` // Simulated GSTIN
            }));
        });
    }

    loadLedger() {
        if (!this.selectedFromCompany || !this.selectedToCompany) return;

        this.isLoading = true;
        this.loadingService.setLoading(true);

        // Simulation: Fetching inter-company transactions
        // In a real scenario, we'd filter Sales/Purchases where the partner is also a group company.
        setTimeout(() => {
            this.transactions = [
                { date: new Date(), voucherno: 'IC/001', type: 'Payment', description: 'Fund Transfer - Working Capital', amount: 50000, balance: 50000 },
                { date: new Date(), voucherno: 'SL/502', type: 'Sale', description: 'Bulk Item Supply', amount: 25000, balance: 75000 },
                { date: new Date(), voucherno: 'RC/112', type: 'Receipt', description: 'Invoice Clearing', amount: -30000, balance: 45000 }
            ];
            this.totalBalance = 45000;
            this.isLoading = false;
            this.loadingService.setLoading(false);
            this.cdr.detectChanges();
        }, 800);
    }

    exportToPDF() {
        const doc = new jsPDF();
        const fromCompany = this.companies.find(c => c.id === this.selectedFromCompany)?.name;
        const toCompany = this.companies.find(c => c.id === this.selectedToCompany)?.name;
        const dateRangeStr = `${this.startDate.toLocaleDateString()} to ${this.endDate.toLocaleDateString()}`;
        
        doc.setFontSize(22);
        doc.setTextColor(15, 23, 42); 
        doc.text('Inter-Company Ledger', 14, 22);
        
        doc.setFontSize(11);
        doc.setTextColor(100, 116, 139);
        doc.text(`Primary: ${fromCompany} | Partner: ${toCompany}`, 14, 30);
        doc.text(`Period: ${dateRangeStr}`, 14, 35);
        
        autoTable(doc, {
            startY: 45,
            head: [['Date', 'Voucher', 'Type', 'Description', 'Amount', 'Balance']],
            body: this.transactions.map(t => [
                new Date(t.date).toLocaleDateString(),
                t.voucherno,
                t.type,
                t.description,
                t.amount.toLocaleString(),
                t.balance.toLocaleString()
            ]),
            theme: 'grid',
            headStyles: { fillColor: [59, 130, 246] },
            columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' } }
        });

        doc.save(`InterCompany_Ledger_${new Date().getTime()}.pdf`);
    }

    shareOnWhatsApp() {
        const fromComp = this.companies.find(c => c.id === this.selectedFromCompany);
        const toComp = this.companies.find(c => c.id === this.selectedToCompany);
        const dateRangeStr = `${this.startDate.toLocaleDateString()} - ${this.endDate.toLocaleDateString()}`;
        const status = this.totalBalance >= 0 ? 'Receivable' : 'Payable';

        const message = `*Inter-Company Ledger Summary*
----------------------------
🗓️ *Period:* ${dateRangeStr}
🏢 *From:* ${fromComp?.name} (GST: ${fromComp?.gstin})
🤝 *Partner:* ${toComp?.name} (GST: ${toComp?.gstin})
----------------------------
⚖️ *Outstanding Status:* ${status}
💰 *Net Balance:* ₹${Math.abs(this.totalBalance).toLocaleString('en-IN')}
----------------------------
_Generated via ${this.companyName} Multi-Company Audit_`;

        const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    }

    getCompanyGstin(id: number | null): string {
        if (!id) return 'N/A';
        const company = this.companies.find(c => c.id === id);
        return company?.gstin || 'N/A';
    }
}
