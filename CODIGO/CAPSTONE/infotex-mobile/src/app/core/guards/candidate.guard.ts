import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';

import { SessionService } from '../services/session.service';

const CANDIDATE_USER_TYPE = 1;

export const candidateGuard: CanActivateFn = async (_route, state): Promise<boolean | UrlTree> => {
  const sessionService = inject(SessionService);
  const router = inject(Router);

  const userType = await sessionService.getUserType();

  if (
    userType === CANDIDATE_USER_TYPE ||
    (typeof userType === 'string' && userType.toLowerCase() === 'candidate')
  ) {
    return true;
  }

  console.warn('[candidateGuard] Acceso denegado para rol no candidato', { state: state.url });
  return router.createUrlTree(['/usuario-logueado/empleos']);
};
