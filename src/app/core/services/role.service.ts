import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../enviornments/environment";
import { Role, RolePermission } from "../models/role.model";
import { ApiService } from "../../shared/api.service";

@Injectable({ providedIn: 'root' })
export class RoleService {
    private api = inject(ApiService);
    private readonly baseUrl = environment.api.identity;

    getAllRoles(): Observable<Role[]> {
        return this.api.get<Role[]>('roles', this.baseUrl);
    }

    getRoleById(id: number): Observable<Role> {
        return this.api.get<Role>(`roles/${id}`, this.baseUrl);
    }

    createRole(role: Role): Observable<Role> {
        return this.api.post<Role>('roles', role, this.baseUrl);
    }

    updateRole(id: number, role: Role): Observable<Role> {
        return this.api.put<Role>(`roles/${id}`, role, this.baseUrl);
    }

    deleteRole(id: number): Observable<void> {
        return this.api.delete<void>(`roles/${id}`, this.baseUrl);
    }

    // Permissions
    getRolePermissions(roleId: number): Observable<RolePermission[]> {
        return this.api.get<RolePermission[]>(`roles/${roleId}/permissions`, this.baseUrl);
    }

    updateRolePermissions(roleId: number, permissions: RolePermission[]): Observable<void> {
        return this.api.put<void>(`roles/${roleId}/permissions`, permissions, this.baseUrl);
    }

    // Print Settings
    getRolePrintSettings(roleId: number): Observable<any[]> {
        return this.api.get<any[]>(`roles/${roleId}/print-settings`, this.baseUrl);
    }

    updateRolePrintSettings(roleId: number, settings: any[]): Observable<void> {
        return this.api.put<void>(`roles/${roleId}/print-settings`, settings, this.baseUrl);
    }
}

