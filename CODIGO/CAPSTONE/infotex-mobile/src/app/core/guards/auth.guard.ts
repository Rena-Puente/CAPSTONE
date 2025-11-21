import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';

import { SessionService } from '../services/session.service';

export const authGuard: CanActivateFn = async (_route, state): Promise<boolean | UrlTree> => {
  const sessionService = inject(SessionService);
  const router = inject(Router);

  const isLoggedIn = await sessionService.isLoggedIn();

  if (isLoggedIn) {
    // Usuario autenticado → permitir acceso
    return true;
  }

  console.warn(
    '[authGuard] Acceso bloqueado. Usuario sin sesión intentando entrar a:',
    state.url
  );

  // Redirigir al login guardando la ruta original
  return router.createUrlTree(['/login'], {
    queryParams: {
      redirectTo: state.url !== '/' ? state.url : '/usuario-logueado/empleos',
    },
  });
};
