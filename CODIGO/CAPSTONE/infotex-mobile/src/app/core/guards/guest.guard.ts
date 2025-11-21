import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';

import { SessionService } from '../services/session.service';

const HOME_ROUTE = '/usuario-logueado/empleos';

export const guestGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const sessionService = inject(SessionService);
  const router = inject(Router);

  const isLoggedIn = await sessionService.isLoggedIn();

  if (!isLoggedIn) {
    // Invitado: puede entrar a login/register
    return true;
  }

  // Logueado: lo expulsamos a home de logueado
  return router.createUrlTree([HOME_ROUTE]);
};
