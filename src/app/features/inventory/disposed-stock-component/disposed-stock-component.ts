import { Component, OnInit, ViewChild, AfterViewInit, ChangeDetectorRef, inject } from '@angular/core';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { CommonModule } from '@angular/common';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { InventoryService } from '../service/inventory.service';
import { Router } from '@angular/router';
import { merge, of } from 'rxjs';
import { startWith, switchMap, map, catchError } from 'rxjs/operators';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { LoadingService } from '../../../core/services/loading.service';
import { LocationService } from '../../master/locations/services/locations.service';
import { NotificationService } from '../../shared/notification.service';

@Component({
  selector: 'app-disposed-stock-component',
  standalone: true,
  imports: [MaterialModule, CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './disposed-stock-component.html',
  styleUrl: './disposed-stock-component.scss',
  animations: [
    trigger('detailExpand', [
      state('collapsed', style({ height: '0px', minHeight: '0' })),
      state('expanded', style({ height: '*' })),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),
  ],
})
export class DisposedStockComponent implements OnInit, AfterViewInit {
  private loadingService = inject(LoadingService);
  private notification = inject(NotificationService);
  private locationService = inject(LocationService);

  displayedColumns: string[] = ['productName', 'warehouseName', 'rackName', 'disposedQty', 'disposedValue', 'lastPurchase'];
  stockDataSource = new MatTableDataSource<any>([]);

  expandedElement: any | null;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  resultsLength = 0;
  isLoadingResults = true;
  totalDisposedValue: number = 0;
  totalDisposedQty: number = 0;
  searchValue: string = '';

  startDate: Date | null = null;
  endDate: Date | null = null;

  warehouses: any[] = [];
  racks: any[] = [];
  filteredRacks: any[] = [];
  selectedWarehouseId: string | null = null;
  selectedRackId: string | null = null;

  constructor(private inventoryService: InventoryService, private router: Router,
    private cdr: ChangeDetectorRef) { }

  ngOnInit() {
    this.loadLocations();
  }

  loadLocations() {
    this.locationService.getWarehouses().subscribe(data => {
      this.warehouses = data.filter(w => w.isActive);
    });
    this.locationService.getRacks().subscribe(data => {
      this.racks = data.filter(r => r.isActive);
    });
  }

  onWarehouseChange() {
    this.filteredRacks = this.selectedWarehouseId ? this.racks.filter(r => r.warehouseId === this.selectedWarehouseId) : [];
    this.selectedRackId = null;
    this.applyDateFilter();
  }

  ngAfterViewInit() {
    this.sort.sortChange.subscribe(() => (this.paginator.pageIndex = 0));
    this.loadingService.setLoading(true);

    setTimeout(() => {
      merge(this.sort.sortChange, this.paginator.page)
        .pipe(
          startWith({}),
          switchMap(() => this.fetchDataStream()),
          map(data => {
            this.isLoadingResults = false;
            this.loadingService.setLoading(false);
            if (data === null) return [];
            this.resultsLength = data.totalCount;
            this.handleDataUpdate(data.items);
            return data.items;
          }),
          catchError(() => {
            this.isLoadingResults = false;
            this.loadingService.setLoading(false);
            return of([]);
          })
        ).subscribe();
    }, 500);
  }

  private fetchDataStream() {
    this.isLoadingResults = true;
    return this.inventoryService.getDisposedStock(
      this.sort.active,
      this.sort.direction,
      this.paginator.pageIndex,
      this.paginator.pageSize,
      this.searchValue,
      this.startDate,
      this.endDate,
      this.selectedWarehouseId,
      this.selectedRackId
    );
  }

  private handleDataUpdate(items: any) {
    if (items) {
      this.stockDataSource.data = items;
      this.updateSummary(items);
    }
    this.cdr.detectChanges();
  }

  updateSummary(data: any[]) {
    this.totalDisposedValue = data.reduce((acc, curr) => acc + (curr.totalRejected * curr.lastRate), 0);
    this.totalDisposedQty = data.reduce((acc, curr) => acc + (curr.totalRejected || 0), 0);
    this.cdr.detectChanges();
  }

  applyDateFilter() {
    this.paginator.pageIndex = 0;
    this.fetchDataStream().subscribe(data => {
      this.isLoadingResults = false;
      if (data) {
        this.resultsLength = data.totalCount;
        this.handleDataUpdate(data.items);
      }
    });
  }

  applyFilter(event: Event) {
    this.searchValue = (event.target as HTMLInputElement).value.trim().toLowerCase();
    this.paginator.pageIndex = 0;
    this.applyDateFilter();
  }

  toggleRow(element: any) {
    this.expandedElement = this.expandedElement === element ? null : element;
    this.cdr.detectChanges();
  }
}
