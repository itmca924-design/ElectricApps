export interface MenuItem {
  id?: number;
  title: string;
  url: string;
  icon?: string;
  parentId?: number | null;
  order: number;
  children?: MenuItem[];
  permissions?: MenuPermissions;
}

export interface MenuPermissions {
  canView: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  additionalActions?: string;
}
