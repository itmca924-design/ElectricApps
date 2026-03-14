export interface GridColumn {
  field: string;
  header: string;
  sortable?: boolean;

  // Custom cell rendering ke liye
  cell?: (row: any, index?: any) => string | number | null;

  // Pixel mein width handle karne ke liye (Aapne number manga tha)
  width?: number;

  // Column show/hide logic
  visible?: boolean;

  // Filter functionality (Range filter ke liye zaroori hai)
  isFilterable?: boolean;

  // Resizing allow karne ke liye
  isResizable?: boolean;


  type?: 'text' | 'number' | 'boolean' | 'date' | 'currency';

  // Alignment: text left, numbers right
  align?: 'left' | 'right' | 'center';

  close?: string; // Aapka existing field
  filterValue?: string;
  action?: (row: any) => void;
}