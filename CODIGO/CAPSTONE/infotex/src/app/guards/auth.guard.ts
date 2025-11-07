import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { resolveDefaultRouteForUserType } from '../constants/user-type-routing';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.ensureAuthenticated().pipe(
    map((isAuthenticated) => {
      if (isAuthenticated) {
        const userType = authService.getUserType();
        const restrictedDestination = resolveDefaultRouteForUserType(userType);

        if (restrictedDestination && !state.url.startsWith(restrictedDestination)) {
          return router.createUrlTree([restrictedDestination]);
        }

        return true;
      }

      return router.createUrlTree(['/welcome']);
    })
  );
};
