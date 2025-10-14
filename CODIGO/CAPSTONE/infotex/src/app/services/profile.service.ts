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
    const userId = this.authService.getUserId();
    const accessToken = this.authService.getAccessToken();

    if (!userId || !accessToken) {
      return throwError(() => new Error('No hay una sesión activa.'));
    }

    const headers = new HttpHeaders({ Authorization: `Bearer ${accessToken}` });

    return this.http
      .get<ProfileStatusResponse>(`${this.apiUrl}/profile/status/${userId}`, { headers })
      .pipe(
        map((response) => {
          if (!response?.ok) {
            throw new Error('No fue posible obtener el estado del perfil.');
          }

          return {
            displayName: response.profile?.displayName ?? null,
            headline: response.profile?.headline ?? null,
            biography: response.profile?.biography ?? null,
            country: response.profile?.country ?? null,
            city: response.profile?.city ?? null,
            avatarUrl: response.profile?.avatarUrl ?? null,
            isComplete: response.isComplete,
            missingFields: response.missingFields ?? []
          } satisfies ProfileStatus;
        }),
        catchError((error) => {
          const message = error?.error?.error || error?.message || 'No fue posible consultar el perfil.';
          return throwError(() => new Error(message));
        })
      );
  }
}