import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../enviornments/environment';
import { ApiService } from '../../../shared/api.service';


// Supplier Interface
export interface Supplier {
    id?: number;
    name?: string;
    phone?: string;
    gstIn?: string;
    address?: string;
    createdBy?: string;
    defaultpricelistId?: string;
    email?: string;
    isActive?: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class SupplierService {
    private api = inject(ApiService);
    private readonly baseUrl = environment.api.supplier; // Use plural 'suppliers' as the gateway base

    // Fetch all suppliers (mapped to api/suppliers/Supplier in gateway)
    getSuppliers(): Observable<Supplier[]> {
        return this.api.get<Supplier[]>('Supplier', this.baseUrl);
    }

    // Add new supplier (mapped to api/suppliers/Supplier in gateway)
    addSupplier(supplier: Supplier): Observable<Supplier> {
        return this.api.post<Supplier>('Supplier', supplier, this.baseUrl);
    }

    // Get supplier by ID (mapped to api/suppliers/Supplier/{id} in gateway)
    getSupplierById(id: number): Observable<any> {
        return this.api.get<any>(`Supplier/${id}`, this.baseUrl);
    }

    getPaged(request: any): Observable<any> {
        return this.api.post<any>(`Supplier/paged`, request, this.baseUrl);
    }

    updateSupplier(id: number, supplier: Supplier): Observable<Supplier> {
        return this.api.put<Supplier>(`Supplier/${id}`, supplier, this.baseUrl);
    }

    deleteSupplier(id: number): Observable<any> {
        return this.api.delete(`Supplier/${id}`, this.baseUrl);
    }
}
