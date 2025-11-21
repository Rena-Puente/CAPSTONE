import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, tap, throwError } from 'rxjs';

import { API_AUTH_BASE } from '../../../environments/environment';
import { SessionService, SessionData } from './session.service';
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterPayload extends LoginCredentials {
  [key: string]: unknown;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  tokens: AuthTokens;
  userType: number | string | null;
  userId: number | null;
  companyId: number | null;
  isProfileComplete: boolean;
}

export interface AuthApiResponse {
  accessToken?: string;
  refreshToken?: string;
  token?: string;
  refresh_token?: string;
  userType?: string;
  userId?: number | null;
  companyId?: number | null;
  isProfileComplete?: boolean;
  user?: {
    type?: string;
    role?: string;
    id?: number | null;
    companyId?: number | null;
    isProfileComplete?: boolean;
    profileComplete?: boolean;
    profileCompleted?: boolean;
  };
  data?: {
    accessToken?: string;
    refreshToken?: string;
    userType?: string;
    userId?: number | null;
    companyId?: number | null;
    isProfileComplete?: boolean;
  };
  message?: string;
}

export class AuthServiceError extends Error {
  constructor(
    override readonly message: string,
    public readonly translationKey: string,
    public readonly status: number,
    options?: { cause?: unknown }
  ) {
    super(message);
    if (options?.cause) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
    this.name = 'AuthServiceError';
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly sessionService = inject(SessionService);
  login(credentials: LoginCredentials): Observable<AuthResult> {
    return this.http
      .post<AuthApiResponse>(`${API_AUTH_BASE}/login`, credentials)
      .pipe(
        map((response) => this.normalizeAuthResponse(response)),
        tap((result) => this.persistSession(result)),
        catchError((error) => this.handleError(error))
      );
  }

  register(payload: RegisterPayload): Observable<AuthResult> {
    return this.http
      .post<AuthApiResponse>(`${API_AUTH_BASE}/register`, payload)
      .pipe(
        map((response) => this.normalizeAuthResponse(response)),
        tap((result) => this.persistSession(result)),
        catchError((error) => this.handleError(error))

      );
  }
  async logout(): Promise<void> {
    await this.sessionService.clear();
  }
  private normalizeAuthResponse(response: AuthApiResponse): AuthResult {
    const accessToken =
      response.accessToken ||
      response.token ||
      response.data?.accessToken;
    const refreshToken =
      response.refreshToken || response.refresh_token || response.data?.refreshToken;

    if (!accessToken || !refreshToken) {
      throw new AuthServiceError(
        'Tokens de autenticación no presentes en la respuesta.',
        'auth.errors.missingTokens',
        0
      );
    }

    const userTypeRaw =
      response.userType ||
      response.data?.userType ||
      response.user?.type ||
      response.user?.role ||
      null;

    const userIdRaw =
      response.userId ??
      response.data?.userId ??
      response.user?.id ??
      null;

    const companyIdRaw =
      response.companyId ??
      response.data?.companyId ??
      response.user?.companyId ??
      null;

    const userType = this.parseNumericValue(userTypeRaw, userTypeRaw ?? null);
    const userId = this.parseNumericValue(userIdRaw, null);
    const companyId = this.parseNumericValue(companyIdRaw, null);

    const isProfileComplete =
      response.isProfileComplete ??
      response.data?.isProfileComplete ??
      response.user?.isProfileComplete ??
      response.user?.profileComplete ??
      response.user?.profileCompleted ??
      false;

    return {
      tokens: {
        accessToken,
        refreshToken,
      },
      userType,
      userId,
      companyId,
      isProfileComplete,
    };
  }

  private handleError(error: unknown): Observable<never> {
    if (error instanceof HttpErrorResponse) {
      const translationKey = this.mapTranslationKey(error.status);
      const message =
        error.error?.message ||
        error.statusText ||
        'No fue posible completar la solicitud.';

      return throwError(
        () => new AuthServiceError(message, translationKey, error.status, { cause: error })
      );
    }

    return throwError(
      () =>
        new AuthServiceError(
          'Ocurrió un error inesperado al comunicarse con el servidor.',
          'auth.errors.unexpected',
          0,
          { cause: error }
        )
    );
  }

  private mapTranslationKey(status: number): string {
    switch (status) {
      case 401:
        return 'auth.errors.invalidCredentials';
      case 409:
        return 'auth.errors.userAlreadyExists';
      case 422:
        return 'auth.errors.validationFailed';
      default:
        return 'auth.errors.generic';
    }
  }
  
  private persistSession(result: AuthResult): void {
    const session: SessionData = {
      tokens: result.tokens,
      userId: result.userId,
      userType: result.userType,
      companyId: result.companyId,
      isProfileComplete: result.isProfileComplete,
    };

    void this.sessionService.setSession(session);
  }

  private parseNumericValue(value: unknown, fallback: number | string | null): number | null | string {
    if (value === null || value === undefined) {
      return typeof fallback === 'number' ? fallback : null;
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : typeof fallback === 'number' ? fallback : null;
    }

    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }

    return fallback;
  }
}
