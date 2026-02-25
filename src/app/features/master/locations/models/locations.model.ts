export interface Warehouse {
    id: string;
    name: string;
    description: string;
    isActive: boolean;
}

export interface Rack {
    id: string;
    warehouseId: string;
    warehouseName: string;
    name: string;
    description: string;
    isActive: boolean;
}
