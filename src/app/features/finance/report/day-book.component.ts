import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { FinanceService } from '../service/finance.service';
import { InventoryService } from '../../inventory/service/inventory.service';
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

    selectedDate: Date = new Date();
    transactions: DayBookTransaction[] = [];
    filteredTransactions: DayBookTransaction[] = [];
    isLoading = false;
    selectedType: string = 'All';
    companyName: string = 'ElectricApps';

    totalIn = 0;
    totalOut = 0;

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
            sales: this.inventoryService.getQuickPagedSales(1, 1000, 'Date', 'desc', '', startOfDay, endOfDay)
        }).subscribe({
            next: (results) => {
                const combined: DayBookTransaction[] = [];

                // 1. Process Supplier Payments
                const paymentItems = results.payments?.items || [];
                paymentItems.forEach((p: any) => {
                    const dateStr = p.paymentDate || p.PaymentDate || p.date || p.Date;
                    if (!dateStr) return;
                    const d = new Date(this.normalizeDate(dateStr));
                    if (this.isSameDay(d, this.selectedDate)) {
                        combined.push({
                            time: d,
                            type: 'Payment',
                            particulars: p.supplierName || p.SupplierName || 'Supplier Payment',
                            voucherNo: p.referenceNumber || p.ReferenceNumber || '-',
                            inAmount: 0,
                            outAmount: p.amount || p.Amount || 0,
                            paymentMode: p.paymentMode || p.PaymentMode || 'Cash'
                        });
                    }
                });

                // 2. Process Customer Receipts
                const receiptItems = results.receipts?.items || [];
                receiptItems.forEach((r: any) => {
                    const dateStr = r.receiptDate || r.ReceiptDate || r.date || r.Date;
                    if (!dateStr) return;
                    const d = new Date(this.normalizeDate(dateStr));
                    if (this.isSameDay(d, this.selectedDate)) {
                        combined.push({
                            time: d,
                            type: 'Receipt',
                            particulars: r.customerName || r.CustomerName || 'Customer Receipt',
                            voucherNo: r.referenceNumber || r.ReferenceNumber || '-',
                            inAmount: r.amount || r.Amount || 0,
                            outAmount: 0,
                            paymentMode: r.paymentMode || r.PaymentMode || 'Cash'
                        });
                    }
                });

                // 3. Process Expenses
                const expenseItems = results.expenses?.items || [];
                expenseItems.forEach((e: any) => {
                    const dateStr = e.expenseDate || e.ExpenseDate || e.date || e.Date;
                    if (!dateStr) return;
                    const d = new Date(this.normalizeDate(dateStr));
                    if (this.isSameDay(d, this.selectedDate)) {
                        combined.push({
                            time: d,
                            type: 'Expense',
                            particulars: (e.category?.name || e.Category?.Name || e.categoryName || 'General Expense') + (e.remarks ? ` (${e.remarks})` : ''),
                            voucherNo: '-',
                            inAmount: 0,
                            outAmount: e.amount || e.Amount || 0,
                            paymentMode: e.paymentMode || 'Cash'
                        });
                    }
                });

                // 4. Process Sales
                const saleItems = results.sales?.data || results.sales?.items || [];
                saleItems.forEach((s: any) => {
                    const dateStr = s.soDate || s.SoDate || s.date || s.Date;
                    if (!dateStr) return;
                    const d = new Date(this.normalizeDate(dateStr));
                    if (this.isSameDay(d, this.selectedDate)) {
                        combined.push({
                            time: d,
                            type: 'Sale',
                            particulars: s.customerName || s.CustomerName || 'Cash Sale',
                            voucherNo: s.soNumber || s.SoNumber || '-',
                            inAmount: s.grandTotal || s.GrandTotal || 0,
                            outAmount: 0,
                            paymentMode: s.paymentMode || 'Cash'
                        });
                    }
                });

                // 5. Process Purchases (Standard)
                const purchaseItems = results.purchases?.data || results.purchases?.items || [];
                purchaseItems.forEach((p: any) => {
                    const dateStr = p.poDate || p.PoDate || p.date || p.Date || p.orderDate;
                    if (!dateStr) return;
                    const d = new Date(this.normalizeDate(dateStr));
                    if (this.isSameDay(d, this.selectedDate)) {
                        combined.push({
                            time: d,
                            type: 'Purchase',
                            particulars: p.supplierName || p.SupplierName || 'Purchase Order',
                            voucherNo: p.poNumber || p.PoNumber || '-',
                            inAmount: 0,
                            outAmount: p.grandTotal || p.GrandTotal || 0,
                            paymentMode: p.paymentMode || 'Cash'
                        });
                    }
                });

                // 6. Process Quick Purchases
                const quickPurchaseItems = results.quickPurchases?.data || results.quickPurchases?.items || [];
                quickPurchaseItems.forEach((p: any) => {
                    const dateStr = p.poDate || p.PoDate || p.date || p.Date;
                    if (!dateStr) return;
                    const d = new Date(this.normalizeDate(dateStr));
                    if (this.isSameDay(d, this.selectedDate)) {
                        combined.push({
                            time: d,
                            type: 'Purchase',
                            particulars: p.supplierName || p.SupplierName || 'Quick Purchase',
                            voucherNo: p.pNumber || p.voucherNo || p.poNumber || '-',
                            inAmount: 0,
                            outAmount: p.grandTotal || p.GrandTotal || 0,
                            paymentMode: p.paymentMode || 'Cash'
                        });
                    }
                });

                // Sort by time descending
                this.transactions = combined.sort((a, b) => b.time.getTime() - a.time.getTime());
                this.applyFilters();
                
                // Calculate totals
                this.totalIn = this.transactions.reduce((acc, curr) => acc + curr.inAmount, 0);
                this.totalOut = this.transactions.reduce((acc, curr) => acc + curr.outAmount, 0);

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
