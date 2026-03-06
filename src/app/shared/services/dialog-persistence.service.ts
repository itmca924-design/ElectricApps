import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { StatusDialogComponent } from '../components/status-dialog-component/status-dialog-component';

const DIALOG_KEY = 'pendingStatusDialog';

/**
 * Service to handle dialogs that need to prevent outside-click close.
 * On page refresh: navigates to a safe URL and clears state silently (no dialog reopen).
 * On normal load: dialog opens with disableClose: true, clears on OK click.
 */
@Injectable({ providedIn: 'root' })
export class DialogPersistenceService {
    private dialog = inject(MatDialog);
    private router = inject(Router);

    /**
     * Open a StatusDialog with disableClose.
     * @param data       - StatusDialogComponent data
     * @param restoreUrl - URL to navigate to on page refresh (clears dialog silently)
     */
    openPersistent(data: any, restoreUrl?: string) {
        this._saveState({ ...data, _restoreUrl: restoreUrl ?? null });
        return this._openAndClear(data);
    }

    /**
     * Called on App.ngOnInit.
     * On page refresh: if a pending dialog exists, navigate to restoreUrl silently.
     * The dialog is NOT reopened — sessionStorage clears after navigation.
     * hasPendingDialog() stays true during the async window to block stale checks.
     */
    checkAndRestore() {
        const saved = sessionStorage.getItem(DIALOG_KEY);
        if (!saved) return;

        try {
            const { _restoreUrl } = JSON.parse(saved);

            if (_restoreUrl) {
                // Navigate to safe page, then clear — no dialog reopen
                this.router.navigateByUrl(_restoreUrl).then(() => {
                    sessionStorage.removeItem(DIALOG_KEY);
                });
            } else {
                // No restoreUrl — just clear
                sessionStorage.removeItem(DIALOG_KEY);
            }
        } catch {
            sessionStorage.removeItem(DIALOG_KEY);
        }
    }

    /** Returns true if a pending dialog exists in sessionStorage. */
    hasPendingDialog(): boolean {
        return !!sessionStorage.getItem(DIALOG_KEY);
    }

    clearState() {
        sessionStorage.removeItem(DIALOG_KEY);
    }

    private _saveState(data: any) {
        try {
            sessionStorage.setItem(DIALOG_KEY, JSON.stringify(data));
        } catch { /* ignore quota errors */ }
    }

    private _openAndClear(data: any) {
        const ref = this.dialog.open(StatusDialogComponent, {
            data,
            disableClose: true
        });
        ref.afterClosed().subscribe(() => {
            sessionStorage.removeItem(DIALOG_KEY);
        });
        return ref;
    }
}
