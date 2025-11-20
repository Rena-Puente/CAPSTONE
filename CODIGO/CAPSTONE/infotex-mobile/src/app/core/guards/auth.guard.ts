import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';

import { SessionService } from '../services/session.service';

const LOGIN_ROUTE = '/login';

export const authGuard: CanActivateFn = async (_route, state): Promise<boolean | UrlTree> => {
  const sessionService = inject(SessionService);
  const router = inject(Router);

  const isLoggedIn = await sessionService.isLoggedIn();

  if (isLoggedIn) {
    return true;
  }

  const urlTree = router.createUrlTree([LOGIN_ROUTE], {
    queryParams: { redirectTo: state.url },
  });

  return urlTree;
};
