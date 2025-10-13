import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map } from 'rxjs/operators';
import { Observable, of, throwError } from 'rxjs';

const STORAGE_KEY = 'infotex_is_logged_in';
const STORAGE_USER_KEY = 'infotex_user_id';
const STORAGE_SESSION_KEY = 'infotex_session';
const DEFAULT_API_URL = 'http://localhost:3000';
const configuredApiUrl = import.meta.env.NG_APP_API_URL as string | undefined;

interface LoginResponse {
  ok: boolean;
  userId?: number | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  accessExpiresAt?: string | null;
  refreshExpiresAt?: string | null;
  error?: string;
}

interface RefreshResponse {
  ok: boolean;
  accessToken?: string | null;
  accessExpiresAt?: string | null;
  error?: string;
}

interface AuthSession {
  userId: number;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string | null;
  refreshExpiresAt: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = (configuredApiUrl?.replace(/\/$/, '') || DEFAULT_API_URL).replace(/\/$/, '');
  private readonly session = signal<AuthSession | null>(this.restoreSession());

  isAuthenticated(): boolean {
    const session = this.session();

    if (!session) {
      return false;
    }

    return !this.isExpired(session.accessExpiresAt);
  }

  ensureAuthenticated(): Observable<boolean> {
    const session = this.session();

    if (!session) {
      this.clearSession();
      return of(false);
    }

    if (!this.isExpired(session.accessExpiresAt)) {
      return of(true);
    }

    if (this.isExpired(session.refreshExpiresAt)) {
      this.clearSession();
      return of(false);
    }

    return this.refreshAccessToken(session.refreshToken).pipe(
      map(() => true),
      catchError(() => {
        this.clearSession();
        return of(false);
      })
    );
  }

  login(email: string, password: string): Observable<number> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/auth/login`, { email, password }).pipe(
      map((response) => {
        if (
          !response.ok ||
          !response.userId ||
          !response.accessToken ||
          !response.refreshToken
        ) {
          const message = response.error || 'Credenciales inválidas.';
          throw new Error(message);
        }

        this.persistSession({
          userId: response.userId,
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
          accessExpiresAt: response.accessExpiresAt ?? null,
          refreshExpiresAt: response.refreshExpiresAt ?? null
        });
        return response.userId;
      }),
      catchError((error) => {
        const message = error?.error?.error || error?.message || 'No se pudo iniciar sesión.';
        return throwError(() => new Error(message));
      })
    );
  }

  logout(): void {
    const currentSession = this.session();
    this.clearSession();

    if (!currentSession) {
      return;
    }

    this.http
      .post(`${this.apiUrl}/auth/logout`, {
        accessToken: currentSession.accessToken,
        refreshToken: currentSession.refreshToken
      })
      .pipe(catchError(() => of(null)))
      .subscribe();
  }

  getAccessToken(): string | null {
    return this.session()?.accessToken ?? null;
  }

  private refreshAccessToken(refreshToken: string): Observable<void> {
    return this.http.post<RefreshResponse>(`${this.apiUrl}/auth/refresh`, { refreshToken }).pipe(
      map((response) => {
        if (!response.ok || !response.accessToken) {
          const message = response.error || 'No se pudo renovar el token de acceso.';
          throw new Error(message);
        }

        const current = this.session();

        if (!current) {
          throw new Error('La sesión ya no está disponible.');
        }

        this.persistSession({
          ...current,
          accessToken: response.accessToken,
          accessExpiresAt: response.accessExpiresAt ?? null
        });
      })
    );
  }

  private restoreSession(): AuthSession | null {
    if (!this.storageAvailable()) {
      return null;
    }

    this.clearLegacyStorage();

    const raw = localStorage.getItem(STORAGE_SESSION_KEY);

    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as AuthSession;

      if (!parsed || typeof parsed !== 'object') {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  private persistSession(session: AuthSession): void {
    this.session.set(session);

    if (!this.storageAvailable()) {
      return;
    }

    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
  }

  private clearSession(): void {
    this.session.set(null);

    if (!this.storageAvailable()) {
      return;
    }

    localStorage.removeItem(STORAGE_SESSION_KEY);
    this.clearLegacyStorage();
  }

  private isExpired(isoString: string | null | undefined): boolean {
    if (!isoString) {
      return false;
    }

    const timestamp = Date.parse(isoString);

    if (Number.isNaN(timestamp)) {
      return true;
    }

    return timestamp <= Date.now();
  }

  private storageAvailable(): boolean {
    return typeof localStorage !== 'undefined';
  }

  private clearLegacyStorage(): void {
    if (!this.storageAvailable()) {
      return;
    }

    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_USER_KEY);
  }
}
