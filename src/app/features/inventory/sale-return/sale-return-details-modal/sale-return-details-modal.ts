import { CommonModule, DatePipe, CurrencyPipe } from '@angular/common';
import { Component, inject, Inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MaterialModule } from '../../../../shared/material/material/material-module';
import { SaleReturnService } from '../services/sale-return.service';
import { CompanyService } from '../../../company/services/company.service';
import { CompanyProfileDto } from '../../../company/model/company.model';
import { environment } from '../../../../enviornments/environment';

@Component({
  selector: 'app-sale-return-details-modal',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  providers: [DatePipe, CurrencyPipe],
  templateUrl: './sale-return-details-modal.html',
  styleUrl: './sale-return-details-modal.scss',
})
export class SaleReturnDetailsModal implements OnInit {

  private srService = inject(SaleReturnService);
  companyInfo: CompanyProfileDto | null = null;
  isPrinting = false;

  constructor(
    public dialogRef: MatDialogRef<SaleReturnDetailsModal>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private companyService: CompanyService,
    private cdr: ChangeDetectorRef,
    private datePipe: DatePipe,
    private currencyPipe: CurrencyPipe
  ) { }

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

  onClose(): void {
    this.dialogRef.close();
  }

  ngOnInit(): void {
    console.log('datas', this.data);
    this.loadCompanyProfile();
  }

