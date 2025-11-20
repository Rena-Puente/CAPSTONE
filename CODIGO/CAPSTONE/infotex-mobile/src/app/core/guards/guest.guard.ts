import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';

import { SessionService } from '../services/session.service';

const HOME_ROUTE = '/tabs/tab1';

export const guestGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const sessionService = inject(SessionService);
  const router = inject(Router);

  const isLoggedIn = await sessionService.isLoggedIn();

  if (!isLoggedIn) {
    return true;
  }

  return router.createUrlTree([HOME_ROUTE]);
};
