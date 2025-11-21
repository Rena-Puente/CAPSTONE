import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';

import { SessionService } from '../services/session.service';

const COMPANY_USER_TYPE = 3;

export const companyGuard: CanActivateFn = async (_route, state): Promise<boolean | UrlTree> => {
  const sessionService = inject(SessionService);
  const router = inject(Router);

  const userType = await sessionService.getUserType();

  if (
    userType === COMPANY_USER_TYPE ||
    (typeof userType === 'string' && userType.toLowerCase() === 'company')
  ) {
    return true;
  }

  console.warn('[companyGuard] Acceso denegado para rol no empresa', { state: state.url });
  return router.createUrlTree(['/usuario-logueado/empleos']);
};
