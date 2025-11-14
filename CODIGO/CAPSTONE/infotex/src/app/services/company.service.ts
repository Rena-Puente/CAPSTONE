import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { catchError, map } from 'rxjs/operators';
import { Observable, throwError } from 'rxjs';
import { AuthService } from './auth.service';

const DEFAULT_API_URL = 'http://localhost:3000';
const configuredApiUrl = import.meta.env.NG_APP_API_URL as string | undefined;

export interface CompanyRegistrationPayload {
  name: string;
  website: string;
  country: string;
  city: string;
  email: string;
  password: string;
  rut: string;
  phone?: string;
  description?: string;
}

interface CompanyResponseItem {
  id: number;
  name: string;
  website: string;
  country: string;
  city: string;
  email: string;
  rut: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CompanyProfile extends CompanyResponseItem {
  createdAt: string | null;
  updatedAt: string | null;
}

interface RegisterCompanyResponse {
  ok: boolean;
  message?: string;
  error?: string;
  company?: CompanyResponseItem | null;
}

interface CompanyProfileResponse {
  ok: boolean;
  error?: string;
  company?: CompanyResponseItem | null;
}

export interface CompanyOfferPayload {
  title: string;
  description: string;
  locationType: string;
  city: string;
  country: string;
  seniority: string;
  contractType: string;
}

export interface CompanyOfferSummary {
  id: number;
  companyId: number;
  title: string;
  description: string;
  locationType: string;
  city: string;
  country: string;
  seniority: string;
  contractType: string;
}

interface CreateOfferResponse {
  ok: boolean;
  message?: string;
  error?: string;
  offer?: CompanyOfferSummary | null;
}

export interface CompanyApplicant {
  applicationId: number;
  offerId: number | null;
  offerTitle: string | null;
  applicantId: number | null;
  applicantName: string | null;
  applicantEmail: string | null;
  applicantProfileSlug: string | null;
  status: string | null;
  submittedAt: string | null;
}

interface ApplicantsResponse {
  ok: boolean;
  applicants?: CompanyApplicant[] | null;
  summary?: unknown;
  error?: string;
}

interface CompanyOffersResponse {
  ok: boolean;
  offers?: CompanyOfferSummary[] | null;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class CompanyService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly apiUrl = (configuredApiUrl?.replace(/\/$/, '') || DEFAULT_API_URL).replace(/\/$/, '');

  registerCompany(payload: CompanyRegistrationPayload): Observable<CompanyResponseItem> {
    return this.http.post<RegisterCompanyResponse>(`${this.apiUrl}/companies`, payload).pipe(
      map((response) => {
        if (!response.ok || !response.company) {
          const message =
            response.error ||
            response.message ||
            'No se pudo registrar la empresa. Inténtalo nuevamente en unos minutos.';
          throw new Error(message);
        }

        return response.company;
      }),
      catchError((error) => {
        const message =
          error?.error?.error ||
          error?.error?.message ||
          error?.message ||
          'No se pudo registrar la empresa. Inténtalo nuevamente en unos minutos.';

        console.error('[CompanyService] Company registration failed', { error: message });
        return throwError(() => new Error(message));
      })
    );
  }

  getMyCompanyProfile(): Observable<CompanyProfile> {
    let options: { headers: HttpHeaders };

    try {
      options = this.buildAuthOptions();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Debes iniciar sesión para continuar.';
      return throwError(() => new Error(message));
    }

    return this.http.get<CompanyProfileResponse>(`${this.apiUrl}/companies/me`, options).pipe(
      map((response) => {
        if (!response.ok || !response.company) {
          const message = response.error || 'No se pudo obtener la información de la empresa.';
          throw new Error(message);
        }

        return {
          ...response.company,
          createdAt: response.company.createdAt ?? null,
          updatedAt: response.company.updatedAt ?? null
        };
      }),
      catchError((error) => {
        const message =
          error?.error?.error || error?.error?.message || error?.message || 'No se pudo obtener la información de la empresa.';

        console.error('[CompanyService] Fetch company profile failed', { error: message });
        return throwError(() => new Error(message));
      })
    );
  }

