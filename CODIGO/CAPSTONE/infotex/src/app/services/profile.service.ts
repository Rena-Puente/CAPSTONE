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

export interface ProfileData extends ProfileValues, ProfileValidationFlags, ProfileValidationErrors {
  isComplete: boolean;
  missingFields: string[];
  message: string | null;
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
      displayName: this.toNullableString(baseData.displayName),
      headline: this.toNullableString(baseData.headline),
      biography: this.toNullableString(baseData.biography),
      country: this.toNullableString(baseData.country),
      city: this.toNullableString(baseData.city),
      avatarUrl: this.toNullableString(baseData.avatarUrl),
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
        response.isComplete ?? baseData.isComplete ?? validations.isComplete,
        false
      ),
      missingFields: this.toStringArray(
        response.missingFields ?? baseData.missingFields ?? validations.missingFields
      ),
      message: this.toNullableString(
        response.message ?? baseData.message ?? validations.message ?? errors.message
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

    delete merged.profile;

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
      return trimmed.length > 0 ? trimmed : '';
    }

    return String(value);
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