import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { StatusDialogComponent } from '../../../shared/components/status-dialog-component/status-dialog-component';
import { MatNativeDateModule } from '@angular/material/core';
import { FinanceService } from '../service/finance.service';
import { InventoryService } from '../../inventory/service/inventory.service';
import { CompanyService } from '../../company/services/company.service';
import { forkJoin, finalize } from 'rxjs';
import { LoadingService } from '../../../core/services/loading.service';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
    selector: 'app-gst-reconciliation',
    standalone: true,
    imports: [
        CommonModule, FormsModule, MatCardModule, MatIconModule, MatButtonModule, 
        MatTableModule, MatSelectModule, MatFormFieldModule, MatInputModule, 
        MatDatepickerModule, MatProgressSpinnerModule, MatTooltipModule, MatDialogModule,
        MatNativeDateModule
    ],
    templateUrl: './gst-reconciliation.component.html',
    styleUrl: './gst-reconciliation.component.scss'
})
export class GstReconciliationComponent implements OnInit {
    private financeService = inject(FinanceService);
    private inventoryService = inject(InventoryService);
    private loadingService = inject(LoadingService);
    private companyService = inject(CompanyService);
    private dialog = inject(MatDialog);
    private cdr = inject(ChangeDetectorRef);

    isLoading = false;
    startDate: Date = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    endDate: Date = new Date();
    companyName: string = 'ElectricApps';
    
    outputGst: number = 0; 
    inputGst: number = 0;  
    tdsAmount: number = 0;
    tcsAmount: number = 0;
    gstPayable: number = 0;
    netTaxCredit: number = 0;

    hasGstinErrors: boolean = false;
    totalReversalAmount: number = 0;
    
    gstDetails: any[] = [];
    partyBreakdown: any[] = [];
    taxSlabs: any[] = [];
    itcReversals: any[] = [];
    
    displayedColumns: string[] = ['category', 'cgst', 'sgst', 'igst', 'tds', 'tcs', 'total'];
    partyColumns: string[] = ['partyName', 'gstin', 'totalTax', 'tds', 'tcs', 'status'];
    slabColumns: string[] = ['rate', 'taxableAmount', 'cgst', 'sgst', 'igst', 'totalTax'];
    reversalColumns: string[] = ['invoiceNo', 'invoiceDate', 'partyName', 'aging', 'taxAmount', 'status', 'actions'];
    logColumns: string[] = ['timestamp', 'partyName', 'invoiceNo', 'phone', 'status'];

    reminderLogs: any[] = [];

    ngOnInit() {
        this.loadGstData();
        this.companyService.getCompanyProfile().subscribe(p => this.companyName = p?.name || 'ElectricApps');
    }

    loadGstData() {
        this.isLoading = true;
        this.loadingService.setLoading(true);

        const filters = {
            startDate: this.startDate.toISOString(),
            endDate: this.endDate.toISOString()
        };

        forkJoin({
            sales: this.inventoryService.getQuickPagedSales(1, 1000, 'Date', 'desc', '', this.startDate, this.endDate),
            purchases: this.inventoryService.getPagedOrders({ ...filters, pageSize: 1000 })
        }).pipe(
            finalize(() => {
                this.isLoading = false;
                this.loadingService.setLoading(false);
                this.cdr.detectChanges();
            })
        ).subscribe({
            next: (results) => {
                const sales = results.sales?.items || results.sales?.data || [];
                const purchases = results.purchases?.items || results.purchases?.data || [];

                this.outputGst = sales.reduce((sum: number, s: any) => sum + (s.totalTax || s.taxAmount || s.TaxAmount || 0), 0);
                this.inputGst = purchases.reduce((sum: number, p: any) => sum + (p.taxAmount || p.totalTax || p.TaxAmount || 0), 0);
                
                this.tdsAmount = purchases.reduce((sum: number, p: any) => sum + (p.tdsAmount || p.TdsAmount || 0), 0); 
                this.tcsAmount = sales.reduce((sum: number, s: any) => sum + (s.tcsAmount || s.TcsAmount || 0), 0);

                this.gstPayable = Math.max(0, (this.outputGst + this.tcsAmount) - (this.inputGst + this.tdsAmount));
                this.netTaxCredit = Math.max(0, (this.inputGst + this.tdsAmount) - (this.outputGst + this.tcsAmount));

                const o_igst = sales.reduce((sum: number, s: any) => sum + (s.igstAmount || s.IgstAmount || 0), 0);
                const i_igst = purchases.reduce((sum: number, p: any) => sum + (p.igstAmount || p.IgstAmount || 0), 0);

                this.gstDetails = [
                    { 
                        category: 'Output (Sales)', 
                        cgst: o_igst > 0 ? 0 : this.outputGst / 2, 
                        sgst: o_igst > 0 ? 0 : this.outputGst / 2, 
                        igst: o_igst, 
                        tds: 0, 
                        tcs: this.tcsAmount, 
                        total: this.outputGst + this.tcsAmount 
                    },
                    { 
                        category: 'Input (Purchases)', 
                        cgst: i_igst > 0 ? 0 : this.inputGst / 2, 
                        sgst: i_igst > 0 ? 0 : this.inputGst / 2, 
                        igst: i_igst, 
                        tds: this.tdsAmount, 
                        tcs: 0, 
                        total: this.inputGst + this.tdsAmount 
                    }
                ];

                // Clear mocked data arrays - these should be populated by real-time grouping from API or logic
                this.partyBreakdown = [];
                this.taxSlabs = [];
                this.itcReversals = [];

                this.hasGstinErrors = false;
                this.totalReversalAmount = 0;
            }
        });
    }

