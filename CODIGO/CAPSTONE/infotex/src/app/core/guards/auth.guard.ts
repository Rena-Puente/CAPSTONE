// core/auth/auth.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { map, catchError, of } from 'rxjs';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Si ya tengo token en memoria, ok
  if (auth.accessToken()) return true;

  // Si no tengo, intento refresh (usando cookie). Si funciona, ok.
  return auth.hydrateFromRefresh().pipe(
    map(ok => (ok ? true : router.createUrlTree(['/welcome']))),
    catchError(() => of(router.createUrlTree(['/welcome'])))
  );
};