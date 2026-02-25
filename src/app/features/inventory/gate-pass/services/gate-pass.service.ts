import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../../shared/api.service';
import { GatePass } from '../models/gate-pass.model';

@Injectable({
    providedIn: 'root'
})
export class GatePassService {
    private api = inject(ApiService);

    createGatePass(gatePass: GatePass): Observable<any> {
        return this.api.post('GatePass/Save', gatePass);
    }

    getGatePassesPaged(request: any): Observable<any> {
        return this.api.post('GatePass/GetPaged', request);
    }

    getGatePass(id: number): Observable<GatePass> {
        return this.api.get<GatePass>(`GatePass/${id}`);
    }

    deleteGatePass(id: number): Observable<any> {
        return this.api.delete(`GatePass/${id}`);
    }

    checkDuplicateGatePass(referenceNo: string, passType: string): Observable<any> {
        return this.api.get(`GatePass/CheckDuplicate?referenceNo=${referenceNo}&passType=${passType}`);
    }
}
