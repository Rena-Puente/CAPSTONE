import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { catchError, map } from 'rxjs/operators';
import { Observable, throwError } from 'rxjs';
import { AuthService } from './auth.service';

const DEFAULT_API_URL = 'http://localhost:3000';
const configuredApiUrl = import.meta.env.NG_APP_API_URL as string | undefined;
const MAX_ALLOWED_OFFER_QUESTIONS = 3;

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

export interface OfferQuestionPayload {
  text: string;
  required: boolean;
}

export interface ApplicantAnswer {
  question: string | null;
  answer: string | null;
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
  questions?: OfferQuestionPayload[];
}

export interface CompanyOfferSummary {
  id: number;
  companyId: number;
  title: string | null;
  description: string | null;
  locationType: string | null;
  city: string | null;
  country: string | null;
  seniority: string | null;
  contractType: string | null;
  createdAt: string | null;
  active: boolean;
  totalApplicants: number;
  questions: OfferQuestionPayload[];
}

interface UpdateOfferStateResponse {
  ok: boolean;
  message?: string;
  error?: string;
  offer?: {
    offerId?: number | null;
    companyId?: number | null;
    active?: boolean | number | null;
    previousActive?: boolean | number | null;
  } | null;
}

interface DeleteOfferResponse {
  ok: boolean;
  message?: string;
  error?: string;
}

