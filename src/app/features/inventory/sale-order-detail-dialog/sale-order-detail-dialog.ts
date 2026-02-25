import { Component, Inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { CommonModule, DatePipe, CurrencyPipe } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { CompanyService } from '../../company/services/company.service';
import { CompanyProfileDto } from '../../company/model/company.model';
import { environment } from '../../../enviornments/environment';

@Component({
  selector: 'app-sale-order-detail-dialog',
  standalone: true,
  imports: [MaterialModule, CommonModule],
  providers: [DatePipe, CurrencyPipe],
  templateUrl: './sale-order-detail-dialog.html',
  styleUrl: './sale-order-detail-dialog.scss',
})
export class SaleOrderDetailDialog implements OnInit {
  companyInfo: CompanyProfileDto | null = null;
  loading = false;

  constructor(
    public dialogRef: MatDialogRef<SaleOrderDetailDialog>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private companyService: CompanyService,
    private cdr: ChangeDetectorRef,
    private datePipe: DatePipe,
    private currencyPipe: CurrencyPipe
  ) { }

  onConfirm() {
    this.dialogRef.close('CONFIRM_ACTION');
  }

  ngOnInit(): void {
    console.log('dialog data', this.data);
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

  print(): void {
    const companyName = this.companyInfo?.name || 'Electric Inventory System';
    const logoUrl = this.companyInfo?.logoUrl ? this.getImgUrl(this.companyInfo.logoUrl) : '';

    // Construct Address String safely
    let addressStr = '';
    if (this.companyInfo?.address) {
      const addr = this.companyInfo.address;
      addressStr = `${addr.addressLine1}, ${addr.addressLine2 ? addr.addressLine2 + ', ' : ''}${addr.city}, ${addr.state} - ${addr.pinCode}`;
    }

    const contactInfo = `Contact: ${this.companyInfo?.primaryPhone || ''} | Email: ${this.companyInfo?.primaryEmail || ''}`;

    // Format dates and currency for the print view since we are constructing HTML manually
    const soDate = this.datePipe.transform(this.data.soDate, 'dd MMM yyyy');
    const subTotal = this.currencyPipe.transform(this.data.subTotal || 0, 'INR');
    const totalTax = this.currencyPipe.transform(this.data.totalTax || 0, 'INR');
    const grandTotal = this.currencyPipe.transform(this.data.grandTotal || 0, 'INR');

    // Build items table rows
    const itemsRows = this.data.items.map((item: any, index: number) => `
        <tr>
            <td style="text-align: center;">${index + 1}</td>
            <td>
              <div>${item.productName}</div>
              ${item.rackName ? `<small style="color: #666; font-size: 10px;">Location: <b>${item.rackName}</b></small>` : ''}
            </td>
            <td style="text-align: center;">${item.qty} <small>(${item.unit || 'Nos'})</small></td>
            <td style="text-align: right;">${this.currencyPipe.transform(item.rate, 'INR')}</td>
            <td style="text-align: center;">${item.discountPercent || 0}%</td>
            <td style="text-align: center;">${item.gstPercent || 0}%</td>
            <td style="text-align: right;">${this.currencyPipe.transform(item.total || (item.qty * item.rate), 'INR')}</td>
        </tr>
    `).join('');

    const WindowPrt = window.open('', '', 'left=0,top=0,width=900,height=900,toolbar=0,scrollbars=0,status=0');
    if (!WindowPrt) return;

    WindowPrt.document.write(`
        <html>
            <head>
                <title>Print Order - ${this.data.soNumber}</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; }
                    .header { display: flex; justify-content: space-between; margin-bottom: 30px; border-bottom: 2px solid #eee; padding-bottom: 20px; }
                    .logo-section { display: flex; align-items: center; gap: 15px; }
                    .company-logo { width: 60px; height: 60px; object-fit: contain; }
                    .company-name h1 { margin: 0; font-size: 24px; color: #1a56db; }
                    .company-name p { margin: 2px 0; font-size: 12px; color: #666; }
                    .doc-title h2 { margin: 0; color: #444; text-transform: uppercase; }

                    .info-card { background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 20px; display: flex; justify-content: space-between; }
                    .info-group { display: flex; flex-direction: column; }
                    .info-group label { font-size: 11px; color: #888; text-transform: uppercase; margin-bottom: 4px; }
                    .info-group .value { font-weight: 600; font-size: 14px; }

                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th { background: #f1f5f9; padding: 10px; text-align: left; font-size: 12px; text-transform: uppercase; color: #555; }
                    td { padding: 10px; border-bottom: 1px solid #eee; font-size: 13px; }
                    
                    .invoice-summary { margin-top: 30px; display: flex; flex-direction: column; align-items: flex-end; }
                    .summary-row { display: flex; justify-content: space-between; width: 250px; padding: 5px 0; }
                    .summary-row.grand-total { font-weight: bold; font-size: 16px; color: #1a56db; border-top: 1px solid #eee; margin-top: 10px; padding-top: 10px; }
                    
                    @media print {
                        .no-print { display: none; }
                        body { -webkit-print-color-adjust: exact; }
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
                         <h2>SALE ORDER</h2>
                         <p>#${this.data.soNumber}</p>
                    </div>
                </div>

                <div class="info-card">
                  <div class="info-group">
                    <label>Customer Name</label>
                    <div class="value">${this.data.customerName || 'N/A'}</div>
                  </div>
                  <div class="info-group">
                    <label>Order Date</label>
                    <div class="value">${soDate}</div>
                  </div>
                  <div class="info-group">
                    <label>Current Status</label>
                    <div class="value">${this.data.status}</div>
                  </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th style="text-align: center;">#</th>
                            <th>Product Name</th>
                            <th style="text-align: center;">Qty</th>
                            <th style="text-align: right;">Rate</th>
                            <th style="text-align: center;">Disc</th>
                            <th style="text-align: center;">GST (%)</th>
                            <th style="text-align: right;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsRows}
                    </tbody>
                </table>

                <div class="invoice-summary">
                    <div class="summary-row">
                        <span class="label">Sub Total</span>
                        <span class="value">${subTotal}</span>
                    </div>
                    <div class="summary-row">
                        <span class="label">Total Tax</span>
                        <span class="value">${totalTax}</span>
                    </div>
                    <div class="summary-row grand-total">
                        <span class="label">Grand Total</span>
                        <span class="value">${grandTotal}</span>
                    </div>
                </div>

            </body>
        </html>
    `);
    WindowPrt.document.close();
  }
}