import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { InventoryService } from '../service/inventory.service';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-inventory-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, MaterialModule],
  templateUrl: './inventory-dashboard-component.html',
  styleUrl: './inventory-dashboard-component.scss'
})
export class InventoryDashboardComponent implements OnInit {
  private inventoryService = inject(InventoryService);

  today = new Date();
  stats = {
    totalItems: 0,
    lowStockCount: 0,
    pendingPOs: 0,
    recentGRNs: 0,
    expiringSoon: 0
  };

  recentPOs: any[] = [];
  recentGRNs: any[] = [];
  loading = true;

  quickActions = [
    { label: 'New Purchase Order', icon: 'add_shopping_cart', link: '/app/inventory/polist/add', color: '#3b82f6' },
    { label: 'Receive Inventory (GRN)', icon: 'input', link: '/app/inventory/grn-list/add', color: '#10b981' },
    { label: 'Quick Sale', icon: 'point_of_sale', link: '/app/quick-inventory/quick-sale', color: '#8b5cf6' },
    { label: 'Check Stock', icon: 'inventory', link: '/app/inventory/current-stock', color: '#f59e0b' }
  ];

  ngOnInit() {
    this.loadDashboardData();
  }

  loadDashboardData() {
    this.loading = true;
    
    // Fetch multiple data points for the dashboard
    forkJoin({
      stock: this.inventoryService.getCurrentStock('', '', 0, 5),
      grns: this.inventoryService.getGRNPagedList('', '', 0, 5),
      pos: this.inventoryService.getPagedOrders({ 
        pageIndex: 0, 
        pageSize: 5, 
        sortField: 'CreatedDate', 
        sortOrder: 'desc',
        filter: ''
      })
    }).subscribe({
      next: (data: any) => {
        // Stock Mapping
        const stockData = data.stock || {};
        this.stats.totalItems = stockData.totalCount || stockData.TotalCount || 0;
        const stockItems = stockData.items || stockData.Items || [];
        this.stats.lowStockCount = stockItems.filter((i: any) => i.availableQuantity <= (i.lowStockThreshold || 0)).length;

        // PO Mapping
        const poData = data.pos || {};
        this.stats.pendingPOs = poData.totalRecords || poData.TotalRecords || poData.totalCount || 0;
        const rawPOs = poData.data || poData.Data || poData.items || poData.Items || [];
        this.recentPOs = rawPOs.map((po: any) => ({
          poNumber: po.poNumber || po.PoNumber,
          supplierName: po.supplierName || po.SupplierName,
          date: po.createdAt || po.CreatedDate || po.poDate,
          status: po.status || po.Status
        }));

        // GRN Mapping
        const grnData = data.grns || {};
        this.stats.recentGRNs = grnData.totalCount || grnData.TotalCount || 0;
        const rawGRNs = grnData.items || grnData.Items || [];
        this.recentGRNs = rawGRNs.map((grn: any) => ({
          grnNo: grn.grnNo || grn.GrnNo || grn.grnNumber,
          refPO: grn.refPO || grn.RefPO || grn.poNumber,
          date: grn.receivedDate || grn.createdAt,
          warehouseName: grn.warehouseName || grn.WarehouseName || 'Main Store'
        }));
        
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading inventory dashboard data', err);
        this.loading = false;
      }
    });
  }

  getStatusColor(status: string): string {
    switch (status?.toLowerCase()) {
      case 'pending': return '#f59e0b';
      case 'completed': return '#10b981';
      case 'cancelled': return '#ef4444';
      case 'draft': return '#64748b';
      default: return '#3b82f6';
    }
  }
}
