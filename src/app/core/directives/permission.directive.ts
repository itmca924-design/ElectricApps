import { Directive, Input, TemplateRef, ViewContainerRef, inject } from '@angular/core';
import { PermissionService } from '../services/permission.service';

@Directive({
  selector: '[appPermission]',
  standalone: true
})
export class PermissionDirective {
  private templateRef = inject(TemplateRef<any>);
  private viewContainer = inject(ViewContainerRef);
  private permissionService = inject(PermissionService);

  @Input() set appPermission(action: string) {
    const hasPerm = this.checkPermission(action);
    if (hasPerm) {
      this.viewContainer.createEmbeddedView(this.templateRef);
    } else {
      this.viewContainer.clear();
    }
  }

  private checkPermission(action: string): boolean {
    if (!action) return true;

    // Handle standard mapping (CanAdd -> Add, etc for convenience)
    if (['CanView', 'CanAdd', 'CanEdit', 'CanDelete'].includes(action)) {
      return this.permissionService.hasPermission(action as any);
    }

    // Handle shorthands
    if (action === 'Add') return this.permissionService.hasPermission('CanAdd');
    if (action === 'Edit') return this.permissionService.hasPermission('CanEdit');
    if (action === 'Delete') return this.permissionService.hasPermission('CanDelete');
    if (action === 'View') return this.permissionService.hasPermission('CanView');

    // Default to custom action check
    return this.permissionService.hasAction(action);
  }
}
