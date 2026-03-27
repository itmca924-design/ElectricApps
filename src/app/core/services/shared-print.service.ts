import { Injectable, inject } from '@angular/core';
import { PrintConfigService } from './print-config.service';
import { ThermalPrintService, ThermalReceiptData } from './thermal-print.service';
import { CompanyService } from '../../features/company/services/company.service';
import { DatePipe, CurrencyPipe } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class SharedPrintService {
    private configService = inject(PrintConfigService);
    private thermalService = inject(ThermalPrintService);
    private companyService = inject(CompanyService);
    private datePipe = new DatePipe('en-IN');
    private currencyPipe = new CurrencyPipe('en-IN');
    
    numberToWords(num: number): string {
        const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
        const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        const n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
        if (!n) return '';
        let str = '';
        str += Number(n[1]) != 0 ? (a[Number(n[1])] || b[Number(n[1].toString().charAt(0))] + ' ' + a[Number(n[1].toString().charAt(1))]) + 'Crore ' : '';
        str += Number(n[2]) != 0 ? (a[Number(n[2])] || b[Number(n[2].toString().charAt(0))] + ' ' + a[Number(n[2].toString().charAt(1))]) + 'Lakh ' : '';
        str += Number(n[3]) != 0 ? (a[Number(n[3])] || b[Number(n[3].toString().charAt(0))] + ' ' + a[Number(n[3].toString().charAt(1))]) + 'Thousand ' : '';
        str += Number(n[4]) != 0 ? (a[Number(n[4])] || b[Number(n[4].toString().charAt(0))] + ' ' + a[Number(n[4].toString().charAt(1))]) + 'Hundred ' : '';
        str += Number(n[5]) != 0 ? (str != '' ? 'and ' : '') + (a[Number(n[5])] || b[Number(n[5].toString().charAt(0))] + ' ' + a[Number(n[5].toString().charAt(1))]) + 'only' : '';
        return str;
    }

    printDocument(pageName: string, docType: 'SO' | 'PO' | 'SR' | 'PR', data: any) {
        this.configService.getPrintFormat(pageName).subscribe(format => {
            this.companyService.getCompanyProfile().subscribe({
                next: (companyInfo) => {
                    const mappedData = this.mapDataToThermalFormat(companyInfo, docType, data);
                    if (format === 'THERMAL') {
                        this.thermalService.printReceipt(mappedData);
                    } else {
                        // A4 logic - we generate an A4 size HTML template
                        this.printA4(mappedData, companyInfo, docType);
                    }
                },
                error: () => {
                   // Fallback without company info
                   const mappedData = this.mapDataToThermalFormat(null, docType, data);
                   if (format === 'THERMAL') {
                        this.thermalService.printReceipt(mappedData);
                   } else {
                        this.printA4(mappedData, null, docType);
                   }
                }
            });
        });
    }

    private mapDataToThermalFormat(companyInfo: any, docType: 'SO' | 'PO' | 'SR' | 'PR', data: any): ThermalReceiptData {
        const addr = companyInfo?.address;
        const addressStr = addr 
            ? `${addr.addressLine1}, ${addr.addressLine2 ? addr.addressLine2 + ', ' : ''}${addr.city}, ${addr.state} - ${addr.pinCode}`
            : '';
            
        let title = '';
        let receiptNoLabel = '';
        let partyNameLabel = '';
        let partyName = '';
        let receiptNo = '';
        let docDate = '';

        if (docType === 'SO') {
             title = 'RETAIL INVOICE';
             receiptNoLabel = 'Bill No';
             receiptNo = data.soNumber;
             partyNameLabel = 'Customer';
             partyName = data.customerName;
             docDate = data.soDate;
        } else if (docType === 'PO') {
             title = 'PURCHASE ORDER';
             receiptNoLabel = 'PO No';
             receiptNo = data.poNumber;
             partyNameLabel = 'Supplier';
             partyName = data.supplierName;
             docDate = data.poDate;
        } else if (docType === 'SR') {
             title = 'CREDIT NOTE (SALE RETURN)';
             receiptNoLabel = 'Return No';
             receiptNo = data.returnNumber;
             partyNameLabel = 'Customer';
             partyName = data.customerName;
             docDate = data.returnDate;
        } else if (docType === 'PR') {
             title = 'DEBIT NOTE (PURCHASE RETURN)';
             receiptNoLabel = 'Return No';
             receiptNo = data.returnNumber;
             partyNameLabel = 'Supplier';
             partyName = data.supplierName;
             docDate = data.returnDate;
        }

        const items = (data.items || []).map((i: any) => ({
             name: i.productName || i.name,
             qty: i.qty,
             rate: i.rate,
             discountPercent: i.discountPercent,
             taxPercent: i.taxPercent || i.gstPercent,
             amount: i.total || (i.qty * i.rate * (1 - (i.discountPercent || 0)/100))
        }));

        let grandTotal = data.grandTotal || 0;
        const totalPcs = items.reduce((sum: number, i: any) => sum + i.qty, 0);

        return {
            title,
            companyName: companyInfo?.name || 'My Company',
            address: addressStr,
            contactInfo: `Ph: ${companyInfo?.primaryPhone || ''}`,
            gstin: companyInfo?.taxNumber,
            receiptNoLabel,
            receiptNo,
            date: docDate,
            partyNameLabel,
            partyName,
            items,
            subTotal: (data.subTotal || 0).toFixed(2),
            totalDiscount: (data.totalDiscount || 0).toFixed(2),
            totalTax: (data.totalTax || 0).toFixed(2),
            grandTotal: grandTotal.toFixed(2),
            amountInWords: this.numberToWords(Math.round(grandTotal)),
            savingsInfo: {
                totalPcs,
                mrpTotal: items.reduce((sum: number, i: any) => sum + (i.qty * i.rate), 0),
                totalSaving: data.totalDiscount || 0
            }
        };
    }

    private printA4(data: ThermalReceiptData, companyInfo: any, docType: string) {
        const itemsRows = data.items.map((item, index) => `
            <tr>
                <td style="text-align: center;">${index + 1}</td>
                <td>${item.name}</td>
                <td style="text-align: center;">${item.qty}</td>
                <td style="text-align: right;">${this.currencyPipe.transform(item.rate, 'INR')}</td>
                <td style="text-align: center;">${item.discountPercent || 0}%</td>
                <td style="text-align: right;">${this.currencyPipe.transform(item.amount, 'INR')}</td>
            </tr>
        `).join('');

        const logoUrl = companyInfo?.logoUrl && companyInfo?.logoUrl.startsWith('http') ? companyInfo.logoUrl : '';

        const WindowPrt = window.open('', '', 'left=0,top=0,width=900,height=900,toolbar=0,scrollbars=0,status=0');
        if (!WindowPrt) return;

        WindowPrt.document.write(`
            <html>
                <head>
                    <title>${data.title} - ${data.receiptNo}</title>
                    <style>
                        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; line-height: 1.4; }
                        .header { display: flex; justify-content: space-between; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
                        .logo-section { display: flex; align-items: center; gap: 15px; }
                        .company-logo { width: 70px; height: 70px; object-fit: contain; }
                        .company-name h1 { margin: 0; font-size: 26px; color: #1a56db; font-weight: 800; }
                        .company-name p { margin: 2px 0; font-size: 13px; color: #4b5563; }
                        .doc-title { text-align: right; }
                        .doc-title h2 { margin: 0; color: #1f2937; font-size: 22px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }
                        .doc-title p { margin: 5px 0 0 0; font-size: 16px; font-weight: 700; color: #4b5563; }

                        .info-card { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 30px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
                        .info-group label { font-size: 11px; color: #6b7280; text-transform: uppercase; font-weight: 700; margin-bottom: 4px; display:block; }
                        .info-group .value { font-weight: 700; font-size: 15px; color: #111827; }

                        table { width: 100%; border-collapse: collapse; margin-top: 20px; border: 1px solid #e5e7eb; }
                        th { background: #f3f4f6; padding: 12px 10px; border: 1px solid #e5e7eb; text-align: left; font-size: 11px; text-transform: uppercase; color: #374151; font-weight: 800; }
                        td { padding: 12px 10px; border: 1px solid #e5e7eb; font-size: 13px; color: #1f2937; }
                        
                        .bottom-section { display: flex; justify-content: space-between; margin-top: 40px; }
                        .words-section { flex: 1; padding-right: 40px; }
                        .words-section .value { font-weight: 700; color: #111827; text-transform: capitalize; font-style: italic; font-size: 14px; margin-top: 5px; }

                        .invoice-summary { width: 300px; }
                        .summary-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; border-bottom: 1px dashed #e5e7eb; }
                        .summary-row.grand-total { font-weight: 900; font-size: 18px; color: #1a56db; border-top: 2px solid #1a56db; margin-top: 10px; padding-top: 10px; border-bottom: none; }
                        
                        .footer-note { margin-top: 80px; display: flex; justify-content: space-between; border-top: 1px solid #eee; padding-top: 40px; }
                        .signature-box { text-align: center; min-width: 200px; }
                        .signature-line { border-top: 1px solid #333; margin-bottom: 8px; margin-top: 50px; }

                        @media print { body { padding: 0; } @page { margin: 1cm; } box-shadow: none; }
                    </style>
                </head>
                <body onload="window.print();window.close()">
                     <div class="header">
                        <div class="logo-section">
                            ${logoUrl ? `<img src="${logoUrl}" class="company-logo" alt="Logo">` : ''}
                            <div class="company-name">
                                <h1>${data.companyName}</h1>
                                <p>${data.address}</p>
                                <p>${data.contactInfo}</p>
                            </div>
                        </div>
                        <div class="doc-title">
                             <h2>${data.title}</h2>
                             <p>#${data.receiptNo}</p>
                             <div style="font-size: 13px; font-weight: 600; color: #6b7280; margin-top: 5px;">Date: ${this.datePipe.transform(data.date, 'dd MMM yyyy')}</div>
                        </div>
                    </div>

                    <div class="info-card">
                      <div class="info-group">
                        <label>${data.partyNameLabel}</label>
                        <div class="value">${data.partyName}</div>
                      </div>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th style="text-align: center; width: 30px;">#</th>
                                <th>Product / Description</th>
                                <th style="text-align: center; width: 60px;">Qty</th>
                                <th style="text-align: right; width: 100px;">Rate</th>
                                <th style="text-align: center; width: 60px;">Disc%</th>
                                <th style="text-align: right; width: 120px;">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsRows}
                        </tbody>
                    </table>

                    <div class="bottom-section">
                        <div class="words-section">
                            <p style="font-size: 12px; margin: 0;">Amount in Words:</p>
                            <div class="value">Rupees ${data.amountInWords}</div>
                        </div>
                        <div class="invoice-summary">
                            <div class="summary-row"><span class="label">Sub Total</span><span class="value">₹${data.subTotal || '0.00'}</span></div>
                            ${data.totalDiscount ? `<div class="summary-row" style="color:#ef4444;"><span class="label">Total Discount</span><span class="value">- ₹${data.totalDiscount}</span></div>` : ''}
                            <div class="summary-row"><span class="label">Total Tax</span><span class="value">₹${data.totalTax || '0.00'}</span></div>
                            <div class="summary-row grand-total"><span class="label">Grand Total</span><span class="value">₹${data.grandTotal}</span></div>
                        </div>
                    </div>

                    <div class="footer-note">
                        <div class="signature-box" style="text-align: left;">
                            <p style="font-size: 11px; margin-bottom: 50px;">${data.partyNameLabel} Signature</p>
                            <div class="signature-line" style="width: 180px;"></div>
                        </div>
                        <div class="signature-box">
                            <p style="font-size: 11px; margin-bottom: 50px;">For ${data.companyName}</p>
                            <div class="signature-line"></div>
                            <label style="font-size: 12px; font-weight: 700;">Authorized Signatory</label>
                        </div>
                    </div>
                </body>
            </html>
        `);
        WindowPrt.document.close();
    }
}
