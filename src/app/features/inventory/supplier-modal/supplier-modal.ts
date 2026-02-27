import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { MaterialModule } from '../../../shared/material/material/material-module';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { Supplier, SupplierService } from '../service/supplier.service';
import { PriceListService } from '../../master/pricelist/service/pricelist.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { LoadingService } from '../../../core/services/loading.service';

@Component({
  selector: 'app-supplier-modal',
  imports: [MaterialModule, CommonModule, ReactiveFormsModule],
  templateUrl: './supplier-modal.html',
  styleUrl: './supplier-modal.scss',
})
export class SupplierModalComponent implements OnInit {

  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<SupplierModalComponent>);
  public data = inject(MAT_DIALOG_DATA, { optional: true });
  private supplierService = inject(SupplierService);
  private pricelistService = inject(PriceListService);
  private cdr = inject(ChangeDetectorRef);
  private dialog = inject(MatDialog);
  private loadingService = inject(LoadingService);

  supplierForm!: FormGroup;
  loading = false;
  isEdit = false;

  priceLists: any[] = [];

  createForm() {
    this.supplierForm = this.fb.group({
      id: [0],
      name: ['', Validators.required],
      phone: ['', [Validators.required, Validators.pattern('^[0-9]{10}$')]],
      gstIn: [''],
      email: ['', [Validators.email]],
      address: [''],
      defaultpricelistId: [null, Validators.required],
      isActive: [true]
    });
  }


  ngOnInit(): void {
    this.createForm();
    if (this.data && this.data.supplier) {
      this.isEdit = true;
      this.supplierForm.patchValue(this.data.supplier);
    }
    this.loadPriceLists();
  }

  loadPriceLists(): void {
    this.loading = true;
    this.pricelistService.getPriceLists().subscribe({
      next: (res) => {
        this.priceLists = res;
        this.loading = false;
        this.cdr.detectChanges();
        console.log("Price Lists loaded in modal:", res);
      },
      error: (err) => console.error("Error loading price lists", err),
      complete: () => {
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }


  onSave() {
    if (this.supplierForm.valid) {
      const action = this.isEdit ? 'Update' : 'Create';
      const dialogRef = this.dialog.open(ConfirmDialogComponent, {
        data: {
          title: `Confirm ${action}`,
          message: `Are you sure you want to ${action.toLowerCase()} this supplier?`
        }
      });

      dialogRef.afterClosed().subscribe(confirm => {
        if (!confirm) return;

        this.loading = true;
        this.loadingService.setLoading(true);
        this.cdr.detectChanges();

        const currentEmail = localStorage.getItem('email') || localStorage.getItem('userId') || '';
        const supplierData = {
          ...this.supplierForm.value,
          createdBy: currentEmail
        };

        if (this.isEdit) {
          this.supplierService.updateSupplier(this.supplierForm.value.id, supplierData).subscribe({
            next: () => {
              this.loading = false;
              this.loadingService.setLoading(false);
              this.dialogRef.close(true);
              this.cdr.detectChanges();
            },
            error: (err) => {
              console.error("Supplier update failed:", err);
              this.loading = false;
              this.loadingService.setLoading(false);
              this.cdr.detectChanges();
            }
          });
        } else {
          this.supplierService.addSupplier(supplierData).subscribe({
            next: (res) => {
              this.loading = false;
              this.loadingService.setLoading(false);
              this.dialogRef.close(res);
              this.cdr.detectChanges();
            },
            error: (err) => {
              console.error("Supplier save failed:", err);
              this.loading = false;
              this.loadingService.setLoading(false);
              this.cdr.detectChanges();
            }
          });
        }
      });
    }
  }

  onCancel() {
    this.dialogRef.close();
  }
}