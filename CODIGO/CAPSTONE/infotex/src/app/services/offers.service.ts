import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { AuthService } from './auth.service';

const DEFAULT_API_URL = 'http://localhost:3000';
const configuredApiUrl = import.meta.env.NG_APP_API_URL as string | undefined;

export interface OfferCompanySummary {
  id: number | null;
  name: string;
  city: string | null;
  country: string | null;
  website: string | null;
  logoUrl: string | null;
  avatarUrl: string | null;
}

export interface PublicOffer {
  id: number;
  companyId: number | null;
  title: string | null;
  description: string | null;
  locationType: string | null;
  city: string | null;
  country: string | null;
  seniority: string | null;
  contractType: string | null;
  createdAt: string | null;
  company: OfferCompanySummary;
}

export interface OfferApplicationResult {
  id: number;
  offerId: number;
  userId: number;
  status: string;
  coverLetter: string | null;
  submittedAt: string | null;
}

interface OffersResponse {
  ok: boolean;
  offers?: PublicOffer[] | null;
  error?: string;
}

interface ApplyResponse {
  ok: boolean;
  message?: string | null;
  application?: OfferApplicationResult | null;
  error?: string;
  code?: string;
}

@Injectable({
  providedIn: 'root'
})
export class OffersService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly apiUrl = (configuredApiUrl?.replace(/\/$/, '') || DEFAULT_API_URL).replace(/\/$/, '');

  listOffers(): Observable<PublicOffer[]> {
    return this.http.get<OffersResponse>(`${this.apiUrl}/offers`).pipe(
      map((response) => {
        if (!response.ok) {
          const message = response.error || 'No se pudieron obtener las ofertas disponibles.';
          throw new Error(message);
        }

        const offers = Array.isArray(response.offers) ? response.offers : [];

        return offers.map((offer) => this.normalizeOffer(offer));
      }),
      catchError((error) => {
        const message =
          error?.error?.error ||
          error?.error?.message ||
          error?.message ||
          'No se pudieron obtener las ofertas disponibles.';

        console.error('[OffersService] Failed to list offers', { error: message });
        return throwError(() => new Error(message));
      })
    );
  }

  applyToOffer(offerId: number, coverLetter: string | null): Observable<OfferApplicationResult> {
    let options: { headers: HttpHeaders };

    try {
      options = this.buildAuthOptions();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Debes iniciar sesión para continuar.';
      return throwError(() => new Error(message));
    }

    const payload = { coverLetter };

    return this.http
      .post<ApplyResponse>(`${this.apiUrl}/offers/${offerId}/apply`, payload, options)
      .pipe(
        map((response) => {
          if (!response.ok || !response.application) {
            const message =
              response.error || response.message || 'No se pudo registrar la postulación.';
            throw new Error(message);
          }

          return response.application;
        }),
        catchError((error) => {
          const message =
            error?.error?.error ||
            error?.error?.message ||
            error?.message ||
            'No se pudo registrar la postulación.';

          console.error('[OffersService] Failed to apply to offer', {
            offerId,
            error: message
          });
          return throwError(() => new Error(message));
        })
      );
  }

  private normalizeOffer(offer: Partial<PublicOffer> | null | undefined): PublicOffer {
    const normalizedCompany: OfferCompanySummary = {
      id: offer?.company?.id ?? offer?.companyId ?? null,
      name: offer?.company?.name || 'Empresa sin nombre',
      city: offer?.company?.city ?? null,
      country: offer?.company?.country ?? null,
      website: offer?.company?.website ?? null,
      logoUrl: offer?.company?.logoUrl ?? null,
      avatarUrl: offer?.company?.avatarUrl ?? null
    };

    const numericId = Number.isFinite(offer?.id as number)
      ? Number(offer?.id)
      : Number.parseInt(String(offer?.id ?? 0), 10);

    return {
      id: Number.isNaN(numericId) ? 0 : numericId,
      companyId: offer?.companyId ?? normalizedCompany.id,
      title: offer?.title ?? null,
      description: offer?.description ?? null,
      locationType: offer?.locationType ?? null,
      city: offer?.city ?? null,
      country: offer?.country ?? null,
      seniority: offer?.seniority ?? null,
      contractType: offer?.contractType ?? null,
      createdAt: offer?.createdAt ?? null,
      company: normalizedCompany
    };
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
