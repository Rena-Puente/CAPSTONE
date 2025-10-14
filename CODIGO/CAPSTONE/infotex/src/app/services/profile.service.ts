import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { AuthService } from './auth.service';

const DEFAULT_API_URL = 'http://localhost:3000';
const configuredApiUrl = import.meta.env.NG_APP_API_URL as string | undefined;

export interface ProfileStatus {
  displayName: string | null;
  headline: string | null;
  biography: string | null;
  country: string | null;
  city: string | null;
  avatarUrl: string | null;
  isComplete: boolean;
  missingFields: string[];
}

export interface UpdateProfilePayload {
  displayName: string;
  headline: string;
  biography: string;
  country: string;
  city: string;
  avatarUrl: string;
}

interface ProfileStatusResponse {
  ok: boolean;
  profile: {
    displayName: string | null;
    headline: string | null;
    biography: string | null;
    country: string | null;
    city: string | null;
    avatarUrl: string | null;
  } | null;
  isComplete: boolean;
  missingFields: string[];
}

@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly apiUrl = (configuredApiUrl?.replace(/\/$/, '') || DEFAULT_API_URL).replace(/\/$/, '');

  getProfileStatus(): Observable<ProfileStatus> {
    const session = this.resolveSession();

    if (!session) {
      return throwError(() => new Error('No hay una sesión activa.'));
    }

    const { userId, headers } = session;

    return this.http
      .get<ProfileStatusResponse>(`${this.apiUrl}/profile/status/${userId}`, { headers })
      .pipe(
        map((response) => this.toProfileStatus(response, 'No fue posible obtener el estado del perfil.')),
        catchError((error) => this.handleRequestError('getProfileStatus', `/profile/status/${userId}`, error, 'No fue posible consultar el perfil.'))
      );
  }

  getProfileDetails(): Observable<ProfileStatus> {
    const session = this.resolveSession();

    if (!session) {
      return throwError(() => new Error('No hay una sesión activa.'));
    }

    const { userId, headers } = session;
    const endpoint = `/profile/${userId}`;

    return this.http
      .get<ProfileStatusResponse>(`${this.apiUrl}${endpoint}`, { headers })
      .pipe(
        map((response) => this.toProfileStatus(response, 'No fue posible obtener el perfil.')),
        catchError((error) => this.handleRequestError('getProfileDetails', endpoint, error, 'No fue posible obtener el perfil.'))
      );
  }

  updateProfile(payload: UpdateProfilePayload): Observable<ProfileStatus> {
    const session = this.resolveSession();

    if (!session) {
      return throwError(() => new Error('No hay una sesión activa.'));
    }

    const { userId, headers } = session;
    const endpoint = `/profile/${userId}`;

    return this.http
      .put<ProfileStatusResponse>(`${this.apiUrl}${endpoint}`, payload, { headers })
      .pipe(
        map((response) => this.toProfileStatus(response, 'No fue posible actualizar el perfil.')),
        catchError((error) => this.handleRequestError('updateProfile', endpoint, error, 'No fue posible actualizar el perfil.'))
      );
  }

  private resolveSession(): { userId: number; accessToken: string; headers: HttpHeaders } | null {
    const userId = this.authService.getUserId();
    const accessToken = this.authService.getAccessToken();

    if (!userId || !accessToken) {
      return null;
    }

    const headers = new HttpHeaders({ Authorization: `Bearer ${accessToken}` });

    return { userId, accessToken, headers };
  }

  private toProfileStatus(response: ProfileStatusResponse | null | undefined, defaultMessage: string): ProfileStatus {
    if (!response?.ok) {
      throw new Error(defaultMessage);
    }

    return {
      displayName: response.profile?.displayName ?? null,
      headline: response.profile?.headline ?? null,
      biography: response.profile?.biography ?? null,
      country: response.profile?.country ?? null,
      city: response.profile?.city ?? null,
      avatarUrl: response.profile?.avatarUrl ?? null,
      isComplete: Boolean(response.isComplete),
      missingFields: Array.isArray(response.missingFields) ? response.missingFields : []
    } satisfies ProfileStatus;
  }

  private handleRequestError(method: string, endpoint: string, error: unknown, fallbackMessage: string): Observable<never> {
    const message = (error as any)?.error?.error || (error as any)?.message || fallbackMessage;

    console.error(`[ProfileService] ${method} failed`, {
      url: `${this.apiUrl}${endpoint}`,
      status: (error as any)?.status ?? null,
      message,
      error
    });

    return throwError(() => new Error(message));
  }
}