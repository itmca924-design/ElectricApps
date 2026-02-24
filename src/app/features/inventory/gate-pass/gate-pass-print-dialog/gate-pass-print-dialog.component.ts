import { ChangeDetectorRef, Component, Inject, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { GatePassService } from '../services/gate-pass.service';
import { CompanyService } from '../../../company/services/company.service';
import { CompanyProfileDto } from '../../../company/model/company.model';
import { environment } from '../../../../enviornments/environment';
import { GatePass } from '../models/gate-pass.model';

@Component({
  selector: 'app-gate-pass-print-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatDividerModule, MatProgressSpinnerModule],
  templateUrl: './gate-pass-print-dialog.component.html',
  styleUrls: ['./gate-pass-print-dialog.component.scss']
})
export class GatePassPrintDialogComponent implements OnInit {
  private gatePassService = inject(GatePassService);
  private companyService = inject(CompanyService);
  private cdr = inject(ChangeDetectorRef);

  gatePass: GatePass | null = null;
  loading = true;
  companyInfo: CompanyProfileDto | null = null;

  constructor(
    public dialogRef: MatDialogRef<GatePassPrintDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { id: number }
  ) { }

  ngOnInit(): void {
    this.fetchGatePass();
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

  fetchGatePass(): void {
    this.gatePassService.getGatePass(this.data.id).subscribe({
      next: (res) => {
        this.gatePass = res;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error fetching gate pass:', err);
        this.loading = false;
        this.cdr.detectChanges();
      }
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

  getBreakdownItems(): { ref: string, qty: string }[] {
    if (!this.gatePass?.remarks || !this.gatePass.remarks.includes('Breakdown:')) return [];
    try {
      let breakdownStr = this.gatePass.remarks.split('Breakdown:')[1].trim();

      if (breakdownStr.includes('|')) breakdownStr = breakdownStr.split('|')[0].trim();
      if (breakdownStr.includes('\n')) breakdownStr = breakdownStr.split('\n')[0].trim();

      const items = breakdownStr.split(',').filter(x => x.trim() !== '');
      return items.map(item => {
        let ref = item.trim();
        let qty = '';

        // Handle Format 1: "Ref: Qty"
        if (ref.includes(':')) {
          const parts = ref.split(':');
          ref = parts[0]?.trim() || '';
          qty = parts[1]?.trim() || '';
        }
        // Handle Format 2: "Ref (Qty)"
        else if (ref.includes('(') && ref.includes(')')) {
          const start = ref.indexOf('(');
          const end = ref.indexOf(')');
          qty = ref.substring(start + 1, end).trim();
          ref = ref.substring(0, start).trim();
        }

        return { ref, qty };
      });
    } catch (e) {
      console.error('Error parsing breakdown:', e);
      return [];
    }
  }

  print(): void {
    const printContent = document.getElementById('printable-area');
    if (!printContent || !this.gatePass) return;

    const WindowPrt = window.open('', '', 'left=0,top=0,width=900,height=900,toolbar=0,scrollbars=0,status=0');
    if (!WindowPrt) return;

    const companyName = this.companyInfo?.name || 'Reyakat Electronics';
    const logoUrl = this.companyInfo?.logoUrl ? this.getImgUrl(this.companyInfo.logoUrl) : '';

    let addressStr = '';
    if (this.companyInfo?.address) {
      const addr = this.companyInfo.address;
      addressStr = `${addr.addressLine1}, ${addr.addressLine2 ? addr.addressLine2 + ', ' : ''}${addr.city}, ${addr.state} - ${addr.pinCode}`;
    }

    const contactInfo = `Contact: ${this.companyInfo?.primaryPhone || ''} | Email: ${this.companyInfo?.primaryEmail || ''}`;

    WindowPrt.document.write(`
      <html>
        <head>
          <title>Gate Pass - ${this.gatePass.passNo}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; }
            .print-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
            .company-info-wrapper { display: flex; align-items: center; gap: 15px; }
            .company-logo { width: 80px; height: 80px; object-fit: contain; margin-right: 15px; }
            .company-info h1 { margin: 0; color: #1a56db; font-size: 24px; }
            .company-info p { margin: 2px 0; font-size: 14px; color: #4b5563; }
            
            .pass-title { text-align: right; }
            .pass-title h2 { margin: 0; color: #374151; font-size: 20px; text-transform: uppercase; }
            
            .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 30px; }
            .detail-section h3 { font-size: 14px; text-transform: uppercase; color: #6b7280; margin-bottom: 10px; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; }
            .detail-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; }
            .detail-label { font-weight: 600; color: #4b5563; }
            
            .summary-table { width: 100%; border-collapse: collapse; margin: 15px 0; border: 1px solid #e5e7eb; }
            .summary-table th { background: #f9fafb; padding: 10px; border: 1px solid #e5e7eb; text-align: left; font-size: 11px; text-transform: uppercase; color: #4b5563; }
            .summary-table td { padding: 10px; border: 1px solid #e5e7eb; font-size: 13px; color: #111827; }
            .breakdown-table th { background: #f1f5f9; }

            .barcode-area { margin-top: 20px; padding: 15px; border: 1px dashed #ccc; text-align: center; font-size: 12px; color: #999; }
            
            .print-footer { margin-top: 80px; display: flex; justify-content: space-between; }
            .signature { text-align: center; width: 220px; }
            .sig-line { border-top: 1px solid #333; margin-bottom: 5px; }
            .sig-label { font-size: 12px; font-weight: 600; color: #4b5563; }
            
            @media print {
              body { padding: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body onload="window.print();window.close()">
           <div class="print-header">
            <div class="company-info-wrapper">
                ${logoUrl ? '<img src="' + logoUrl + '" class="company-logo" alt="Logo">' : ''}
                <div class="company-info">
                  <h1>${companyName}</h1>
                  <p>${addressStr}</p>
                  <p>${contactInfo}</p>
                </div>
            </div>
            <div class="pass-title">
              <h2>${this.gatePass.passType} GATE PASS</h2>
              <div class="detail-row">
                <span class="detail-label">Pass No:</span>
                <span style="font-weight: bold; color: #1a56db;">${this.gatePass.passNo}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Date/Time:</span>
                <span>${new Date(this.gatePass.gateEntryTime).toLocaleString()}</span>
              </div>
            </div>
          </div>

          ${printContent.innerHTML} 
          
          <div class="print-footer">
            <div class="signature">
              <div class="sig-line"></div>
              <div class="sig-label">Driver Signature</div>
            </div>
            <div class="signature">
              <div class="sig-line"></div>
              <div class="sig-label">Security Officer</div>
            </div>
            <div class="signature">
              <div class="sig-line"></div>
              <div class="sig-label">Authorized Signatory</div>
            </div>
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
