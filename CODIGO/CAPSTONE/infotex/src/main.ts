import 'zone.js';

import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, Routes, withComponentInputBinding } from '@angular/router';
import { importProvidersFrom, isDevMode } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { provideAnimations } from '@angular/platform-browser/animations';
import {
  provideHttpClient,
  withFetch,
  withInterceptorsFromDi,
  HTTP_INTERCEPTORS
} from '@angular/common/http';

import { AppComponent } from './app/app';
import { Home } from './app/pages/home/home';
import { About } from './app/pages/about/about';
import { GuestHome } from './app/pages/guest-home/guest-home';
import { Profile } from './app/pages/profile/profile';

import { AuthInterceptor } from './app/core/interceptors/auth.interceptor';
import { authGuard } from './app/core/guards/auth.guard';
import { guestGuard } from './app/core/guards/guest.guard';

// NgRx
import { provideStore, provideState } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';

// Auth feature + effects + persistencia
import { authFeature } from './app/core/auth/state/auth.reducer';
import { AuthEffects } from './app/core/auth/state/auth.effects';
import { metaReducers } from './app/core/store/store.metareducer';

const routes: Routes = [
  // Público
  { path: 'welcome', component: GuestHome, canActivate: [guestGuard] },
  { path: 'about', component: About },

  // Protegido
  { path: 'home', component: Home, canActivate: [authGuard] },
  { path: 'profile', component: Profile, canActivate: [authGuard] },

  // raíz y fallback
  { path: '', redirectTo: 'welcome', pathMatch: 'full' },
  { path: '**', redirectTo: 'welcome' },
];

bootstrapApplication(AppComponent, {
  providers: [
    // Router
    provideRouter(routes, withComponentInputBinding()),

    // Formularios / animaciones (FormsModule solo si lo necesitas global; si no, puedes quitarlo)
    importProvidersFrom(FormsModule),
    provideAnimations(),

    // HttpClient + interceptor por DI (clase)
    provideHttpClient(withFetch(), withInterceptorsFromDi()),
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },

    // NgRx Store raíz con metaReducers (ej. persistencia)
    provideStore({}, { metaReducers }),
    // Feature de autenticación
    provideState(authFeature),
    // Efectos
    provideEffects([AuthEffects]),
    // DevTools
    provideStoreDevtools({ maxAge: 25, logOnly: !isDevMode(), connectInZone: true }),
  ],
}).catch(err => console.error(err));
