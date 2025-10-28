import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { AuthService } from './auth.service';

const DEFAULT_API_URL = 'http://localhost:3000';
const configuredApiUrl = import.meta.env.NG_APP_API_URL as string | undefined;

export type ProfileField = 'displayName' | 'headline' | 'biography' | 'country' | 'city' | 'avatarUrl';
export type ProfileOkFlag = `ok_${ProfileField}`;
export type ProfileErrorFlag = `error_${ProfileField}`;

export const PROFILE_FIELDS: readonly ProfileField[] = [
  'displayName',
  'headline',
  'biography',
  'country',
  'city',
  'avatarUrl'
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

export interface ProfileData extends ProfileValues, ProfileValidationFlags, ProfileValidationErrors {
  isComplete: boolean;
  missingFields: string[];
  message: string | null;
  educationSummary: EducationSummary | null;
}

export interface UpdateProfilePayload {
  displayName: string;
  headline: string;
  biography: string;
  country: string;
  city: string;
  avatarUrl: string;
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

interface EducationListResult {
  education: EducationEntry[];
  educationSummary: EducationSummary | null;
}

interface EducationMutationResult {
  education: EducationEntry;
  educationSummary: EducationSummary | null;
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

  private resolveSession(): { userId: number; accessToken: string; headers: HttpHeaders } | null {
    const userId = this.authService.getUserId();
    const accessToken = this.authService.getAccessToken();

    if (!userId || !accessToken) {
      return null;
    }

    const headers = new HttpHeaders({ Authorization: `Bearer ${accessToken}` });

    return { userId, accessToken, headers };
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
      headline: this.toNullableString(baseData['headline']),
      biography: this.toNullableString(baseData['biography']),
      country: this.toNullableString(baseData['country']),
      city: this.toNullableString(baseData['city']),
      avatarUrl: this.toNullableString(baseData['avatarUrl']),
      ok_displayName: this.toBoolean(this.pickValidationFlag('displayName', baseData, validations, response), true),
      ok_headline: this.toBoolean(this.pickValidationFlag('headline', baseData, validations, response), true),
      ok_biography: this.toBoolean(this.pickValidationFlag('biography', baseData, validations, response), true),
      ok_country: this.toBoolean(this.pickValidationFlag('country', baseData, validations, response), true),
      ok_city: this.toBoolean(this.pickValidationFlag('city', baseData, validations, response), true),
      ok_avatarUrl: this.toBoolean(this.pickValidationFlag('avatarUrl', baseData, validations, response), true),
      error_displayName: this.pickValidationError('displayName', baseData, validations, errors, response),
      error_headline: this.pickValidationError('headline', baseData, validations, errors, response),
      error_biography: this.pickValidationError('biography', baseData, validations, errors, response),
      error_country: this.pickValidationError('country', baseData, validations, errors, response),
      error_city: this.pickValidationError('city', baseData, validations, errors, response),
      error_avatarUrl: this.pickValidationError('avatarUrl', baseData, validations, errors, response),
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
      )
    } satisfies ProfileData;

    return result;
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