  loadCompanyProfile(): void {
    this.companyService.getCompanyProfile().subscribe({
      next: (res) => {
        this.companyInfo = res;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error fetching company profile:', err)
    });
  }

  getImgUrl(url: string | null | undefined): string {
    if (!url) return '';
    if (url.startsWith('data:image') || url.startsWith('http')) {
      return url;
    }
    const cleanUrl = url.startsWith('/') ? url.substring(1) : url;
    return `${environment.CompanyRootUrl}/${cleanUrl}`;
  }

  print() {
    const companyName = this.companyInfo?.name || 'Electric Inventory System';
    const logoUrl = this.companyInfo?.logoUrl ? this.getImgUrl(this.companyInfo.logoUrl) : '';

    // Construct Address String safely
    let addressStr = '';
    if (this.companyInfo?.address) {
      const addr = this.companyInfo.address;
      addressStr = `${addr.addressLine1}, ${addr.addressLine2 ? addr.addressLine2 + ', ' : ''}${addr.city}, ${addr.state} - ${addr.pinCode}`;
    }

    const contactInfo = `Contact: ${this.companyInfo?.primaryPhone || ''} | Email: ${this.companyInfo?.primaryEmail || ''}`;

    // Format dates and currency
    const returnDate = this.datePipe.transform(this.data.returnDate, 'dd MMM yyyy');
    const subTotal = this.currencyPipe.transform(this.data.subTotal || 0, 'INR');
    const totalTax = this.currencyPipe.transform(this.data.totalTax || 0, 'INR');
    const grandTotal = this.currencyPipe.transform(this.data.grandTotal || 0, 'INR');

    const totalInWords = this.numberToWords(Math.round(this.data.grandTotal || 0));

    // Build items table rows
    const itemsRows = this.data.items.map((item: any, index: number) => `
        <tr>
            <td style="text-align: center;">${index + 1}</td>
            <td>${item.productName}</td>
            <td style="text-align: center;">${this.datePipe.transform(item.mfgDate || item.MfgDate || item.manufacturingDate, 'dd-MM-yy') || '—'}</td>
            <td style="text-align: center;">${this.datePipe.transform(item.expDate || item.ExpDate || item.expiryDate, 'dd-MM-yy') || '—'}</td>
            <td style="text-align: center;">${item.qty}</td>
            <td style="text-align: right;">${this.currencyPipe.transform(item.rate, 'INR')}</td>
            <td style="text-align: center;">${item.discountPercent || 0}%</td>
            <td style="text-align: center;">${item.taxPercent}%</td>
            <td style="text-align: right;">${this.currencyPipe.transform(item.total, 'INR')}</td>
        </tr>
    `).join('');

    const WindowPrt = window.open('', '', 'left=0,top=0,width=900,height=900,toolbar=0,scrollbars=0,status=0');
    if (!WindowPrt) return;

    WindowPrt.document.write(`
        <html>
            <head>
                <title>Credit Note - ${this.data.returnNumber}</title>
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

                    .info-card { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 30px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
                    .info-group { display: flex; flex-direction: column; }
                    .info-group label { font-size: 11px; color: #6b7280; text-transform: uppercase; font-weight: 700; margin-bottom: 4px; }
                    .info-group .value { font-weight: 700; font-size: 15px; color: #111827; }

                    table { width: 100%; border-collapse: collapse; margin-top: 20px; border: 1px solid #e5e7eb; }
                    th { background: #f3f4f6; padding: 12px 10px; border: 1px solid #e5e7eb; text-align: left; font-size: 11px; text-transform: uppercase; color: #374151; font-weight: 800; }
                    td { padding: 12px 10px; border: 1px solid #e5e7eb; font-size: 13px; color: #1f2937; }
                    
                    .bottom-section { display: flex; justify-content: space-between; margin-top: 40px; }
                    .words-section { flex: 1; padding-right: 40px; }
                    .words-section p { font-size: 12px; margin: 0; }
                    .words-section .value { font-weight: 700; color: #111827; text-transform: capitalize; font-style: italic; font-size: 14px; margin-top: 5px; }

                    .invoice-summary { width: 300px; }
                    .summary-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; border-bottom: 1px dashed #e5e7eb; }
                    .summary-row:last-child { border-bottom: none; }
                    .summary-row.grand-total { font-weight: 900; font-size: 18px; color: #1a56db; border-top: 2px solid #1a56db; margin-top: 10px; padding-top: 10px; border-bottom: none; }
                    
                    .footer-note { margin-top: 80px; display: flex; justify-content: space-between; border-top: 1px solid #eee; padding-top: 40px; }
                    .signature-box { text-align: center; min-width: 200px; }
                    .signature-line { border-top: 1px solid #333; margin-bottom: 8px; margin-top: 50px; }
                    .signature-box label { font-size: 12px; font-weight: 700; color: #4b5563; }

                    @media print {
                        body { padding: 0px; }
                        .no-print { display: none; }
                        @page { margin: 1cm; }
                    }
                </style>
            </head>
            <body onload="window.print();window.close()">
                 <div class="header">
                    <div class="logo-section">
                        ${logoUrl ? `<img src="${logoUrl}" class="company-logo" alt="Logo">` : ''}
                        <div class="company-name">
                            <h1>${companyName}</h1>
                            <p>${addressStr}</p>
                            <p>${contactInfo}</p>
                        </div>
                    </div>
                    <div class="doc-title">
                         <h2>CREDIT NOTE</h2>
                         <p>#${this.data.returnNumber}</p>
                         <div style="font-size: 13px; font-weight: 600; color: #6b7280; margin-top: 5px;">Date: ${returnDate}</div>
                    </div>
                </div>

                <div class="info-card">
                  <div class="info-group">
                    <label>Customer Name</label>
                    <div class="value">${this.data.customerName || 'N/A'}</div>
                  </div>
                  <div class="info-group">
                    <label>Reference No (SO)</label>
                    <div class="value">${this.data.soNumber || 'N/A'}</div>
                  </div>
                   <div class="info-group">
                    <label>Document Status</label>
                    <div class="value">${this.data.status || 'Confirmed'}</div>
                  </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th style="text-align: center; width: 30px;">#</th>
                            <th>Product Name / Description</th>
                            <th style="text-align: center; width: 80px;">Mfg Date</th>
                            <th style="text-align: center; width: 80px;">Exp Date</th>
                            <th style="text-align: center; width: 60px;">Qty</th>
                            <th style="text-align: right; width: 100px;">Rate</th>
                            <th style="text-align: center; width: 60px;">Disc%</th>
                            <th style="text-align: center; width: 60px;">Tax%</th>
                            <th style="text-align: right; width: 120px;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsRows}
                    </tbody>
                </table>

                <div class="bottom-section">
                    <div class="words-section">
                        <p>Amount in Words:</p>
                        <div class="value">Rupees ${totalInWords}</div>
                    </div>
                    <div class="invoice-summary">
                        <div class="summary-row">
                            <span class="label">Sub Total</span>
                            <span class="value">${subTotal}</span>
                        </div>
                        ${this.data.totalDiscount > 0 ? `
                            <div class="summary-row" style="color: #ef4444;">
                                <span class="label">Total Discount</span>
                                <span class="value">- ${this.currencyPipe.transform(this.data.totalDiscount, 'INR')}</span>
                            </div>
                        ` : ''}
                        <div class="summary-row">
                            <span class="label">Total Tax</span>
                            <span class="value">${totalTax}</span>
                        </div>
                        <div class="summary-row grand-total">
                            <span class="label">Grand Total</span>
                            <span class="value">${grandTotal}</span>
                        </div>
                    </div>
                </div>

                <div class="footer-note">
                    <div class="signature-box" style="text-align: left;">
                        <p style="font-size: 11px; margin-bottom: 50px;">Customer Signature & Seal</p>
                        <div class="signature-line" style="width: 180px;"></div>
                    </div>
                    <div class="signature-box">
                        <p style="font-size: 11px; margin-bottom: 50px;">For ${companyName}</p>
                        <div class="signature-line"></div>
                        <label>Authorized Signatory</label>
                    </div>
                </div>

                <div style="margin-top: 50px; font-size: 10px; color: #9ca3af; text-align: center; border-top: 1px solid #f3f4f6; padding-top: 10px;">
                    This is a computer generated document and does not require a physical signature.
                </div>

            </body>
        </html>
    `);
    WindowPrt.document.close();
  }
}
