import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../shared/api.service';

@Injectable({ providedIn: 'root' })
export class SaleOrderService {
    private api = inject(ApiService);

    saveSaleOrder(orderData: any): Observable<any> {
        return this.api.post('SaleOrder/save', orderData);
    }

    deleteSaleOrder(id: number): Observable<any> {
        return this.api.delete(`saleorder/${id}`);
    }

    updateSaleOrder(orderData: any): Observable<any> {
        // Backend 'save' endpoint handles both create and update based on Id
        return this.api.post('SaleOrder/save', orderData);
    }

    exportSaleOrderList(): Observable<Blob> {
        return this.api.getBlob('saleorder/export-list');
    }

    getSaleOrders(page: number, size: number, sort: string, order: string, search: string, startDate?: Date, endDate?: Date): Observable<any> {
        const request: any = {
            pageNumber: page,
            pageSize: size,
            sortBy: sort,
            sortOrder: order,
            searchTerm: search
        };
        if (startDate) request.startDate = startDate.toISOString();
        if (endDate) request.endDate = endDate.toISOString();
        
        return this.api.get<any>(`saleorder?${this.api.toQueryString(request)}`);
    }

    updateSaleOrderStatus(id: number, status: string): Observable<any> {
        return this.api.patch(`saleorder/${id}/status`, { status: status });
    }

    getSaleOrderById(id: number): Observable<any> {
        return this.api.get<any>(`saleorder/${id}`);
    }

    SaleOrderReportDownload(productIds: string[]) {
        return this.api.postBlob('saleorder/export', productIds);
    }


    getOrdersByCustomer(customerId: number): Observable<any[]> {
        return this.api.get<any[]>(`saleorder/orders-by-customer/${customerId}`);
    }

    getSaleOrderItems(saleOrderId: number): Observable<any[]> {
        return this.api.get<any[]>(`SaleOrder/grid-items/${saleOrderId}`);
    }

    getPendingSOs(): Observable<any[]> {
        return this.api.get<any[]>('SaleOrder/pending-sos');
    }
}
