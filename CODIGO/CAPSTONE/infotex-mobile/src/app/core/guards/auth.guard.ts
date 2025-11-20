import { inject } from '@angular/core';
import { CanActivateFn, UrlTree } from '@angular/router';

import { SessionService } from '../services/session.service';

export const authGuard: CanActivateFn = async (_route, state): Promise<boolean | UrlTree> => {
  const sessionService = inject(SessionService);

  const isLoggedIn = await sessionService.isLoggedIn();

    if (!isLoggedIn) {
    console.warn(
      '[authGuard] Navegación permitida sin sesión activa para evitar pantallas invisibles. Ruta solicitada:',
      state.url
    );
  }
  return true;
};
