import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
  isDevMode,
} from '@angular/core';

import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import {
  HTTP_INTERCEPTORS,
  provideHttpClient,
  withFetch,
  withInterceptorsFromDi,
} from '@angular/common/http';

// ⬇️ NgRx
import { provideStore, provideState } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';

// ⬇️ Tus features / effects / meta-reducers
import { authFeature } from './core/auth/state/auth.reducer';
import { AuthEffects } from './core/auth/state/auth.effects';
import { metaReducers } from './core/store/store.metareducer';
import { AuthInterceptor } from './core/interceptors/auth.interceptor';

// (Opcional) si luego agregas la UI de pestañas:
// import { uiFeature } from './core/ui/state/ui.reducer';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),

    provideRouter(routes),
    provideClientHydration(),
    provideAnimations(),

    provideHttpClient(withFetch(), withInterceptorsFromDi()),
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
    // 🧠 Store raíz con persistencia (localStorageSync)
    provideStore({}, { metaReducers }),

    // 🔐 Feature de autenticación
    provideState(authFeature),
    // (Opcional) pestañas/UI:
    // provideState(uiFeature),

    // ⚡ Effects (login/logout + navegación)
    provideEffects([AuthEffects]),

    // 🧰 DevTools (desactiva logOnly=false en prod si quieres solo lectura)
    provideStoreDevtools({
      maxAge: 25,
      connectInZone: true,
      logOnly: !isDevMode(),
    }),
  ]
};
