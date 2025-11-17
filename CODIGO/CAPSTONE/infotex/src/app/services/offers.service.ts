import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { AuthService } from './auth.service';
import type { ApplicantAnswer } from './company.service';

const DEFAULT_API_URL = 'http://localhost:3000';
const configuredApiUrl = import.meta.env.NG_APP_API_URL as string | undefined;
const MAX_ALLOWED_OFFER_QUESTIONS = 3;

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
  career: string | null;
  careerCategory: string | null;
  procedure: string | null;
  region: string | null;
  modality: string | null;
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

  applyToOffer(
    offerId: number,
    coverLetter: string | null,
    answers?: ApplicantAnswer[]
  ): Observable<OfferApplicationResult> {
    let options: { headers: HttpHeaders };

    try {
      options = this.buildAuthOptions();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Debes iniciar sesión para continuar.';
      return throwError(() => new Error(message));
    }

    let normalizedAnswers: ApplicantAnswer[] | undefined;

    try {
      normalizedAnswers = normalizeApplicantAnswersForRequest(answers);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Las respuestas ingresadas para la oferta no son válidas.';
      return throwError(() => new Error(message));
    }

    const payload = normalizedAnswers === undefined ? { coverLetter } : { coverLetter, answers: normalizedAnswers };

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
    const extraCareer = this.pickOfferString(offer, 'career', 'careerName', 'carrera');
    const extraProcedure = this.pickOfferString(
      offer,
      'procedure',
      'procedimiento',
      'careerProcedure',
      'career_procedure',
      'PROCEDIMIENTO'
    );
    const extraCareerCategory =
      this.pickOfferString(
        offer,
        'careerCategory',
        'career_category',
        'categoriaCarrera',
        'CATEGORIA_CARRERA',
        'categoria_carrera',
        'categoria',
        'CATEGORY',
        'careerType'
      ) ?? extraProcedure;
    const extraRegion = this.pickOfferString(
      offer,
      'region',
      'REGION',
      'regionOferta',
      'REGION_OFERTA',
      'region_name',
      'regionName'
    );
    const extraModality = this.pickOfferString(
      offer,
      'modality',
      'MODALIDAD',
      'workMode',
      'work_mode',
      'tipoModalidad',
      'tipo_modalidad'
    );

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
      career: extraCareer ?? null,
      careerCategory: extraCareerCategory ?? null,
      procedure: extraProcedure ?? null,
      region: extraRegion ?? null,
      modality: extraModality ?? null,
      company: normalizedCompany
    };
  }

  private pickOfferString(
    offer: Partial<PublicOffer> | Record<string, unknown> | null | undefined,
    ...keys: string[]
  ): string | null {
    if (!offer || typeof offer !== 'object') {
      return null;
    }

    const record = offer as Record<string, unknown>;

    for (const key of keys) {
      if (!key) {
        continue;
      }

      const variations = new Set<string>([key, key.toLowerCase(), key.toUpperCase()]);

      for (const variant of variations) {
        if (!variant || !Object.prototype.hasOwnProperty.call(record, variant)) {
          continue;
        }

        const normalized = this.toNullableString(record[variant]);

        if (normalized) {
          return normalized;
        }
      }
    }

    return null;
  }

  private toNullableString(value: unknown): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed || null;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      const normalized = String(value).trim();
      return normalized || null;
    }

    return null;
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

function normalizeApplicantAnswersForRequest(
  input?: ApplicantAnswer[] | null
): ApplicantAnswer[] | undefined {
  if (input === undefined) {
    return undefined;
  }

  const list = Array.isArray(input) ? input : [];

  if (list.length > MAX_ALLOWED_OFFER_QUESTIONS) {
    throw new Error(`Solo se permiten hasta ${MAX_ALLOWED_OFFER_QUESTIONS} respuestas por oferta.`);
  }

  return list.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`La respuesta #${index + 1} no es válida.`);
    }

    const question = normalizeAnswerField(item.question);
    const answer = normalizeAnswerField(item.answer);

    if (!question) {
      throw new Error(`La respuesta #${index + 1} debe indicar la pregunta que responde.`);
    }

    if (!answer) {
      throw new Error(`La respuesta para "${question}" no puede estar vacía.`);
    }

    return { question, answer } satisfies ApplicantAnswer;
  });
}

function normalizeAnswerField(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return String(value).trim();
}
