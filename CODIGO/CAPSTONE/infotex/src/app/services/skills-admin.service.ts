import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from './auth.service';

const DEFAULT_API_URL = 'http://localhost:3000';
const configuredApiUrl = import.meta.env.NG_APP_API_URL as string | undefined;

export interface SkillCatalogItem {
  id: number | null;
  name: string;
  category: string;
}

interface SkillCatalogResponseItem {
  id?: number | string | null;
  ID?: number | string | null;
  id_habilidad?: number | string | null;
  ID_HABILIDAD?: number | string | null;
  name?: string | null;
  NAME?: string | null;
  nombre?: string | null;
  NOMBRE?: string | null;
  category?: string | null;
  CATEGORY?: string | null;
  categoria?: string | null;
  CATEGORIA?: string | null;
}

interface SkillCatalogResponse {
  ok: boolean;
  skills?: SkillCatalogResponseItem[] | null;
  error?: string | null;
  message?: string | null;
}

interface CreateSkillResponse {
  ok: boolean;
  skill?: SkillCatalogResponseItem | null;
  error?: string | null;
  message?: string | null;
}

interface DeleteSkillResponse {
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

function parseSkillCatalogItem(item: SkillCatalogResponseItem | null | undefined): SkillCatalogItem | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const rawId = item.id ?? item.ID ?? item.id_habilidad ?? item.ID_HABILIDAD ?? null;
  let id: number | null = null;

  if (rawId !== null && rawId !== undefined && rawId !== '') {
    const parsed = Number.isFinite(rawId as number)
      ? Number(rawId)
      : Number.parseInt(String(rawId), 10);
    id = Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
  }

  const rawName =
    typeof item.name === 'string'
      ? item.name
      : typeof item.nombre === 'string'
      ? item.nombre
      : typeof item.NAME === 'string'
      ? item.NAME
      : typeof item.NOMBRE === 'string'
      ? item.NOMBRE
      : null;
  const name = normalizeText(rawName).trim();

  if (!name) {
    return null;
  }

  const rawCategory =
    typeof item.category === 'string'
      ? item.category
      : typeof item.categoria === 'string'
      ? item.categoria
      : typeof item.CATEGORY === 'string'
      ? item.CATEGORY
      : typeof item.CATEGORIA === 'string'
      ? item.CATEGORIA
      : null;
  const category = normalizeText(rawCategory).trim() || 'Sin categoría';

  return { id, name, category };
}

@Injectable({ providedIn: 'root' })
export class SkillsAdminService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly apiUrl = (configuredApiUrl?.replace(/\/$/, '') || DEFAULT_API_URL).replace(/\/$/, '');

  getCatalog(category?: string): Observable<SkillCatalogItem[]> {
    let options: { headers: HttpHeaders; params: HttpParams };

    try {
      const { headers } = this.buildAuthOptions();
      const params = this.buildCategoryParams(category);
      options = { headers, params };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Debes iniciar sesión para continuar.';
      return throwError(() => new Error(message));
    }

    return this.http
      .get<SkillCatalogResponse>(`${this.apiUrl}/admin/careers/skills`, options)
      .pipe(
        map((response) => {
          if (!response.ok) {
            const message =
              response.error || response.message || 'No se pudo obtener el catálogo de habilidades.';
            throw new Error(message);
          }

          const items = Array.isArray(response.skills) ? response.skills : [];

          return items
            .map((entry) => parseSkillCatalogItem(entry))
            .filter((entry): entry is SkillCatalogItem => Boolean(entry))
            .sort((a, b) => {
              const categoryComparison = a.category.localeCompare(b.category, 'es', {
                sensitivity: 'base'
              });

              if (categoryComparison !== 0) {
                return categoryComparison;
              }

              return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
            });
        }),
        catchError((error) => {
          const message =
            error?.error?.error ||
            error?.error?.message ||
            error?.message ||
            'No se pudo obtener el catálogo de habilidades.';
          console.error('[SkillsAdminService] Failed to load skills catalog', error);
          return throwError(() => new Error(message));
        })
      );
  }

  createSkill(category: string, name: string): Observable<SkillCatalogItem> {
    const trimmedCategory = normalizeText(category).trim();
    const trimmedName = normalizeText(name).trim();

    if (!trimmedCategory) {
      return throwError(() => new Error('La categoría es obligatoria.'));
    }

    if (!trimmedName) {
      return throwError(() => new Error('El nombre de la habilidad es obligatorio.'));
    }

    if (trimmedCategory.length > 100) {
      return throwError(() => new Error('La categoría es demasiado larga.'));
    }

    if (trimmedName.length > 150) {
      return throwError(() => new Error('El nombre de la habilidad es demasiado largo.'));
    }

    let options: { headers: HttpHeaders };

    try {
      options = this.buildAuthOptions();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Debes iniciar sesión para continuar.';
      return throwError(() => new Error(message));
    }

    const payload = { category: trimmedCategory, skill: trimmedName };

    return this.http
      .post<CreateSkillResponse>(`${this.apiUrl}/admin/careers/skills`, payload, options)
      .pipe(
        map((response) => {
          if (!response.ok || !response.skill) {
            const message =
              response.error || response.message || 'No se pudo crear la habilidad.';
            throw new Error(message);
          }

          const parsed = parseSkillCatalogItem(response.skill);

          if (!parsed) {
            throw new Error('No se pudo validar la habilidad creada.');
          }

          return parsed;
        }),
        catchError((error) => {
          const message =
            error?.error?.error ||
            error?.error?.message ||
            error?.message ||
            'No se pudo crear la habilidad.';
          console.error('[SkillsAdminService] Failed to create skill', error);
          return throwError(() => new Error(message));
        })
      );
  }

  deleteSkill(id: number | null, name?: string): Observable<void> {
    const hasId = id !== null && id !== undefined;
    let skillId: number | null = null;

    if (hasId) {
      const parsed = Number.parseInt(String(id), 10);

      if (!Number.isInteger(parsed) || parsed <= 0) {
        return throwError(() => new Error('El identificador de la habilidad no es válido.'));
      }

      skillId = parsed;
    }

    let options: { headers: HttpHeaders };

    try {
      options = this.buildAuthOptions();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Debes iniciar sesión para continuar.';
      return throwError(() => new Error(message));
    }

    const normalizedName = normalizeText(name).trim();

    if (skillId === null && !normalizedName) {
      return throwError(
        () => new Error('Debes indicar el nombre de la habilidad a eliminar.')
      );
    }

    const body: { name?: string } = {};

    if (normalizedName) {
      body.name = normalizedName;
    }

    return this.http
      .delete<DeleteSkillResponse>(
        `${this.apiUrl}/admin/careers/skills/${skillId ?? 'by-name'}`,
        {
          ...options,
          body
        }
      )
      .pipe(
        map((response) => {
          if (!response.ok) {
            const message = response.error || response.message || 'No se pudo eliminar la habilidad.';
            throw new Error(message);
          }
        }),
        catchError((error) => {
          const message =
            error?.error?.error ||
            error?.error?.message ||
            error?.message ||
            'No se pudo eliminar la habilidad.';
          console.error('[SkillsAdminService] Failed to delete skill', error);
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

  private buildCategoryParams(category?: string): HttpParams {
    const normalized = normalizeText(category).trim();

    if (!normalized) {
      return new HttpParams();
    }

    return new HttpParams().set('category', normalized);
  }
}
