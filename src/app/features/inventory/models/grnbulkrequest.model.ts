export interface BulkGrnRequest {
    purchaseOrderIds: number[];
    createdBy: string;
    receivedDate: Date;
    gatePassNo: string | null;
    remarks: string | null;
    items: BulkGrnItem[];
}

export interface BulkGrnItem {
    poId: number;
    productId: string;
    receivedQty: number;
    rejectedQty: number;
    unitRate: number;
    warehouseId?: string | null;
    rackId?: string | null;
}