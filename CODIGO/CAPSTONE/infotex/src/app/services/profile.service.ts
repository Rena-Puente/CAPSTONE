import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { AuthService } from './auth.service';

const DEFAULT_API_URL = 'http://localhost:3000';
const configuredApiUrl = import.meta.env.NG_APP_API_URL as string | undefined;
export const GITHUB_LINK_FEEDBACK_KEY = 'infotex_github_link_feedback';

export type ProfileField =
  | 'displayName'
  | 'biography'
  | 'country'
  | 'city'
  | 'career'
  | 'avatarUrl'
  | 'slug';
export type ProfileOkFlag = `ok_${ProfileField}`;
export type ProfileErrorFlag = `error_${ProfileField}`;

export const PROFILE_FIELDS: readonly ProfileField[] = [
  'displayName',
  'biography',
  'country',
  'city',
  'career',
  'avatarUrl',
  'slug'
] as const;

type ProfileValues = Record<ProfileField, string | null>;
type ProfileValidationFlags = Record<ProfileOkFlag, boolean>;
type ProfileValidationErrors = Record<ProfileErrorFlag, string | null>;

export interface EducationSummary {
  hasEducation: boolean;
  totalRecords: number;
  validDateCount: number;
  invalidDateCount: number;
}

export interface EducationEntry {
  id: number;
  institution: string;
  degree: string | null;
  fieldOfStudy: string | null;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
}

export interface EducationPayload {
  institution: string;
  degree?: string | null;
  fieldOfStudy?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  description?: string | null;
}

export interface ExperienceSummary {
  hasExperience: boolean;
  totalRecords: number;
  validDateCount: number;
  invalidDateCount: number;
  currentCount: number;
}

export interface ExperienceEntry {
  id: number;
  title: string;
  company: string | null;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  description: string | null;
}

export interface ExperiencePayload {
  title: string;
  company?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  location?: string | null;
  description?: string | null;
}

export interface SkillSummary {
  totalSkills: number;
  averageLevel: number | null;
  maxLevel: number | null;
  minLevel: number | null;
}

export interface SkillEntry {
  id: number;
  skillId: number;
  name: string;
  category: string | null;
  level: number | null;
  yearsExperience: number | null;
  endorsementCount: number;
}

export interface SkillPayload {
  skillId?: number | null;
  skillName?: string | null;
  level?: number | null;
  yearsExperience?: number | null;
  endorsementCount?: number | null;
}

export interface SkillCatalogItem {
  skillId: number;
  name: string;
  category: string | null;
}

export interface GithubAccountStatus {
  linked: boolean;
  username: string | null;
  profileUrl: string | null;
  providerId: string | null;
  lastSyncedAt: string | null;
}

export interface GithubAccountResponse {
  account: GithubAccountStatus;
  message: string | null;
}

export interface ProfileData extends ProfileValues, ProfileValidationFlags, ProfileValidationErrors {
  isComplete: boolean;
  missingFields: string[];
  message: string | null;
  educationSummary: EducationSummary | null;
  experienceSummary: ExperienceSummary | null;
  skillsSummary: SkillSummary | null;
  githubAccount: GithubAccountStatus;
}

export interface UpdateProfilePayload {
  displayName: string;
  biography: string;
  country: string;
  city: string;
  career: string;
  avatarUrl: string;
  slug: string;
}

export interface PublicProfileData {
  profile: {
    displayName: string | null;
    biography: string | null;
    country: string | null;
    city: string | null;
    career: string | null;
    avatarUrl: string | null;
    slug: string | null;
  };
  education: {
    entries: EducationEntry[];
    summary: EducationSummary | null;
  };
  experience: {
    entries: ExperienceEntry[];
    summary: ExperienceSummary | null;
  };
  skills: {
    entries: SkillEntry[];
    summary: SkillSummary | null;
  };
}

interface ProfileResponseEnvelope {
  ok: boolean;
  data?: Partial<ProfileData & { profile?: ProfileValues }> | null;
  profile?: Partial<ProfileValues> | null;
  validations?: Partial<Record<string, unknown>> | null;
  errors?: Partial<Record<string, unknown>> | null;
  missingFields?: unknown;
  isComplete?: unknown;
  message?: unknown;
  error?: unknown;
  educationSummary?: unknown;
  experienceSummary?: unknown;
  skillsSummary?: unknown;
  [key: string]: unknown;
}

interface EducationResponseEnvelope {
  ok: boolean;
  education?: unknown;
  educationSummary?: unknown;
  message?: unknown;
  error?: unknown;
  [key: string]: unknown;
}

interface ExperienceResponseEnvelope {
  ok: boolean;
  experience?: unknown;
  experienceSummary?: unknown;
  message?: unknown;
  error?: unknown;
  [key: string]: unknown;
}

interface SkillsResponseEnvelope {
  ok: boolean;
  skills?: unknown;
  skill?: unknown;
  skillsSummary?: unknown;
  message?: unknown;
  error?: unknown;
  [key: string]: unknown;
}

interface SkillCatalogResponseEnvelope {
  ok: boolean;
  items?: unknown;
  count?: unknown;
  message?: unknown;
  error?: unknown;
  [key: string]: unknown;
}

interface SkillListResult {
  skills: SkillEntry[];
  skillsSummary: SkillSummary | null;
}

interface SkillMutationResult {
  skill: SkillEntry;
  skillsSummary: SkillSummary | null;
}

interface GithubAccountResponseEnvelope {
  ok: boolean;
  githubAccount?: unknown;
  message?: unknown;
  error?: unknown;
  [key: string]: unknown;
}

interface GithubAuthorizeLinkResponse {
  ok: boolean;
  url?: string | null;
  authorizeUrl?: string | null;
  error?: unknown;
}

interface PublicProfileResponseEnvelope {
  ok: boolean;
  profile?: unknown;
  education?: unknown;
  experience?: unknown;
  skills?: unknown;
  error?: unknown;
  message?: unknown;
  [key: string]: unknown;
}

interface EducationListResult {
  education: EducationEntry[];
  educationSummary: EducationSummary | null;
}

interface EducationMutationResult {
  education: EducationEntry;
  educationSummary: EducationSummary | null;
}

interface ExperienceListResult {
  experience: ExperienceEntry[];
  experienceSummary: ExperienceSummary | null;
}

interface ExperienceMutationResult {
  experience: ExperienceEntry;
  experienceSummary: ExperienceSummary | null;
}

