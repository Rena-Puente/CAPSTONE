import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { API_BASE } from '../../../environments/environment';
import { SessionService } from './session.service';

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

@Injectable({ providedIn: 'root' })
export class ApplicationsService {
  private readonly http = inject(HttpClient);
  private readonly sessionService = inject(SessionService);

  listCurrentUserApplications(): Observable<CandidateApplication[]> {
    return new Observable<CandidateApplication[]>((subscriber) => {
      void this.resolveAuthContext()
        .then(({ userId, headers }) => {
          this.http
            .get<ApplicationsResponse>(`${API_BASE}/profile/${userId}/applications`, { headers })
            .pipe(
              map((response) => {
                if (!response.ok) {
                  const message = response.error || 'No se pudieron obtener tus postulaciones.';
                  throw new Error(message);
                }

                const applications = Array.isArray(response.applications)
                  ? response.applications
                  : [];

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
            )
            .subscribe({
              next: (applications) => subscriber.next(applications),
              error: (error) => subscriber.error(error),
              complete: () => subscriber.complete(),
            });
        })
        .catch((error) => {
          subscriber.error(error instanceof Error ? error : new Error('Debes iniciar sesión para continuar.'));
          subscriber.complete();
        });
    });
  }

  private async resolveAuthContext(): Promise<{ headers: HttpHeaders; userId: number }> {
    const [token, userId] = await Promise.all([
      this.sessionService.getAccessToken(),
      this.sessionService.getUserId(),
    ]);

    if (!token || !userId) {
      throw new Error('Debes iniciar sesión para continuar.');
    }

    return {
      userId,
      headers: new HttpHeaders({ Authorization: `Bearer ${token}` }),
    };
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
      offerPublishedAt: application?.offerPublishedAt ?? null,
    } satisfies CandidateApplication;
  }
}
