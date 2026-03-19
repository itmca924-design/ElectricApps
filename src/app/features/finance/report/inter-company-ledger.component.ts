import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { CompanyService } from '../../company/services/company.service';
import { FinanceService } from '../service/finance.service';
import { forkJoin, finalize } from 'rxjs';
import { LoadingService } from '../../../core/services/loading.service';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { customerService } from '../../master/customer-component/customer.service';
import { SupplierService } from '../../inventory/service/supplier.service';

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
    private customerService = inject(customerService);
    private supplierService = inject(SupplierService);
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
            this.companies = (res?.items || []);
        });
    }

    loadLedger() {
        if (!this.selectedFromCompany || !this.selectedToCompany) return;

        const partner = this.companies.find(c => c.id === this.selectedToCompany);
        if (!partner) return;

        this.isLoading = true;
        this.loadingService.setLoading(true);

        // Step 1: Lookup partner as Customer and/or Supplier
        forkJoin({
            customers: this.customerService.getCustomersLookup(),
            suppliers: this.supplierService.getSuppliers()
        }).subscribe({
            next: (lookups) => {
                const partnerName = partner.name.toLowerCase();
                const targetCustomer = (lookups.customers || []).find(c => 
                    (c.name || c.customerName || '').toLowerCase().includes(partnerName) ||
                    (c.gstIn || c.gstin || '').toLowerCase() === (partner.gstin || '').toLowerCase()
                );
                const targetSupplier = (lookups.suppliers || []).find(s => 
                    (s.name || '').toLowerCase().includes(partnerName) ||
                    (s.gstIn || '').toLowerCase() === (partner.gstin || '').toLowerCase()
                );
                
                const requests: any = {};
                const filters = {
                    startDate: this.startDate.toISOString(),
                    endDate: this.endDate.toISOString(),
                    pageNumber: 1,
                    pageSize: 1000,
                    sortBy: 'TransactionDate',
                    sortOrder: 'asc',
                    searchTerm: ''
                };

                if (targetCustomer) {
                    requests.customerLedger = this.financeService.getCustomerLedger({ customerId: targetCustomer.id, ...filters });
                }
                if (targetSupplier) {
                    requests.supplierLedger = this.financeService.getSupplierLedger({ supplierId: targetSupplier.id, ...filters });
                }

                if (Object.keys(requests).length === 0) {
                    this.transactions = [];
                    this.totalBalance = 0;
                    this.isLoading = false;
                    this.loadingService.setLoading(false);
                    return;
                }

                forkJoin(requests).pipe(
                    finalize(() => {
                        this.isLoading = false;
                        this.loadingService.setLoading(false);
                        this.cdr.detectChanges();
                    })
                ).subscribe((results: any) => {
                    let combined: any[] = [];
                    
                    if (results.customerLedger && results.customerLedger.ledger) {
                        const items = results.customerLedger.ledger.items || [];
                        combined.push(...items.map((i: any) => ({
                            date: i.transactionDate,
                            voucherno: i.referenceId || i.id,
                            type: i.transactionType || 'Sale',
                            description: i.description || 'Customer Transaction',
                            amount: (i.debit || 0) - (i.credit || 0) // Dr increases receivable, Cr decreases
                        })));
                    }

                    if (results.supplierLedger && results.supplierLedger.ledger) {
                        const items = results.supplierLedger.ledger.items || [];
                        combined.push(...items.map((i: any) => ({
                            date: i.transactionDate,
                            voucherno: i.referenceId || i.id,
                            type: i.transactionType || 'Purchase',
                            description: i.description || 'Supplier Transaction',
                            amount: (i.debit || 0) - (i.credit || 0) // Dr (Payment) increases net assets, Cr (Purchase) decreases
                        })));
                    }

                    // Sort by Date Ascending
                    combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                    // Calculate running balance
                    let runningBalance = 0;
                    this.transactions = combined.map(t => {
                        runningBalance += t.amount;
                        return { ...t, balance: runningBalance };
                    });

                    this.totalBalance = runningBalance;
                });
            },
            error: () => {
                this.isLoading = false;
                this.loadingService.setLoading(false);
            }
        });
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
                t.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
                t.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })
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
💰 *Net Balance:* ₹${Math.abs(this.totalBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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

