import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from './auth.service';

const DEFAULT_API_URL = 'http://localhost:3000';
const configuredApiUrl = import.meta.env.NG_APP_API_URL as string | undefined;

export interface StudyHouseItem {
  id: number | null;
  name: string;
}

interface StudyHouseListResponseItem {
  id?: number | string | null;
  name?: string | null;
  casa_estudios?: string | null;
  ID?: number | string | null;
  NAME?: string | null;
  id_casa_estudios?: number | string | null;
}

interface StudyHouseListResponse {
  ok: boolean;
  houses?: StudyHouseListResponseItem[] | null;
  error?: string | null;
}

interface CreateStudyHouseResponse {
  ok: boolean;
  house?: StudyHouseListResponseItem | null;
  error?: string | null;
  message?: string | null;
}

interface DeleteStudyHouseResponse {
  ok: boolean;
  error?: string | null;
  message?: string | null;
}

function normalizeText(value: unknown): string {
  if (typeof value !== 'string') {
    if (value === null || value === undefined) {
      return '';
    }

    return String(value);
  }

  return value;
}

function parseStudyHouseItem(entry: StudyHouseListResponseItem | null | undefined): StudyHouseItem | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const rawName =
    typeof entry.name === 'string'
      ? entry.name
      : typeof entry.casa_estudios === 'string'
      ? entry.casa_estudios
      : typeof entry.NAME === 'string'
      ? entry.NAME
      : null;
  const name = normalizeText(rawName).trim();

  if (!name) {
    return null;
  }

  const rawId =
    entry.id ?? entry.ID ?? entry.id_casa_estudios ?? null;
  let id: number | null = null;

  if (rawId !== null && rawId !== undefined && rawId !== '') {
    const parsed = Number.isFinite(rawId as number)
      ? Number(rawId)
      : Number.parseInt(String(rawId), 10);
    id = Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
  }

  return { id, name };
}

@Injectable({ providedIn: 'root' })
export class StudyHousesAdminService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly apiUrl = (configuredApiUrl?.replace(/\/$/, '') || DEFAULT_API_URL).replace(/\/$/, '');

  getCatalog(): Observable<StudyHouseItem[]> {
    return this.http.get<StudyHouseListResponse>(`${this.apiUrl}/catalogs/study-houses`).pipe(
      map((response) => {
        if (!response.ok) {
          const message = response.error || 'No se pudo obtener el catálogo de casas de estudios.';
          throw new Error(message);
        }

        const items = Array.isArray(response.houses) ? response.houses : [];
        return items
          .map((item) => parseStudyHouseItem(item))
          .filter((item): item is StudyHouseItem => Boolean(item))
          .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
      }),
      catchError((error) => {
        const message =
          error?.error?.error ||
          error?.error?.message ||
          error?.message ||
          'No se pudo obtener el catálogo de casas de estudios.';
        console.error('[StudyHousesAdminService] Failed to load study houses', error);
        return throwError(() => new Error(message));
      })
    );
  }

  createStudyHouse(name: string): Observable<StudyHouseItem> {
    const trimmedName = normalizeText(name).trim();

    if (!trimmedName) {
      return throwError(() => new Error('El nombre de la casa de estudios es obligatorio.'));
    }

    if (trimmedName.length > 150) {
      return throwError(() => new Error('El nombre de la casa de estudios es demasiado largo.'));
    }

    let options: { headers: HttpHeaders };

    try {
      options = this.buildAuthOptions();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Debes iniciar sesión para continuar.';
      return throwError(() => new Error(message));
    }

    const payload = { name: trimmedName };

    return this.http.post<CreateStudyHouseResponse>(`${this.apiUrl}/admin/study-houses`, payload, options).pipe(
      map((response) => {
        if (!response.ok || !response.house) {
          const message = response.error || response.message || 'No se pudo crear la casa de estudios.';
          throw new Error(message);
        }

        const parsed = parseStudyHouseItem(response.house);

        if (!parsed) {
          throw new Error('No se pudo validar la casa de estudios creada.');
        }

        return parsed;
      }),
      catchError((error) => {
        const message =
          error?.error?.error ||
          error?.error?.message ||
          error?.message ||
          'No se pudo crear la casa de estudios.';
        console.error('[StudyHousesAdminService] Failed to create study house', error);
        return throwError(() => new Error(message));
      })
    );
  }

  deleteStudyHouse(id: number | null, name?: string): Observable<void> {
    const hasId = id !== null && id !== undefined;
    let houseId: number | null = null;

    if (hasId) {
      const parsed = Number.parseInt(String(id), 10);

      if (!Number.isInteger(parsed) || parsed <= 0) {
        return throwError(() => new Error('El identificador de la casa de estudios no es válido.'));
      }

      houseId = parsed;
    }

    let options: { headers: HttpHeaders };

    try {
      options = this.buildAuthOptions();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Debes iniciar sesión para continuar.';
      return throwError(() => new Error(message));
    }

    const body: { name?: string } = {};
    const normalizedName = normalizeText(name).trim();

    if (houseId === null) {
      if (!normalizedName) {
        return throwError(
          () => new Error('Debes indicar el nombre de la casa de estudios a eliminar.')
        );
      }

      body.name = normalizedName;
    } else if (normalizedName) {
      body.name = normalizedName;
    }

    const endpointId = houseId ?? 'by-name';

    return this.http
      .delete<DeleteStudyHouseResponse>(`${this.apiUrl}/admin/study-houses/${endpointId}`, {
        ...options,
        body
      })
      .pipe(
        map((response) => {
          if (!response.ok) {
            const message = response.error || response.message || 'No se pudo eliminar la casa de estudios.';
            throw new Error(message);
          }
        }),
        catchError((error) => {
          const message =
            error?.error?.error ||
            error?.error?.message ||
            error?.message ||
            'No se pudo eliminar la casa de estudios.';
          console.error('[StudyHousesAdminService] Failed to delete study house', error);
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
