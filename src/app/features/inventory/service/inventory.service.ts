import { Injectable, inject } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { ApiService } from '../../../shared/api.service';
import { PurchaseOrderPayload } from '../models/purchaseorder.model';
import { PriceListItemDto } from '../models/price-list-item.dto';
import { BulkGrnRequest } from '../models/grnbulkrequest.model';

@Injectable({
    providedIn: 'root'
})
export class InventoryService {
    private api = inject(ApiService);
    
    private inventoryUpdateSource = new Subject<void>();
    inventoryUpdate$ = this.inventoryUpdateSource.asObservable();

    notifyInventoryChange() {
        this.inventoryUpdateSource.next();
    }

    getNextPoNumber(): Observable<{ poNumber: string }> {
        return this.api.get<{ poNumber: string }>('purchaseorders/next-number');
    }

    savePoDraft(payload: PurchaseOrderPayload): Observable<any> {
        return this.api.post('PurchaseOrders/save-po', payload);
    }

    getPriceLists(): Observable<any[]> {
        return this.api.get<any[]>('pricelists');
    }

    getPriceListsForDropdown(): Observable<any[]> {
        return this.api.get<any[]>('pricelists/dropdown');
    }

    getPriceListRate(priceListId: string, productId: number): Observable<any> {
        return this.api.get<any>(`pricelists/${priceListId}/product-rate/${productId}`);
    }

    getProductRate(productId: string, priceListId: string): Observable<any> {
        const url = `products/rate?productId=${productId}&priceListId=${priceListId}`;
        return this.api.get(url);
    }

    getPagedOrders(request: any): Observable<any> {
        return this.api.post<any>('PurchaseOrders/get-paged-orders', request);
    }

    getQuickPagedOrders(request: any): Observable<any> {
        return this.api.post<any>('PurchaseOrders/get-paged-orders', { ...request, isQuick: true });
    }

    getQuickPagedPurchases(page: number, size: number, sort: string, order: string, search: string, startDate?: Date, endDate?: Date): Observable<any> {
        const request = {
            pageIndex: page - 1, // 0-based index
            pageSize: size,
            sortField: sort === 'Date' ? 'CreatedDate' : sort,
            sortOrder: order,
            filter: search,
            fromDate: startDate?.toISOString(),
            toDate: endDate?.toISOString(),
            isQuick: true
        };
        return this.api.post<any>('PurchaseOrders/get-paged-orders', request);
    }

    getQuickPagedSales(page: number, size: number, sort: string, order: string, search: string, startDate?: Date, endDate?: Date): Observable<any> {
        const request: any = {
            pageNumber: page,
            pageSize: size,
            sortBy: sort === 'Date' ? 'SoDate' : sort,
            sortOrder: order,
            searchTerm: search,
            isQuick: true
        };
        if (startDate) request.startDate = startDate.toISOString();
        if (endDate) request.endDate = endDate.toISOString();
        
        return this.api.get<any>(`saleorder?${this.api.toQueryString(request)}`);
    }

    deletePurchaseOrder(poId: number): Observable<any> {
        return this.api.delete(`PurchaseOrders/${poId}`);
    }

    deleteSaleOrder(soId: number): Observable<any> {
        return this.api.delete(`saleorder/${soId}`);
    }

    bulkDeletePurchaseOrders(ids: number[]): Observable<any> {
        return this.api.post('PurchaseOrders/bulk-delete-orders', { ids });
    }

    bulkDeletePOItems(poId: number, itemIds: number[]): Observable<any> {
        const payload = {
            purchaseOrderId: poId,
            itemIds: itemIds
        };
        return this.api.post('PurchaseOrders/bulk-delete-items', payload);
    }

    updatePOStatus(id: number, status: string, reason?: string): Observable<any> {
        const payload = {
            Id: id,
            Status: status,
            Reason: reason || null
        };
        return this.api.put('PurchaseOrders/UpdateStatus', payload);
    }

