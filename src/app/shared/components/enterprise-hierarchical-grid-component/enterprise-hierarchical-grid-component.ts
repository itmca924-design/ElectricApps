import { AfterViewInit, ChangeDetectorRef, Component, EventEmitter, inject, Input, OnChanges, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, PageEvent, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, Sort, MatSortModule } from '@angular/material/sort';
import { CdkDragDrop, moveItemInArray, DragDropModule } from '@angular/cdk/drag-drop';
import { GridColumn } from '../../../shared/models/grid-column.model';
import { MaterialModule } from '../../material/material/material-module';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AppSearchInput } from '../app-search-input/app-search-input';
import { Router } from '@angular/router';
import { SelectionModel } from '@angular/cdk/collections';
import { NotificationService } from '../../../features/shared/notification.service';
import { ConfirmDialogComponent } from '../confirm-dialog-component/confirm-dialog-component';
import { MatDialog } from '@angular/material/dialog';

@Component({
  selector: 'app-enterprise-hierarchical-grid',
  standalone: true,
  imports: [CommonModule,
    MaterialModule,
    ReactiveFormsModule,
    AppSearchInput,
    MatPaginatorModule,
    FormsModule],
  templateUrl: './enterprise-hierarchical-grid-component.html',
  styleUrl: './enterprise-hierarchical-grid-component.scss'
})
export class EnterpriseHierarchicalGridComponent implements OnInit, AfterViewInit, OnChanges {
  @Input() columns: GridColumn[] = [];
  @Input() dataSource = new MatTableDataSource<any>();
  @Input() childColumns: GridColumn[] = [];
  @Input() childDataField: string = 'items';
  @Input() isLoading: boolean = false;
  @Input() totalRecords: number = 0;
  @Input() pageSize: number = 10;
  @Input() addNewLabel: string = 'New Record';
  @Input() addNewRoute: string = '';
  @Input() entityName: string = 'Record';
  @Input() showApprovalWorkflow: boolean = true;
  @Input() showBulkConfirm: boolean = false;

  @Output() editRecord = new EventEmitter<any>();
  @Output() deleteRecord = new EventEmitter<any>();
  @Output() bulkDeleteRecords = new EventEmitter<any[]>();
  @Output() onGridStateChange = new EventEmitter<any>();
  @Output() onSelectionChange = new EventEmitter<any>();
  @Output() editChildRecord = new EventEmitter<any>();
  @Output() bulkDeleteChildItems = new EventEmitter<any>();
  @Output() deletePO = new EventEmitter<any>();

  @Output() selectionChanged = new EventEmitter<any[]>();
  @Output() bulkApproveOrders = new EventEmitter<any[]>();
  @Output() bulkDraftApproved = new EventEmitter<any[]>();
  @Output() bulkPORejected = new EventEmitter<any[]>();
  @Output() bulkCreateGrn = new EventEmitter<any[]>();
  @Output() bulkConfirmOrders = new EventEmitter<any[]>();

  @Output() bulkDeleteParentOrders = new EventEmitter<any[]>();
  @Output() actionClicked = new EventEmitter<{ action: string, row: any }>();
  @Output() rowExpanded = new EventEmitter<any>();

  @Input() highlightedId: any = null;

  @Input() userRole: any = ''; // Parent se role lene ke liye

  // Role Permission Inputs (from PermissionService via parent)
  @Input() canAdd: boolean = true;
  @Input() canEdit: boolean = true;
  @Input() canDelete: boolean = true;

  // When true: shows simple Edit/Delete for all rows (used by Quick Sale/Quick Purchase)
  @Input() showSimpleActions: boolean = false;


  private notification = inject(NotificationService);
  private dialog = inject(MatDialog);

  @ViewChild(MatSort) sort!: MatSort;
  sortChildDir: boolean = true;
  currentChildSortField: string = '';

  selection = new SelectionModel<any>(true, [], true, (a, b) => {
    if (a && b && a.id && b.id) return a.id === b.id;
    return a === b;
  });
  childSelection = new SelectionModel<any>(true, [], true, (a, b) => {
    if (a && b && a.id && b.id) return a.id === b.id;
    return a === b;
  });

