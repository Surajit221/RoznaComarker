import {
  ApplicationConfig,
  importProvidersFrom,
  inject,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection
} from '@angular/core';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideFirebaseApp, initializeApp, FirebaseApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';

import { routes } from './app.routes';
import { environment } from '../environments/environment';
import { JwtInterceptor } from './auth/jwt.interceptor';
import { AuthErrorInterceptor } from './auth/auth-error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(withInterceptorsFromDi()),

    { provide: HTTP_INTERCEPTORS, useClass: JwtInterceptor, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: AuthErrorInterceptor, multi: true },

    // 🔥 Correct AngularFire init
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth(inject(FirebaseApp))),

    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })
    )
  ]
};