function normalizeBooleanFlag(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (!normalized) {
      return fallback;
    }

    if (['true', '1', 'si', 'sí', 'on', 'activo', 'activa'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no', 'off', 'inactivo', 'inactiva'].includes(normalized)) {
      return false;
    }
  }

  return fallback;
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
  applicantPhone: string | null;
  applicantProfileSlug: string | null;
  status: string | null;
  submittedAt: string | null;
  questions: OfferQuestionPayload[];
  answers: ApplicantAnswer[];
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

    let normalizedQuestions: OfferQuestionPayload[] | undefined;

    try {
      normalizedQuestions = normalizeOfferQuestionsForRequest(payload.questions);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Las preguntas ingresadas para la oferta no son válidas.';
      return throwError(() => new Error(message));
    }

    const requestPayload =
      normalizedQuestions === undefined ? payload : { ...payload, questions: normalizedQuestions };

    return this.http
      .post<CreateOfferResponse>(`${this.apiUrl}/companies/offers`, requestPayload, options)
      .pipe(
      map((response) => {
        if (!response.ok || !response.offer) {
          const message = response.error || response.message || 'No se pudo crear la oferta.';
          throw new Error(message);
        }

        const offer = response.offer;

        return {
          id: offer.id,
          companyId: offer.companyId,
          title: offer.title ?? null,
          description: offer.description ?? null,
          locationType: offer.locationType ?? null,
          city: offer.city ?? null,
          country: offer.country ?? null,
          seniority: offer.seniority ?? null,
          contractType: offer.contractType ?? null,
          createdAt: (offer as { createdAt?: string | null })?.createdAt ?? null,
          active: normalizeBooleanFlag((offer as { active?: boolean | number | null })?.active, true),
          totalApplicants: Number((offer as { totalApplicants?: number | null })?.totalApplicants ?? 0),
          questions: normalizeOfferQuestionsFromResponse((offer as { questions?: unknown })?.questions)
        } satisfies CompanyOfferSummary;
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
          applicantPhone: applicant.applicantPhone ?? null,
          applicantProfileSlug: applicant.applicantProfileSlug ?? null,
          status: applicant.status ?? null,
          submittedAt: applicant.submittedAt ?? null,
          questions: normalizeOfferQuestionsFromResponse((applicant as { questions?: unknown })?.questions),
          answers: normalizeApplicantAnswersFromResponse((applicant as { answers?: unknown })?.answers)
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
          title: offer.title ?? null,
          description: offer.description ?? null,
          locationType: offer.locationType ?? null,
          city: offer.city ?? null,
          country: offer.country ?? null,
          seniority: offer.seniority ?? null,
          contractType: offer.contractType ?? null,
          createdAt: (offer as { createdAt?: string | null })?.createdAt ?? null,
          active: normalizeBooleanFlag((offer as { active?: boolean | number | null })?.active, true),
          totalApplicants: Number((offer as { totalApplicants?: number | null })?.totalApplicants ?? 0),
          questions: normalizeOfferQuestionsFromResponse((offer as { questions?: unknown })?.questions)
        } satisfies CompanyOfferSummary));
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
            applicantPhone: applicant.applicantPhone ?? null,
            applicantProfileSlug: applicant.applicantProfileSlug ?? null,
            status: applicant.status ?? null,
            submittedAt: applicant.submittedAt ?? null,
            questions: normalizeOfferQuestionsFromResponse((applicant as { questions?: unknown })?.questions),
            answers: normalizeApplicantAnswersFromResponse((applicant as { answers?: unknown })?.answers)
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

  listApplicantsByOffer(offerId: number): Observable<CompanyApplicant[]> {
    return this.listApplicantsForOffer(offerId);
  }

  updateOfferActiveState(
    offerId: number,
    active: boolean
  ): Observable<{ offerId: number; active: boolean; previousActive: boolean; message: string | null }> {
    if (!Number.isInteger(offerId) || offerId <= 0) {
      return throwError(() => new Error('El identificador de la oferta no es válido.'));
    }

    let options: { headers: HttpHeaders };

    try {
      options = this.buildAuthOptions();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Debes iniciar sesión para continuar.';
      return throwError(() => new Error(message));
    }

    return this.http
      .patch<UpdateOfferStateResponse>(`${this.apiUrl}/companies/me/offers/${offerId}/active`, { active }, options)
      .pipe(
        map((response) => {
          if (!response.ok || !response.offer) {
            const message = response.error || response.message || 'No se pudo actualizar el estado de la oferta.';
            throw new Error(message);
          }

          const offerResponse = response.offer;
          const resolvedOfferId = Number(offerResponse.offerId ?? offerId) || offerId;
          const normalizedActive = normalizeBooleanFlag(offerResponse.active, active);
          const normalizedPrevious = normalizeBooleanFlag(offerResponse.previousActive, normalizedActive);

          return {
            offerId: resolvedOfferId,
            active: normalizedActive,
            previousActive: normalizedPrevious,
            message: response.message ?? null
          };
        }),
        catchError((error) => {
          const message =
            error?.error?.error ||
            error?.error?.message ||
            error?.message ||
            'No se pudo actualizar el estado de la oferta.';

          console.error('[CompanyService] Update offer state failed', { error: message, offerId });
          return throwError(() => new Error(message));
        })
      );
  }

  deleteOffer(offerId: number): Observable<{ offerId: number; message: string | null }> {
    if (!Number.isInteger(offerId) || offerId <= 0) {
      return throwError(() => new Error('El identificador de la oferta no es válido.'));
    }

    let options: { headers: HttpHeaders };

    try {
      options = this.buildAuthOptions();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Debes iniciar sesión para continuar.';
      return throwError(() => new Error(message));
    }

    return this.http
      .delete<DeleteOfferResponse>(`${this.apiUrl}/companies/me/offers/${offerId}`, options)
      .pipe(
        map((response) => {
          if (!response.ok) {
            const message = response.error || 'No se pudo eliminar la oferta.';
            throw new Error(message);
          }

          return {
            offerId,
            message: response.message ?? null
          };
        }),
        catchError((error) => {
          const message =
            error?.error?.error || error?.error?.message || error?.message || 'No se pudo eliminar la oferta.';

          console.error('[CompanyService] Delete offer failed', { error: message, offerId });
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

function toNormalizedString(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return String(value).trim();
}

function toNullableString(value: unknown): string | null {
  const normalized = toNormalizedString(value);
  return normalized || null;
}

function normalizeOfferQuestionsFromResponse(input: unknown): OfferQuestionPayload[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const text =
        toNormalizedString((item as { text?: unknown }).text) ||
        toNormalizedString((item as { question?: unknown }).question) ||
        toNormalizedString((item as { pregunta?: unknown }).pregunta);

      if (!text) {
        return null;
      }

      const required = Boolean(
        (item as { required?: unknown }).required ??
          (item as { mandatory?: unknown }).mandatory ??
          (item as { obligatoria?: unknown }).obligatoria ??
          (item as { isRequired?: unknown }).isRequired
      );

      return { text, required } satisfies OfferQuestionPayload;
    })
    .filter((entry): entry is OfferQuestionPayload => Boolean(entry))
    .slice(0, MAX_ALLOWED_OFFER_QUESTIONS);
}

function normalizeApplicantAnswersFromResponse(input: unknown): ApplicantAnswer[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const question =
        toNullableString((item as { question?: unknown }).question) ??
        toNullableString((item as { pregunta?: unknown }).pregunta) ??
        toNullableString((item as { text?: unknown }).text);
      const answer =
        toNullableString((item as { answer?: unknown }).answer) ??
        toNullableString((item as { respuesta?: unknown }).respuesta) ??
        toNullableString((item as { value?: unknown }).value);

      if (!question && !answer) {
        return null;
      }

      return { question, answer } satisfies ApplicantAnswer;
    })
    .filter((entry): entry is ApplicantAnswer => Boolean(entry))
    .slice(0, MAX_ALLOWED_OFFER_QUESTIONS);
}

function normalizeOfferQuestionsForRequest(
  input: OfferQuestionPayload[] | null | undefined
): OfferQuestionPayload[] | undefined {
  if (input === undefined) {
    return undefined;
  }

  const list = Array.isArray(input) ? input : [];

  if (list.length > MAX_ALLOWED_OFFER_QUESTIONS) {
    throw new Error(`Solo se permiten hasta ${MAX_ALLOWED_OFFER_QUESTIONS} preguntas por oferta.`);
  }

  return list.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`La pregunta #${index + 1} no es válida.`);
    }

    const text = toNormalizedString(item.text);

    if (!text) {
      throw new Error(`La pregunta #${index + 1} debe incluir un texto.`);
    }

    return { text, required: Boolean(item.required) } satisfies OfferQuestionPayload;
  });
}
