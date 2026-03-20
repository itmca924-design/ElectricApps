import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-balance-sheet-input-dialog',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    ReactiveFormsModule, 
    MatDialogModule, 
    MatFormFieldModule, 
    MatInputModule, 
    MatButtonModule
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p class="mb-3 text-muted">{{ data.message }}</p>
      <form [formGroup]="inputForm" (ngSubmit)="onSave()">
        <mat-form-field appearance="outline" class="w-100">
          <mat-label>{{ data.label }}</mat-label>
          <input matInput type="number" formControlName="amount" autofocus 
                 [placeholder]="'Max available: ' + (data.max || 0)">
          <span matPrefix class="me-1">₹&nbsp;</span>
          
          <mat-hint *ngIf="data.max !== undefined">
            Available Physical Cash: <strong>₹{{ data.max | number:'1.2-2' }}</strong>
          </mat-hint>

          <mat-error *ngIf="inputForm.get('amount')?.hasError('required')">Amount is required</mat-error>
          <mat-error *ngIf="inputForm.get('amount')?.hasError('min')">Amount cannot be negative</mat-error>
          <mat-error *ngIf="inputForm.get('amount')?.hasError('max')">
            Limit exceeded. You only have ₹{{ data.max }} in cash to move.
          </mat-error>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button mat-flat-button color="primary" [disabled]="inputForm.invalid" (click)="onSave()">Save Changes</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .w-100 { width: 100%; }
    mat-dialog-content { padding-top: 10px !important; }
  `]
})
export class BalanceSheetInputDialogComponent {
  inputForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<BalanceSheetInputDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { title: string, message: string, label: string, amount: number, max?: number }
  ) {
    this.inputForm = this.fb.group({
      amount: [data.amount, [Validators.required, Validators.min(0), Validators.max(data.max ?? 99999999)]]
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSave(): void {
    if (this.inputForm.valid) {
      this.dialogRef.close(this.inputForm.value.amount);
    }
  }
}
