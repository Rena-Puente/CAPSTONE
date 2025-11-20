import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { resolveDefaultRouteForUserType, COMPANY_USER_TYPE } from '../constants/user-type-routing';
import { AuthService } from '../services/auth.service';

function redirectToDestination(router: Router, destination: string): UrlTree {
  return router.createUrlTree([destination]);
}

export const companyGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
      return router.createUrlTree(['/welcome']);
  }

  const userType = authService.getUserType();

  if (userType === COMPANY_USER_TYPE) {
    return true;
  }

  const destination = resolveDefaultRouteForUserType(userType) ?? '/home';

  if (state.url.startsWith(destination)) {
    return true;
  }

  return redirectToDestination(router, destination);
};
