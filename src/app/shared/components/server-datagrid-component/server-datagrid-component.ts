import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, OnDestroy, inject } from '@angular/core';
import { PageEvent } from '@angular/material/paginator';
import { GridRequest } from '../../models/grid-request.model';
import { GridColumn } from '../../../shared/models/grid-column.model';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../material/material/material-module';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import * as XLSX from 'xlsx';
import { PermissionService } from '../../../core/services/permission.service';

@Component({
  selector: 'app-server-datagrid',
  standalone: true,
  imports: [CommonModule, MaterialModule, DragDropModule],
  templateUrl: './server-datagrid-component.html',
  styleUrl: './server-datagrid-component.scss',
})
export class ServerDatagridComponent<T> implements OnChanges, OnInit, OnDestroy {
  @Input() columns: GridColumn[] = [];
  @Input() data: T[] = [];
  @Input() totalCount = 0;
  @Input() loading = false;

  @Output() loadData = new EventEmitter<GridRequest>();

  @Output() delete = new EventEmitter<any[]>();
  @Output() selectionChange = new EventEmitter<any[]>();
  @Output() rowClick = new EventEmitter<any>();
  @Output() editAction = new EventEmitter<any>();

  selection = new Set<any>();
  private readonly STORAGE_KEY = 'grid-settings-state';
  @Input({ required: true }) gridKey!: string;

  // Permission Inputs (auto-loaded from PermissionService based on current URL)
  private permissionService = inject(PermissionService);
  canAdd: boolean = true;
  canEdit: boolean = true;
  canDelete: boolean = true;

  filteredColumns: GridColumn[] = [];

  private searchSubject = new Subject<string>();
  private filterSubject = new Subject<{ field: string; value: string }>();

  private columnFilters: { [key: string]: string } = {};

  request: GridRequest = {
    pageNumber: 1,
    pageSize: 10,
    sortDirection: 'desc',
    search: '',
    filters: {}
  };

  private resizingColumn?: GridColumn;
  private startX = 0;
  private startWidth = 0;

  constructor() {
    // Global Search Logic
    this.searchSubject.pipe(debounceTime(400), distinctUntilChanged()).subscribe(val => {
      this.request.search = val;
      this.request.pageNumber = 1;
      this.emitRequest();
    });

    // Column Filter Logic
    this.filterSubject
      .pipe(debounceTime(500))
      .subscribe(({ field, value }) => {
        if (value) {
          this.columnFilters[field] = value;
        } else {
          delete this.columnFilters[field];
        }

        this.request.filters = { ...this.columnFilters };
        this.request.pageNumber = 1;
        this.emitRequest();
      });

  }

  ngOnInit(): void {
    this.restoreColumnState();
    this.filteredColumns = [...this.columns];

    // Load permissions for current page automatically
    this.canAdd = this.permissionService.hasPermission('CanAdd');
    this.canEdit = this.permissionService.hasPermission('CanEdit');
    this.canDelete = this.permissionService.hasPermission('CanDelete');

    console.log('[ServerDatagrid] Permissions -> canAdd:', this.canAdd, 'canEdit:', this.canEdit, 'canDelete:', this.canDelete);
  }


