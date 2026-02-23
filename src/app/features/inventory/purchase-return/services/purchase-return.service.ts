import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../../shared/api.service';


@Injectable({
    providedIn: 'root'
})
export class PurchaseReturnService {
    private api = inject(ApiService);

    // Supplier ke rejected items mangwane ke liye
    GetSuppliersForPurchaseReturnAsync(): Observable<any[]> {
        return this.api.get<any[]>('PurchaseReturn/suppliers-purchase-return');
    }

    // 2. Supplier select hone ke baad items ke liye
    getRejectedItems(supplierId: number): Observable<any[]> {
        return this.api.get<any[]>(`PurchaseReturn/rejected-items/${supplierId}`);
    }

    getReceivedStock(supplierId: number): Observable<any[]> {
        return this.api.get<any[]>(`PurchaseReturn/get-received-stock/${supplierId}`);
    }

    // Naya Return save karne ke liye [cite: 2026-02-03]
    savePurchaseReturn(data: any): Observable<any> {
        return this.api.post<any>('PurchaseReturn/create', data);
    }

    getPurchaseReturns(
        search: string = '',
        pageIndex: number = 0,
        pageSize: number = 10,
        fromDate?: string,
        toDate?: string,
        sortField: string = 'ReturnDate',
        sortOrder: string = 'desc',
        status: string = ''
    ): Observable<any> {
        const request: any = {
            filter: search,
            pageIndex,
            pageSize,
            sortField,
            sortOrder,
            status
        };

        if (fromDate) request.fromDate = fromDate;
        if (toDate) request.toDate = toDate;

        return this.api.get(`PurchaseReturn/list?${this.api.toQueryString(request)}`);
    }

    getPurchaseReturnById(id: number): Observable<any> {
        return this.api.get<any>(`PurchaseReturn/details/${id}`);
    }

    downloadExcel(fromDate?: string, toDate?: string): Observable<Blob> {
        const request: any = {};
        if (fromDate) request.fromDate = fromDate;
        if (toDate) request.toDate = toDate;

        return this.api.getBlob(`PurchaseReturn/export-excel?${this.api.toQueryString(request)}`);
    }

    getPendingPRs(): Observable<any[]> {
        return this.api.get<any[]>('PurchaseReturn/pending-prs');
    }

    bulkOutward(ids: string[]): Observable<any> {
        return this.api.post('PurchaseReturn/bulk-outward', ids);
    }

    getSummary(): Observable<any> {
        return this.api.get('PurchaseReturn/summary');
    }
}
