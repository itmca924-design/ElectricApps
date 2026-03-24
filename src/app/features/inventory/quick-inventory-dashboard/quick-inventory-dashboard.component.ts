import { Component, OnInit, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { InventoryService } from '../service/inventory.service';
import { forkJoin, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-quick-inventory-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, MaterialModule],
  templateUrl: './quick-inventory-dashboard.component.html',
  styleUrl: './quick-inventory-dashboard.component.scss'
})
export class QuickInventoryDashboardComponent implements OnInit, OnDestroy {
  private inventoryService = inject(InventoryService);
  private destroy$ = new Subject<void>();

  today = new Date();
  stats = {
    totalQuickPurchase: 0,
    totalQuickSaleCount: 0,
    quickGRNCount: 0,
    unpaidQuickSales: 0
  };

  recentQuickPurchases: any[] = [];
  recentQuickSales: any[] = [];
  loading = true;

  quickActions = [
    { label: 'New Quick Purchase', icon: 'bolt', link: '/app/quick-inventory/purchase/add', color: '#10b981' },
    { label: 'New Quick Sale', icon: 'shopping_basket', link: '/app/quick-inventory/sale/add', color: '#3b82f6' },
    { label: 'Receive GRN', icon: 'list_alt', link: '/app/quick-inventory/grn-list/add', color: '#8b5cf6' },
    { label: 'Check Stock', icon: 'inventory_2', link: '/app/quick-inventory/current-stock', color: '#f59e0b' }
  ];

  ngOnInit() {
    this.inventoryService.inventoryUpdate$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        console.log('🔄 Inventory updated elsewhere. Refreshing dashboard...');
        this.loadDashboardData();
      });

    this.loadDashboardData();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadDashboardData() {
    this.loading = true;
    
    // Fetch Quick Purchase, Quick Sale, and Quick GRN data
    forkJoin({
      purchases: this.inventoryService.getQuickPagedOrders({ 
        pageIndex: 0, 
        pageSize: 5, 
        sortField: 'CreatedDate', 
        sortOrder: 'desc',
        filter: ''
      }),
      sales: this.inventoryService.getQuickPagedSales(1, 5, 'Date', 'desc', ''),
      grns: this.inventoryService.getGRNPagedList('', '', 0, 5, '', true)
    }).subscribe({
      next: (data: any) => {
        // Quick Purchase Mapping
        const purchaseData = data.purchases || {};
        this.stats.totalQuickPurchase = purchaseData.totalRecords || 0;
        this.recentQuickPurchases = (purchaseData.data || []).map((po: any) => ({
          poNumber: po.poNumber || po.PoNumber,
          supplierName: po.supplierName || po.SupplierName,
          date: po.createdAt || po.CreatedDate || po.poDate,
          status: po.status || po.Status
        }));

        // Quick Sale Mapping
        const saleData = data.sales || {};
        this.stats.totalQuickSaleCount = saleData.totalRecords || 0;
        this.recentQuickSales = (saleData.data || []).map((so: any) => ({
          soNumber: so.soNumber || so.sonumber || so.SoNumber,
          customerName: so.customerName || so.CustomerName || 'Walk-in',
          date: so.date || so.createdAt,
          status: so.status || so.Status
        }));
        this.stats.unpaidQuickSales = (saleData.data || []).filter((s:any) => s.paymentStatus?.toLowerCase() !== 'paid').length;

        // Quick GRN Mapping
        const grnData = data.grns || {};
        this.stats.quickGRNCount = grnData.totalCount || 0;
        
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading quick inventory dashboard data', err);
        this.loading = false;
      }
    });
  }

  getStatusColor(status: string): string {
    switch (status?.toLowerCase()) {
      case 'paid': return '#10b981';
      case 'unpaid': return '#ef4444';
      case 'partial': return '#f59e0b';
      case 'confirmed': return '#3b82f6';
      case 'received': return '#10b981';
      default: return '#64748b';
    }
  }
}
