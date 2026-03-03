import { ChangeDetectorRef, Component, inject, OnInit, ViewChild } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MaterialModule } from '../../../../shared/material/material/material-module';
import { Router } from '@angular/router';
import { GatePassService } from '../services/gate-pass.service';
import { MatTableDataSource } from '@angular/material/table';
import { LoadingService } from '../../../../core/services/loading.service';
import { MatDialog } from '@angular/material/dialog';
import { StatusDialogComponent } from '../../../../shared/components/status-dialog-component/status-dialog-component';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog-component/confirm-dialog-component';
import { NotificationService } from '../../../../features/shared/notification.service';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSort, Sort } from '@angular/material/sort';
import { FormsModule } from '@angular/forms';
import { GatePassPrintDialogComponent } from '../gate-pass-print-dialog/gate-pass-print-dialog.component';
import { CompanyService } from '../../../company/services/company.service';
import { PermissionService } from '../../../../core/services/permission.service';

@Component({
    selector: 'app-gate-pass-list',
    standalone: true,
    imports: [
        CommonModule,
        MaterialModule,
        FormsModule
    ],
    providers: [DatePipe],
    templateUrl: './gate-pass-list.component.html',
    styleUrl: './gate-pass-list.component.scss'
})
export class GatePassListComponent implements OnInit {
    private gatePassService = inject(GatePassService);
    private router = inject(Router);
    private cdr = inject(ChangeDetectorRef);
    private datePipe = inject(DatePipe);
    private loadingService = inject(LoadingService);
    private dialog = inject(MatDialog);
    private notification = inject(NotificationService);
    private companyService = inject(CompanyService);
    private permissionService = inject(PermissionService);

    canAdd: boolean = true;

    dataSource = new MatTableDataSource<any>([]);
    companyProfile: any = null;
    displayedColumns: string[] = ['passNo', 'passType', 'gateEntryTime', 'partyName', 'referenceNo', 'vehicleNo', 'totalQty', 'status', 'actions'];

    totalRecords = 0;
    pageSize = 10;
    pageIndex = 0;
    isLoading = false;
    searchKey: string = "";

    sortField = 'CreatedAt';
    sortOrder = 'desc';

    fromDate: Date | null = null;
    toDate: Date | null = null;

    // Stats
    totalInward = 0;
    totalOutward = 0;
    totalPasses = 0;

    @ViewChild(MatPaginator) paginator!: MatPaginator;
    @ViewChild(MatSort) sort!: MatSort;

    ngOnInit() {
        this.canAdd = this.permissionService.hasPermission('CanAdd');
        this.loadData();
        this.loadCompanyProfile();
    }

    loadCompanyProfile() {
        this.companyService.getCompanyProfile().subscribe({
            next: (profile: any) => {
                this.companyProfile = profile;
                this.cdr.detectChanges();
            },
            error: (err: any) => console.error('Error fetching company profile:', err)
        });
    }

    loadData() {
        this.isLoading = true;
        this.loadingService.setLoading(true);
        this.cdr.detectChanges();

        const request = {
            pageIndex: this.pageIndex,
            pageSize: this.pageSize,
            sortField: this.sortField,
            sortOrder: this.sortOrder,
            filter: this.searchKey,
            fromDate: this.fromDate ? this.datePipe.transform(this.fromDate, 'yyyy-MM-dd') : null,
            toDate: this.toDate ? this.datePipe.transform(this.toDate, 'yyyy-MM-dd') : null
        };

        this.gatePassService.getGatePassesPaged(request).subscribe({
            next: (res) => {
                const items = res.data || [];
                items.forEach((item: any) => {
                    if (item.gateEntryTime && !item.gateEntryTime.includes('Z') && !item.gateEntryTime.includes('+')) {
                        item.gateEntryTime = item.gateEntryTime + 'Z';
                    }
                    if (item.receivedDate && typeof item.receivedDate === 'string' && !item.receivedDate.includes('Z') && !item.receivedDate.includes('+')) {
                        item.receivedDate = item.receivedDate + 'Z';
                    }
                });
                this.dataSource.data = items;
                this.totalRecords = res.totalRecords || 0;
                this.calculateStats(items);
                this.isLoading = false;
                this.loadingService.setLoading(false);
                this.cdr.detectChanges();
            },
            error: (err) => {
                this.isLoading = false;
                this.loadingService.setLoading(false);
                this.cdr.detectChanges();
                console.error('Error loading gate passes:', err);
                this.notification.showStatus(false, 'Failed to load Gate Passes');
            }
        });
    }

    onPageChange(event: PageEvent) {
        this.pageIndex = event.pageIndex;
        this.pageSize = event.pageSize;
        this.loadData();
    }

    onSortChange(sort: Sort) {
        this.sortField = sort.active;
        this.sortOrder = sort.direction || 'desc';
        this.loadData();
    }

    applySearch(event: Event) {
        const filterValue = (event.target as HTMLInputElement).value;
        this.searchKey = filterValue.trim().toLowerCase();
        this.pageIndex = 0;
        this.loadData();
    }

