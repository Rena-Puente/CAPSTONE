import { inject, Injectable, signal } from '@angular/core';
import type { Signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { catchError, map } from 'rxjs/operators';
import { Observable, of, throwError } from 'rxjs';


const STORAGE_KEY = 'infotex_is_logged_in';
const STORAGE_USER_KEY = 'infotex_user_id';
const STORAGE_SESSION_KEY = 'infotex_session';
export const GITHUB_OAUTH_STATE_KEY = 'infotex_github_oauth_state';
export type GithubOAuthMode = 'login' | 'link';

export interface GithubOAuthSession {
  state: string;
  mode: GithubOAuthMode;
  userId?: number | null;
}
const DEFAULT_API_URL = 'http://localhost:3000';
const configuredApiUrl = import.meta.env.NG_APP_API_URL as string | undefined;

function summarizeToken(token: string | null | undefined): string | null {
  if (!token) {
    return null;
  }

  if (token.length <= 8) {
    return token;
  }

  return `${token.slice(0, 4)}...${token.slice(-4)} (len=${token.length})`;
}

interface LoginResponse {
  ok: boolean;
  userId?: number | null;
  userType?: number | null;
  companyId?: number | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  accessExpiresAt?: string | null;
  refreshExpiresAt?: string | null;
  isProfileComplete?: boolean | null;
  error?: string;
}

interface GithubAuthorizeResponse {
  ok: boolean;
  authorizeUrl?: string | null;
  url?: string | null;
  error?: string;
}

interface RefreshResponse {
  ok: boolean;
  accessToken?: string | null;
  accessExpiresAt?: string | null;
  error?: string;
}

interface RegisterResponse {
  ok: boolean;
  error?: string;
}

interface PasswordResetRequestResponse {
  ok: boolean;
  error?: string | null;
  message?: string | null;
}

interface PasswordResetResponse {
  ok: boolean;
  error?: string | null;
  message?: string | null;
}

interface VerifyEmailResponse {
  ok: boolean;
  error?: string | null;
}

interface AuthSession {
  userId: number;
  userType: number | null;
  companyId: number | null;
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

  getSessionSignal(): Signal<AuthSession | null> {
    return this.session.asReadonly();
  }

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

  storeGithubOAuthState(value: GithubOAuthSession): boolean {
    if (!value || typeof value.state !== 'string' || !value.state.trim()) {
      return false;
    }

    try {
      if (typeof sessionStorage === 'undefined') {
        return false;
      }

      const normalizedState = value.state.trim();
      const mode: GithubOAuthMode = value.mode === 'link' ? 'link' : 'login';
      let normalizedUserId: number | null = null;

      if (value.userId !== undefined && value.userId !== null) {
        if (Number.isFinite(value.userId)) {
          normalizedUserId = Number(value.userId);
        } else {
          const parsed = Number.parseInt(String(value.userId), 10);
          normalizedUserId = Number.isNaN(parsed) ? null : parsed;
        }
      }

      const payload: GithubOAuthSession = {
        state: normalizedState,
        mode,
        userId: normalizedUserId
      };

      sessionStorage.setItem(GITHUB_OAUTH_STATE_KEY, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  readGithubOAuthState(): GithubOAuthSession | null {
    try {
      if (typeof sessionStorage === 'undefined') {
        return null;
      }

      const raw = sessionStorage.getItem(GITHUB_OAUTH_STATE_KEY);

      if (!raw) {
        return null;
      }

      const trimmed = raw.trim();

      if (!trimmed) {
        return null;
      }

      if (trimmed.startsWith('{')) {
        const parsed = JSON.parse(trimmed) as Partial<GithubOAuthSession> & Record<string, unknown>;

        if (!parsed || typeof parsed !== 'object' || typeof parsed.state !== 'string') {
          return null;
        }

        const state = parsed.state.trim();

        if (!state) {
          return null;
        }

        const parsedUserId = parsed.userId;
        let userId: number | null = null;

        if (parsedUserId !== undefined && parsedUserId !== null) {
          if (Number.isFinite(parsedUserId)) {
            userId = Number(parsedUserId);
          } else {
            const extracted = Number.parseInt(String(parsedUserId), 10);
            userId = Number.isNaN(extracted) ? null : extracted;
          }
        }

        return {
          state,
          mode: parsed.mode === 'link' ? 'link' : 'login',
          userId
        };
      }

      return { state: trimmed, mode: 'login', userId: null };
    } catch {
      return null;
    }
  }

  clearGithubOAuthState(): void {
    try {
      if (typeof sessionStorage === 'undefined') {
        return;
      }

      sessionStorage.removeItem(GITHUB_OAUTH_STATE_KEY);
    } catch {
      // Swallow storage errors silently.
    }
  }

  register(email: string, password: string, passwordConfirmation: string): Observable<void> {
    return this.http
      .post<RegisterResponse>(`${this.apiUrl}/auth/register`, {
        email,
        password,
        passwordConfirmation
      })
      .pipe(
        map((response) => {
          if (!response.ok) {
            const message = response.error || 'No se pudo crear la cuenta.';
            throw new Error(message);
          }
        }),
        catchError((error) => {
          const message = error?.error?.error || error?.message || 'No se pudo crear la cuenta.';
          console.error('[AuthService] Registration failed', { email, error: message });
          return throwError(() => new Error(message));
        })
      );
  }

  requestPasswordReset(email: string): Observable<string> {
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!normalizedEmail) {
      return throwError(
        () => new Error('Ingresa el correo con el que creaste tu cuenta para continuar.')
      );
    }

    return this.http
      .post<PasswordResetRequestResponse>(`${this.apiUrl}/auth/password/request`, {
        email: normalizedEmail
      })
      .pipe(
        map((response) => {
          if (!response.ok) {
            const message =
              response.error || 'No se pudo enviar el enlace de restablecimiento.';
            throw new Error(message);
          }

          const friendlyMessage =
            typeof response.message === 'string' && response.message.trim().length > 0
              ? response.message.trim()
              : 'Si tu correo está registrado, recibirás un enlace para restablecer tu contraseña.';

          return friendlyMessage;
        }),
        catchError((error) => {
          const message =
            error?.error?.error ||
            error?.message ||
            'No se pudo enviar el enlace de restablecimiento.';

          console.error('[AuthService] Password reset request failed', {
            email: normalizedEmail,
            error: message
          });

          return throwError(() => new Error(message));
        })
      );
  }

  resetPassword(token: string, password: string, passwordConfirmation: string): Observable<string> {
    const normalizedToken = typeof token === 'string' ? token.trim() : '';

    if (!normalizedToken) {
      return throwError(() => new Error('El enlace de restablecimiento no es válido.'));
    }

    return this.http
      .post<PasswordResetResponse>(`${this.apiUrl}/auth/password/reset`, {
        token: normalizedToken,
        password,
        passwordConfirmation
      })
      .pipe(
        map((response) => {
          if (!response.ok) {
            const message =
              response.error || 'No se pudo restablecer la contraseña. Intenta nuevamente.';
            throw new Error(message);
          }

          const friendlyMessage =
            typeof response.message === 'string' && response.message.trim().length > 0
              ? response.message.trim()
              : 'Tu contraseña se actualizó correctamente. Ahora puedes iniciar sesión.';

          return friendlyMessage;
        }),
        catchError((error) => {
          const message =
            error?.error?.error ||
            error?.message ||
            'No se pudo restablecer la contraseña. Intenta nuevamente.';

          console.error('[AuthService] Password reset failed', {
            error: message,
            token: summarizeToken(normalizedToken)
          });

          return throwError(() => new Error(message));
        })
      );
  }

  verifyEmail(token: string): Observable<void> {
    const normalizedToken = typeof token === 'string' ? token.trim() : '';

    if (!normalizedToken) {
      return throwError(() => new Error('El enlace de verificación es inválido.'));
    }

    return this.http
      .post<VerifyEmailResponse>(`${this.apiUrl}/auth/verify-email`, { token: normalizedToken })
      .pipe(
        map((response) => {
          if (!response.ok) {
            const message = response.error || 'No se pudo verificar el correo.';
            throw new Error(message);
          }
        }),
        catchError((error) => {
          const message =
            error?.error?.error || error?.message || 'No se pudo verificar el correo.';

          console.error('[AuthService] Email verification failed', {
            error: message,
            token: summarizeToken(normalizedToken)
          });

          return throwError(() => new Error(message));
        })
      );
  }

  login(
    email: string,
    password: string
  ): Observable<{ userId: number; userType: number | null; companyId: number | null; isProfileComplete: boolean | null }> {
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

        const userType = this.normalizeUserType(response.userType);
        const companyId = this.normalizeId(response.companyId);

        this.persistSession({
          userId: response.userId,
          userType,
          companyId,
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
          accessExpiresAt: response.accessExpiresAt ?? null,
          refreshExpiresAt: response.refreshExpiresAt ?? null
        });

        console.info('[AuthService] Login successful', {
          userId: response.userId,
          userType,
          companyId,
          accessToken: summarizeToken(response.accessToken),
          refreshToken: summarizeToken(response.refreshToken),
          accessExpiresAt: response.accessExpiresAt ?? null,
          refreshExpiresAt: response.refreshExpiresAt ?? null,
          isProfileComplete: response.isProfileComplete ?? null
        });

        return {
          userId: response.userId,
          userType,
          companyId,
          isProfileComplete: response.isProfileComplete ?? null
        };
      }),
      catchError((error) => {
        const message = error?.error?.error || error?.message || 'No se pudo iniciar sesión.';
        console.error('[AuthService] Login failed', { email, error: message });
        return throwError(() => new Error(message));
      })
    );
  }

getGithubAuthorizeUrl(state: string): Observable<string> {
  const params = new HttpParams().set('state', state);

  return this.http
    .get<GithubAuthorizeResponse>(`${this.apiUrl}/auth/github/authorize`, { params })
    .pipe(
      map((response): string => {
        // 1) Validación del OK del backend
        if (!response.ok) {
          throw new Error(response.error ?? 'No se pudo iniciar la autenticación con GitHub.');
        }

        // 2) Resolver URL y asegurar que sea string
        const authorizeUrl = response.authorizeUrl ?? response.url;
        if (!authorizeUrl) {
          throw new Error(response.error ?? 'No se recibió la URL de autorización de GitHub.');
        }

        // 3) Sanity check de formato de URL (opcional pero útil)
        try {
          new URL(authorizeUrl);
        } catch {
          throw new Error('La URL de autorización recibida es inválida.');
        }

        console.info('[AuthService] GitHub authorize URL received');
        return authorizeUrl; // ya es string garantizado
      }),
      catchError((error: unknown) => {
        // Manejo de HttpErrorResponse o Error plano
        const httpErr = error as { error?: any; message?: string };
        const message =
          httpErr?.error?.error ??
          httpErr?.error?.message ??
          httpErr?.message ??
          'No se pudo iniciar la autenticación con GitHub.';

        console.error('[AuthService] GitHub authorize URL failed', { error: message });
        return throwError(() => new Error(message));
      })
    );
}


  completeGithubLogin(
    code: string,
    state: string
  ): Observable<{
    userId: number;
    userType: number | null;
    companyId: number | null;
    isProfileComplete: boolean | null;
  }> {
    return this.http
      .post<LoginResponse>(`${this.apiUrl}/auth/github/callback`, { code, state })
      .pipe(
        map((response) => {
          if (
            !response.ok ||
            !response.userId ||
            !response.accessToken ||
            !response.refreshToken
          ) {
            const message = response.error || 'No se pudo completar el inicio de sesión con GitHub.';
            throw new Error(message);
          }

          const userType = this.normalizeUserType(response.userType);
          const companyId = this.normalizeId(response.companyId);

          this.persistSession({
            userId: response.userId,
            userType,
            companyId,
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            accessExpiresAt: response.accessExpiresAt ?? null,
            refreshExpiresAt: response.refreshExpiresAt ?? null
          });

          console.info('[AuthService] GitHub login successful', {
            userId: response.userId,
            userType,
            accessToken: summarizeToken(response.accessToken),
            refreshToken: summarizeToken(response.refreshToken),
            accessExpiresAt: response.accessExpiresAt ?? null,
            refreshExpiresAt: response.refreshExpiresAt ?? null,
            isProfileComplete: response.isProfileComplete ?? null
          });

          return {
            userId: response.userId,
            userType,
            companyId,
            isProfileComplete: response.isProfileComplete ?? null
          };
        }),
        catchError((error) => {
          const message =
            error?.error?.error || error?.message || 'No se pudo completar el inicio de sesión con GitHub.';
          console.error('[AuthService] GitHub login failed', { error: message });
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

  getUserId(): number | null {
    return this.session()?.userId ?? null;
  }

  getUserType(): number | null {
    return this.session()?.userType ?? null;
  }

  getCompanyId(): number | null {
    return this.session()?.companyId ?? null;
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

        console.info('[AuthService] Access token refreshed', {
          refreshToken: summarizeToken(refreshToken),
          newAccessToken: summarizeToken(response.accessToken),
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
      const parsed = JSON.parse(raw) as Partial<AuthSession> & Record<string, unknown>;

      if (!parsed || typeof parsed !== 'object') {
        return null;
      }

      const userIdRaw = parsed.userId;
      const parsedUserId =
        typeof userIdRaw === 'number' && Number.isFinite(userIdRaw)
          ? userIdRaw
          : Number.parseInt(String(userIdRaw ?? ''), 10);

      if (!parsedUserId || Number.isNaN(parsedUserId)) {
        return null;
      }

      const accessToken =
        typeof parsed.accessToken === 'string' && parsed.accessToken.trim().length > 0
          ? parsed.accessToken
          : null;
      const refreshToken =
        typeof parsed.refreshToken === 'string' && parsed.refreshToken.trim().length > 0
          ? parsed.refreshToken
          : null;

      if (!accessToken || !refreshToken) {
        return null;
      }

      const normalized: AuthSession = {
        userId: parsedUserId,
        userType: this.normalizeUserType(parsed.userType),
        companyId: this.normalizeId(parsed.companyId),
        accessToken,
        refreshToken,
        accessExpiresAt:
          typeof parsed.accessExpiresAt === 'string' && parsed.accessExpiresAt.trim().length > 0
            ? parsed.accessExpiresAt
            : null,
        refreshExpiresAt:
          typeof parsed.refreshExpiresAt === 'string' && parsed.refreshExpiresAt.trim().length > 0
            ? parsed.refreshExpiresAt
            : null
      };

      console.info('[AuthService] Session restored from storage', {
        userId: normalized.userId,
        userType: normalized.userType,
        companyId: normalized.companyId,
        accessExpiresAt: normalized.accessExpiresAt,
        refreshExpiresAt: normalized.refreshExpiresAt
      });

      return normalized;
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

    console.info('[AuthService] Session persisted', {
      userId: session.userId,
      userType: session.userType,
      companyId: session.companyId,
      accessExpiresAt: session.accessExpiresAt,
      refreshExpiresAt: session.refreshExpiresAt
    });
  }

  private clearSession(): void {
    this.session.set(null);

    if (!this.storageAvailable()) {
      return;
    }

    localStorage.removeItem(STORAGE_SESSION_KEY);
    this.clearLegacyStorage();

    console.info('[AuthService] Session cleared');
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

  private normalizeId(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const normalized = Math.trunc(value);
      return normalized > 0 ? normalized : null;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number.parseInt(value, 10);

      if (!Number.isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return null;
  }

  private normalizeUserType(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number.parseInt(value, 10);

      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }

    return null;
  }

  private clearLegacyStorage(): void {
    if (!this.storageAvailable()) {
      return;
    }

    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_USER_KEY);
  }
}
