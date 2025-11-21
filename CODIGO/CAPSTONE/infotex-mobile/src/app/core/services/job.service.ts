import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { from, map, Observable, switchMap } from 'rxjs';

import { API_BASE } from '../../../environments/environment';
import { Application, ApplicationAnswer, Job, JobQuestion } from '../models';
import { SessionService } from './session.service';

const API_OFFERS_BASE = `${API_BASE}/offers`;
const API_COMPANIES_BASE = `${API_BASE}/companies`;

export interface JobPayload {
  title: string;
  description: string;
  locationType: string;
  city: string;
  country: string;
  seniority: string;
  contractType: string;
  questions?: JobQuestion[];
}

export interface ApplyJobPayload {
  coverLetter?: string | null;
  answers?: ApplicationAnswer[];
}

export interface ApplicationSummary {
  totalApplications: number;
  totalOffers: number;
  activeOffers: number;
  lastApplicationAt: string | null;
  lastUpdatedAt: string | null;
  byStatus: {
    enviada: number;
    en_revision: number;
    aceptada: number;
    rechazada: number;
  };
}

@Injectable({ providedIn: 'root' })
export class JobService {
  private readonly http = inject(HttpClient);
  private readonly sessionService = inject(SessionService);

  getPublicJobs(): Observable<Job[]> {
    return this.http
      .get<{ ok: boolean; offers: Job[] }>(`${API_OFFERS_BASE}`)
      .pipe(map((response) => response.offers ?? []));
  }

  applyToJob(offerId: number, payload: ApplyJobPayload): Observable<Application> {
    return this.withAuthHeaders((headers) =>
      this.http
        .post<{ ok: boolean; application: Application }>(
          `${API_OFFERS_BASE}/${offerId}/apply`,
          payload,
          { headers }
        )
        .pipe(map((response) => response.application))
    );
  }

  createJob(payload: JobPayload): Observable<Job> {
    return this.withAuthHeaders((headers) =>
      this.http
        .post<{ ok: boolean; offer: Job }>(`${API_COMPANIES_BASE}/offers`, payload, {
          headers,
        })
        .pipe(map((response) => response.offer))
    );
  }

  listCompanyJobs(): Observable<Job[]> {
    return this.withAuthHeaders((headers) =>
      this.http
        .get<{ ok: boolean; offers: Job[] }>(`${API_COMPANIES_BASE}/me/offers`, { headers })
        .pipe(map((response) => response.offers ?? []))
    );
  }

  updateJobActiveState(
    offerId: number,
    active: boolean
  ): Observable<{ offerId: number; companyId: number; active: boolean; previousActive: boolean }> {
    return this.withAuthHeaders((headers) =>
      this.http
        .patch<{ ok: boolean; offer: { offerId: number; companyId: number; active: boolean; previousActive: boolean } }>(
          `${API_COMPANIES_BASE}/me/offers/${offerId}/active`,
          { active },
          { headers }
        )
        .pipe(map((response) => response.offer))
    );
  }

  deleteJob(offerId: number): Observable<void> {
    return this.withAuthHeaders((headers) =>
      this.http
        .delete<{ ok: boolean; message: string }>(`${API_COMPANIES_BASE}/me/offers/${offerId}`, {
          headers,
        })
        .pipe(map(() => void 0))
    );
  }

  listApplicantsForOffer(offerId: number): Observable<Application[]> {
    return this.withAuthHeaders((headers) =>
      this.http
        .get<{ ok: boolean; applicants: Application[] }>(
          `${API_COMPANIES_BASE}/me/offers/${offerId}/applicants`,
          { headers }
        )
        .pipe(map((response) => response.applicants ?? []))
    );
  }

  listCompanyApplicants(): Observable<{ applicants: Application[]; summary?: ApplicationSummary }> {
    return this.withAuthHeaders((headers) =>
      this.http
        .get<{ ok: boolean; applicants: Application[]; summary?: ApplicationSummary }>(
          `${API_COMPANIES_BASE}/me/applicants`,
          { headers }
        )
        .pipe(
          map((response) => ({
            applicants: response.applicants ?? [],
            summary: response.summary,
          }))
        )
    );
  }

  updateApplicationStatus(
    applicationId: number,
    status: string
  ): Observable<{ id: number; status: string | null; previousStatus: string | null }> {
    return this.withAuthHeaders((headers) =>
      this.http
        .patch<{
          ok: boolean;
          application: { id: number; status: string | null; previousStatus: string | null };
        }>(
          `${API_COMPANIES_BASE}/me/applicants/${applicationId}/status`,
          { status },
          { headers }
        )
        .pipe(map((response) => response.application))
    );
  }

  private buildAuthHeaders(): Observable<HttpHeaders> {
    return from(this.sessionService.getAccessToken()).pipe(
      map((token) => {
        let headers = new HttpHeaders();

        if (token) {
          headers = headers.set('Authorization', `Bearer ${token}`);
        }

        return headers;
      })
    );
  }

  private withAuthHeaders<T>(requestFactory: (headers: HttpHeaders) => Observable<T>): Observable<T> {
    return this.buildAuthHeaders().pipe(switchMap((headers) => requestFactory(headers)));
  }
}
