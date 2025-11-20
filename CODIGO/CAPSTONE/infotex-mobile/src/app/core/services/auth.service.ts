import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';

import { API_AUTH_BASE } from '../../../environments/environment';

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
  userType: string;
  isProfileComplete: boolean;
}

export interface AuthApiResponse {
  accessToken?: string;
  refreshToken?: string;
  token?: string;
  refresh_token?: string;
  userType?: string;
  isProfileComplete?: boolean;
  user?: {
    type?: string;
    role?: string;
    isProfileComplete?: boolean;
    profileComplete?: boolean;
    profileCompleted?: boolean;
  };
  data?: {
    accessToken?: string;
    refreshToken?: string;
    userType?: string;
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
    super(message, options);
    this.name = 'AuthServiceError';
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  login(credentials: LoginCredentials): Observable<AuthResult> {
    return this.http
      .post<AuthApiResponse>(`${API_AUTH_BASE}/login`, credentials)
      .pipe(
        map((response) => this.normalizeAuthResponse(response)),
        catchError((error) => this.handleError(error))
      );
  }

  register(payload: RegisterPayload): Observable<AuthResult> {
    return this.http
      .post<AuthApiResponse>(`${API_AUTH_BASE}/register`, payload)
      .pipe(
        map((response) => this.normalizeAuthResponse(response)),
        catchError((error) => this.handleError(error))
      );
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

    const userType =
      response.userType ||
      response.data?.userType ||
      response.user?.type ||
      response.user?.role ||
      'guest';

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
}
