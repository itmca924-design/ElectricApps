import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, ActivatedRoute, NavigationEnd, RouterModule } from '@angular/router';
import { filter } from 'rxjs/operators';
import { MaterialModule } from '../../../shared/material/material/material-module';

export interface Breadcrumb {
  label: string;
  url: string;
}

@Component({
  selector: 'app-breadcrumb',
  standalone: true,
  imports: [CommonModule, RouterModule, MaterialModule],
  templateUrl: './breadcrumb-component.html',
  styleUrls: ['./breadcrumb-component.scss'],
})
export class BreadcrumbComponent {

  breadcrumbs: Breadcrumb[] = [];

  private router = inject(Router);
  private route = inject(ActivatedRoute);

  constructor() {
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.breadcrumbs = this.buildBreadcrumb(this.route.root);
      });
  }

  private buildBreadcrumb(
    route: ActivatedRoute,
    url: string = '',
    crumbs: Breadcrumb[] = []
  ): Breadcrumb[] {

    const children = route.children;
    if (children.length === 0) return crumbs;

    for (const child of children) {
      const routeURL: string = child.snapshot.url.map(segment => segment.path).join('/');
      let nextUrl = url;
      if (routeURL !== '') {
        nextUrl += `/${routeURL}`;
      }

      const label = child.snapshot.data['breadcrumb'];
      if (label) {
        // Special Case: Direct Home/App link should go to dashboard if current path is app
        let finalUrl = nextUrl;
        if (routeURL === 'app' && label === 'Home') {
          finalUrl = '/app/dashboard';
        }
        crumbs.push({ label, url: finalUrl });
      }

      return this.buildBreadcrumb(child, nextUrl, crumbs);
    }

    return crumbs;
  }
}