    onFilterChange() {
        this.loadGstData();
    }

    exportToPDF() {
        const doc = new jsPDF();
        const dateRangeStr = `${this.startDate.toLocaleDateString()} to ${this.endDate.toLocaleDateString()}`;
        
        doc.setFontSize(22);
        doc.setTextColor(26, 32, 44); 
        doc.text('GST & Tax Reconciliation', 14, 22);
        
        doc.setFontSize(11);
        doc.setTextColor(113, 128, 150);
        doc.text(`Period: ${dateRangeStr}`, 14, 30);
        
        autoTable(doc, {
            startY: 40,
            head: [['Description', 'Amount (Rs.)']],
            body: [
                ['Output GST (Sales)', this.outputGst.toLocaleString('en-IN')],
                ['TCS Collected', this.tcsAmount.toLocaleString('en-IN')],
                ['Input GST (Purchases)', this.inputGst.toLocaleString('en-IN')],
                ['TDS Paid', this.tdsAmount.toLocaleString('en-IN')],
                ['ITC Reversal (180 Days)', { content: this.totalReversalAmount.toLocaleString('en-IN'), styles: { textColor: [229, 62, 62] } }],
                [{ content: (this.outputGst >= this.inputGst ? 'NET TAX PAYABLE' : 'NET CREDIT'), styles: { fontStyle: 'bold', fillColor: [247, 250, 252] } }, 
                 { content: this.gstPayable.toLocaleString('en-IN'), styles: { fontStyle: 'bold', fillColor: [247, 250, 252] } }]
            ],
            theme: 'grid',
            headStyles: { fillColor: [45, 55, 72] },
            columnStyles: { 1: { halign: 'right' } }
        });

        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 10,
            head: [['Category', 'CGST', 'SGST', 'IGST', 'TDS', 'TCS', 'Total']],
            body: this.gstDetails.map(d => [
                d.category, 
                d.cgst.toLocaleString(), 
                d.sgst.toLocaleString(), 
                d.igst.toLocaleString(), 
                d.tds.toLocaleString(), 
                d.tcs.toLocaleString(), 
                d.total.toLocaleString()
            ]),
            theme: 'striped',
            headStyles: { fillColor: [49, 130, 206] }
        });

        doc.save(`GST_Tax_Report_${new Date().getTime()}.pdf`);
    }

    shareOnWhatsApp() {
        const dateRangeStr = `${this.startDate.toLocaleDateString()} - ${this.endDate.toLocaleDateString()}`;
        
        const message = `*GST & Tax Summary (${dateRangeStr})*
----------------------------
📤 *Output GST:* ₹${this.outputGst.toLocaleString('en-IN')}
📥 *Input GST (ITC):* ₹${this.inputGst.toLocaleString('en-IN')}
----------------------------
📑 *TDS Recv:* ₹${this.tdsAmount.toLocaleString('en-IN')}
📑 *TCS Paid:* ₹${this.tcsAmount.toLocaleString('en-IN')}
----------------------------
⚖️ *Tax Payable:* ₹${this.gstPayable.toLocaleString('en-IN')}
⚠️ *Incl. ITC Reversal:* ₹${this.totalReversalAmount.toLocaleString('en-IN')}
----------------------------
_${this.companyName} Financial Compliance_`;

        const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    }

    sendReminder(element: any) {
        const message = `*URGENT: Payment Reminder regarding Invoice ${element.invoiceNo}*
----------------------------
Dear *${element.partyName}*,

This is to follow up on the payment for invoice *${element.invoiceNo}* dated *${new Date(element.invoiceDate).toLocaleDateString()}*. 

As per GST Rule 37, this invoice has exceeded the *180-day* credit limit (Aging: *${element.aging} Days*), and we are now required to reverse the ITC.

Please process the outstanding payment as soon as possible to avoid further compliance issues.

*Invoice Amount:* ₹${element.taxAmount.toLocaleString('en-IN')} (GST Component)
----------------------------
_Generated via ${this.companyName} Finance System_`;

        const url = `https://wa.me/${element.phone}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');

        // Add to Log
        this.reminderLogs.unshift({
            timestamp: new Date(),
            partyName: element.partyName,
            invoiceNo: element.invoiceNo,
            phone: element.phone,
            status: 'Delivered'
        });

        this.dialog.open(StatusDialogComponent, { 
            data: { isSuccess: true, message: `Reminder sent to ${element.partyName}` } 
        });
    }

    exportReminderLog() {
        if (this.reminderLogs.length === 0) return;

        const doc = new jsPDF();
        doc.setFontSize(22);
        doc.setTextColor(16, 101, 52); // Success Green
        doc.text('Payment Reminder Activity Log', 14, 22);
        
        doc.setFontSize(11);
        doc.setTextColor(100, 116, 139);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
        
        autoTable(doc, {
            startY: 40,
            head: [['Time', 'Supplier', 'Invoice No', 'Phone', 'Status']],
            body: this.reminderLogs.map(log => [
                log.timestamp.toLocaleTimeString(),
                log.partyName,
                log.invoiceNo,
                log.phone,
                log.status
            ]),
            theme: 'grid',
            headStyles: { fillColor: [16, 101, 52] }
        });

        doc.save(`Reminder_Audit_Log_${new Date().getTime()}.pdf`);
    }

    isValidGstin(gstin: string): boolean {
        if (!gstin || gstin === 'PENDING') return false;
        // Basic GSTIN Regex
        const regex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
        return regex.test(gstin);
    }
}
