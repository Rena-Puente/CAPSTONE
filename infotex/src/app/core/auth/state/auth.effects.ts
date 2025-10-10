// core/auth/state/auth.effects.ts
import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { AuthActions } from './auth.actions';
import { tap, exhaustMap, map, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';

@Injectable({ providedIn: 'root' })
export class AuthEffects {
  private actions$ = inject(Actions);
  private router   = inject(Router);
  private authSvc  = inject(AuthService);

  goHomeOnSuccess$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.loginSuccess),
        tap(() => this.router.navigateByUrl('/profile'))
      ),
    { dispatch: false }
  );

  // Logout: llama al backend para revocar tokens y luego navega al welcome
  logout$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.logout),
        exhaustMap(() =>
          this.authSvc.logout().pipe(
            tap(() => this.router.navigateByUrl('/welcome')),
            // En caso de error, igualmente intentamos limpiar UX
            catchError(() => {
              this.router.navigateByUrl('/welcome');
              return of(null);
            })
          )
        )
      ),
    { dispatch: false }
  );

 
}
