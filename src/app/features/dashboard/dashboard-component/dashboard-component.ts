import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { DashboardService } from '../services/dashboard.service';
import { Router } from '@angular/router';
import { ProductService } from '../../master/product/service/product.service';
import { forkJoin, BehaviorSubject } from 'rxjs';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { LoadingService } from '../../../core/services/loading.service';
import { FinanceService } from '../../finance/service/finance.service';
import { CompanyService } from '../../company/services/company.service';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CompanyProfileDto } from '../../company/model/company.model';
import { environment } from '../../../enviornments/environment';

@Component({
  selector: 'app-dashboard-component',
  standalone: true,
  imports: [MaterialModule, CommonModule, BaseChartDirective, ScrollingModule, FormsModule],
  providers: [DecimalPipe],
  templateUrl: './dashboard-component.html',
  styleUrl: './dashboard-component.scss',
})
export class DashboardComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);
  private decimalPipe = inject(DecimalPipe);
  public router = inject(Router);
  private loadingService = inject(LoadingService);

  isExcelLoading = false;
  isPdfLoading = false;
  isDashboardLoading = true;
  currentDate = new Date();
  private productService = inject(ProductService);
  public financeService = inject(FinanceService);
  private companyService = inject(CompanyService);

  companyInfo: CompanyProfileDto | null = null;


  // Stats array with 'hasAlert' property for type safety in HTML
  stats: any[] = [
    {
      title: 'Total Sales',
      value: '₹0',
      icon: 'trending_up',
      color: '#4caf50',
      tooltip: 'Total revenue generated from all completed sale orders'
    },
    {
      title: 'Receivables',
      value: '₹0',
      icon: 'account_balance_wallet',
      color: '#00bcd4',
      tooltip: 'Total amount yet to be collected from customers (Outstanding)'
    },
    {
      title: 'Stock Value',
      value: '₹0',
      icon: 'inventory_2',
      color: '#ff9800',
      subLabel: '0 Units',
      tooltip: 'Total value of current stock (Stock Quantity × Purchase Price)'
    },
    {
      title: 'Payables',
      value: '₹0',
      icon: 'payments',
      color: '#673ab7',
      tooltip: 'Total amount yet to be paid to suppliers (Pending Dues)'
    },
    {
      title: 'Purchase Orders',
      value: '0 Pending',
      icon: 'shopping_cart',
      color: '#2196f3',
      tooltip: 'Purchase orders waiting for delivery or processing'
    },
    {
      title: 'Low Stock',
      value: 'Loading...',
      icon: 'report_problem',
      color: '#f44336',
      hasAlert: false,
      tooltip: 'Items where current stock is less than or equal to minimum stock level'
    }
  ];

  recentActivities: any[] = [];
  page = 1;
  pageSize = 10;
  loadingActivities = false;
  allLoaded = false;

  // ========== Customer Dues Modal State ==========
  isDuesModalOpen = false;
  isDuesLoading = false;
  customerDues: any[] = [];
  duesSearchQuery = '';
  customerDuesCount = 0;
  customerDuesTotalFormatted = '0';

  get filteredCustomerDues(): any[] {
    if (!this.duesSearchQuery.trim()) return this.customerDues;
    const q = this.duesSearchQuery.toLowerCase();
    return this.customerDues.filter(d =>
      (d.customerName || '').toLowerCase().includes(q)
    );
  }

  public lineChartData: ChartConfiguration['data'] = {
    datasets: [
      { data: [], label: 'Sales', borderColor: '#4caf50', backgroundColor: 'rgba(76,175,80,0.1)', fill: true, tension: 0.4 },
      { data: [], label: 'Purchase', borderColor: '#2196f3', backgroundColor: 'rgba(33,150,243,0.1)', fill: true, tension: 0.4 }
    ],
    labels: []
  };

  public donutChartData: ChartConfiguration['data'] = {
    datasets: [{
      data: [0, 0, 0],
      backgroundColor: ['#4caf50', '#2196f3', '#ff9800'],
      hoverOffset: 15,
      borderWidth: 0
    }],
    labels: ['Finished', 'Raw Material', 'Damaged']
  };

  public chartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { padding: 20, usePointStyle: true } }
    }
  };

  constructor(private dashboardService: DashboardService) { }

  ngOnInit(): void {
    this.loadDashboardData();
    this.loadCompanyInfo();
    this.loadCustomerDuesSummary();
  }

  loadCustomerDuesSummary() {
    this.financeService.getPendingCustomerDues().subscribe({
      next: (dues: any[]) => {
        this.customerDues = dues || [];
        this.customerDuesCount = this.customerDues.length;
        const total = this.customerDues.reduce((sum, d) => sum + (d.pendingAmount || 0), 0);
        this.customerDuesTotalFormatted = this.decimalPipe.transform(total, '1.0-0') || '0';
        this.cdr.detectChanges();
      },
      error: () => { /* Silent fail – just show 0 */ }
    });
  }

  loadCompanyInfo() {
    this.companyService.getCompanyProfile().subscribe({
      next: (profile) => this.companyInfo = profile,
      error: (err) => console.error('Failed to load company info for reports:', err)
    });
  }

  loadDashboardData() {
    this.isDashboardLoading = true; // Loader ON
    this.loadingService.setLoading(true); // Global loading ON
    this.cdr.detectChanges();

    // APIs ko ek saath call kar rahe hain
    forkJoin({
      summary: this.dashboardService.getSummary(),
      charts: this.dashboardService.getChartData(),
      activities: this.dashboardService.getRecentMovements(this.page, this.pageSize),
      receivables: this.financeService.getTotalReceivables(),
      payables: this.financeService.getTotalPayables()
    }).subscribe({
      next: (res: any) => {
        // 1. Summary Stats Update
        this.stats[0].value = '₹' + (this.decimalPipe.transform(res.summary.totalSales, '1.0-0') || '0');

        // Receivables
        const recAmt = res.receivables?.totalOutstanding || res.receivables?.totalReceivable || 0;
        this.stats[1].value = '₹' + (this.decimalPipe.transform(recAmt, '1.0-0') || '0');

        // Stock
        this.stats[2].value = '₹' + (this.decimalPipe.transform(res.summary.totalStockValue, '1.0-0') || '0');
        this.stats[2].subLabel = (this.decimalPipe.transform(res.summary.totalStockItems) || '0') + ' Units In Stock';

        // Payables
        const payAmt = res.payables?.totalPending || res.payables?.totalPayable || 0;
        this.stats[3].value = '₹' + (this.decimalPipe.transform(payAmt, '1.0-0') || '0');

        // POs
        this.stats[4].value = (res.summary.pendingPurchaseOrders || 0) + ' Pending';

        // Low Stock
        const lowStockCount = res.summary.lowStockAlertCount || 0;
        this.stats[5].value = lowStockCount + (lowStockCount === 1 ? ' Item' : ' Items');
        this.stats[5].hasAlert = lowStockCount > 0;

        this.stats = [...this.stats];

        // 2. Charts Update
        this.lineChartData.labels = res.charts.labels;
        this.lineChartData.datasets[0].data = res.charts.salesData;
        this.lineChartData.datasets[1].data = res.charts.purchaseData;
        this.donutChartData.datasets[0].data = [
          res.charts.finishedGoods || 0,
          res.charts.rawMaterials || 0,
          res.charts.damagedItems || 0
        ];
        this.lineChartData = { ...this.lineChartData };
        this.donutChartData = { ...this.donutChartData };

        // 3. Recent Activities
        this.recentActivities = res.activities;
        if (res.activities.length < this.pageSize) {
          this.allLoaded = true;
        }

        // Sab kuch load hone ke baad Loader OFF
        this.isDashboardLoading = false;
        this.loadingService.setLoading(false); // Global loading OFF
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Dashboard load error:', err);
        this.isDashboardLoading = false;
        this.loadingService.setLoading(false); // Global loading OFF on error
        this.cdr.detectChanges();
      }
    });
  }

  get hasDonutData(): boolean {
    const data = this.donutChartData.datasets[0].data;
    return data ? data.some(val => (val as number) > 0) : false;
  }

  navigateToLowStockReport() {
    this.router.navigate(['/app/master/products'], {
      queryParams: { filter: 'lowstock' }
    });
  }

  // ========== Customer Dues Modal Methods ==========
  openCustomerDuesModal() {
    this.isDuesModalOpen = true;
    this.duesSearchQuery = '';
    this.loadCustomerDues();
  }

  closeCustomerDuesModal(event: MouseEvent, force = false) {
    const target = event.target as HTMLElement;
    // Only close if clicking on overlay itself OR force=true (close button)
    if (force || target.classList.contains('dues-modal-overlay')) {
      this.isDuesModalOpen = false;
    }
  }

  loadCustomerDues() {
    this.isDuesLoading = true;
    this.financeService.getPendingCustomerDues().subscribe({
      next: (dues: any[]) => {
        this.customerDues = dues || [];
        this.customerDuesCount = this.customerDues.length;
        const total = this.customerDues.reduce((sum, d) => sum + (d.pendingAmount || 0), 0);
        this.customerDuesTotalFormatted = this.decimalPipe.transform(total, '1.0-0') || '0';
        this.isDuesLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Customer Dues load error:', err);
        this.customerDues = [];
        this.isDuesLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  isOverdue(dueDate: string | null): boolean {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  }

  // Company ka WhatsApp number (9540553975) is device pe logged in hai
  // Isi liye jab bhi wa.me link khulega, message IS number se jayega automatically

  sendWhatsAppReminder(due: any) {
    const name = due.customerName || 'Customer';
    const amount = this.decimalPipe.transform(due.pendingAmount, '1.0-0') || '0';
    const company = this.companyInfo?.name || 'Reyakat Electrics';

    // Company Master se dynamic message lo, warna fallback use karo
    const templateMsg = this.companyInfo?.message
      ? this.companyInfo.message
        .replace(/\[Amount\]/g, `₹${amount}`)          // [Amount] placeholder
        .replace(/₹[\d,]+/g, `₹${amount}`)             // ya seedha ₹177 jaisa number
        .replace(/\[Name\]/g, `${name} ji`)
        .replace(/\[Company\]/g, company)
      : `Namaste ${name} ji! 🙏\n\nYe ${company} ki taraf se ek friendly reminder hai.\n\nAapka abhi *₹${amount}* ka payment pending hai.\n\nKripaya jald se jald payment karein.\n\nShukriya! 🙏`;

    const message = encodeURIComponent(templateMsg);
    const customerPhone = (due.phone || '').replace(/\D/g, '');
    const url = customerPhone
      ? `https://web.whatsapp.com/send?phone=91${customerPhone}&text=${message}`
      : `https://web.whatsapp.com/send?text=${message}`;
    window.open(url, '_blank');
  }

  sendBulkWhatsApp() {
    const overdueList = this.filteredCustomerDues;
    if (!overdueList.length) return;

    // Har customer ko individually unka apna amount ke saath message bhejo
    overdueList.forEach((due, index) => {
      setTimeout(() => {
        this.sendWhatsAppReminder(due);
      }, index * 500); // 0.5 sec delay — browser blocking avoid karne ke liye
    });
  }
  exportToExcel() {
    this.isExcelLoading = true; // Spinner start karein

    this.productService.downloadLowStockExcel().subscribe({
      next: (blob: Blob) => {
        this.cdr.detectChanges();
        // 1. Blob se URL create karein
        const url = window.URL.createObjectURL(blob);

        // 2. Ek hidden anchor element banayein
        const a = document.createElement('a');
        a.href = url;

        // 3. File ka naam set karein
        a.download = `LowStockReport_${new Date().getTime()}.xlsx`;

        // 4. Click trigger karke download start karein
        a.click();

        // 5. Cleanup: URL aur element ko remove karein
        window.URL.revokeObjectURL(url);
        a.remove();

        this.isExcelLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Excel export failed:', err);
        this.isExcelLoading = false;
        // Yahan aap toast message ya notification dikha sakte hain
      }
    });
  }
  exportToPdf() {
    this.isPdfLoading = true;
    this.cdr.detectChanges();

    // Fetch low stock products first
    this.productService.getLowStockProducts().subscribe({
      next: (products) => {
        this.generateBrandedPdf(products);
      },
      error: (err) => {
        console.error('PDF data fetch failed:', err);
        this.isPdfLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  private generateBrandedPdf(products: any[]) {
    this.isPdfLoading = true;
    this.cdr.detectChanges();

    const info = this.companyInfo;

    if (info?.logoUrl) {
      const cleanLogoUrl = info.logoUrl.startsWith('/') ? info.logoUrl.substring(1) : info.logoUrl;
      const fullLogoUrl = info.logoUrl.startsWith('http') ? info.logoUrl : `${environment.CompanyRootUrl}/${cleanLogoUrl}`;

      this.fetchImageAsBase64(fullLogoUrl)
        .then(base64Data => {
          this.renderPdfWithBranding(products, info, base64Data);
        })
        .catch(err => {
          console.error('Logo fetching failed:', err);
          this.renderPdfWithBranding(products, info, null);
        });
    } else {
      this.renderPdfWithBranding(products, info, null);
    }
  }

  private async fetchImageAsBase64(url: string): Promise<string> {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      throw e;
    }
  }

  private renderPdfWithBranding(products: any[], info: any, logoBase64: string | null) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // 1. Company Header (Rectangle Accent)
    doc.setFillColor(33, 150, 243); // Material Blue
    doc.rect(0, 0, pageWidth, 40, 'F');

    // 2. Company Identity & Logo
    doc.setTextColor(255, 255, 255);
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, 'PNG', 15, 5, 30, 30);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(24);
        doc.text(info?.name || 'REYAKAT ELECTRONICS', 55, 20);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(info?.tagline || '', 55, 28);
      } catch (e) {
        this.renderHeaderTextOnly(doc, info);
      }
    } else {
      this.renderHeaderTextOnly(doc, info);
    }

    // 3. Contact Details
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    const rightMargin = pageWidth - 15;
    doc.text(`GSTIN: ${info?.gstin || 'N/A'}`, rightMargin, 15, { align: 'right' });
    doc.text(`Email: ${info?.primaryEmail || 'N/A'}`, rightMargin, 23, { align: 'right' });
    doc.text(`Phone: ${info?.primaryPhone || 'N/A'}`, rightMargin, 31, { align: 'right' });

    // 4. Report Title
    doc.setTextColor(33, 37, 41);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('LOW STOCK ALERT REPORT', pageWidth / 2, 55, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, pageWidth / 2, 63, { align: 'center' });

    // 5. Products Table
    const tableData = products.map((p, index) => [
      index + 1,
      p.productName,
      p.sku || 'N/A',
      `${p.currentStock} ${p.unit}`,
      `${p.minStock} ${p.unit}`,
      p.categoryName || 'N/A'
    ]);

    autoTable(doc, {
      startY: 72,
      head: [['Sr.', 'Product Name', 'SKU', 'Current Stock', 'Min. Stock', 'Category']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [33, 150, 243],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center'
      },
      styles: {
        fontSize: 9,
        cellPadding: 4,
        valign: 'middle'
      },
      columnStyles: {
        0: { cellWidth: 15, halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { halign: 'center' },
        3: { fontStyle: 'bold', textColor: [220, 53, 69], halign: 'center' },
        4: { halign: 'center' },
        5: { halign: 'center' }
      },
      didDrawPage: (data) => {
        const str = 'Page ' + doc.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(str, data.settings.margin.left, doc.internal.pageSize.height - 10);
      }
    });

    // 6. Signature
    const lastY = (doc as any).lastAutoTable.finalY || 150;
    const footerY = lastY + 25;
    if (footerY < doc.internal.pageSize.height - 20) {
      doc.setDrawColor(200);
      doc.line(pageWidth - 65, footerY, pageWidth - 15, footerY);
      doc.setFontSize(9);
      doc.setTextColor(50);
      doc.text('Authorized Signatory', pageWidth - 40, footerY + 7, { align: 'center' });
    }

    doc.save(`LowStockReport_${new Date().toISOString().split('T')[0]}.pdf`);
    this.isPdfLoading = false;
    this.cdr.detectChanges();
  }

  private renderHeaderTextOnly(doc: jsPDF, info: any) {
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text(info?.name || 'REYAKAT ELECTRONICS', 15, 20);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(info?.tagline || 'Excellence in Electronics & Electricals', 15, 28);
  }

  onScroll(index: number) {
    // Agar hum list ke end ke kareeb hain (e.g., last 5 items), toh next page load karein
    if (this.recentActivities.length && !this.loadingActivities && !this.allLoaded) {
      const threshold = this.recentActivities.length - 5;
      if (index > threshold) {
        this.loadMoreActivities();
      }
    }
  }

  loadMoreActivities() {
    this.loadingActivities = true;
    this.page++;
    this.dashboardService.getRecentMovements(this.page, this.pageSize).subscribe({
      next: (data) => {
        if (data.length > 0) {
          this.recentActivities = [...this.recentActivities, ...data];
        }

        if (data.length < this.pageSize) {
          this.allLoaded = true;
        }

        this.loadingActivities = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading more activities:', err);
        this.loadingActivities = false;
        this.page--; // Revert page increment on error
      }
    });
  }
}