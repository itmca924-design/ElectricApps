import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { FinanceService } from '../service/finance.service';
import { InventoryService } from '../../inventory/service/inventory.service';
import { SaleOrderService } from '../../inventory/service/saleorder.service';
import { CompanyService } from '../../company/services/company.service';
import { forkJoin, finalize } from 'rxjs';
import { LoadingService } from '../../../core/services/loading.service';
import { FormsModule } from '@angular/forms';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface DayBookTransaction {
    time: Date;
    type: 'Sale' | 'Purchase' | 'Receipt' | 'Payment' | 'Expense';
    particulars: string;
    voucherNo: string;
    inAmount: number;
    outAmount: number;
    paymentMode?: string;
}

@Component({
    selector: 'app-day-book',
    standalone: true,
    imports: [CommonModule, RouterModule, MaterialModule, FormsModule],
    templateUrl: './day-book.component.html',
    styleUrl: './day-book.component.scss'
})
export class DayBookComponent implements OnInit {
    private cdr = inject(ChangeDetectorRef);
    private loadingService = inject(LoadingService);
    private financeService = inject(FinanceService);
    private inventoryService = inject(InventoryService);
    private companyService = inject(CompanyService);
    private saleOrderService = inject(SaleOrderService);

    selectedDate: Date = new Date();
    transactions: DayBookTransaction[] = [];
    filteredTransactions: DayBookTransaction[] = [];
    isLoading = false;
    selectedType: string = 'All';
    companyName: string = 'ElectricApps';

    displayedColumns: string[] = ['time', 'type', 'particulars', 'voucherNo', 'inAmount', 'outAmount'];

    ngOnInit() {
        this.loadDayBook();
        this.companyService.getCompanyProfile().subscribe((p: any) => this.companyName = p?.name || 'ElectricApps');
    }

    onDateChange() {
        this.loadDayBook();
    }

    onFilterChange() {
        this.applyFilters();
    }

    applyFilters() {
        if (this.selectedType === 'All') {
            this.filteredTransactions = [...this.transactions];
        } else {
            this.filteredTransactions = this.transactions.filter(t => t.type === this.selectedType);
        }
        
        // Calculate totals based on filtered data (or keep original totals? Usually report totals show overall)
        // Let's keep totals for overall day, but table for filtered view.
        this.cdr.detectChanges();
    }

    loadDayBook() {
        this.isLoading = true;
        this.loadingService.setLoading(true);
        
        const startOfDay = new Date(this.selectedDate);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(this.selectedDate);
        endOfDay.setHours(23, 59, 59, 999);

        const startStr = startOfDay.toISOString();
        const endStr = endOfDay.toISOString();

        const paymentParams = {
            startDate: startStr,
            endDate: endStr,
            pageNumber: 1,
            pageSize: 1000,
            sortBy: 'PaymentDate',
            sortOrder: 'desc',
            searchTerm: ''
        };

        const receiptParams = {
            startDate: startStr,
            endDate: endStr,
            pageNumber: 1,
            pageSize: 1000,
            sortBy: 'ReceiptDate',
            sortOrder: 'desc',
            searchTerm: ''
        };

        const purchaseParams = {
            pageIndex: 0,
            pageSize: 1000,
            sortField: 'CreatedDate',
            sortOrder: 'desc',
            fromDate: startStr,
            toDate: endStr,
            filter: '',
            filters: [],
            isQuick: false
        };

        forkJoin({
            payments: this.financeService.getPaymentsReport(paymentParams),
            receipts: this.financeService.getReceiptsReport(receiptParams),
            expenses: this.financeService.getExpenseEntries(1, 1000), 
            purchases: this.inventoryService.getPagedOrders(purchaseParams),
            quickPurchases: this.inventoryService.getQuickPagedPurchases(1, 1000, 'Date', 'desc', '', startOfDay, endOfDay),
            quickSales: this.inventoryService.getQuickPagedSales(1, 1000, 'Date', 'desc', '', startOfDay, endOfDay),
            standardSales: this.saleOrderService.getSaleOrders(1, 1000, 'soDate', 'desc', '', startOfDay, endOfDay)
        }).subscribe({
            next: (results: any) => {
                const combinedMap = new Map<string, DayBookTransaction>();

                const addTransaction = (t: DayBookTransaction) => {
                    const key = `${t.type}-${t.voucherNo}-${t.particulars}`;
                    if (!combinedMap.has(key)) {
                        combinedMap.set(key, t);
                    }
                };

                // Process all using the addTransaction helper to automatically deduplicate
                const processItems = (items: any[], type: DayBookTransaction['type'], dateFields: string[], specifics: any) => {
                    items.forEach(item => {
                        let dateFound = null;
                        for (const f of dateFields) {
                            if (item[f]) { dateFound = item[f]; break; }
                        }
                        if (!dateFound) return;
                        
                        const d = new Date(this.normalizeDate(dateFound));
                        if (this.isSameDay(d, this.selectedDate)) {
                            addTransaction({
                                time: d,
                                type: type,
                                particulars: specifics.particulars(item),
                                voucherNo: specifics.voucher(item),
                                inAmount: specifics.in(item),
                                outAmount: specifics.out(item),
                                paymentMode: item.paymentMode || item.PaymentMode || 'Cash'
                            });
                        }
                    });
                };

                // 1. Payments
                processItems(results.payments?.items || [], 'Payment', ['paymentDate', 'PaymentDate', 'date', 'Date'], {
                    particulars: (p: any) => p.supplierName || p.SupplierName || 'Supplier Payment',
                    voucher: (p: any) => p.referenceNumber || p.ReferenceNumber || '-',
                    in: () => 0,
                    out: (p: any) => p.amount || p.Amount || 0
                });

                // 2. Receipts
                processItems(results.receipts?.items || [], 'Receipt', ['receiptDate', 'ReceiptDate', 'date', 'Date'], {
                    particulars: (r: any) => r.customerName || r.CustomerName || 'Customer Receipt',
                    voucher: (r: any) => r.referenceNumber || r.ReferenceNumber || '-',
                    in: (r: any) => r.amount || r.Amount || 0,
                    out: () => 0
                });

                // 3. Expenses
                processItems(results.expenses?.items || [], 'Expense', ['expenseDate', 'ExpenseDate', 'date', 'Date'], {
                    particulars: (e: any) => (e.category?.name || e.Category?.Name || e.categoryName || 'General Expense') + (e.remarks ? ` (${e.remarks})` : ''),
                    voucher: () => '-',
                    in: () => 0,
                    out: (e: any) => e.amount || e.Amount || 0
                });

                // 4. Sales
                const allSales = [...(results.quickSales?.data || results.quickSales?.items || []), ...(results.standardSales?.data || results.standardSales?.items || [])];
                processItems(allSales, 'Sale', ['soDate', 'SoDate', 'date', 'Date'], {
                    particulars: (s: any) => s.customerName || s.CustomerName || 'Cash Sale',
                    voucher: (s: any) => s.soNumber || s.SoNumber || '-',
                    in: (s: any) => s.grandTotal || s.GrandTotal || 0,
                    out: () => 0
                });

                // 5. Purchases
                const allPurchases = [...(results.purchases?.data || results.purchases?.items || []), ...(results.quickPurchases?.data || results.quickPurchases?.items || [])];
                processItems(allPurchases, 'Purchase', ['poDate', 'PoDate', 'date', 'Date', 'orderDate'], {
                    particulars: (p: any) => p.supplierName || p.SupplierName || 'Purchase/Quick Purchase',
                    voucher: (p: any) => p.poNumber || p.PoNumber || p.pNumber || p.voucherNo || '-',
                    in: () => 0,
                    out: (p: any) => p.grandTotal || p.GrandTotal || 0
                });

                // Convert Map to sorted array
                this.transactions = Array.from(combinedMap.values()).sort((a, b) => b.time.getTime() - a.time.getTime());
                this.applyFilters();
                
                this.isLoading = false;
                this.loadingService.setLoading(false);
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error('Error loading day book:', err);
                this.isLoading = false;
                this.loadingService.setLoading(false);
                this.cdr.detectChanges();
            }
        });
    }