    onCreateGrn(row: any) {
        if (row.passType !== 'Inward' || row.referenceType !== 1) { // 1 = PurchaseOrder
            this.notification.showStatus(false, 'GRN can only be created for Inward PO Gate Passes');
            return;
        }

        this.router.navigate(['/app/inventory/grn-list/add'], {
            queryParams: {
                poId: row.referenceId,
                gatePassNo: row.passNo
            }
        });
    }

    onEdit(row: any) {
        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            width: '400px',
            data: {
                title: 'Edit Gate Pass',
                message: `Are you sure you want to edit Gate Pass ${row.passNo}?`,
                confirmText: 'Yes, Edit'
            }
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                const route = row.passType === 'Inward' ? 'inward' : 'outward';
                this.router.navigate([`/app/inventory/gate-pass/${route}`], {
                    queryParams: { id: row.id, mode: 'edit' }
                });
            }
        });
    }

    onPrint(row: any) {
        this.dialog.open(GatePassPrintDialogComponent, {
            width: '800px',
            data: { id: row.id }
        });
    }

    onDelete(row: any) {
        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            width: '400px',
            data: {
                title: 'Delete Gate Pass',
                message: `Are you sure you want to delete Gate Pass ${row.passNo}?`,
                confirmText: 'Delete',
                confirmColor: 'warn'
            }
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                this.isLoading = true;
                this.loadingService.setLoading(true);
                this.gatePassService.deleteGatePass(row.id).subscribe({
                    next: () => {
                        this.isLoading = false;
                        this.loadingService.setLoading(false);
                        this.notification.showStatus(true, 'Gate Pass deleted successfully');
                        this.loadData();
                    },
                    error: (err) => {
                        this.isLoading = false;
                        this.loadingService.setLoading(false);
                        this.notification.showStatus(false, 'Failed to delete Gate Pass');
                    }
                });
            }
        });
    }

    navigateToAddInward() {
        this.router.navigate(['/app/inventory/gate-pass/inward']);
    }

    navigateToAddOutward() {
        this.router.navigate(['/app/inventory/gate-pass/outward']);
    }

    navigateToAdd() {
        this.navigateToAddInward();
    }

    resetFilters() {
        this.searchKey = "";
        this.fromDate = null;
        this.toDate = null;
        this.pageIndex = 0;
        this.loadData();
    }

    getStatusClass(status: number): string {
        switch (status) {
            case 1: return 'status-entered';
            case 2: return 'status-dispatched';
            case 3: return 'status-cancelled';
            case 4: return 'status-completed';
            default: return '';
        }
    }

    getStatusLabel(status: number): string {
        switch (status) {
            case 1: return 'Entered';
            case 2: return 'Dispatched';
            case 3: return 'Cancelled';
            case 4: return 'Completed';
            default: return 'Unknown';
        }
    }

    private calculateStats(items: any[]) {
        this.totalPasses = this.totalRecords;
        this.totalInward = 0;
        this.totalOutward = 0;

        // Since we are using paged data, for true stats we'd need a separate API call or summary in res
        // But for consistency with other modules, we show current context or summary from res
        // If the API returns stats in the response, use that. Let's assume we count from current page for now
        // OR we can add these fields to the API response if we had control.
        // For now, let's just use the current records as a representative sample or use the totalRecords.

        items.forEach(item => {
            if (item.passType === 'Inward') this.totalInward++;
            else if (item.passType === 'Outward') this.totalOutward++;
        });
    }

    onTrackWhatsApp(row: any) {
        if (!row.driverPhone) {
            this.notification.showStatus(false, 'Driver phone number not available');
            return;
        }

        // Clean phone number (remove non-digits)
        const cleanPhone = row.driverPhone.replace(/\D/g, '');
        // Default to India (91) if 10 digits
        const phoneWithCountry = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;

        const companyName = this.companyProfile?.name || this.companyProfile?.tagline || 'Reyakat Electrics';
        const companyPhone = this.companyProfile?.primaryPhone || '';

        // Use dynamic template if available, else fallback to default
        let message = '';
        if (this.companyProfile?.driverWhatsAppMessage) {
            message = this.companyProfile.driverWhatsAppMessage
                .replace(/\[Driver\]/g, row.driverName || 'Driver')
                .replace(/\[Company Name\]/g, companyName)
                .replace(/\[Vehicle No\]/g, row.vehicleNo)
                .replace(/\[Pass No\]/g, row.passNo);
        } else {
            message = `Hello ${row.driverName || 'Driver'}, this is ${companyName}. Please share your LIVE LOCATION for Truck ${row.vehicleNo} (Gate Pass: ${row.passNo}). Shukriya! 🙏`;
            if (companyPhone) {
                message += ` Contact: ${companyPhone}`;
            }
        }

        console.log('Sending WhatsApp Message:', message);
        const url = `whatsapp://send?phone=${phoneWithCountry}&text=${encodeURIComponent(message)}`;

        window.open(url, '_blank');
    }
}
