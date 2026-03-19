export interface Product {
  id?: any;
  categoryId: number;
  subcategoryId: number;
  productName: string;
  name?: string;
  sku?: string;
  brand?: string;
  unit: 'KG' | 'PCS' | 'BOX' | 'NOS';

  // 💰 Pricing Logic Fields
  basePurchasePrice: number;
  mrp?: number;
  rate: number;
  saleRate?: number;
  price?: number;
  currentStock: number;
  availableStock?: number;

  // 📈 Inventory & Tax
  defaultGst: number;
  gstPercent?: number;
  discount?: number;
  discountPercent?: number;
  hsnCode?: string;
  minStock: number;
  trackInventory: boolean;
  isActive: boolean;
  productType: string;
  damagedStock: number;
  description?: string;
  defaultWarehouseId?: string;
  defaultRackId?: string;
  isExpiryRequired?: boolean;
  defaultRackName?: string;
  rackName?: string;
  imageUrl?: string;

  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: string;
  updatedby?: string;
  createdby?: string;
}

export interface LowStockProductDto {
  // Guid ke liye string use hota hai
  id: string;

  // UI Table ke columns
  categoryName: string;
  subCategoryName: string;
  productName: string;
  sku: string;
  unit: string;

  // Stock logic
  currentStock: number;
  minStock: number;

  // Extra fields for PO
  basePurchasePrice: number;
}