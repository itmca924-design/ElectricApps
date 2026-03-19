import { Injectable, inject } from '@angular/core';
import { LowStockProductDto, Product } from '../model/product.model';
import { Observable } from 'rxjs';
import { ApiService } from '../../../../shared/api.service';
import { GridResponse } from '../../../../shared/models/grid-response.model';
import { GridRequest } from '../../../../shared/models/grid-request.model';

@Injectable({ providedIn: 'root' })
export class ProductService {
    private api = inject(ApiService);

    /**
     * 🔍 Search Products for Autocomplete
     */
    searchProducts(term: string): Observable<Product[]> {
        if (!term || term.trim() === '') {
            return new Observable(observer => observer.next([]));
        }
        return this.api.get<Product[]>(`products/search?term=${encodeURIComponent(term)}`);
    }

    create(payload: Product): Observable<any> {
        return this.api.post('products', payload);
    }

    update(id: string, payload: Product): Observable<any> {
        return this.api.put(`products/${id}`, payload);
    }

    delete(id: string): Observable<any> {
        return this.api.delete(`products/${id}`);
    }

    getAll(): Observable<Product[]> {
        return this.api.get('products');
    }

    getPaged(request: GridRequest): Observable<GridResponse<Product>> {
        return this.api.get<GridResponse<Product>>(
            `products/paged?${this.api.toQueryString(request)}`
        );
    }

    getById(id: string): Observable<Product> {
        return this.api.get<Product>(`products/${id}`);
    }

    deleteMany(ids: string[]): Observable<any> {
        return this.api.post<any>(`products/bulk-delete`, ids);
    }

    searchProductsData(term: string): Observable<any[]> {
        return this.api.get<any[]>(`products/search?term=${term}`);
    }

    getLowStockProducts(): Observable<LowStockProductDto[]> {
        return this.api.get<LowStockProductDto[]>('products/low-stock');
    }

    downloadLowStockExcel(): Observable<Blob> {
        return this.api.getBlob('products/export-low-stock');
    }

    downloadLowStockPdf(): Observable<Blob> {
        return this.api.getBlob('products/export-low-stock-pdf');
    }

    uploadExcel(file: File): Observable<any> {
        const formData = new FormData();
        formData.append('file', file);
        return this.api.post('products/upload-excel', formData);
    }

    checkDuplicate(name: string, id: string | null = null): Observable<{ exists: boolean, message: string }> {
        let url = `products/check-duplicate?name=${encodeURIComponent(name)}`;
        if (id) {
            url += `&excludeId=${id}`;
        }
        return this.api.get<{ exists: boolean, message: string }>(url);
    }

    /**
     * 🔄 Trigger Stock Synchronization across all products
     */
    syncStock(): Observable<any> {
        return this.api.post('stock/sync', null);
    }
}

