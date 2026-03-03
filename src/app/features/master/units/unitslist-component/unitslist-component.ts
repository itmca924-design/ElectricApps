import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { MaterialModule } from '../../../../shared/material/material/material-module';
import { ReactiveFormsModule } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import { MatSort } from '@angular/material/sort';
import { UnitService } from '../services/units.service';
import { SummaryStat, SummaryStatsComponent } from '../../../../shared/components/summary-stats-component/summary-stats-component';
import { LoadingService } from '../../../../core/services/loading.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { StatusDialogComponent } from '../../../../shared/components/status-dialog-component/status-dialog-component';
import * as XLSX from 'xlsx';
import { PermissionService } from '../../../../core/services/permission.service';
import { inject } from '@angular/core';

@Component({
  selector: 'app-unitslist-component',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule, RouterLink, SummaryStatsComponent],
  templateUrl: './unitslist-component.html',
  styleUrl: './unitslist-component.scss',
})
export class UnitslistComponent implements OnInit {
  // Table columns jo humein dikhane hain
  displayedColumns: string[] = ['index', 'name', 'description', 'status', 'actions'];
  dataSource = new MatTableDataSource<any>();
  isLoading = true;
  summaryStats: SummaryStat[] = [];

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(
    private unitService: UnitService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private loadingService: LoadingService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) { }

  private permissionService = inject(PermissionService);
  canAdd: boolean = true;
  canEdit: boolean = true;
  canDelete: boolean = true;

  ngOnInit(): void {
    this.canAdd = this.permissionService.hasPermission('CanAdd');
    this.canEdit = this.permissionService.hasPermission('CanEdit');
    this.canDelete = this.permissionService.hasPermission('CanDelete');
    this.loadUnits();
  }

  loadUnits() {
    this.isLoading = true;
    this.loadingService.setLoading(true);
    this.unitService.getAll().subscribe({
      next: (data) => {
        this.dataSource.data = data || [];
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
        this.updateStats();
        this.isLoading = false;
        this.loadingService.setLoading(false);
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoading = false;
        this.loadingService.setLoading(false);
        this.cdr.detectChanges();
      }
    });
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.isLoading = true;
      this.loadingService.setLoading(true);
      this.unitService.importUnits(file).subscribe({
        next: (res: any) => {
          this.isLoading = false;
          this.loadingService.setLoading(false);
          this.dialog.open(StatusDialogComponent, {
            width: '400px',
            data: {
              isSuccess: true,
              status: 'success',
              title: 'Success',
              message: res.message || 'Units imported successfully'
            }
          });
          this.loadUnits();
        },
        error: (err) => {
          console.error(err);
          const errorMsg = err.error?.message || err.error || 'Failed to import units';
          this.isLoading = false;
          this.loadingService.setLoading(false);
          this.dialog.open(StatusDialogComponent, {
            width: '400px',
            data: {
              isSuccess: false,
              status: 'error',
              title: 'Error',
              message: errorMsg
            }
          });
          this.cdr.detectChanges();
        }
      });
    }
    event.target.value = '';
  }

  downloadTemplate() {
    const data = [
      ['Unit Name', 'Description'],
      ['KG', 'Kilogram - used for solid items like Rice, Sugar, Flour'],
      ['GRAM', 'Gram - used for spices and small quantity items'],
      ['LITER', 'Liter - used for liquid items like Oil, Milk, Ghee'],
      ['ML', 'Milliliter - used for small liquid packs like essence'],
      ['PACKET', 'Packet - used for items like Biscuits, Noodles, Snacks'],
      ['POUCH', 'Pouch - used for small packs of Spices, Detergents'],
      ['PIECE', 'Piece - used for individual items like Soap, Chocolates'],
      ['BOTTLE', 'Bottle - used for Ketchup, Pickle, Soft Drinks'],
      ['BOX', 'Box - used for bulk items or Tea bags'],
      ['BAG', 'Bag - used for bulk 5kg/10kg/20kg items'],
      ['TIN', 'Tin - used for edible oil or ghee containers'],
      ['JAR', 'Jar - used for items like Coffee, Jam, Honey'],
      ['DOZEN', 'Dozen - used for fruits like Bananas or Eggs'],
      ['SET', 'Set - used for combo packs or utensils'],
      ['PAIR', 'Pair - used for small sets'],
      ['BUNDLE', 'Bundle - used for green leafy vegetables or bulk sticks'],
      ['ROLL', 'Roll - used for Aluminum foils or Tissue papers'],
      ['CARTON', 'Carton - used for bulk wholesale shipping'],
      ['SACK', 'Sack - used for very large quantities of grains'],
      ['CUP', 'Cup - measure for small flavored items'],
      ['TRAY', 'Tray - used for Egg trays or small fruits']
    ];

    const ws: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet(data);
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'UnitsTemplate');
    XLSX.writeFile(wb, 'Units_Bulk_Upload_Template.xlsx');
  }

  private updateStats(): void {
    const total = this.dataSource.data.length;
    const active = this.dataSource.data.filter(u => u.isActive).length;
    const inactive = total - active;

    this.summaryStats = [
      { label: 'Total Units', value: total, icon: 'straighten', type: 'info' },
      { label: 'Active', value: active, icon: 'check_circle', type: 'success' },
      { label: 'Inactive', value: inactive, icon: 'block', type: 'warning' }
    ];
  }

  // Client-side search logic
  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }
  editUnit(unit: any) {
    this.router.navigate(['/app/master/units/edit', unit.id]);
  }

  deleteUnit(unit: any) {
    const dialogRef = this.dialog.open(StatusDialogComponent, {
      width: '400px',
      data: {
        isSuccess: false,
        title: 'Delete Unit',
        message: `Are you sure you want to delete ${unit.name}?`,
        status: 'warning',
        showCancel: true,
        confirmText: 'Delete',
        cancelText: 'Cancel'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.isLoading = true;
        this.loadingService.setLoading(true);
        this.unitService.delete(unit.id).subscribe({
          next: () => {
            this.isLoading = false;
            this.loadingService.setLoading(false);
            this.dialog.open(StatusDialogComponent, {
              width: '400px',
              data: {
                isSuccess: true,
                status: 'success',
                title: 'Deleted',
                message: 'Unit deleted successfully'
              }
            });
            this.loadUnits();
          },
          error: (err) => {
            console.error(err);
            this.isLoading = false;
            this.loadingService.setLoading(false);
            this.dialog.open(StatusDialogComponent, {
              width: '400px',
              data: {
                isSuccess: false,
                status: 'error',
                title: 'Error',
                message: 'Failed to delete unit'
              }
            });
            this.cdr.detectChanges();
          }
        });
      }
    });
  }
}