    isSameDay(d1: Date, d2: Date): boolean {
        return d1.getFullYear() === d2.getFullYear() &&
               d1.getMonth() === d2.getMonth() &&
               d1.getDate() === d2.getDate();
    }

    normalizeDate(dateStr: string): string {
        if (!dateStr) return '';
        if (typeof dateStr !== 'string') return dateStr;
        // Normalize UTC strings from backend
        if (!dateStr.includes('Z') && !dateStr.includes('+')) {
            return dateStr + 'Z';
        }
        return dateStr;
    }

    get totalIn(): number {
        return this.filteredTransactions.reduce((sum, t) => sum + t.inAmount, 0);
    }

    get totalOut(): number {
        return this.filteredTransactions.reduce((sum, t) => sum + t.outAmount, 0);
    }

    get netBalance(): number {
        return this.totalIn - this.totalOut;
    }

    exportToPDF() {
        const doc = new jsPDF();
        const dateStr = this.selectedDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        
        doc.setFontSize(18);
        doc.text('Day Book Report', 14, 22);
        
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Date: ${dateStr}`, 14, 30);
        
        const summaryY = 40;
        doc.text(`Total Inflow: Rs. ${this.totalIn.toLocaleString('en-IN')}`, 14, summaryY);
        doc.text(`Total Outflow: Rs. ${this.totalOut.toLocaleString('en-IN')}`, 80, summaryY);
        doc.text(`Net Movement: Rs. ${this.netBalance.toLocaleString('en-IN')}`, 150, summaryY);

        const tableData = this.filteredTransactions.map(t => [
            t.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            t.type,
            t.particulars,
            t.voucherNo,
            t.inAmount > 0 ? t.inAmount.toLocaleString('en-IN') : '-',
            t.outAmount > 0 ? t.outAmount.toLocaleString('en-IN') : '-'
        ]);

        autoTable(doc, {
            startY: 50,
            head: [['Time', 'Type', 'Particulars', 'Voucher', 'IN (+)', 'OUT (-)']],
            body: tableData,
            theme: 'striped',
            headStyles: { fillColor: [63, 81, 181] },
            columnStyles: {
                4: { halign: 'right' },
                5: { halign: 'right' }
            }
        });

        doc.save(`DayBook_${dateStr.replace(/ /g, '_')}.pdf`);
    }

    shareOnWhatsApp() {
        const dateStr = this.selectedDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        
        const message = `*Day Book Summary (${dateStr})*
----------------------------
📥 *Total Inflow:* ₹${this.totalIn.toLocaleString('en-IN')}
📤 *Total Outflow:* ₹${this.totalOut.toLocaleString('en-IN')}
📦 *Net Movement:* ₹${this.netBalance.toLocaleString('en-IN')}
----------------------------
📊 *Transactions:* ${this.transactions.length} entries recorded.
----------------------------
Generated via ${this.companyName}`;

        const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    }
}
