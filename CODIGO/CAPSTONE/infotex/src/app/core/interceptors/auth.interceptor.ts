// core/auth/auth.interceptor.ts
import { Injectable, inject } from '@angular/core';
import {
  HttpEvent, HttpHandler, HttpInterceptor, HttpRequest, HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { AuthService } from '../auth/auth.service'; // ← ruta corregida

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private auth = inject(AuthService);

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = this.auth.accessToken();

    // Adjunta Authorization si hay token; siempre withCredentials para enviar cookies (refresh)
    const authReq = token
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` }, withCredentials: true })
      : req.clone({ withCredentials: true });

    const isRefreshCall = authReq.url.includes('/api/auth/refresh');
    const isLoginCall   = authReq.url.includes('/api/auth/login');
    const alreadyRetried = authReq.headers.has('X-Retry');

    return next.handle(authReq).pipe(
      catchError((err: any) => {
        // Solo intentamos refresh si:
        // - Es 401
        // - No es la llamada a /refresh ni /login
        // - No hemos reintentado ya esta misma request
        if (
          err instanceof HttpErrorResponse &&
          err.status === 401 &&
          !isRefreshCall &&
          !isLoginCall &&
          !alreadyRetried
        ) {
          return this.auth.hydrateFromRefresh().pipe(
            switchMap((ok) => {
              const newToken = this.auth.accessToken();
              if (!ok || !newToken) return throwError(() => err);

              // Reintentamos la request original con el token nuevo, marcando X-Retry
              const retryReq = req.clone({
                setHeaders: { Authorization: `Bearer ${newToken}`, 'X-Retry': '1' },
                withCredentials: true
              });
              return next.handle(retryReq);
            }),
            catchError(() => throwError(() => err))
          );
        }

        return throwError(() => err);
      })
    );
  }
}
