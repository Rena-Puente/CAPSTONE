import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Si NO está logueado -> puede pasar (welcome público)
  // Si SÍ está logueado -> redirige a /profile (u /home si prefieres)
  return !auth.isLoggedIn() ? true : router.createUrlTree(['/profile']);
};
