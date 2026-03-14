import { ChangeDetectorRef, Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { InventoryService } from '../service/inventory.service';
import { CompanyService } from '../../company/services/company.service';
import { CompanyProfileDto } from '../../company/model/company.model';
import { environment } from '../../../enviornments/environment';

@Component({
  selector: 'app-grn-print-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatDividerModule, MatProgressSpinnerModule],
  templateUrl: './grn-print-dialog.component.html',
  styleUrls: ['./grn-print-dialog.component.scss']
})
export class GrnPrintDialogComponent implements OnInit {
  grnData: any;
  loading = true;
  companyInfo: CompanyProfileDto | null = null;

  constructor(
    public dialogRef: MatDialogRef<GrnPrintDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { grnNo: string },
    private inventoryService: InventoryService,
    private companyService: CompanyService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.fetchPrintData();
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

  fetchPrintData(): void {
    this.inventoryService.getGrnPrintData(this.data.grnNo).subscribe({
      next: (res: any) => {
        this.grnData = res;
        console.log('--- GRN PRINT DEBUG START ---');
        console.log('Header Data:', {
          grnNumber: res.grnNumber,
          subTotal: res.subTotal,
          totalTaxAmount: res.totalTaxAmount,
          totalAmount: res.totalAmount
        });
        console.log('Items List:');
        console.table(res.items);
        console.log('--- GRN PRINT DEBUG END ---');
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Error fetching GRN print data:', err);
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  print(): void {
    if (!this.grnData || !this.companyInfo) return;

    const WindowPrt = window.open('', '', 'left=0,top=0,width=900,height=900,toolbar=0,scrollbars=0,status=0');
    if (!WindowPrt) return;

    const companyName = this.companyInfo.name || 'Electric Inventory System';
    const logoUrl = this.companyInfo.logoUrl ? this.getImgUrl(this.companyInfo.logoUrl) : '';
    
    // Construct Address String safely
    let addressStr = '';
    if (this.companyInfo.address) {
      const addr = this.companyInfo.address;
      addressStr = `${addr.addressLine1 || ''}${addr.addressLine2 ? ', ' + addr.addressLine2 : ''}, ${addr.city || ''}, ${addr.state || ''} - ${addr.pinCode || ''}`;
    }

    const contactInfo = `Contact: ${this.companyInfo.primaryPhone || ''} | Email: ${this.companyInfo.primaryEmail || ''}`;
    
    // Construct Items Table Rows
    const itemRows = (this.grnData.items || []).map((item: any, index: number) => `
      <tr>
        <td>${index + 1}</td>
        <td>${item.productName || ''}</td>
        <td>${item.sku || ''}</td>
        <td class="text-right">${item.orderedQty || 0}</td>
        <td class="text-right">${(item.receivedQty || 0) - (item.rejectedQty || 0)}</td>
        <td class="text-right">₹${(item.unitRate || 0).toFixed(2)}</td>
        <td class="text-right">${item.discountPercent || 0}%</td>
        <td class="text-right">${item.gstPercentage || 0}%</td>
        <td class="text-right">₹${(item.total || 0).toFixed(2)}</td>
      </tr>
    `).join('');

    const subTotal = (this.grnData.subTotal || this.grnData.SubTotal || 0);
    const taxAmount = (this.grnData.totalTaxAmount || this.grnData.TotalTaxAmount || 0);
    const totalAmount = (this.grnData.totalAmount || this.grnData.TotalAmount || (subTotal + taxAmount));

    WindowPrt.document.write(`
      <html>
        <head>
          <title>Print GRN - ${this.grnData.grnNumber}</title>
          <style>
            body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #1e293b; line-height: 1.5; }
            .header { display: flex; justify-content: space-between; border-bottom: 3px solid #1e293b; padding-bottom: 20px; margin-bottom: 30px; }
            .company-info-wrapper { display: flex; align-items: center; gap: 20px; }
            .logo { width: 80px; height: 80px; object-fit: contain; }
            .company-info h1 { margin: 0; color: #2563eb; font-size: 26px; }
            .company-info p { margin: 2px 0; font-size: 14px; color: #64748b; }
            
            .grn-info { text-align: right; }
            .grn-info h2 { margin: 0 0 10px 0; font-size: 22px; font-weight: 800; }
            .info-row { display: flex; justify-content: flex-end; gap: 10px; font-size: 14px; margin-bottom: 4px; }
            .info-label { font-weight: 700; color: #475569; }
            
            .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 30px; }
            .detail-section h3 { font-size: 13px; text-transform: uppercase; color: #94a3b8; border-bottom: 1px dashed #e2e8f0; padding-bottom: 5px; margin-bottom: 10px; }
            .detail-row { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 6px; }
            .detail-label { font-weight: 700; color: #475569; }
            
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #475569; }
            td { border: 1px solid #e2e8f0; padding: 12px; font-size: 14px; }
            .text-right { text-align: right; }
            
            .totals { margin-top: 30px; display: flex; justify-content: flex-end; }
            .totals-table { width: 280px; }
            .total-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dotted #e2e8f0; font-size: 14px; }
            .grand-total { font-weight: 800; font-size: 18px; color: #2563eb; border-top: 2px solid #2563eb; padding-top: 10px; border-bottom: none; }
            
            .footer { margin-top: 60px; display: flex; justify-content: space-between; }
            .sig { text-align: center; width: 200px; }
            .sig-line { border-bottom: 1px solid #94a3b8; margin-bottom: 8px; }
            .sig p { margin: 0; font-size: 12px; color: #64748b; }
            
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body onload="setTimeout(function(){window.print();window.close();}, 500)">
          <div class="header">
            <div class="company-info-wrapper">
              ${logoUrl ? `<img src="${logoUrl}" class="logo">` : ''}
              <div class="company-info">
                <h1>${companyName}</h1>
                <p>${addressStr}</p>
                <p>${contactInfo}</p>
              </div>
            </div>
            <div class="grn-info">
              <h2>GOODS RECEIVED NOTE</h2>
              <div class="info-row"><span class="info-label">GRN No:</span><span>${this.grnData.grnNumber || ''}</span></div>
              <div class="info-row"><span class="info-label">Date:</span><span>${new Date(this.grnData.receivedDate).toLocaleDateString(undefined, { day:'2-digit', month:'short', year:'numeric' })}</span></div>
            </div>
          </div>
          
          <div class="details-grid">
            <div class="detail-section">
              <h3>Supplier Details</h3>
              <div class="detail-row"><span class="detail-label">Name:</span><span>${this.grnData.supplierName || '--'}</span></div>
              <div class="detail-row"><span class="detail-label">PO Reference:</span><span>${this.grnData.poNumber || this.grnData.purchaseOrderId || '--'}</span></div>
            </div>
            <div class="detail-section">
              <h3>Other Info</h3>
              <div class="detail-row"><span class="detail-label">Status:</span><span>${this.grnData.status || '--'}</span></div>
              <div class="detail-row"><span class="detail-label">Remarks:</span><span>${this.grnData.remarks || '--'}</span></div>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Product Name</th>
                <th>SKU</th>
                <th class="text-right">Ordered</th>
                <th class="text-right">Received</th>
                <th class="text-right">Rate</th>
                <th class="text-right">Disc%</th>
                <th class="text-right">GST%</th>
                <th class="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
          </table>
          
          <div class="totals">
            <div class="totals-table">
              <div class="total-row"><span>Sub-total</span><span>₹${subTotal.toFixed(2)}</span></div>
              <div class="total-row"><span>Tax (GST)</span><span>₹${taxAmount.toFixed(2)}</span></div>
              <div class="total-row grand-total"><span>TOTAL</span><span>₹${totalAmount.toFixed(2)}</span></div>
            </div>
          </div>
          
          <div class="footer">
            <div class="sig"><div class="sig-line"></div><p>Authorized Signature</p></div>
            <div class="sig"><div class="sig-line"></div><p>Store Keeper Signature</p></div>
          </div>
        </body>
      </html>
    `);
    WindowPrt.document.close();
    WindowPrt.focus();
  }

  close(): void {
    this.dialogRef.close();
  }
}