@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly apiUrl = (configuredApiUrl?.replace(/\/$/, '') || DEFAULT_API_URL).replace(/\/$/, '');

  getProfile(): Observable<ProfileData> {
    const session = this.resolveSession();

    if (!session) {
      return throwError(() => new Error('No hay una sesión activa.'));
    }

    const { userId, headers } = session;
    const endpoint = `/profile/${userId}`;

    return this.http
      .get<ProfileResponseEnvelope>(`${this.apiUrl}${endpoint}`, { headers })
      .pipe(
        map((response) => this.normalizeProfileResponse(response, 'No fue posible obtener tu perfil.')),
        catchError((error) => this.handleRequestError('getProfile', endpoint, error, 'No fue posible obtener tu perfil.'))
      );
  }

  updateProfile(payload: UpdateProfilePayload): Observable<ProfileData> {
    const session = this.resolveSession();

    if (!session) {
      return throwError(() => new Error('No hay una sesión activa.'));
    }

    const { userId, headers } = session;
    const endpoint = `/profile/${userId}`;

    return this.http
      .put<ProfileResponseEnvelope>(`${this.apiUrl}${endpoint}`, payload, { headers })
      .pipe(
        map((response) => this.normalizeProfileResponse(response, 'No fue posible actualizar el perfil.')),
        catchError((error) => this.handleRequestError('updateProfile', endpoint, error, 'No fue posible actualizar el perfil.'))
      );
  }

  getGithubLinkAuthorizeUrl(state: string): Observable<string> {
    const session = this.resolveSession();

    if (!session) {
      return throwError(() => new Error('No hay una sesión activa.'));
    }

    const normalizedState = typeof state === 'string' ? state.trim() : '';

    if (!normalizedState) {
      return throwError(() => new Error('El estado de seguridad es obligatorio.'));
    }

    const endpoint = `/profile/${session.userId}/github/authorize`;

    return this.http
      .post<GithubAuthorizeLinkResponse>(`${this.apiUrl}${endpoint}`, { state: normalizedState }, {
        headers: session.headers
      })
      .pipe(
        map((response) => {
          if (!response?.ok) {
            throw new Error(this.toNullableString(response?.error) || 'No se pudo preparar la vinculación con GitHub.');
          }

          const authorizeUrl =
            (typeof response.authorizeUrl === 'string' && response.authorizeUrl.trim().length > 0
              ? response.authorizeUrl.trim()
              : null) ||
            (typeof response.url === 'string' && response.url.trim().length > 0 ? response.url.trim() : null);

          if (!authorizeUrl) {
            throw new Error('No se recibió la URL de autorización de GitHub.');
          }

          try {
            // Validate URL format
            new URL(authorizeUrl);
          } catch {
            throw new Error('La URL de autorización recibida no es válida.');
          }

          return authorizeUrl;
        }),
        catchError((error) =>
          this.handleRequestError(
            'getGithubLinkAuthorizeUrl',
            endpoint,
            error,
            'No se pudo generar la URL de autorización de GitHub.'
          )
        )
      );
  }

  completeGithubLink(code: string, state: string): Observable<GithubAccountResponse> {
    const session = this.resolveSession();

    if (!session) {
      return throwError(() => new Error('No hay una sesión activa.'));
    }

    const normalizedCode = typeof code === 'string' ? code.trim() : '';
    const normalizedState = typeof state === 'string' ? state.trim() : '';

    if (!normalizedCode || !normalizedState) {
      return throwError(() => new Error('El código de autorización y el estado son obligatorios.'));
    }

    const endpoint = `/profile/${session.userId}/github/link`;

    return this.http
      .post<GithubAccountResponseEnvelope>(
        `${this.apiUrl}${endpoint}`,
        { code: normalizedCode, state: normalizedState },
        { headers: session.headers }
      )
      .pipe(
        map((response) =>
          this.normalizeGithubAccountResponse(response, 'No se pudo vincular tu cuenta de GitHub.')
        ),
        catchError((error) =>
          this.handleRequestError(
            'completeGithubLink',
            endpoint,
            error,
            'No se pudo vincular tu cuenta de GitHub.'
          )
        )
      );
  }

  unlinkGithubAccount(): Observable<GithubAccountResponse> {
    const session = this.resolveSession();

    if (!session) {
      return throwError(() => new Error('No hay una sesión activa.'));
    }

    const endpoint = `/profile/${session.userId}/github/link`;

    return this.http
      .delete<GithubAccountResponseEnvelope>(`${this.apiUrl}${endpoint}`, { headers: session.headers })
      .pipe(
        map((response) =>
          this.normalizeGithubAccountResponse(response, 'No se pudo desvincular tu cuenta de GitHub.')
        ),
        catchError((error) =>
          this.handleRequestError(
            'unlinkGithubAccount',
            endpoint,
            error,
            'No se pudo desvincular tu cuenta de GitHub.'
          )
        )
      );
  }

  getPublicProfile(slug: string): Observable<PublicProfileData> {
    const normalizedSlug = this.normalizeSlug(slug);

    if (!normalizedSlug) {
      return throwError(() => new Error('La URL pública proporcionada no es válida.'));
    }

    const endpoint = `/profiles/${encodeURIComponent(normalizedSlug)}`;

    return this.http
      .get<PublicProfileResponseEnvelope>(`${this.apiUrl}${endpoint}`)
      .pipe(
        map((response) =>
          this.normalizePublicProfileResponse(response, 'No fue posible obtener el perfil público.')
        ),
        catchError((error) =>
          this.handleRequestError(
            'getPublicProfile',
            endpoint,
            error,
            'No fue posible obtener el perfil público.'
          )
        )
      );
  }

  checkSlugAvailability(slug: string): Observable<boolean> {
    const normalizedSlug = this.normalizeSlug(slug);

    if (!normalizedSlug) {
      return of(false);
    }

    const endpoint = `/profiles/${encodeURIComponent(normalizedSlug)}`;

    return this.http.get<PublicProfileResponseEnvelope>(`${this.apiUrl}${endpoint}`).pipe(
      map(() => false),
      catchError((error) => {
        if (error instanceof HttpErrorResponse) {
          if (error.status === 404) {
            return of(true);
          }

          if (error.status === 400) {
            return of(false);
          }
        }

        console.error('[ProfileService] checkSlugAvailability failed', {
          url: `${this.apiUrl}${endpoint}`,
          status: (error as any)?.status ?? null,
          message: (error as any)?.message ?? null,
          error
        });

        const message =
          (error as any)?.error?.error ||
          (error as any)?.error?.message ||
          (error as any)?.message ||
          'No se pudo verificar la disponibilidad de la URL personalizada.';

        return throwError(() => new Error(message));
      })
    );
  }

  getEducation(): Observable<EducationListResult> {
    const session = this.resolveSession();

    if (!session) {
      return throwError(() => new Error('No hay una sesión activa.'));
    }

    const { userId, headers } = session;
    const endpoint = `/profile/${userId}/education`;

    return this.http
      .get<EducationResponseEnvelope>(`${this.apiUrl}${endpoint}`, { headers })
      .pipe(
        map((response) => this.normalizeEducationListResponse(response, 'No fue posible obtener tu información educativa.')),
        catchError((error) =>
          this.handleRequestError('getEducation', endpoint, error, 'No fue posible obtener tu información educativa.')
        )
      );
  }

  createEducation(payload: EducationPayload): Observable<EducationMutationResult> {
    const session = this.resolveSession();

    if (!session) {
      return throwError(() => new Error('No hay una sesión activa.'));
    }

    const { userId, headers } = session;
    const endpoint = `/profile/${userId}/education`;

    return this.http
      .post<EducationResponseEnvelope>(`${this.apiUrl}${endpoint}`, this.prepareEducationPayload(payload), { headers })
      .pipe(
        map((response) =>
          this.normalizeEducationMutationResponse(response, 'No fue posible crear el registro educativo.')
        ),
        catchError((error) =>
          this.handleRequestError('createEducation', endpoint, error, 'No fue posible crear el registro educativo.')
        )
      );
  }

  updateEducation(educationId: number, payload: EducationPayload): Observable<EducationMutationResult> {
    const session = this.resolveSession();

    if (!session) {
      return throwError(() => new Error('No hay una sesión activa.'));
    }

    const { userId, headers } = session;
    const endpoint = `/profile/${userId}/education/${educationId}`;

    return this.http
      .put<EducationResponseEnvelope>(`${this.apiUrl}${endpoint}`, this.prepareEducationPayload(payload), { headers })
      .pipe(
        map((response) =>
          this.normalizeEducationMutationResponse(response, 'No fue posible actualizar el registro educativo.')
        ),
        catchError((error) =>
          this.handleRequestError('updateEducation', endpoint, error, 'No fue posible actualizar el registro educativo.')
        )
      );
  }

  getExperience(): Observable<ExperienceListResult> {
    const session = this.resolveSession();

    if (!session) {
      return throwError(() => new Error('No hay una sesión activa.'));
    }

    const { userId, headers } = session;
    const endpoint = `/profile/${userId}/experience`;

    return this.http
      .get<ExperienceResponseEnvelope>(`${this.apiUrl}${endpoint}`, { headers })
      .pipe(
        map((response) =>
          this.normalizeExperienceListResponse(response, 'No fue posible obtener tu experiencia laboral.')
        ),
        catchError((error) =>
          this.handleRequestError('getExperience', endpoint, error, 'No fue posible obtener tu experiencia laboral.')
        )
      );
  }

  createExperience(payload: ExperiencePayload): Observable<ExperienceMutationResult> {
    const session = this.resolveSession();

    if (!session) {
      return throwError(() => new Error('No hay una sesión activa.'));
    }

    const { userId, headers } = session;
    const endpoint = `/profile/${userId}/experience`;

    return this.http
      .post<ExperienceResponseEnvelope>(`${this.apiUrl}${endpoint}`, this.prepareExperiencePayload(payload), {
        headers
      })
      .pipe(
        map((response) =>
          this.normalizeExperienceMutationResponse(response, 'No fue posible crear el registro de experiencia.')
        ),
        catchError((error) =>
          this.handleRequestError(
            'createExperience',
            endpoint,
            error,
            'No fue posible crear el registro de experiencia.'
          )
        )
      );
  }

  updateExperience(experienceId: number, payload: ExperiencePayload): Observable<ExperienceMutationResult> {
    const session = this.resolveSession();

    if (!session) {
      return throwError(() => new Error('No hay una sesión activa.'));
    }

    const { userId, headers } = session;
    const endpoint = `/profile/${userId}/experience/${experienceId}`;

    return this.http
      .put<ExperienceResponseEnvelope>(`${this.apiUrl}${endpoint}`, this.prepareExperiencePayload(payload), {
        headers
      })
      .pipe(
        map((response) =>
          this.normalizeExperienceMutationResponse(response, 'No fue posible actualizar el registro de experiencia.')
        ),
        catchError((error) =>
          this.handleRequestError(
            'updateExperience',
            endpoint,
            error,
            'No fue posible actualizar el registro de experiencia.'
          )
        )
      );
  }

  getSkillCatalog(category?: string | null): Observable<SkillCatalogItem[]> {
    const session = this.resolveSession();

    if (!session) {
      return throwError(() => new Error('No hay una sesión activa.'));
    }

    const { headers } = session;
    const endpoint = `/skills/catalog`;
    const options: { headers: HttpHeaders; params?: HttpParams } = { headers };

    if (category && category.trim().length > 0) {
      options.params = new HttpParams().set('category', category.trim());
    }

    return this.http
      .get<SkillCatalogResponseEnvelope>(`${this.apiUrl}${endpoint}`, options)
      .pipe(
        map((response) =>
          this.normalizeSkillCatalogResponse(response, 'No se pudo obtener el catálogo de habilidades.')
        ),
        catchError((error) =>
          this.handleRequestError(
            'getSkillCatalog',
            endpoint,
            error,
            'No se pudo obtener el catálogo de habilidades.'
          )
        )
      );
  }

  getSkills(): Observable<SkillListResult> {
    const session = this.resolveSession();

    if (!session) {
      return throwError(() => new Error('No hay una sesión activa.'));
    }

    const { userId, headers } = session;
    const endpoint = `/profile/${userId}/skills`;

    return this.http
      .get<SkillsResponseEnvelope>(`${this.apiUrl}${endpoint}`, { headers })
      .pipe(
        map((response) => this.normalizeSkillListResponse(response, 'No fue posible obtener tus habilidades.')),
        catchError((error) =>
          this.handleRequestError('getSkills', endpoint, error, 'No fue posible obtener tus habilidades.')
        )
      );
  }

  createSkill(payload: SkillPayload): Observable<SkillMutationResult> {
    const session = this.resolveSession();

    if (!session) {
      return throwError(() => new Error('No hay una sesión activa.'));
    }

    const { userId, headers } = session;
    const endpoint = `/profile/${userId}/skills`;

    return this.http
      .post<SkillsResponseEnvelope>(`${this.apiUrl}${endpoint}`, this.prepareSkillPayload(payload), { headers })
      .pipe(
        map((response) => this.normalizeSkillMutationResponse(response, 'No fue posible registrar la habilidad.')),
        catchError((error) =>
          this.handleRequestError('createSkill', endpoint, error, 'No fue posible registrar la habilidad.')
        )
      );
  }

  updateSkill(skillId: number, payload: SkillPayload): Observable<SkillMutationResult> {
    const session = this.resolveSession();

    if (!session) {
      return throwError(() => new Error('No hay una sesión activa.'));
    }

    const { userId, headers } = session;
    const endpoint = `/profile/${userId}/skills/${skillId}`;

    return this.http
      .put<SkillsResponseEnvelope>(`${this.apiUrl}${endpoint}`, this.prepareSkillPayload(payload), { headers })
      .pipe(
        map((response) => this.normalizeSkillMutationResponse(response, 'No fue posible actualizar la habilidad.')),
        catchError((error) =>
          this.handleRequestError('updateSkill', endpoint, error, 'No fue posible actualizar la habilidad.')
        )
      );
  }

  deleteSkill(skillId: number): Observable<SkillSummary | null> {
    const session = this.resolveSession();

    if (!session) {
      return throwError(() => new Error('No hay una sesión activa.'));
    }

    const { userId, headers } = session;
    const endpoint = `/profile/${userId}/skills/${skillId}`;

    return this.http
      .delete<SkillsResponseEnvelope>(`${this.apiUrl}${endpoint}`, { headers })
      .pipe(
        map((response) => this.normalizeSkillDeleteResponse(response, 'No fue posible eliminar la habilidad.')),
        catchError((error) =>
          this.handleRequestError('deleteSkill', endpoint, error, 'No fue posible eliminar la habilidad.')
        )
      );
  }

  deleteEducation(educationId: number): Observable<EducationSummary | null> {
    const session = this.resolveSession();

    if (!session) {
      return throwError(() => new Error('No hay una sesión activa.'));
    }

    const { userId, headers } = session;
    const endpoint = `/profile/${userId}/education/${educationId}`;

    return this.http
      .delete<EducationResponseEnvelope>(`${this.apiUrl}${endpoint}`, { headers })
      .pipe(
        map((response) =>
          this.normalizeEducationDeleteResponse(response, 'No fue posible eliminar el registro educativo.')
        ),
        catchError((error) =>
          this.handleRequestError('deleteEducation', endpoint, error, 'No fue posible eliminar el registro educativo.')
        )
      );
  }

  deleteExperience(experienceId: number): Observable<ExperienceSummary | null> {
    const session = this.resolveSession();

    if (!session) {
      return throwError(() => new Error('No hay una sesión activa.'));
    }

    const { userId, headers } = session;
    const endpoint = `/profile/${userId}/experience/${experienceId}`;

    return this.http
      .delete<ExperienceResponseEnvelope>(`${this.apiUrl}${endpoint}`, { headers })
      .pipe(
        map((response) =>
          this.normalizeExperienceDeleteResponse(response, 'No fue posible eliminar el registro de experiencia.')
        ),
        catchError((error) =>
          this.handleRequestError(
            'deleteExperience',
            endpoint,
            error,
            'No fue posible eliminar el registro de experiencia.'
          )
        )
      );
  }

  private resolveSession():
    | { userId: number; userType: number | null; accessToken: string; headers: HttpHeaders }
    | null {
    const userId = this.authService.getUserId();
    const userType = this.authService.getUserType();
    const accessToken = this.authService.getAccessToken();

    if (!userId || !accessToken) {
      return null;
    }

    const headers = new HttpHeaders({ Authorization: `Bearer ${accessToken}` });

    return { userId, userType, accessToken, headers };
  }

  private normalizeProfileResponse(
    response: ProfileResponseEnvelope | null | undefined,
    defaultMessage: string
  ): ProfileData {
    if (!response?.ok) {
      throw new Error(this.extractErrorMessage(response, defaultMessage));
    }

    const baseData = this.mergeProfileSources(response);
    const validations = this.toRecord(response.validations);
    const errors = this.toRecord(response.errors);

    const result: ProfileData = {
      displayName: this.toNullableString(baseData['displayName']),
      biography: this.toNullableString(baseData['biography']),
      country: this.toNullableString(baseData['country']),
      city: this.toNullableString(baseData['city']),
      career: this.toNullableString(baseData['career']),
      avatarUrl: this.toNullableString(baseData['avatarUrl']),
      slug: this.toNullableString(baseData['slug']),
      ok_displayName: this.toBoolean(this.pickValidationFlag('displayName', baseData, validations, response), true),
      ok_biography: this.toBoolean(this.pickValidationFlag('biography', baseData, validations, response), true),
      ok_country: this.toBoolean(this.pickValidationFlag('country', baseData, validations, response), true),
      ok_city: this.toBoolean(this.pickValidationFlag('city', baseData, validations, response), true),
      ok_career: this.toBoolean(this.pickValidationFlag('career', baseData, validations, response), true),
      ok_avatarUrl: this.toBoolean(this.pickValidationFlag('avatarUrl', baseData, validations, response), true),
      ok_slug: this.toBoolean(this.pickValidationFlag('slug', baseData, validations, response), true),
      error_displayName: this.pickValidationError('displayName', baseData, validations, errors, response),
      error_biography: this.pickValidationError('biography', baseData, validations, errors, response),
      error_country: this.pickValidationError('country', baseData, validations, errors, response),
      error_city: this.pickValidationError('city', baseData, validations, errors, response),
      error_career: this.pickValidationError('career', baseData, validations, errors, response),
      error_avatarUrl: this.pickValidationError('avatarUrl', baseData, validations, errors, response),
      error_slug: this.pickValidationError('slug', baseData, validations, errors, response),
      isComplete: this.toBoolean(
        response['isComplete'] ?? baseData['isComplete'] ?? validations['isComplete'],
        false
      ),
      missingFields: this.toStringArray(
        response['missingFields'] ?? baseData['missingFields'] ?? validations['missingFields']
      ),
      message: this.toNullableString(
        response['message'] ??
          baseData['message'] ??
          validations['message'] ??
          errors['message']
      ),
      educationSummary: this.toEducationSummary(
        response['educationSummary'] ??
          baseData['educationSummary'] ??
          validations['educationSummary'] ??
          errors['educationSummary']
      ),
      experienceSummary: this.toExperienceSummary(
        response['experienceSummary'] ??
          baseData['experienceSummary'] ??
          validations['experienceSummary'] ??
          errors['experienceSummary']
      ),
      skillsSummary: this.toSkillSummary(
        response['skillsSummary'] ??
          baseData['skillsSummary'] ??
          validations['skillsSummary'] ??
          errors['skillsSummary']
      ),
      githubAccount: this.toGithubAccount(
        response['githubAccount'] ??
          baseData['githubAccount'] ??
          validations['githubAccount'] ??
          errors['githubAccount']
      )
    } satisfies ProfileData;

    return result;
  }

  private normalizeGithubAccountResponse(
    response: GithubAccountResponseEnvelope | null | undefined,
    defaultMessage: string
  ): GithubAccountResponse {
    if (!response?.ok) {
      const errorMessage = this.toNullableString(response?.error) || defaultMessage;
      throw new Error(errorMessage);
    }

    const account = this.toGithubAccount(response.githubAccount);
    const message = this.toNullableString(response.message);

    return {
      account,
      message: message || null
    } satisfies GithubAccountResponse;
  }

  private normalizePublicProfileResponse(
    response: PublicProfileResponseEnvelope | null | undefined,
    defaultMessage: string
  ): PublicProfileData {
    const errorMessage = this.toNullableString((response as any)?.error);
    const fallbackMessage = this.toNullableString((response as any)?.message) ?? defaultMessage;

    if (!response?.ok) {
      throw new Error(errorMessage ?? fallbackMessage);
    }

    const profileRecord = this.toRecord(response.profile);

    if (Object.keys(profileRecord).length === 0) {
      throw new Error(errorMessage ?? fallbackMessage);
    }

    const educationRecord = this.toRecord(response.education);
    const experienceRecord = this.toRecord(response.experience);
    const skillsRecord = this.toRecord(response.skills);

    const educationEntries = this.toEducationArray(
      educationRecord['entries'] ?? educationRecord['list'] ?? educationRecord['education']
    );
    const experienceEntries = this.toExperienceArray(
      experienceRecord['entries'] ?? experienceRecord['list'] ?? experienceRecord['experience']
    );
    const skillEntries = this.toSkillArray(
      skillsRecord['entries'] ?? skillsRecord['list'] ?? skillsRecord['skills']
    );

    const educationSummary = this.toEducationSummary(
      educationRecord['summary'] ?? educationRecord['status'] ?? educationRecord['educationSummary']
    );
    const experienceSummary = this.toExperienceSummary(
      experienceRecord['summary'] ?? experienceRecord['status'] ?? experienceRecord['experienceSummary']
    );
    const skillsSummary = this.toSkillSummary(
      skillsRecord['summary'] ?? skillsRecord['status'] ?? skillsRecord['skillsSummary']
    );

    return {
      profile: {
        displayName: this.toNullableString(profileRecord['displayName']),
        biography: this.toNullableString(profileRecord['biography']),
        country: this.toNullableString(profileRecord['country']),
        city: this.toNullableString(profileRecord['city']),
        career: this.toNullableString(profileRecord['career']),
        avatarUrl: this.toNullableString(profileRecord['avatarUrl']),
        slug: this.toNullableString(profileRecord['slug'])
      },
      education: {
        entries: educationEntries,
        summary: educationSummary
      },
      experience: {
        entries: experienceEntries,
        summary: experienceSummary
      },
      skills: {
        entries: skillEntries,
        summary: skillsSummary
      }
    } satisfies PublicProfileData;
  }

  private mergeProfileSources(response: ProfileResponseEnvelope): Record<string, unknown> {
    const data = this.toRecord(response.data);
    const innerProfile = this.toRecord((response.data as any)?.profile);
    const profile = this.toRecord(response.profile);

    const merged = {
      ...profile,
      ...innerProfile,
      ...data
    } as Record<string, unknown>;

    delete merged['profile'];

    return merged;
  }

  private pickValidationFlag(
    field: ProfileField,
    data: Record<string, unknown>,
    validations: Record<string, unknown>,
    response: ProfileResponseEnvelope
  ): unknown {
    const key = `ok_${field}`;
    return validations[key] ?? data[key] ?? (response as Record<string, unknown>)[key];
  }

  private pickValidationError(
    field: ProfileField,
    data: Record<string, unknown>,
    validations: Record<string, unknown>,
    errors: Record<string, unknown>,
    response: ProfileResponseEnvelope
  ): string | null {
    const key = `error_${field}`;
    const root = response as Record<string, unknown>;
    const candidates = [errors[key], validations[key], data[key], root[key], errors[field]];

    for (const candidate of candidates) {
      const message = this.toNullableString(
        typeof candidate === 'object' && candidate !== null && 'message' in candidate
          ? (candidate as any).message
          : candidate
      );

      if (message) {
        return message;
      }
    }

    return null;
  }

  private toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object') {
      return {};
    }

    return value as Record<string, unknown>;
  }

  private normalizeSlug(slug: string | null | undefined): string {
    if (typeof slug !== 'string') {
      return '';
    }

    const normalized = slug.trim().toLowerCase();

    if (!normalized) {
      return '';
    }

    const slugPattern = /^[a-z0-9-]{3,40}$/;

    return slugPattern.test(normalized) ? normalized : '';
  }

  private toNullableString(value: unknown): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      
      if (!trimmed || trimmed === '[object Object]') {
        return '';
      }

      return trimmed;
    }

      if (ArrayBuffer.isView(value)) {
      const decoded = this.decodeByteSequence(value as ArrayBufferView);
      return decoded ?? '';
    }

    if (value instanceof ArrayBuffer) {
      const decoded = this.decodeByteSequence(new Uint8Array(value));
      return decoded ?? '';
    }

    if (this.isSerializedBuffer(value)) {
      const decoded = this.decodeByteSequence((value as { data: ArrayLike<number> }).data);
      return decoded ?? '';
    }

    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;

      const textCandidate = typeof record['text'] === 'string' ? record['text'].trim() : null;
      if (textCandidate && textCandidate.length > 0) {
        return textCandidate;
      }

      const valueCandidate = typeof record['value'] === 'string' ? record['value'].trim() : null;
      if (valueCandidate && valueCandidate.length > 0) {
        return valueCandidate;
      }

      const customToString = record['toString'];
      if (typeof customToString === 'function' && customToString !== Object.prototype.toString) {
        try {
          const result = customToString.call(value);
          if (typeof result === 'string') {
            const trimmed = result.trim();
            if (trimmed.length > 0 && trimmed !== '[object Object]') {
              return trimmed;
            }
          }
        } catch (error) {
          console.warn('[ProfileService] Failed to stringify object value', error);
        }
      }
    }

    const fallback = String(value).trim();
    return fallback === '[object Object]' ? '' : fallback;
  }

  private decodeByteSequence(
    value: ArrayBufferView | ArrayLike<number> | null | undefined
  ): string | null {
    if (!value) {
      return null;
    }

    try {
      let bytes: Uint8Array;

      if (value instanceof Uint8Array) {
        bytes = value;
      } else if (ArrayBuffer.isView(value)) {
        bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      } else {
        bytes = Uint8Array.from(value);
      }

      const decoded = new TextDecoder().decode(bytes);
      const trimmed = decoded.trim();
      return trimmed.length > 0 ? trimmed : '';
    } catch (error) {
      console.warn('[ProfileService] Failed to decode byte sequence', error);
      return null;
    }
  }

  private isSerializedBuffer(value: unknown): value is { type: string; data: ArrayLike<number> } {
    return (
      !!value &&
      typeof value === 'object' &&
      (value as { type?: unknown }).type === 'Buffer' &&
      Array.isArray((value as { data?: unknown }).data)
    );
  }

  private toBoolean(value: unknown, defaultValue = false): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y') {
        return true;
      }
      if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'n') {
        return false;
      }
    }

    if (typeof value === 'number') {
      return value !== 0;
    }

    return defaultValue;
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => this.toNullableString(item))
      .filter((item): item is string => item !== null && item.trim().length > 0)
      .map((item) => item.trim());
  }

  private prepareEducationPayload(payload: EducationPayload): Record<string, unknown> {
    return {
      institution: this.normalizeRequiredString(payload.institution),
      degree: this.normalizeOptionalString(payload.degree),
      fieldOfStudy: this.normalizeOptionalString(payload.fieldOfStudy),
      startDate: this.normalizeDateInput(payload.startDate),
      endDate: this.normalizeDateInput(payload.endDate),
      description: this.normalizeOptionalString(payload.description)
    } satisfies Record<string, unknown>;
  }

  private prepareExperiencePayload(payload: ExperiencePayload): Record<string, unknown> {
    return {
      title: this.normalizeRequiredString(payload.title),
      company: this.normalizeOptionalString(payload.company),
      startDate: this.normalizeDateInput(payload.startDate),
      endDate: this.normalizeDateInput(payload.endDate),
      location: this.normalizeOptionalString(payload.location),
      description: this.normalizeOptionalString(payload.description)
    } satisfies Record<string, unknown>;
  }

  private prepareSkillPayload(payload: SkillPayload): Record<string, unknown> {
    return {
      skillId: this.normalizeOptionalNumber(payload.skillId),
      skillName: this.normalizeOptionalString(payload.skillName),
      level: this.normalizeOptionalNumber(payload.level),
      yearsExperience: this.normalizeOptionalNumber(payload.yearsExperience),
      endorsementCount: this.normalizeOptionalNumber(payload.endorsementCount)
    } satisfies Record<string, unknown>;
  }

  private normalizeRequiredString(value: unknown): string {
    const normalized = this.toNullableString(value);

    if (!normalized) {
      return '';
    }

    const trimmed = normalized.trim();
    return trimmed.length > 0 ? trimmed : '';
  }

  private normalizeOptionalString(value: unknown): string | null {
    const normalized = this.toNullableString(value);

    if (!normalized) {
      return null;
    }

    const trimmed = normalized.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeDateInput(value: unknown): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    const normalized = this.toNullableString(value);

    if (!normalized) {
      return null;
    }

    const trimmed = normalized.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeOptionalNumber(value: unknown): number | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private normalizeDateOutput(value: unknown): string | null {
    if (value instanceof Date) {
      return value.toISOString();
    }

    const normalized = this.toNullableString(value);

    if (!normalized) {
      return null;
    }

    const trimmed = normalized.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeEducationListResponse(
    response: EducationResponseEnvelope | null | undefined,
    defaultMessage: string
  ): EducationListResult {
    if (!response?.ok) {
      throw new Error(this.extractErrorMessage(response, defaultMessage));
    }

    const education = this.toEducationArray(
      (response as any)?.education ?? (response as any)?.data?.education
    );
    const educationSummary = this.toEducationSummary(
      response.educationSummary ?? (response as any)?.data?.educationSummary
    );

    return { education, educationSummary } satisfies EducationListResult;
  }

  private normalizeEducationMutationResponse(
    response: EducationResponseEnvelope | null | undefined,
    defaultMessage: string
  ): EducationMutationResult {
    if (!response?.ok) {
      throw new Error(this.extractErrorMessage(response, defaultMessage));
    }

    const education = this.toEducationEntry(
      response.education ?? (response as any)?.data?.education
    );

    if (!education) {
      throw new Error(defaultMessage);
    }

    const educationSummary = this.toEducationSummary(
      response.educationSummary ?? (response as any)?.data?.educationSummary
    );

    return { education, educationSummary } satisfies EducationMutationResult;
  }

  private normalizeEducationDeleteResponse(
    response: EducationResponseEnvelope | null | undefined,
    defaultMessage: string
  ): EducationSummary | null {
    if (!response?.ok) {
      throw new Error(this.extractErrorMessage(response, defaultMessage));
    }

    return (
      this.toEducationSummary(
        response.educationSummary ?? (response as any)?.data?.educationSummary
      ) ?? null
    );
  }

  private normalizeExperienceListResponse(
    response: ExperienceResponseEnvelope | null | undefined,
    defaultMessage: string
  ): ExperienceListResult {
    if (!response?.ok) {
      throw new Error(this.extractErrorMessage(response, defaultMessage));
    }

    const experience = this.toExperienceArray(
      (response as any)?.experience ?? (response as any)?.data?.experience
    );
    const experienceSummary = this.toExperienceSummary(
      response.experienceSummary ?? (response as any)?.data?.experienceSummary
    );

    return { experience, experienceSummary } satisfies ExperienceListResult;
  }

  private normalizeExperienceMutationResponse(
    response: ExperienceResponseEnvelope | null | undefined,
    defaultMessage: string
  ): ExperienceMutationResult {
    if (!response?.ok) {
      throw new Error(this.extractErrorMessage(response, defaultMessage));
    }

    const experience = this.toExperienceEntry(
      response.experience ?? (response as any)?.data?.experience
    );

    if (!experience) {
      throw new Error(defaultMessage);
    }

    const experienceSummary = this.toExperienceSummary(
      response.experienceSummary ?? (response as any)?.data?.experienceSummary
    );

    return { experience, experienceSummary } satisfies ExperienceMutationResult;
  }

  private normalizeExperienceDeleteResponse(
    response: ExperienceResponseEnvelope | null | undefined,
    defaultMessage: string
  ): ExperienceSummary | null {
    if (!response?.ok) {
      throw new Error(this.extractErrorMessage(response, defaultMessage));
    }

    return (
      this.toExperienceSummary(
        response.experienceSummary ?? (response as any)?.data?.experienceSummary
      ) ?? null
    );
  }

  private normalizeSkillCatalogResponse(
    response: SkillCatalogResponseEnvelope | null | undefined,
    defaultMessage: string
  ): SkillCatalogItem[] {
    if (!response?.ok) {
      throw new Error(this.extractErrorMessage(response, defaultMessage));
    }

    return this.toSkillCatalogItems(
      response.items ??
        (response as any)?.data?.items ??
        (response as any)?.skills ??
        (response as any)?.catalog
    );
  }

  private normalizeSkillListResponse(
    response: SkillsResponseEnvelope | null | undefined,
    defaultMessage: string
  ): SkillListResult {
    if (!response?.ok) {
      throw new Error(this.extractErrorMessage(response, defaultMessage));
    }

    const skills = this.toSkillArray((response as any)?.skills ?? (response as any)?.data?.skills);
    const skillsSummary = this.toSkillSummary(
      response.skillsSummary ?? (response as any)?.data?.skillsSummary
    );

    return { skills, skillsSummary } satisfies SkillListResult;
  }

  private normalizeSkillMutationResponse(
    response: SkillsResponseEnvelope | null | undefined,
    defaultMessage: string
  ): SkillMutationResult {
    if (!response?.ok) {
      throw new Error(this.extractErrorMessage(response, defaultMessage));
    }

    const skill = this.toSkillEntry(response.skill ?? (response as any)?.data?.skill);

    if (!skill) {
      throw new Error(defaultMessage);
    }

    const skillsSummary = this.toSkillSummary(
      response.skillsSummary ?? (response as any)?.data?.skillsSummary
    );

    return { skill, skillsSummary } satisfies SkillMutationResult;
  }

  private normalizeSkillDeleteResponse(
    response: SkillsResponseEnvelope | null | undefined,
    defaultMessage: string
  ): SkillSummary | null {
    if (!response?.ok) {
      throw new Error(this.extractErrorMessage(response, defaultMessage));
    }

    return (
      this.toSkillSummary(response.skillsSummary ?? (response as any)?.data?.skillsSummary) ?? null
    );
  }

  private toEducationArray(value: unknown): EducationEntry[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => this.toEducationEntry(item))
      .filter((item): item is EducationEntry => item !== null);
  }

  private toEducationEntry(value: unknown): EducationEntry | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;
    const idCandidate =
      record['id'] ??
      record['ID'] ??
      record['educationId'] ??
      record['ID_EDUCACION'];
    const id = Number(idCandidate);

    if (!Number.isFinite(id) || id <= 0) {
      return null;
    }

    return {
      id,
      institution: this.normalizeRequiredString(record['institution'] ?? record['INSTITUCION']),
      degree: this.normalizeOptionalString(record['degree'] ?? record['GRADO']),
      fieldOfStudy: this.normalizeOptionalString(
        record['fieldOfStudy'] ?? record['FIELD_OF_STUDY'] ?? record['AREA_ESTUDIO']
      ),
      startDate: this.normalizeDateOutput(
        record['startDate'] ?? record['START_DATE'] ?? record['FECHA_INICIO']
      ),
      endDate: this.normalizeDateOutput(record['endDate'] ?? record['END_DATE'] ?? record['FECHA_FIN']),
      description: this.normalizeOptionalString(record['description'] ?? record['DESCRIPCION'])
    } satisfies EducationEntry;
  }

  private toEducationSummary(value: unknown): EducationSummary | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;
    const totalRecordsRaw = Number(
      record['totalRecords'] ?? record['TOTAL_RECORDS'] ?? record['o_total_registros'] ?? record['TOTAL']
    );
    const validDatesRaw = Number(
      record['validDateCount'] ??
        record['VALID_DATE_COUNT'] ??
        record['o_con_fechas_validas'] ??
        record['VALID_DATES']
    );
    const invalidDatesRaw = Number(
      record['invalidDateCount'] ??
        record['INVALID_DATE_COUNT'] ??
        record['o_invalid_date_count'] ??
        record['INVALID_DATES']
    );
    const hasEducation = this.toBoolean(
      record['hasEducation'] ?? record['HAS_EDUCATION'] ?? record['o_tiene_educacion'],
      false
    );

    const totalRecords = Number.isFinite(totalRecordsRaw) ? Math.max(Math.floor(totalRecordsRaw), 0) : 0;
    const validDateCount = Number.isFinite(validDatesRaw) ? Math.max(Math.floor(validDatesRaw), 0) : 0;
    const invalidDateCount = Number.isFinite(invalidDatesRaw)
      ? Math.max(Math.floor(invalidDatesRaw), 0)
      : Math.max(totalRecords - validDateCount, 0);

    return {
      hasEducation,
      totalRecords,
      validDateCount,
      invalidDateCount
    } satisfies EducationSummary;
  }

  private toExperienceArray(value: unknown): ExperienceEntry[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => this.toExperienceEntry(item))
      .filter((item): item is ExperienceEntry => item !== null);
  }

  private toExperienceEntry(value: unknown): ExperienceEntry | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;
    const idCandidate =
      record['id'] ??
      record['ID'] ??
      record['experienceId'] ??
      record['ID_EXPERIENCIA'];
    const id = Number(idCandidate);

    if (!Number.isFinite(id) || id <= 0) {
      return null;
    }

    return {
      id,
      title: this.normalizeRequiredString(record['title'] ?? record['TITULO']),
      company: this.normalizeOptionalString(record['company'] ?? record['EMPRESA']),
      startDate: this.normalizeDateOutput(record['startDate'] ?? record['START_DATE'] ?? record['FECHA_INICIO']),
      endDate: this.normalizeDateOutput(record['endDate'] ?? record['END_DATE'] ?? record['FECHA_FIN']),
      location: this.normalizeOptionalString(record['location'] ?? record['UBICACION']),
      description: this.normalizeOptionalString(record['description'] ?? record['DESCRIPCION'])
    } satisfies ExperienceEntry;
  }

  private toExperienceSummary(value: unknown): ExperienceSummary | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;
    const totalRecordsRaw = Number(
      record['totalRecords'] ?? record['TOTAL_RECORDS'] ?? record['o_total_registros'] ?? record['TOTAL']
    );
    const validDatesRaw = Number(
      record['validDateCount'] ??
        record['VALID_DATE_COUNT'] ??
        record['o_con_fechas_validas'] ??
        record['VALID_DATES']
    );
    const invalidDatesRaw = Number(
      record['invalidDateCount'] ??
        record['INVALID_DATE_COUNT'] ??
        record['o_invalid_date_count'] ??
        record['INVALID_DATES']
    );
    const currentCountRaw = Number(
      record['currentCount'] ?? record['CURRENT_COUNT'] ?? record['o_actuales'] ?? record['ACTUAL']
    );
    const hasExperience = this.toBoolean(
      record['hasExperience'] ?? record['HAS_EXPERIENCE'] ?? record['o_tiene_experiencia'],
      false
    );

    const totalRecords = Number.isFinite(totalRecordsRaw) ? Math.max(Math.floor(totalRecordsRaw), 0) : 0;
    const validDateCount = Number.isFinite(validDatesRaw) ? Math.max(Math.floor(validDatesRaw), 0) : 0;
    const invalidDateCount = Number.isFinite(invalidDatesRaw)
      ? Math.max(Math.floor(invalidDatesRaw), 0)
      : Math.max(totalRecords - validDateCount, 0);
    const currentCount = Number.isFinite(currentCountRaw) ? Math.max(Math.floor(currentCountRaw), 0) : 0;

    return {
      hasExperience,
      totalRecords,
      validDateCount,
      invalidDateCount,
      currentCount
    } satisfies ExperienceSummary;
  }

  private toSkillCatalogItems(value: unknown): SkillCatalogItem[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => this.toSkillCatalogItem(item))
      .filter((item): item is SkillCatalogItem => item !== null);
  }

  private toSkillCatalogItem(value: unknown): SkillCatalogItem | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;
    const idCandidate =
      record['skillId'] ??
      record['SKILL_ID'] ??
      record['id'] ??
      record['ID'] ??
      record['ID_HABILIDAD'];
    const skillId = Number(idCandidate);

    if (!Number.isFinite(skillId) || skillId <= 0) {
      return null;
    }

    const rawName = record['name'] ?? record['NAME'] ?? record['nombre'] ?? record['NOMBRE'];
    const name = this.normalizeRequiredString(rawName);

    if (!name) {
      return null;
    }

    const category = this.normalizeOptionalString(
      record['category'] ?? record['CATEGORY'] ?? record['categoria'] ?? record['CATEGORIA']
    );

    return { skillId, name, category } satisfies SkillCatalogItem;
  }

  private toSkillArray(value: unknown): SkillEntry[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => this.toSkillEntry(item))
      .filter((item): item is SkillEntry => item !== null);
  }

  private toSkillEntry(value: unknown): SkillEntry | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;
    const idCandidate =
      record['skillId'] ??
      record['SKILL_ID'] ??
      record['id'] ??
      record['ID'] ??
      record['ID_HABILIDAD'];
    const id = Number(idCandidate);

    if (!Number.isFinite(id) || id <= 0) {
      return null;
    }

    const rawName = record['name'] ?? record['NAME'] ?? record['NOMBRE'];
    const name = this.normalizeRequiredString(rawName);

    if (!name) {
      return null;
    }

    const category = this.normalizeOptionalString(record['category'] ?? record['CATEGORY'] ?? record['CATEGORIA']);
    const level = this.normalizeOptionalNumber(record['level'] ?? record['LEVEL'] ?? record['NIVEL']);
    const yearsExperience = this.normalizeOptionalNumber(
      record['yearsExperience'] ??
        record['YEARS_EXPERIENCE'] ??
        record['YEARS'] ??
        record['ANIOS_EXPERIENCIA'] ??
        record['ANIOS']
    );
    const endorsementsRaw = this.normalizeOptionalNumber(
      record['endorsementCount'] ??
        record['ENDORSEMENT_COUNT'] ??
        record['cantidad_respaldo'] ??
        record['CANTIDAD_RESPALDO']
    );
    const endorsementCount = endorsementsRaw === null ? 0 : Math.max(Math.floor(endorsementsRaw), 0);

    return {
      id,
      skillId: id,
      name,
      category,
      level,
      yearsExperience,
      endorsementCount
    } satisfies SkillEntry;
  }

  private toSkillSummary(value: unknown): SkillSummary | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;
    const totalRaw = Number(
      record['totalSkills'] ?? record['TOTAL_SKILLS'] ?? record['total'] ?? record['o_total_habilidades']
    );
    const averageRaw = Number(
      record['averageLevel'] ?? record['AVERAGE_LEVEL'] ?? record['o_promedio_nivel'] ?? record['promedioNivel']
    );
    const maxRaw = Number(record['maxLevel'] ?? record['MAX_LEVEL'] ?? record['o_max_nivel']);
    const minRaw = Number(record['minLevel'] ?? record['MIN_LEVEL'] ?? record['o_min_nivel']);

    const totalSkills = Number.isFinite(totalRaw) ? Math.max(Math.floor(totalRaw), 0) : 0;

    return {
      totalSkills,
      averageLevel: Number.isFinite(averageRaw) ? averageRaw : null,
      maxLevel: Number.isFinite(maxRaw) ? maxRaw : null,
      minLevel: Number.isFinite(minRaw) ? minRaw : null
    } satisfies SkillSummary;
  }

  private toGithubAccount(value: unknown): GithubAccountStatus {
    const fallback: GithubAccountStatus = {
      linked: false,
      username: null,
      profileUrl: null,
      providerId: null,
      lastSyncedAt: null
    };

    if (!value || typeof value !== 'object') {
      return fallback;
    }

    const record = value as Record<string, unknown>;
    const linked = this.toBoolean(record['linked'], false);
    const username = this.toNullableString(record['username']);
    const providerId = this.toNullableString(record['providerId']);
    const profileUrl = this.toNullableString(record['profileUrl']);
    const lastSyncedAt = this.toNullableString(record['lastSyncedAt']);

    const normalizedUsername = username && username.length > 0 ? username : null;
    const normalizedProfileUrl = profileUrl && profileUrl.length > 0
      ? profileUrl
      : normalizedUsername
        ? `https://github.com/${normalizedUsername}`
        : null;

    return {
      linked,
      username: normalizedUsername,
      profileUrl: normalizedProfileUrl,
      providerId: providerId && providerId.length > 0 ? providerId : null,
      lastSyncedAt: lastSyncedAt && lastSyncedAt.length > 0 ? lastSyncedAt : null
    } satisfies GithubAccountStatus;
  }

  private extractErrorMessage(
    response: ProfileResponseEnvelope | null | undefined,
    fallbackMessage: string
  ): string {
    const messageCandidate =
      (response as any)?.error ?? (response as any)?.message ?? (response as any)?.errors?.message;

    const message = this.toNullableString(messageCandidate);

    return message && message.length > 0 ? message : fallbackMessage;
  }

  private handleRequestError(
    method: string,
    endpoint: string,
    error: unknown,
    fallbackMessage: string
  ): Observable<never> {
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

