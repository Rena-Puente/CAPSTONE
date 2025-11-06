import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { resolveDefaultRouteForUserType } from '../constants/user-type-routing';
import { AuthService } from '../services/auth.service';

export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const isLoggedIn = authService.isAuthenticated(); // o tu método equivalente

  if (isLoggedIn) {
    // si el usuario ya está logueado, redirígelo al home
    const userType = authService.getUserType();
    const destination = resolveDefaultRouteForUserType(userType) ?? '/home';

    router.navigate([destination]);
    return false;
  }

  // si NO está logueado, puede ver el welcome
  return true;
};
