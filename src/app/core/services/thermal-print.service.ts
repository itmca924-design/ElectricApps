import { Injectable } from '@angular/core';
import { DatePipe } from '@angular/common';

export interface ThermalReceiptData {
  title: string;
  companyName: string;
  address: string;
  contactInfo: string;
  gstin?: string;
  receiptNoLabel: string;
  receiptNo: string;
  date: string;
  partyNameLabel: string;
  partyName: string;
  items: Array<{
    name: string;
    qty: number;
    rate: number;
    discountPercent?: number;
    taxPercent?: number;
    amount: number;
  }>;
  subTotal?: string;
  totalDiscount?: string;
  totalTax?: string;
  grandTotal: string;
  amountInWords?: string;
  roundOff?: string;
  footerMessage?: string;
  savingsInfo?: {
    totalPcs: number;
    mrpTotal: number;
    totalSaving: number;
  };
}

@Injectable({ providedIn: 'root' })
export class ThermalPrintService {
  private datePipe = new DatePipe('en-US');
  
  constructor() {}

  printReceipt(data: ThermalReceiptData) {
    const itemsHtml = data.items.map((item, index) => {
      const discountTxt = item.discountPercent ? `${item.discountPercent}%` : '-';
      return `
        <tr><td colspan="5" class="item-name">${index + 1}. ${item.name}</td></tr>
        <tr class="item-details">
           <td></td> <!-- SN space -->
           <td style="text-align: center;">${item.qty}</td>
           <td style="text-align: right;">${item.rate.toFixed(2)}</td>
           <td style="text-align: center;">${discountTxt}</td>
           <td style="text-align: right;">${item.amount.toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    const currentDateTime = this.datePipe.transform(new Date(), 'dd-MM-yyyy hh:mm a');

    const amountInWordsHtml = data.amountInWords ? `<div class="amount-words">Rupees ${data.amountInWords}</div>` : '';

    const savingsHtml = data.savingsInfo ? `
        <div class="savings-container">
            <table>
                <tr>
                    <td>No Of Total Pcs.</td>
                    <td style="text-align: right;">${data.savingsInfo.totalPcs}</td>
                </tr>
                <tr>
                    <td>MRP Total</td>
                    <td style="text-align: right;">${data.savingsInfo.mrpTotal.toFixed(2)}</td>
                </tr>
                <tr>
                    <td>Total Saving Amt.</td>
                    <td style="text-align: right;">${data.savingsInfo.totalSaving.toFixed(2)}</td>
                </tr>
            </table>
        </div>
    ` : '';

    const printContent = `
      <html>
      <head>
        <title>${data.title} - ${data.receiptNo}</title>
        <style>
          @page { margin: 0; }
          body { 
            font-family: 'Courier New', Courier, monospace; 
            width: 80mm; 
            margin: auto; 
            padding: 5mm; 
            font-size: 12px;
            color: #000;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .font-bold { font-weight: bold; }
          
          .header h2 { margin: 0; padding: 0; font-size: 16px; text-transform: uppercase; }
          .header .address { font-size: 10px; margin: 3px 0; }
          .header .contact { font-size: 10px; }
          
          .divider { border-bottom: 1px dashed #000; margin: 5px 0; }
          
          .info-row { display: flex; justify-content: space-between; font-size: 11px; }
          .info-col { flex: 1; }
          
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th { text-align: center; border-bottom: 1px dashed #000; border-top: 1px dashed #000; padding: 3px 0; }
          .item-name { padding-top: 5px; font-weight: bold; }
          .item-details td { padding-bottom: 3px; }
          
          .totals-table { width: 100%; font-size: 12px; margin-top: 5px; }
          .totals-table td { padding: 2px 0; }
          
          .net-amount-box { 
            border: 1.5px solid #000; 
            padding: 3px; 
            margin-top: 5px; 
            font-size: 14px; 
            font-weight: bold; 
            display: flex; 
            justify-content: space-between; 
          }
          
          .amount-words { font-size: 10px; margin-top: 5px; font-style: italic; border-bottom: 1px dashed #000; padding-bottom: 5px;}
          
          .savings-container { font-size: 11px; margin-top: 5px; border-bottom: 1px dashed #000; padding-bottom: 5px;}
          
          .footer { text-align: center; font-size: 10px; margin-top: 10px; }
          
          /* Hide button during print */
          @media print {
            .no-print { display: none; }
          }
        </style>
      </head>
      <body onload="window.print();window.close()">
      
        <div class="header text-center">
            <div style="font-size: 10px; margin-bottom: 3px;">${data.title}</div>
            <h2>${data.companyName}</h2>
            <div class="address">${data.address}</div>
            <div class="contact">${data.contactInfo}</div>
            ${data.gstin ? `<div class="contact font-bold">GSTIN: ${data.gstin}</div>` : ''}
        </div>
        
        <div class="divider"></div>
        
        <div class="info-row">
            <div class="info-col">
                <div>${data.receiptNoLabel}: ${data.receiptNo}</div>
                <div>${data.partyNameLabel}: ${data.partyName}</div>
            </div>
            <div class="info-col text-right">
                <div>Date: ${currentDateTime}</div>
            </div>
        </div>
        
        <div class="divider"></div>
        
        <table>
            <thead>
                <tr>
                    <th style="width: 10%;">S.N</th>
                    <th style="width: 20%;">Qty</th>
                    <th style="width: 25%; text-align: right;">Rate</th>
                    <th style="width: 20%;">Dsc%</th>
                    <th style="width: 25%; text-align: right;">Amt</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHtml}
            </tbody>
        </table>
        
        <div class="divider"></div>
        
        <table class="totals-table">
            ${data.subTotal ? `<tr><td>Sub Total:</td><td class="text-right">${data.subTotal}</td></tr>` : ''}
            ${data.totalDiscount ? `<tr><td>Discount:</td><td class="text-right">-${data.totalDiscount}</td></tr>` : ''}
            ${data.totalTax ? `<tr><td>Tax:</td><td class="text-right">${data.totalTax}</td></tr>` : ''}
            ${data.roundOff ? `<tr><td>Round Off:</td><td class="text-right">${data.roundOff}</td></tr>` : ''}
        </table>
        
        <div class="net-amount-box">
            <span>Net Amount:</span>
            <span>${data.grandTotal}</span>
        </div>
        
        ${amountInWordsHtml}
        
        ${savingsHtml}
        
        <div class="footer">
            <div>${data.footerMessage || 'Thank You for Business! Visit Again.'}</div>
        </div>

      </body>
      </html>
    `;

    const WindowPrt = window.open('', '', 'left=0,top=0,width=400,height=600,toolbar=0,scrollbars=0,status=0');
    if (WindowPrt) {
        WindowPrt.document.write(printContent);
        WindowPrt.document.close();
    }
  }
}
