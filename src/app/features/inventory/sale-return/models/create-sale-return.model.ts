export interface SaleReturnItem {
    productId?: string;
    returnQty?: number;
    unitPrice?: number;    // Backend property name
    taxPercentage?: number; // Backend property name
    totalAmount?: number;   // Backend property name
    reason?: string;
    itemCondition?: string;
    warehouseId?: number;
    rackId?: number;
    manufacturingDate?: Date;
    expiryDate?: Date;
    mfgDate?: Date;
    expDate?: Date;
    createdBy?: string;
    modifiedBy?: string;
}

export interface CreateSaleReturnDto {
    returnDate?: Date;
    saleOrderId?: number;
    customerId?: number;
    remarks?: string;
    modifiedBy?: string;
    createdBy?: string;
    items?: SaleReturnItem[];
    isQuick?: boolean;
}