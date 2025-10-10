// src/main.server.ts
import 'zone.js/node';

import { bootstrapApplication } from '@angular/platform-browser';
import { importProvidersFrom, isDevMode } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import {
  provideHttpClient,
  withFetch,
  withInterceptorsFromDi,
  HTTP_INTERCEPTORS,
} from '@angular/common/http';

import { AppComponent } from './app/app';
import { routes } from './app/app.routes';

// Interceptor DI (clase)
import { AuthInterceptor } from './app/core/interceptors/auth.interceptor';

// NgRx (igual que en main.ts)
import { provideStore, provideState } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { authFeature } from './app/core/auth/state/auth.reducer';
import { AuthEffects } from './app/core/auth/state/auth.effects';
import { metaReducers } from './app/core/store/store.metareducer';

// (Opcional) si usas Forms de forma global en SSR
import { FormsModule } from '@angular/forms';

const bootstrap = () =>
  bootstrapApplication(AppComponent, {
    providers: [
      provideServerRendering(), // 👈 habilita SSR

      // Router
      provideRouter(routes, withComponentInputBinding()),

      // (Opcional) Formularios y animaciones en SSR
      importProvidersFrom(FormsModule),
      provideAnimations(),

      // HttpClient + interceptor (igual que en main.ts)
      provideHttpClient(withFetch(), withInterceptorsFromDi()),
      { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },

      // NgRx (igual que en main.ts)
      provideStore({}, { metaReducers }),
      provideState(authFeature),
      provideEffects([AuthEffects]),
      provideStoreDevtools({ maxAge: 25, logOnly: !isDevMode(), connectInZone: true }),
    ],
  });

export default bootstrap;

// (opcional) Manejo de errores tipado si ejecutas aquí:
bootstrap().catch((err: unknown) => console.error(err));
