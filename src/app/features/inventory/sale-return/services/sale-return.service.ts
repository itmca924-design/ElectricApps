import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SaleReturnPagedResponse } from '../models/sale-return.model';
import { CreateSaleReturnDto } from '../models/create-sale-return.model';
import { ApiService } from '../../../../shared/api.service';

@Injectable({
    providedIn: 'root'
})
export class SaleReturnService {
    private api = inject(ApiService);

    // Get Sale Returns List
    getSaleReturns(
        search: string = '',
        pageIndex: number = 0,
        pageSize: number = 10,
        sortField: string = 'ReturnDate',
        sortOrder: string = 'desc',
        fromDate?: Date,
        toDate?: Date,
        status: string = '',
        isQuick: boolean = false
    ): Observable<SaleReturnPagedResponse> {
        const request: any = {
            search,
            status,
            pageIndex,
            pageSize,
            sortField,
            sortOrder,
            isQuick
        };

        if (fromDate) request.fromDate = fromDate.toISOString();
        if (toDate) request.toDate = toDate.toISOString();

        return this.api.get<SaleReturnPagedResponse>(`SaleReturn/list?${this.api.toQueryString(request)}`);
    }

    // Create Sale Return
    saveSaleReturn(data: CreateSaleReturnDto): Observable<any> {
        return this.api.post('SaleReturn/create', data);
    }

    deleteSaleReturn(id: number): Observable<any> {
        return this.api.delete(`SaleReturn/delete/${id}`);
    }

    // Get Sale Return Details by ID
    getSaleReturnById(id: number): Observable<any> {
        return this.api.get<any>(`SaleReturn/details/${id}`);
    }

    // Get Sale Orders/Invoices for a specific customer
    getSaleOrders(customerId: number): Observable<any[]> {
        return this.api.get<any[]>(`SaleReturn/sale-orders/${customerId}`);
    }

    // Get Items for a specific Sale Order
    getSaleOrderItems(soId: number): Observable<any[]> {
        return this.api.get<any[]>(`SaleReturn/sale-order-items/${soId}`);
    }

    // Export to Excel
    downloadExcel(fromDate?: string, toDate?: string): Observable<Blob> {
        const request: any = {};
        if (fromDate) request.fromDate = fromDate;
        if (toDate) request.toDate = toDate;

        return this.api.getBlob(`SaleReturn/export-excel?${this.api.toQueryString(request)}`);
    }

    getPrintData(id: number): Observable<any> {
        return this.api.get(`SaleReturn/print-data/${id}`);
    }

    printCreditNote(id: number): Observable<Blob> {
        return this.api.getBlob(`SaleReturn/print/${id}`);
    }

    getDashboardSummary(isQuick: boolean = false): Observable<any> {
        return this.api.get(`SaleReturn/summary?isQuick=${isQuick}`);
    }

    getPendingSaleReturns(): Observable<any[]> {
        return this.api.get<any[]>('SaleReturn/pending-returns');
    }

    bulkInward(ids: number[]): Observable<any> {
        return this.api.post('SaleReturn/bulk-inward', ids);
    }
}

