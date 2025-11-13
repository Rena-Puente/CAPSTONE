import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { AuthService } from './auth.service';

const DEFAULT_API_URL = 'http://localhost:3000';
const configuredApiUrl = import.meta.env.NG_APP_API_URL as string | undefined;

export interface CandidateApplication {
  id: number;
  offerId: number | null;
  companyId: number | null;
  offerTitle: string | null;
  companyName: string | null;
  status: string | null;
  coverLetter: string | null;
  submittedAt: string | null;
  updatedAt: string | null;
  city: string | null;
  country: string | null;
  locationType: string | null;
  seniority: string | null;
  contractType: string | null;
  offerActive: boolean;
  offerPublishedAt: string | null;
}

interface ApplicationsResponse {
  ok: boolean;
  applications?: CandidateApplication[] | null;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ApplicationsService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly apiUrl = (configuredApiUrl?.replace(/\/$/, '') || DEFAULT_API_URL).replace(/\/$/, '');

  listCurrentUserApplications(): Observable<CandidateApplication[]> {
    const userId = this.authService.getUserId();

    if (!userId) {
      return throwError(() => new Error('Debes iniciar sesión para continuar.'));
    }

    let options: { headers: HttpHeaders };

    try {
      options = this.buildAuthOptions();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Debes iniciar sesión para continuar.';
      return throwError(() => new Error(message));
    }

    return this.http
      .get<ApplicationsResponse>(`${this.apiUrl}/profile/${userId}/applications`, options)
      .pipe(
        map((response) => {
          if (!response.ok) {
            const message = response.error || 'No se pudieron obtener tus postulaciones.';
            throw new Error(message);
          }

          const applications = Array.isArray(response.applications) ? response.applications : [];

          return applications.map((application) => this.normalizeApplication(application));
        }),
        catchError((error) => {
          const message =
            error?.error?.error ||
            error?.error?.message ||
            error?.message ||
            'No se pudieron obtener tus postulaciones.';

          console.error('[ApplicationsService] Failed to list applications', { error: message });
          return throwError(() => new Error(message));
        })
      );
  }

  private normalizeApplication(application: Partial<CandidateApplication> | null | undefined): CandidateApplication {
    const idValue = Number.isFinite(application?.id as number)
      ? Number(application?.id)
      : Number.parseInt(String(application?.id ?? 0), 10);

    const offerIdValue = Number.isFinite(application?.offerId as number)
      ? Number(application?.offerId)
      : Number.parseInt(String(application?.offerId ?? 0), 10);

    const companyIdValue = Number.isFinite(application?.companyId as number)
      ? Number(application?.companyId)
      : Number.parseInt(String(application?.companyId ?? 0), 10);

    return {
      id: Number.isNaN(idValue) ? 0 : idValue,
      offerId: Number.isNaN(offerIdValue) ? null : offerIdValue,
      companyId: Number.isNaN(companyIdValue) ? null : companyIdValue,
      offerTitle: application?.offerTitle ?? null,
      companyName: application?.companyName ?? null,
      status: application?.status ?? null,
      coverLetter: application?.coverLetter ?? null,
      submittedAt: application?.submittedAt ?? null,
      updatedAt: application?.updatedAt ?? null,
      city: application?.city ?? null,
      country: application?.country ?? null,
      locationType: application?.locationType ?? null,
      seniority: application?.seniority ?? null,
      contractType: application?.contractType ?? null,
      offerActive: Boolean(application?.offerActive),
      offerPublishedAt: application?.offerPublishedAt ?? null
    } satisfies CandidateApplication;
  }

  private buildAuthOptions(): { headers: HttpHeaders } {
    const token = this.authService.getAccessToken();

    if (!token) {
      throw new Error('Debes iniciar sesión para continuar.');
    }

    return {
      headers: new HttpHeaders({ Authorization: `Bearer ${token}` })
    };
  }
}
