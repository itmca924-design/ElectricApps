import { ApplicationConfig, APP_INITIALIZER, provideBrowserGlobalErrorListeners, provideZoneChangeDetection, LOCALE_ID, isDevMode } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { registerLocaleData, DATE_PIPE_DEFAULT_OPTIONS } from '@angular/common';
import localeIn from '@angular/common/locales/en-IN';

import { routes } from './app.routes';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { DatePipe } from '@angular/common';

import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { authInterceptor } from './core/auth.interceptors';
import { PermissionService } from './core/services/permission.service';
import { MAT_DIALOG_DEFAULT_OPTIONS } from '@angular/material/dialog';
import { provideServiceWorker } from '@angular/service-worker';

registerLocaleData(localeIn);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAnimations(),
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([authInterceptor])
    ),
    provideCharts(withDefaultRegisterables()),
    { provide: LOCALE_ID, useValue: 'en-IN' },
    { provide: DATE_PIPE_DEFAULT_OPTIONS, useValue: { timezone: '+0530' } },
    // Global: Koi bhi dialog outside click pe close nahi hoga
    { provide: MAT_DIALOG_DEFAULT_OPTIONS, useValue: { disableClose: true } },
    {
      // Pre-load menu permissions BEFORE app renders any component.
      // This fixes the race condition where ngOnInit runs before async menu API returns.
      provide: APP_INITIALIZER,
      useFactory: (permissionService: PermissionService) => () => permissionService.initializePermissions(),
      deps: [PermissionService],
      multi: true
    },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
};