  createOffer(payload: CompanyOfferPayload): Observable<CompanyOfferSummary> {
    let options: { headers: HttpHeaders };

    try {
      options = this.buildAuthOptions();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Debes iniciar sesión para continuar.';
      return throwError(() => new Error(message));
    }

    return this.http.post<CreateOfferResponse>(`${this.apiUrl}/companies/offers`, payload, options).pipe(
      map((response) => {
        if (!response.ok || !response.offer) {
          const message = response.error || response.message || 'No se pudo crear la oferta.';
          throw new Error(message);
        }

        return response.offer;
      }),
      catchError((error) => {
        const message =
          error?.error?.error || error?.error?.message || error?.message || 'No se pudo crear la oferta.';

        console.error('[CompanyService] Create offer failed', { error: message });
        return throwError(() => new Error(message));
      })
    );
  }

  listApplicants(): Observable<CompanyApplicant[]> {
    let options: { headers: HttpHeaders };

    try {
      options = this.buildAuthOptions();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Debes iniciar sesión para continuar.';
      return throwError(() => new Error(message));
    }

    return this.http.get<ApplicantsResponse>(`${this.apiUrl}/companies/me/applicants`, options).pipe(
      map((response) => {
        if (!response.ok) {
          const message = response.error || 'No se pudo obtener la lista de postulantes.';
          throw new Error(message);
        }

        return (response.applicants ?? []).map((applicant) => ({
          applicationId: applicant.applicationId,
          offerId: applicant.offerId ?? null,
          offerTitle: applicant.offerTitle ?? null,
          applicantId: applicant.applicantId ?? null,
          applicantName: applicant.applicantName ?? null,
          applicantEmail: applicant.applicantEmail ?? null,
          applicantProfileSlug: applicant.applicantProfileSlug ?? null,
          status: applicant.status ?? null,
          submittedAt: applicant.submittedAt ?? null
        }));
      }),
      catchError((error) => {
        const message =
          error?.error?.error || error?.error?.message || error?.message || 'No se pudo obtener la lista de postulantes.';

        console.error('[CompanyService] List applicants failed', { error: message });
        return throwError(() => new Error(message));
      })
    );
  }

  listMyOffers(): Observable<CompanyOfferSummary[]> {
    let options: { headers: HttpHeaders };

    try {
      options = this.buildAuthOptions();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Debes iniciar sesión para continuar.';
      return throwError(() => new Error(message));
    }

    return this.http.get<CompanyOffersResponse>(`${this.apiUrl}/companies/me/offers`, options).pipe(
      map((response) => {
        if (!response.ok) {
          const message = response.error || 'No se pudieron obtener las ofertas de la empresa.';
          throw new Error(message);
        }

        return (response.offers ?? []).map((offer) => ({
          id: offer.id,
          companyId: offer.companyId,
          title: offer.title,
          description: offer.description,
          locationType: offer.locationType,
          city: offer.city,
          country: offer.country,
          seniority: offer.seniority,
          contractType: offer.contractType
        }));
      }),
      catchError((error) => {
        const message =
          error?.error?.error ||
          error?.error?.message ||
          error?.message ||
          'No se pudieron obtener las ofertas de la empresa.';

        console.error('[CompanyService] List company offers failed', { error: message });
        return throwError(() => new Error(message));
      })
    );
  }

  listApplicantsForOffer(offerId: number): Observable<CompanyApplicant[]> {
    let options: { headers: HttpHeaders };

    try {
      options = this.buildAuthOptions();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Debes iniciar sesión para continuar.';
      return throwError(() => new Error(message));
    }

    return this.http
      .get<ApplicantsResponse>(`${this.apiUrl}/companies/me/offers/${offerId}/applicants`, options)
      .pipe(
        map((response) => {
          if (!response.ok) {
            const message = response.error || 'No se pudo obtener la lista de postulantes.';
            throw new Error(message);
          }

          return (response.applicants ?? []).map((applicant) => ({
            applicationId: applicant.applicationId,
            offerId: applicant.offerId ?? null,
            offerTitle: applicant.offerTitle ?? null,
            applicantId: applicant.applicantId ?? null,
            applicantName: applicant.applicantName ?? null,
            applicantEmail: applicant.applicantEmail ?? null,
            applicantProfileSlug: applicant.applicantProfileSlug ?? null,
            status: applicant.status ?? null,
            submittedAt: applicant.submittedAt ?? null
          }));
        }),
        catchError((error) => {
          const message =
            error?.error?.error || error?.error?.message || error?.message || 'No se pudo obtener la lista de postulantes.';

          console.error('[CompanyService] List applicants for offer failed', { error: message, offerId });
          return throwError(() => new Error(message));
        })
      );
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
