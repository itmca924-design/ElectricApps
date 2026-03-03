
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSort, Sort } from '@angular/material/sort';
import { SelectionModel } from '@angular/cdk/collections';
import { GridColumn } from '../../../../shared/models/grid-column.model';
import { MaterialModule } from '../../../../shared/material/material/material-module';
import { trigger, state, style, transition, animate } from '@angular/animations';

@Component({
    selector: 'app-pricelist-hierarchical-grid',
    standalone: true,
    imports: [CommonModule, MaterialModule],
    templateUrl: './pricelist-hierarchical-grid.component.html',
    styleUrls: ['./pricelist-hierarchical-grid.component.scss'],
    animations: [
        trigger('detailExpand', [
            state('collapsed', style({ height: '0px', minHeight: '0' })),
            state('expanded', style({ height: '*' })),
            transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
        ]),
    ],
})
export class PricelistHierarchicalGridComponent implements OnInit, OnChanges {
    @Input() columns: any[] = [];
    @Input() childColumns: any[] = [];
    @Input() data: any[] = [];
    @Input() totalCount: number = 0;
    @Input() loading: boolean = false;
    @Input() gridKey: string = '';
    @Input() canEdit: boolean = true;
    @Input() canDelete: boolean = true;

    @Output() loadData = new EventEmitter<any>();
    @Output() delete = new EventEmitter<any>();
    @Output() editAction = new EventEmitter<any>();
    @Output() selectionChange = new EventEmitter<any>();
    @Output() deleteChildRow = new EventEmitter<any>();
    @Output() rowExpand = new EventEmitter<any>();

    toggleExpand(row: any) {
        this.expandedElement = this.expandedElement === row ? null : row;
        if (this.expandedElement) {
            this.rowExpand.emit(row);
        }
    }

    dataSource = new MatTableDataSource<any>([]);
    selection = new SelectionModel<any>(true, []);
    expandedElement: any | null = null;
    displayedColumns: string[] = [];
    childDisplayedColumns: string[] = [];

    @ViewChild(MatPaginator) paginator!: MatPaginator;
    @ViewChild(MatSort) sort!: MatSort;

    pageSize = 10;
    pageIndex = 0;
    sortField = '';
    sortDirection = '';

    ngOnInit(): void {
        this.updateDisplayedColumns();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['data']) {
            this.dataSource.data = this.data || [];
        }
        if (changes['columns']) {
            this.updateDisplayedColumns();
        }
        if (changes['childColumns']) {
            this.updateChildDisplayedColumns();
        }
    }

    updateDisplayedColumns() {
        this.displayedColumns = ['select', ...this.columns.map(c => c.field), 'actions'];
    }

    updateChildDisplayedColumns() {
        // Logic for child columns
        this.childDisplayedColumns = this.childColumns.map(c => c.field);
        // Add child actions if needed
        this.childDisplayedColumns.push('childActions');
    }

    isAllSelected() {
        const numSelected = this.selection.selected.length;
        const numRows = this.dataSource.data.length;
        return numSelected === numRows;
    }

    masterToggle() {
        this.isAllSelected()
            ? this.selection.clear()
            : this.dataSource.data.forEach((row) => this.selection.select(row));
        this.selectionChange.emit(this.selection.selected);
    }

    onPageChange(event: PageEvent) {
        this.pageIndex = event.pageIndex;
        this.pageSize = event.pageSize;
        this.emitLoadData();
    }

    onSortChange(sort: Sort) {
        this.sortField = sort.active;
        this.sortDirection = sort.direction;
        this.emitLoadData();
    }

    emitLoadData() {
        this.loadData.emit({
            pageIndex: this.pageIndex,
            pageSize: this.pageSize,
            sortField: this.sortField,
            sortOrder: this.sortDirection
        });
    }
}