  globalSearchQuery: string = '';
  expandedElement: any | null = null;
  currentPage: number = 0;
  sortField: string = 'poDate';
  sortDirection: 'asc' | 'desc' | '' = 'desc';
  fromDate: string = '';
  toDate: string = '';

  constructor(private cdr: ChangeDetectorRef, private router: Router) { }

  ngOnInit() {
    this.columns.forEach(col => {
      if (col.visible === undefined) col.visible = true;
    });

    this.dataSource.sort = null;
    setTimeout(() => { this.triggerDataLoad(); }, 0);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['userRole']) {
      console.log('Child Grid mein Role aaya:', changes['userRole'].currentValue);
    }
    if (changes['showApprovalWorkflow']) {
      console.log('Grid Flow Workflow Status:', changes['showApprovalWorkflow'].currentValue);
    }
  }

  getStatusBadgeClass(status: any): string {
    if (!status) return '';
    const s = String(status).toLowerCase();
    if (s.includes('partial')) return 'status-partial';
    if (s.includes('receive')) return 'status-received';
    if (s.includes('approve') || s.includes('confirmed')) return 'status-approved';
    if (s.includes('reject')) return 'status-rejected';
    if (s.includes('draft')) return 'status-draft';
    if (s.includes('submit')) return 'status-submitted';
    return '';
  }

  ngAfterViewInit() {
    this.dataSource.sort = this.sort;
    this.cdr.detectChanges();
  }
  onColumnToggle() {
    this.cdr.detectChanges();
  }
  get displayedColumns(): string[] {
    const dynamicCols = this.columns.filter(c => c.visible !== false).map(c => c.field);
    return ['select', ...dynamicCols, 'actions'];
  }

  isRowSelectable(row: any): boolean {
    const data = this.dataSource.data || [];
    const selected = this.selection.selected;
    const s = String(row.status || '').toLowerCase();

    // Helpers to identify row categories
    const isPendingInward = (r: any) => {
      const rs = String(r.status || '').toLowerCase();
      const hasShortage = Number(r.totalAccepted || 0) < Number(r.totalOrdered || 0);
      return (rs === 'approved' || rs === 'partially received' || rs === 'received') && hasShortage;
    };

    const isUnpaid = (s === 'confirmed' || s === 'approved') && (row.paymentStatus === 'Unpaid' || row.paymentStatus === 'Partial');
    const isPaidDispatch = (s === 'confirmed' || s === 'approved') && row.paymentStatus === 'Paid' && row.isDispatchPending;
    const rowIsPending = isPendingInward(row);
    const isDraft = s === 'draft' || s === 'rejected';
    const isSubmitted = s === 'submitted';

    // --- Dynamic Exclusion Logic (Prevent Mixing Incompatible Groups) ---
    if (selected.length > 0) {
      // Group 1: Inwarding (Approved with shortage, Partially Received)
      if (this.anySelectedHasPendingInward) {
        return rowIsPending;
      }
      // Group 2: Draft/Rejected (For Delete/Submit/Confirm)
      if (this.allSelectedAreDraft) {
        return isDraft;
      }
      // Group 3: Submitted (For Approve/Reject)
      if (this.allSelectedAreSubmitted) {
        return isSubmitted;
      }
      // Group 4: Unpaid Confirmed (For Bulk Payment - MUST be same customer)
      if (this.allSelectedAreUnpaid) {
        return isUnpaid && row.customerId === selected[0].customerId;
      }
      // Group 5: Paid Confirmed (For Bulk Outward - MUST be same customer)
      if (this.allSelectedArePaidDispatch) {
        return isPaidDispatch && row.customerId === selected[0].customerId;
      }

      // If row fits another group while some group is already selected, block it
      if (rowIsPending || isDraft || isSubmitted || isUnpaid || isPaidDispatch) return false;
    }

    // --- Role-based entry points for starting a selection ---
    // Anyone can start selecting rows that need Inwarding, Payment, or Dispatch
    if (rowIsPending || isUnpaid || isPaidDispatch) return true;

    if (this.userRole === 'Super Admin') return true;

    if (this.userRole === 'Manager') {
      const submittedCount = data.filter(r => String(r.status || '').toLowerCase() === 'submitted').length;
      return isSubmitted && submittedCount >= 1;
    }

    if (this.userRole === 'Warehouse') {
      return false; // Only POs needing inward (checked above) are selectable for Warehouse
    }

    // Default: User -> Draft/Rejected rows
    const draftCount = data.filter(r => {
      const rs = String(r.status || '').toLowerCase();
      return rs === 'draft' || rs === 'rejected';
    }).length;
    return isDraft && draftCount >= 1;
  }

  onParentCheck(row: any) {
    if (this.isRowSelectable(row)) {
      this.selection.toggle(row);
      this.emitSelection();
    }
  }

  get anySelectedIsPartiallyReceived(): boolean {
    if (this.selection.selected.length === 0) return false;
    return this.selection.selected.some(row => String(row.status || '').toLowerCase() === 'partially received');
  }

  get anySelectedIsApprovedPending(): boolean {
    if (this.selection.selected.length === 0) return false;
    return this.selection.selected.some(row => {
      const s = String(row.status || '').toLowerCase();
      return s === 'approved' && (Number(row.totalAccepted || 0) < Number(row.totalOrdered || 0));
    });
  }

  get anySelectedHasPendingInward(): boolean {
    return this.anySelectedIsPartiallyReceived || this.anySelectedIsApprovedPending;
  }

  get allSelectedHaveBlueTruck(): boolean {
    return this.anySelectedHasPendingInward;
  }

  get allSelectedAreSubmitted(): boolean {
    if (this.selection.selected.length === 0) return false;
    return this.selection.selected.every(row => String(row.status || '').toLowerCase() === 'submitted');
  }

  get allSelectedAreDraft(): boolean {
    if (this.selection.selected.length === 0) return false;
    return this.selection.selected.every(row => {
      const s = String(row.status || '').toLowerCase();
      return s === 'draft' || s === 'rejected';
    });
  }

  get allSelectedAreUnpaid(): boolean {
    if (this.selection.selected.length === 0) return false;
    return this.selection.selected.every(row => 
      (row.paymentStatus === 'Unpaid' || row.paymentStatus === 'Partial') && 
      (row.status?.toLowerCase() === 'confirmed' || row.status?.toLowerCase() === 'approved')
    );
  }

  get allSelectedArePaidDispatch(): boolean {
    if (this.selection.selected.length === 0) return false;
    return this.selection.selected.every(row => 
      row.paymentStatus === 'Paid' && 
      row.isDispatchPending && 
      (row.status?.toLowerCase() === 'confirmed' || row.status?.toLowerCase() === 'approved')
    );
  }

  isAllSelected(): boolean {
    const data = this.dataSource.data || [];
    const selectableRows = data.filter(row => this.isRowSelectable(row));
    if (selectableRows.length === 0) return false;
    return selectableRows.every(row => this.selection.isSelected(row));
  }

  masterToggle() {
    const data = this.dataSource.data || [];
    
    if (this.isAllSelected()) {
      this.selection.clear();
      this.emitSelection();
      return;
    }

    // Sequentially find selectable rows based on the first match
    let activeCategory: string = '';
    let activeCustomerId: any = null;
    const toSelect: any[] = [];

    for (const row of data) {
      const s = String(row.status || '').toLowerCase();
      const isUnpaid = (s === 'confirmed' || s === 'approved') && (row.paymentStatus === 'Unpaid' || row.paymentStatus === 'Partial');
      const isPaidDispatch = (s === 'confirmed' || s === 'approved') && row.paymentStatus === 'Paid' && row.isDispatchPending;
      const isDraft = s === 'draft' || s === 'rejected';

      if (!activeCategory) {
        if (isUnpaid) { activeCategory = 'unpaid'; activeCustomerId = row.customerId; }
        else if (isPaidDispatch) { activeCategory = 'dispatch'; activeCustomerId = row.customerId; }
        else if (isDraft) activeCategory = 'draft';
      }

      if (activeCategory === 'unpaid' && isUnpaid && row.customerId === activeCustomerId) toSelect.push(row);
      else if (activeCategory === 'dispatch' && isPaidDispatch && row.customerId === activeCustomerId) toSelect.push(row);
      else if (activeCategory === 'draft' && isDraft) toSelect.push(row);
    }

    this.selection.select(...toSelect);
    this.emitSelection();
  }

  // masterToggle() {
  //   if (this.isAllSelected()) {
  //     this.selection.clear();
  //   } else {
  //     // Jab Parent Header select ho:
  //     this.childSelection.clear(); // 1. Saare child selections saaf
  //     this.dataSource.data.forEach(row => this.selection.select(row)); // 2. Saare parents select
  //   }
  //   this.emitSelection();
  // }

  isAllChildSelected(element: any): boolean {
    const items = element[this.childDataField] || [];
    return items.length > 0 && items.every((item: any) => this.childSelection.isSelected(item));
  }

  toggleAllColumns(state: boolean) {
    this.columns.forEach(col => col.visible = state);
    this.onColumnToggle();
  }

  childMasterToggle(parentRow: any) {
    if (this.isAllChildSelected(parentRow)) {
      this.childSelection.clear();
    } else {
      // Jab Child Header select ho:
      this.selection.clear(); // 1. Saare parent selections saaf (Header included)

      // 2. Sirf is specific parent ke items ko select karein
      if (parentRow[this.childDataField]) {
        parentRow[this.childDataField].forEach((item: any) => this.childSelection.select(item));
      }
    }
    this.emitSelection();
  }
  emitSelection(): void {
    const selectionData = {
      parents: this.selection.selected,
      children: this.childSelection.selected
    };
    this.onSelectionChange.emit(selectionData);
    this.selectionChanged.emit(this.selection.selected); // Emit array for parent
  }

  // --- Drag & Drop ---
  drop(event: CdkDragDrop<string[]>): void {
    if (event.previousIndex > 0 && event.currentIndex > 0) {
      moveItemInArray(this.columns, event.previousIndex - 1, event.currentIndex - 1);
    }
  }

  dropChild(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.childColumns, event.previousIndex, event.currentIndex);
    this.cdr.detectChanges();
  }

  // --- Search & Filters ---
  onGlobalSearch(value: any) { this.globalSearchQuery = typeof value === 'string' ? value : value?.target?.value || ''; this.currentPage = 0; this.triggerDataLoad(); }
  applyDateFilter() { this.currentPage = 0; this.triggerDataLoad(); }
  onSortChange(sort: Sort) { this.sortField = sort.active; this.sortDirection = sort.direction as any; this.currentPage = 0; this.triggerDataLoad(); }
  onPageChange(event: PageEvent) { this.currentPage = event.pageIndex; this.pageSize = event.pageSize; this.triggerDataLoad(); }
  applyFilter() { this.currentPage = 0; this.triggerDataLoad(); }

  triggerDataLoad() {
    const state =
    {
      pageIndex: this.currentPage,
      pageSize: this.pageSize,
      sortField: this.sortField || 'poDate',
      sortOrder: this.sortDirection || 'desc',
      fromDate: this.fromDate,
      toDate: this.toDate,
      globalSearch: this.globalSearchQuery,
      filters: this.columns.filter(c => c.filterValue).map(c => ({ field: c.field, value: c.filterValue }))
    };
    this.onGridStateChange.emit(state);
  }

  clearAllFilters() { this.columns.forEach(col => col.filterValue = ''); this.fromDate = ''; this.toDate = ''; this.globalSearchQuery = ''; this.applyFilter(); }
  clearGlobalSearch() { this.globalSearchQuery = ''; this.currentPage = 0; this.triggerDataLoad(); }

  // --- UI Row Helpers ---
  toggleRow(element: any) {
    this.expandedElement = this.expandedElement === element ? null : element;
    if (this.expandedElement === element) {
      this.rowExpanded.emit(element);
    }
    this.cdr.detectChanges();
  }

  onResize(column: GridColumn, event: MouseEvent) {
    if (!column.isResizable) return;
    event.preventDefault();
    event.stopPropagation();

    const startX = event.pageX;
    const startWidth = column.width || 150;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const move = (e: MouseEvent) => {
      const newWidth = Math.max(80, startWidth + (e.pageX - startX));
      column.width = newWidth;
      this.cdr.detectChanges();
    };

    const up = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };

    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  toggleColumn(column: GridColumn) { column.visible = !column.visible; this.cdr.detectChanges(); }

  applyChildFilter(element: any, column: any) {
    if (!element.originalChildData) element.originalChildData = [...element[this.childDataField]];
    const val = column.filterValue?.toLowerCase().trim();
    element[this.childDataField] = val ? element.originalChildData.filter((r: any) => String(r[column.field]).toLowerCase().includes(val)) : element.originalChildData;
  }

  sortChild(field: string, element: any) {
    this.currentChildSortField = field;
    this.sortChildDir = !this.sortChildDir;
    const data = element[this.childDataField];
    data.sort((a: any, b: any) => {
      const valA = a[field]; const valB = b[field];
      return this.sortChildDir ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });
  }

  onResizeChild(col: any, event: MouseEvent) {
    if (!col.isResizable || event.button !== 0) return; // Only if resizable and left click
    event.preventDefault();
    event.stopPropagation();

    const startX = event.pageX;
    const startWidth = col.width || 120;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(60, startWidth + (e.pageX - startX));
      col.width = newWidth;
      this.cdr.detectChanges(); // Trigger Change Detection to reflect new width
    };

    const onMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  onAddNewClick() { if (this.addNewRoute) this.router.navigate([this.addNewRoute]); }

  // --- Action Methods ---

  onEdit(row: any, event?: MouseEvent) {
    if (event) { event.stopPropagation(); event.preventDefault(); }
    alert('Edit function called for: ' + (row.poNo || 'Selected Row'));
    this.editRecord.emit(row);
  }

  // 1. Single Parent Delete
  // enterprise-hierarchical-grid.ts

  SingleParentDelete(row: any, event?: MouseEvent) {
    if (event) event.stopPropagation();

    // 1. Domain Rule Check (Draft Only)
    if (row.status !== 'Draft') {
      this.notification.showStatus(false, `Dude, the command is '${row.status}'. Only drafts will be deleted!`);
      return;
    }

    // 2. Browser confirm() ki jagah Modal Popup
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: `Remove ${this.entityName}`,
        message: `Do you want to remove ${this.entityName}: ${row.poNumber || row.soNumber || row.id}?`,
        confirmText: 'Remove',
        cancelText: 'Keep',
        confirmColor: 'warn'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.deleteRecord.emit(row);
      }
    });
  }



  onEditChild(child: any, event?: any) {
    if (event && event.stopPropagation) {
      event.stopPropagation();
    }

    const dataToEdit = this.expandedElement ? this.expandedElement : child;

    this.editRecord.emit(dataToEdit);
  }

  // Single Item Delete (Trash icon click par)
  onDeleteChild(parentRow: any, childRow: any) {
    this.bulkDeleteChildItems.emit({
      parent: parentRow,
      child: childRow,
      isBulk: false
    });
  }

  // 2. Bulk Parent Delete 
  // enterprise-hierarchical-grid.ts

  onBulkConfirmClick() {
    if (this.selection.selected.length > 0) {
      const selectedRows = this.selection.selected;
      const dialogRef = this.dialog.open(ConfirmDialogComponent, {
        width: '400px',
        data: {
          title: "Bulk Confirm Orders",
          message: `Are you sure you want to confirm ${selectedRows.length} selected orders? This will deduct stock from inventory for all of them.`,
          confirmText: "Confirm All",
          confirmColor: "primary"
        }
      });

      dialogRef.afterClosed().subscribe(result => {
        if (result) {
          this.bulkConfirmOrders.emit(selectedRows);
          this.selection.clear();
        }
      });
    }
  }

  onBulkDeleteClick() {
    const selectedRows = this.selection.selected;

    if (selectedRows.length === 0) return;

    // Validation Check
    const invalidOrders = selectedRows.filter(r => r.status !== 'Draft');
    if (invalidOrders.length > 0) {
      // Yahan aap toastr ya notification dikha sakte hain alert ki jagah
      this.notification.showStatus(false, 'Only draft orders can be bulk deleted!');
      return;
    }

    // Ab confirm() ki jagah Modal trigger karenge
    this.openBulkDeleteDialog(selectedRows);
  }

  openBulkDeleteDialog(selectedRows: any[]) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: `Remove ${this.entityName}(s)`,
        message: `Do you want to remove ${selectedRows.length} selected ${this.entityName.toLowerCase()}(s)?`,
        confirmText: 'Remove',
        cancelText: 'Keep',
        confirmColor: 'warn'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Agar user ne 'Remove' click kiya, tab emit karo
        this.bulkDeleteParentOrders.emit(selectedRows);
        this.selection.clear(); // Selection clear karna mat bhoolna
      }
    });
  }

  // Child Delete Trigger (Bulk)
  onBulkDeleteChildItems(element: any) {
    this.bulkDeleteChildItems.emit({
      parent: element,
      child: this.childSelection.selected,
      isBulk: true
    });
  }

  onBulkApproveClick() {
    if (this.selection.selected.length > 0) {
      this.bulkApproveOrders.emit(this.selection.selected);
      // Selection clear is handled by parent or manual? 
      // Usually parent refreshes data which clears selection, but let's leave it to parent.
    }
  }

  onBulkDraftApprovedClick() {
    if (this.selection.selected.length > 0) {
      this.bulkDraftApproved.emit(this.selection.selected);
    }
  }

  onBulkPORejectedClick() {
    if (this.selection.selected.length > 0) {
      this.bulkPORejected.emit(this.selection.selected);
    }
  }

  onBulkCreateGrnClick() {
    if (this.selection.selected.length > 0) {
      this.bulkCreateGrn.emit(this.selection.selected);
    }
  }
  // enterprise-hierarchical-grid.ts

  // Jab Parent checkbox click ho
  onParentSelectionChange(row: any) {
    this.selection.toggle(row);

    if (this.selection.hasValue()) {
      // Agar Parent select hua, toh Child selection ko khali kar do
      this.childSelection.clear();
    }
  }

  // Jab Child checkbox click ho
  onChildSelectionChange(item: any) {
    this.childSelection.toggle(item);

    if (this.childSelection.hasValue()) {
      // Agar Child select hua, toh Parent selection ko khali kar do
      this.selection.clear();
    }
  }



  // Jab Child (Item) row ka checkbox click ho
  onChildCheck(item: any) {
    // Exclusive logic: Child select hua toh Parent ki saari selections saaf
    this.selection.clear();
    this.childSelection.toggle(item);
  }

  // enterprise-hierarchical-grid.ts

  calculateSubTotal(element: any): number {
    if (element.subTotal) return element.subTotal;
    const grand = element.grandTotal || 0;
    const tax = element.totalTax || 0;
    return grand - tax;
  }

  calculateTotalQty(element: any): number {
    const items = element[this.childDataField] || [];
    return items.reduce((sum: number, item: any) => sum + (Number(item.qty) || 0), 0);
  }

  onDeletePO(row: any) {
    // Parent ko signal bhej rahe hain delete karne ke liye [cite: 2026-01-22]
    this.deletePO.emit(row);
  }

  // 3. Ye functions buttons se call honge
  onSubmitPO(row: any) {
    this.actionClicked.emit({ action: 'SUBMIT', row: row });
  }

  onApprovePO(row: any) {
    this.actionClicked.emit({ action: 'APPROVE', row: row });
  }

  onRejectPO(row: any) {
    this.actionClicked.emit({ action: 'REJECT', row: row });
  }

  // Child Grid TS [cite: 2026-01-22]


  onPrintPO(row: any) {
    // Print ke liye hum aksar parent ko batate hain ya alag window open karte hain
    console.log('Printing PO:', row.poNumber);
    // Example: Window open for PDF
    // window.open(`${environment.apiUrl}/reports/po-print/${row.id}`, '_blank');
  }

  handleAction(actionName: string, rowData: any) {
    // Hum action ka naam aur poora row data emit kar rahe hain
    this.actionClicked.emit({
      action: actionName,
      row: rowData
    });
  }

  isWithinReturnWindow(row: any): boolean {
    if (!row.soDate && !row.SODate) return true;
    const dateStr = row.soDate || row.SODate;
    const saleDate = new Date(dateStr);
    const now = new Date();
    const diffInHours = (now.getTime() - saleDate.getTime()) / (1000 * 60 * 60);
    return diffInHours <= 72;
  }
}