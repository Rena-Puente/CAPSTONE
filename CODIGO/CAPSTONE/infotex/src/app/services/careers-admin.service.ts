import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import {
  CareerCatalogCategory,
  CareerCatalogItemDetail,
  CareerCatalogItemResponse,
  CareerCatalogResponse,
  ensureCareerItem,
  normalizeCareerCatalogResponse
} from './career-catalog.models';
import { AuthService } from './auth.service';

const DEFAULT_API_URL = 'http://localhost:3000';
const configuredApiUrl = import.meta.env.NG_APP_API_URL as string | undefined;

interface CreateCareerResponse {
  ok: boolean;
  error?: string | null;
  message?: string | null;
  career?: CareerCatalogItemResponse | null;
}

interface DeleteCareerResponse {
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

@Injectable({ providedIn: 'root' })
export class CareersAdminService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly apiUrl = (configuredApiUrl?.replace(/\/$/, '') || DEFAULT_API_URL).replace(/\/$/, '');

  getCatalog(): Observable<CareerCatalogCategory[]> {
    return this.http.get<CareerCatalogResponse>(`${this.apiUrl}/catalogs/careers`).pipe(
      map((response) => normalizeCareerCatalogResponse(response)),
      catchError((error) => {
        const message =
          error?.error?.error ||
          error?.error?.message ||
          error?.message ||
          'No se pudo obtener el catálogo de carreras.';
        console.error('[CareersAdminService] Falló carga de catálogo de carreras', error);
        return throwError(() => new Error(message));
      })
    );
  }

  createCareer(category: string, career: string): Observable<CareerCatalogItemDetail> {
    const trimmedCategory = normalizeText(category).trim();
    const trimmedCareer = normalizeText(career).trim();

    if (!trimmedCategory || !trimmedCareer) {
      return throwError(() => new Error('La categoría y el nombre de la carrera son obligatorios.'));
    }

    if (trimmedCategory.length > 100) {
      return throwError(() => new Error('La categoría es demasiado larga.'));
    }

    if (trimmedCareer.length > 150) {
      return throwError(() => new Error('El nombre de la carrera es demasiado largo.'));
    }

    let options: { headers: HttpHeaders };

    try {
      options = this.buildAuthOptions();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Debes iniciar sesión para continuar.';
      return throwError(() => new Error(message));
    }

    const payload = { category: trimmedCategory, career: trimmedCareer };

    return this.http.post<CreateCareerResponse>(`${this.apiUrl}/admin/careers`, payload, options).pipe(
      map((response) => {
        if (!response.ok || !response.career) {
          const message = response.error || response.message || 'No se pudo crear la carrera.';
          throw new Error(message);
        }

        return ensureCareerItem(
          response.career,
          response.career.category ?? response.career.categoria ?? trimmedCategory
        );
      }),
      catchError((error) => {
        const message =
          error?.error?.error ||
          error?.error?.message ||
          error?.message ||
          'No se pudo crear la carrera.';
        console.error('[CareersAdminService] Error al crear carrera', error);
        return throwError(() => new Error(message));
      })
    );
  }

  deleteCareer(id: number, category?: string, career?: string): Observable<void> {
    if (!Number.isInteger(id) || id <= 0) {
      return throwError(() => new Error('El identificador de la carrera no es válido.'));
    }

    let options: { headers: HttpHeaders };

    try {
      options = this.buildAuthOptions();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Debes iniciar sesión para continuar.';
      return throwError(() => new Error(message));
    }

    const body: { category?: string; career?: string } = {};

    const normalizedCategory = normalizeText(category).trim();
    const normalizedCareer = normalizeText(career).trim();

    if (normalizedCategory) {
      body.category = normalizedCategory;
    }

    if (normalizedCareer) {
      body.career = normalizedCareer;
    }

    return this.http
      .delete<DeleteCareerResponse>(`${this.apiUrl}/admin/careers/${id}`, {
        ...options,
        body
      })
      .pipe(
        map((response) => {
          if (!response.ok) {
            const message = response.error || response.message || 'No se pudo eliminar la carrera.';
            throw new Error(message);
          }
        }),
        catchError((error) => {
          const message =
            error?.error?.error ||
            error?.error?.message ||
            error?.message ||
            'No se pudo eliminar la carrera.';
          console.error('[CareersAdminService] Error al eliminar carrera', error);
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