  ngOnDestroy(): void {
    this.searchSubject.complete();
    this.filterSubject.complete();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data']) {
      this.selection.clear();
      // Delay emission to avoid ExpressionChangedAfterItHasBeenCheckedError
      Promise.resolve().then(() => this.emitSelection());
    }
  }

  emitRequest() {
    // Parent component ko batane ke liye ki data reload karna hai
    this.loadData.emit({ ...this.request });
  }

  onSearch(value: string): void { this.searchSubject.next(value); }

  onColumnFilter(field: string, value: string): void {
    this.filterSubject.next({
      field,
      value: value?.trim() ?? ''
    });
  }


  exportToExcel(): void {
    const exportData = this.data.map((row: any) => {
      const obj: any = {};
      this.visibleColumns.forEach(col => {
        obj[col.header] = row[col.field];
      });
      return obj;
    });
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data_Export');
    XLSX.writeFile(workbook, `Grid_Export_${new Date().getTime()}.xlsx`);
  }

  onSort(event: MouseEvent, column: GridColumn): void {
    if (!column.sortable || this.loading) return;
    this.request.sortDirection = (this.request.sortBy === column.field && this.request.sortDirection === 'asc') ? 'desc' : 'asc';
    this.request.sortBy = column.field;
    this.request.pageNumber = 1;
    this.emitRequest();
  }

  onPageChange(event: PageEvent): void {
    this.request.pageNumber = event.pageIndex + 1;
    this.request.pageSize = event.pageSize;
    this.emitRequest();
  }

  clearSelection(): void { this.selection.clear(); this.emitSelection(); }
  get visibleColumns() { return this.columns.filter(c => c.visible); }
  displayedColumnsWithActions(): string[] { return ['select', ...this.visibleColumns.map(c => c.field), 'actions']; }
  toggleRow(row: any): void { this.selection.has(row) ? this.selection.delete(row) : this.selection.add(row); this.emitSelection(); }
  toggleAll(event: any): void { event.checked ? this.data.forEach(row => this.selection.add(row)) : this.selection.clear(); this.emitSelection(); }
  emitSelection(): void { this.selectionChange.emit(Array.from(this.selection)); }
  isHeaderChecked(): boolean { return this.selection.size > 0; }

  onRowClick(event: MouseEvent, row: any): void {
    if ((event.target as HTMLElement).closest('button, mat-checkbox, mat-icon, input')) return;
    this.rowClick.emit(row);
  }

  startResize(event: MouseEvent, column: GridColumn): void {
    event.preventDefault();
    this.resizingColumn = column;
    this.startX = event.pageX;
    this.startWidth = column.width ?? 150;
    document.addEventListener('mousemove', this.resizeMouseMove);
    document.addEventListener('mouseup', this.resizeMouseUp);
  }

  resizeMouseMove = (event: MouseEvent) => {
    if (!this.resizingColumn) return;
    window.requestAnimationFrame(() => {
      if (this.resizingColumn) {
        const delta = event.pageX - this.startX;
        this.resizingColumn.width = Math.max(80, this.startWidth + delta);
      }
    });
  }

  resizeMouseUp = () => {
    this.saveColumnState();
    this.resizingColumn = undefined;
    document.removeEventListener('mousemove', this.resizeMouseMove);
    document.removeEventListener('mouseup', this.resizeMouseUp);
  }

  dropColumn(event: CdkDragDrop<any[]>) {
    if (event.previousIndex === event.currentIndex) return;
    const visibleArr = this.visibleColumns;
    const fromIdx = this.columns.indexOf(visibleArr[event.previousIndex]);
    const toIdx = this.columns.indexOf(visibleArr[event.currentIndex]);
    moveItemInArray(this.columns, fromIdx, toIdx);
    this.saveColumnState();
  }

  saveColumnState(): void {
    const state = this.columns.map(col => ({ field: col.field, visible: col.visible, width: col.width }));
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
  }

  restoreColumnState(): void {
    const saved = localStorage.getItem(this.storageKey);
    if (!saved) return;

    const savedState: Array<{
      field: string;
      visible?: boolean;
      width?: number;
    }> = JSON.parse(saved);

    const restoredColumns: GridColumn[] = [];

    for (const col of this.columns) {
      const savedCol = savedState.find(s => s.field === col.field);

      if (!savedCol) {
        restoredColumns.push(col);
        continue;
      }

      restoredColumns.push({
        ...col,
        ...(savedCol.visible !== undefined && { visible: savedCol.visible }),
        ...(savedCol.width !== undefined && { width: savedCol.width })
      });
    }

    this.columns = restoredColumns;
  }




  updateDisplayedColumns(): void {
    this.columns = [...this.columns];
    this.filteredColumns = [...this.columns]; // ✅ keep menu in sync
    this.saveColumnState();
  }



  resetColumns(): void {
    this.columns = this.columns.map(col => ({
      ...col,
      visible: true,
      width: undefined
    }));

    localStorage.removeItem(this.STORAGE_KEY);
    this.updateDisplayedColumns();
  }

  private get storageKey(): string {
    return `grid-state-${this.gridKey}`;
  }

  showAllColumns(): void {
    this.columns.forEach(c => (c.visible = true));
    this.updateDisplayedColumns();
  }

  hideAllColumns(): void {
    this.columns.forEach(c => (c.visible = false));
    this.updateDisplayedColumns();
  }



  onColumnSearch(value: string): void {
    const v = value.toLowerCase().trim();

    this.filteredColumns = v
      ? this.columns.filter(c => c.header.toLowerCase().includes(v))
      : [...this.columns]; // ✅ reset properly
  }


  toggleColumn(col: GridColumn, visible: boolean): void {
    col.visible = visible;
    this.updateDisplayedColumns(); // ✅ persists + refreshes menu
  }


  selectAllColumns(): void {
    this.columns.forEach(c => (c.visible = true));
    this.filteredColumns = [...this.columns]; // ✅ reflect immediately
    this.updateDisplayedColumns();
  }


  clearAllColumns(): void {
    this.columns.forEach(c => (c.visible = false));
    this.filteredColumns = [...this.columns]; // ✅ reflect immediately
    this.updateDisplayedColumns();
  }

  onEditClick(row: any) {
    this.editAction.emit(row); // Ye event parent ko signal bhejega
  }
}