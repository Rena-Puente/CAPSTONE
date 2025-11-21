import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    // OJO: no se puede usar canActivate aquí
    redirectTo: 'login',
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./pages/auth/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./pages/auth/register/register.page').then(
        (m) => m.RegisterPage
      ),
  },
  {
    path: 'usuario-logueado',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./pages/usuario-logueado/usuario-logueado.routes').then(
        (m) => m.routes
      ),
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];