    getPODataForGRN(poIds: string, grnHeaderId: number | null = null, gatePassNo: string | null = null): Observable<any> {
        let url = `GRN/GetPOData?poIds=${poIds}&`;
        if (grnHeaderId) url += `grnHeaderId=${grnHeaderId}&`;
        if (gatePassNo) url += `gatePassNo=${gatePassNo}`;
        url = url.endsWith('&') || url.endsWith('?') ? url.slice(0, -1) : url;
        return this.api.get(url);
    }

    saveGRN(payload: any): Observable<any> {
        return this.api.post('GRN/Save', payload);
    }

    getCurrentStock(
        sortField: string = '',
        sortOrder: string = '',
        pageIndex: number = 0,
        pageSize: number = 10,
        search: string = '',
        startDate: Date | null = null,
        endDate: Date | null = null,
        warehouseId: string | null = null,
        rackId: string | null = null
    ): Observable<any> {
        const request = {
            sortField,
            sortOrder,
            pageIndex,
            pageSize,
            search,
            startDate: startDate?.toISOString(),
            endDate: endDate?.toISOString(),
            warehouseId,
            rackId
        };
        return this.api.get(`stock/current-stock?${this.api.toQueryString(request)}`);
    }

    getGRNPagedList(
        sortField: string = '',
        sortOrder: string = '',
        pageIndex: number = 0,
        pageSize: number = 10,
        search: string = '',
        isQuick: boolean = false
    ): Observable<any> {
        const request = {
            sortField,
            sortOrder,
            pageIndex,
            pageSize,
            search,
            isQuick
        };
        return this.api.get(`grn/grn-list?${this.api.toQueryString(request)}`);
    }

    getPendingPurchaseOrders(): Observable<any[]> {
        return this.api.get<any[]>('PurchaseOrders/pending-pos');
    }

    getPOItemsForGRN(poId: number): Observable<any[]> {
        return this.api.get<any[]>(`PurchaseOrders/po-items/${poId}`);
    }

    getPriceListItems(priceListId: string): Observable<PriceListItemDto[]> {
        return this.api.get<PriceListItemDto[]>(`pricelists/price-list-items/${priceListId}`);
    }

    downloadStockReport(productIds: string[]): Observable<Blob> {
        return this.api.postBlob('Stock/ExportExcel', productIds);
    }

    getGrnPrintData(grnNumber: string): Observable<any> {
        return this.api.get(`GRN/print-data/${grnNumber}`);
    }

    createBulkGrn(data: BulkGrnRequest): Observable<any> {
        return this.api.post('GRN/bulk-create', data);
    }

    quickPurchase(payload: any): Observable<any> {
        return this.api.post('QuickTransaction/quick-purchase', payload);
    }

    quickSale(payload: any): Observable<any> {
        return this.api.post('SaleOrder/save', payload);
    }

    getSuppliers(): Observable<any[]> {
        return this.api.get<any[]>('suppliers/dropdown');
    }

    getCustomers(): Observable<any[]> {
        return this.api.get<any[]>('customers/dropdown');
    }

    getProductById(id: string): Observable<any> {
        return this.api.get<any>(`products/${id}`);
    }

    adjustStock(payload: any): Observable<any> {
        return this.api.post('stock/adjust', payload);
    }

    moveStockToExpiredRack(payload: any): Observable<any> {
        return this.api.post('stock/move-to-expired', payload);
    }

    getDisposedStock(
        sortField: string = '',
        sortOrder: string = '',
        pageIndex: number = 0,
        pageSize: number = 10,
        search: string = '',
        startDate: Date | null = null,
        endDate: Date | null = null,
        warehouseId: string | null = null,
        rackId: string | null = null
    ): Observable<any> {
        const request = {
            sortField,
            sortOrder,
            pageIndex,
            pageSize,
            search,
            startDate: startDate?.toISOString(),
            endDate: endDate?.toISOString(),
            warehouseId,
            rackId
        };
        return this.api.get(`stock/disposed-stock?${this.api.toQueryString(request)}`);
    }
}
