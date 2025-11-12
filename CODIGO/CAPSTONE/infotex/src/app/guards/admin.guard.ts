import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ADMIN_USER_TYPE, resolveDefaultRouteForUserType } from '../constants/user-type-routing';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/welcome']);
  }

  const userType = authService.getUserType();

  if (userType === ADMIN_USER_TYPE) {
    return true;
  }

  const destination = resolveDefaultRouteForUserType(userType) ?? '/home';

  if (state.url.startsWith(destination)) {
    return true;
  }

  return router.createUrlTree([destination]);
};
