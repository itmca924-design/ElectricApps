import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '../../../shared/api.service';
import { PurchaseOrderPayload } from '../models/purchaseorder.model';
import { PriceListItemDto } from '../models/price-list-item.dto';
import { BulkGrnRequest } from '../models/grnbulkrequest.model';



@Injectable({
    providedIn: 'root'
})
export class InventoryService {
    private api = inject(ApiService);

    getNextPoNumber(): Observable<{ poNumber: string }> {
        return this.api.get<{ poNumber: string }>('purchaseorders/next-number');
    }

    // PO Save karne ke liye
    savePoDraft(payload: PurchaseOrderPayload): Observable<any> {
        return this.api.post('PurchaseOrders/save-po', payload);
    }


    // 1. Saari active Price Lists load karne ke liye
    getPriceLists(): Observable<any[]> {
        return this.api.get<any[]>('pricelists');
    }

    getPriceListsForDropdown(): Observable<any[]> {
        return this.api.get<any[]>('pricelists/dropdown');
    }

    // 2. Kisi specific Price List se product ka rate aur discount nikalne ke liye
    getPriceListRate(priceListId: string, productId: number): Observable<any> {
        return this.api.get<any>(`pricelists/${priceListId}/product-rate/${productId}`);
    }

    /**
   * Price List ke basis par product ka rate fetch karne ke liye
   * @param productId - Selected Product ki ID
   * @param priceListId - Selected Price List ki ID
   */
    getProductRate(productId: string, priceListId: string): Observable<any> {
        const url = `products/rate?productId=${productId}&priceListId=${priceListId}`;
        return this.api.get(url);
    }

    // purchase-order.service.ts
    getPagedOrders(request: any): Observable<any> {
        return this.api.post<any>('PurchaseOrders/get-paged-orders', request);
    }



    /**
     * 2. Delete Single Purchase Order (From Grid/List)
     * Method: DELETE
     * Purpose: Poore Purchase Order record ko database se khatam karna
     */
    deletePurchaseOrder(poId: number): Observable<any> {
        return this.api.delete(`PurchaseOrders/${poId}`);
    }



    bulkDeletePurchaseOrders(ids: number[]): Observable<any> {
        return this.api.post('PurchaseOrders/bulk-delete-orders', { ids });
    }

    /**
     * 1. Bulk Delete Items (From Entry Screen)
     * Method: POST
     * Purpose: PO ke andar se selected products ko delete karna
     */
    bulkDeletePOItems(poId: number, itemIds: number[]): Observable<any> {
        const payload = {
            purchaseOrderId: poId,
            itemIds: itemIds
        };
        return this.api.post('PurchaseOrders/bulk-delete-items', payload);
    }

    /** * PO Status update karne ke liye nullable reason parameter ke sath [cite: 2026-01-22]
   */
    updatePOStatus(id: number, status: string, reason?: string): Observable<any> {
        const payload = {
            Id: id,
            Status: status,
            Reason: reason || null
        };

        return this.api.put('PurchaseOrders/UpdateStatus', payload);
    }

    // PO Data pick karne ke liye
    getPODataForGRN(poIds: string, grnHeaderId: number | null = null, gatePassNo: string | null = null): Observable<any> {
        let url = `GRN/GetPOData?poIds=${poIds}&`;
        if (grnHeaderId) url += `grnHeaderId=${grnHeaderId}&`;
        if (gatePassNo) url += `gatePassNo=${gatePassNo}`;
        // Clean up trailing & or ?
        url = url.endsWith('&') || url.endsWith('?') ? url.slice(0, -1) : url;
        return this.api.get(url);
    }

    // GRN save aur stock update ke liye (CQRS Command)
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

    /**
   * GRN List fetch karne ke liye (with Paging, Sorting, Searching)
   *
   */
    getGRNPagedList(
        sortField: string = '',
        sortOrder: string = '',
        pageIndex: number = 0,
        pageSize: number = 10,
        search: string = ''
    ): Observable<any> {
        const request = {
            sortField,
            sortOrder,
            pageIndex,
            pageSize,
            search
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

    /**
   * Multiple Approved POs se Bulk mein GRN create karne ke liye
   * @param data { purchaseOrderIds: number[], createdBy: string }
   */
    createBulkGrn(data: BulkGrnRequest): Observable<any> {
        return this.api.post('GRN/bulk-create', data);
    }
}
