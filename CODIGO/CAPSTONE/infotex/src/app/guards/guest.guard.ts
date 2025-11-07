import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { resolveDefaultRouteForUserType } from '../constants/user-type-routing';
import { AuthService } from '../services/auth.service';

export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return true;
  }

  const userType = authService.getUserType();
  const destination = resolveDefaultRouteForUserType(userType) ?? '/home';

  return router.createUrlTree([destination]);
};
