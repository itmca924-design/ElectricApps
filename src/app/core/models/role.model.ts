export interface Role {
    id: number;
    roleName: string;
}

export interface RolePermission {
    id?: number;
    roleId: number;
    menuId: number;
    canView: boolean;
    canAdd: boolean;
    canEdit: boolean;
    canDelete: boolean;
    additionalActions?: string; // New: comma separated keys
}
