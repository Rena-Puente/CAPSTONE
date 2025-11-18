// src/app/services/profilefields.service.ts
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import {
  CareerCatalogCategory,
  CareerCatalogResponse,
  normalizeCareerCatalogResponse
} from './career-catalog.models';

/** ciudades.json: Record<Region, Record<CiudadId, CiudadNombre>> */
type CityDataset = Record<string, Record<string, string>>;
interface StudyHouseCatalogEntry {
  id?: number | string | null;
  name?: string | null;
  casa_estudios?: string | null;
  ID?: number | string | null;
  NAME?: string | null;
  id_casa_estudios?: number | string | null;
}

interface StudyHouseCatalogResponse {
  ok: boolean;
  houses?: StudyHouseCatalogEntry[] | null;
  error?: string | null;
}

const DEFAULT_API_URL = 'http://localhost:3000';
const configuredApiUrl = import.meta.env.NG_APP_API_URL as string | undefined;

@Injectable({ providedIn: 'root' })
export class ProfileFieldsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = (configuredApiUrl?.replace(/\/$/, '') || DEFAULT_API_URL).replace(/\/$/, '');

  /** ====== Ciudades ====== */
  private readonly cities$ = this.http
    .get<CityDataset>('assets/data/ciudades.json')
    .pipe(
      map((dataset) => {
        const cities = new Set<string>();

        if (dataset && typeof dataset === 'object') {
          for (const province of Object.values(dataset)) {
            if (!province || typeof province !== 'object') continue;

            for (const city of Object.values(province)) {
              if (typeof city !== 'string') continue;
              const normalized = city.trim();
              if (normalized.length > 0) cities.add(normalized);
            }
          }
        }

        return Array.from(cities).sort((a, b) =>
          a.localeCompare(b, 'es', { sensitivity: 'base' })
        );
      }),
      catchError((error) => {
        console.error('[ProfileFieldsService] Falló carga de ciudades', error);
        return throwError(() => new Error('No se pudo cargar el listado de ciudades.'));
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );

  /** ====== Instituciones ====== */
  private readonly institutions$ = this.http
    .get<StudyHouseCatalogResponse>(`${this.apiUrl}/catalogs/study-houses`)
    .pipe(
        map((response) => {
        if (!response.ok) {
          throw new Error(response.error || 'No se pudo cargar el listado de instituciones.');
        }
        const institutions = new Set<string>();
        const dataset = Array.isArray(response.houses) ? response.houses : [];

        for (const entry of dataset) {
          if (!entry || typeof entry !== 'object') continue;

          const rawName =
            typeof entry.name === 'string'
              ? entry.name
              : typeof entry.casa_estudios === 'string'
              ? entry.casa_estudios
              : typeof entry.NAME === 'string'
              ? entry.NAME
              : null;
          const normalized = (rawName ?? '').trim();

          if (normalized.length > 0) {
            institutions.add(normalized);
          }
        }

        return Array.from(institutions).sort((a, b) =>
          a.localeCompare(b, 'es', { sensitivity: 'base' })
        );
      }),
      catchError((error) => {
        console.error('[ProfileFieldsService] Falló carga de instituciones', error);
        return throwError(() => new Error('No se pudo cargar el listado de instituciones.'));
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );

  /** ====== Carreras ====== */
  private readonly careerCatalog$: Observable<CareerCatalogCategory[]> = this.http
    .get<CareerCatalogResponse>(`${this.apiUrl}/catalogs/careers`)
    .pipe(
      map((response) => normalizeCareerCatalogResponse(response)),
      catchError((error) => {
        const message =
          error?.error?.error ||
          error?.error?.message ||
          error?.message ||
          'No se pudo cargar el listado de carreras.';
        console.error('[ProfileFieldsService] Falló carga de carreras', error);
        return throwError(() => new Error(message));
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );

  private readonly careersMap$ = this.careerCatalog$.pipe(
    map((categories) => {
      const mapObj: Record<string, string[]> = {};

      for (const category of categories) {
        if (this.isSeniorityCategory(category.category)) {
          continue;
        }

        mapObj[category.category] = category.items.map((item) => item.name);
      }

      return mapObj;
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  private readonly careersFlat$ = this.careersMap$.pipe(
    map((mapObj) => {
      const all: string[] = [];
      Object.values(mapObj).forEach((arr) => all.push(...arr));
      return Array.from(new Set(all)).sort((a, b) =>
        a.localeCompare(b, 'es', { sensitivity: 'base' })
      );
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  private readonly seniorityLevels$ = this.careerCatalog$.pipe(
    map((categories) => {
      const match = categories.find((category) => this.isSeniorityCategory(category.category));
      return match ? match.items.map((item) => item.name) : [];
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  private isSeniorityCategory(value: string): boolean {
    return (value ?? '').trim().toLocaleLowerCase('es') === 'seniority';
  }

  /** ====== API pública ====== */

  // Ciudades
  getCities(): Observable<string[]> {
    return this.cities$;
  }

  // Instituciones
  getInstitutions(): Observable<string[]> {
    return this.institutions$;
  }

  // Carreras
  getCareerCategories(): Observable<string[]> {
    return this.careersMap$.pipe(map((m) => Object.keys(m)));
  }

  getCareerMap(): Observable<Record<string, string[]>> {
    return this.careersMap$;
  }

  getCareersByCategory(category: string): Observable<string[]> {
    const wanted = (category ?? '').trim();
    return this.careersMap$.pipe(map((m) => m[wanted] ?? []));
  }

  getAllCareers(): Observable<string[]> {
    return this.careersFlat$;
  }

  getSeniorityLevels(): Observable<string[]> {
    return this.seniorityLevels$;
  }

  // Utilidad: búsqueda rápida (opcional)
  searchCareers(term: string): Observable<string[]> {
    const q = (term ?? '').trim();
    if (!q) return this.getAllCareers();
    const lower = q.toLocaleLowerCase('es');
    return this.careersFlat$.pipe(
      map((list) => list.filter((c) => c.toLocaleLowerCase('es').includes(lower)))
    );
  }
}
