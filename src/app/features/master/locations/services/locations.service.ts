import { Injectable } from '@angular/core';
import { ApiService } from '../../../../shared/api.service';
import { Observable } from 'rxjs';
import { Warehouse, Rack } from '../models/locations.model';

@Injectable({ providedIn: 'root' })
export class LocationService {
    constructor(private api: ApiService) { }

    // Warehouse Methods
    getWarehouses(): Observable<Warehouse[]> {
        return this.api.get<Warehouse[]>('warehouses');
    }

    createWarehouse(payload: any): Observable<any> {
        return this.api.post('warehouses', payload);
    }

    updateWarehouse(id: string, payload: any): Observable<any> {
        return this.api.put(`warehouses/${id}`, payload);
    }

    deleteWarehouse(id: string): Observable<any> {
        return this.api.delete(`warehouses/${id}`);
    }

    // Rack Methods
    getRacks(): Observable<Rack[]> {
        return this.api.get<Rack[]>('racks');
    }

    createRack(payload: any): Observable<any> {
        return this.api.post('racks', payload);
    }
}
