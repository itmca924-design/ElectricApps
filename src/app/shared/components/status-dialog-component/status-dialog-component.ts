import { Component, Inject } from '@angular/core';
import { MaterialModule } from '../../material/material/material-module';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-status-dialog-component',
  standalone: true,
  imports: [MaterialModule, FormsModule, CommonModule],
  templateUrl: './status-dialog-component.html',
  styleUrl: './status-dialog-component.scss',
})
export class StatusDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: {
    isSuccess: boolean,
    message: string,
    title?: string,
    showCancel?: boolean,
    confirmText?: string,
    cancelText?: string,
    status?: string, // 'success', 'warning', 'error'
    actions?: { label: string, role: string, color?: string }[]
  }) { }
}
