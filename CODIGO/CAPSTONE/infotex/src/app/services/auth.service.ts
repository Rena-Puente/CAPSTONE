import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map } from 'rxjs/operators';
import { Observable, throwError } from 'rxjs';

const STORAGE_KEY = 'infotex_is_logged_in';
const STORAGE_USER_KEY = 'infotex_user_id';
const DEFAULT_API_URL = 'http://localhost:3000';
const configuredApiUrl = import.meta.env.NG_APP_API_URL as string | undefined;

interface LoginResponse {
  ok: boolean;
  userId?: number | null;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = (configuredApiUrl?.replace(/\/$/, '') || DEFAULT_API_URL).replace(/\/$/, '');
  private readonly loggedIn = signal<boolean>(this.restoreStatus());

  isAuthenticated(): boolean {
    return this.loggedIn();
  }

  login(email: string, password: string): Observable<number> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/auth/login`, { email, password }).pipe(
      map((response) => {
        if (!response.ok || !response.userId) {
          const message = response.error || 'Credenciales inválidas.';
          throw new Error(message);
        }

        this.persistLogin(response.userId);
        return response.userId;
      }),
      catchError((error) => {
        const message = error?.error?.error || error?.message || 'No se pudo iniciar sesión.';
        return throwError(() => new Error(message));
      })
    );
  }

  logout(): void {
    this.loggedIn.set(false);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_USER_KEY);
    }
  }

  private restoreStatus(): boolean {
    return typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'true';
  }

  private persistLogin(userId: number): void {
    this.loggedIn.set(true);

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, 'true');
      localStorage.setItem(STORAGE_USER_KEY, String(userId));
    }
  }
}
