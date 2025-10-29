// src/app/services/profilefields.service.ts
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';

/** ciudades.json: Record<Region, Record<CiudadId, CiudadNombre>> */
type CityDataset = Record<string, Record<string, string>>;

/** carreras.json: Record<Categoría, string[]> */
type CareerDataset = Record<string, string[]>;

@Injectable({ providedIn: 'root' })
export class ProfileFieldsService {
  private readonly http = inject(HttpClient);

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

  /** ====== Carreras ====== */
  private readonly careersMap$ = this.http
    .get<CareerDataset>('assets/data/carreras.json')
    .pipe(
      map((dataset) => {
        const normalized: Record<string, string[]> = {};

        if (dataset && typeof dataset === 'object') {
          for (const [rawCategory, rawList] of Object.entries(dataset)) {
            const category = (rawCategory ?? '').trim();
            if (!category) continue;

            const set = new Set<string>();
            (rawList ?? []).forEach((name) => {
              if (typeof name !== 'string') return;
              const n = name.trim();
              if (n) set.add(n);
            });

            normalized[category] = Array.from(set).sort((a, b) =>
              a.localeCompare(b, 'es', { sensitivity: 'base' })
            );
          }
        }

        // Ordenar por nombre de categoría (opcional, útil para el UI)
        const ordered: Record<string, string[]> = {};
        Object.keys(normalized)
          .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
          .forEach((k) => (ordered[k] = normalized[k]));
        return ordered;
      }),
      catchError((error) => {
        console.error('[ProfileFieldsService] Falló carga de carreras', error);
        return throwError(() => new Error('No se pudo cargar el listado de carreras.'));
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );

  private readonly careersFlat$ = this.careersMap$.pipe(
    map((mapObj) => {
      const all: string[] = [];
      Object.values(mapObj).forEach((arr) => all.push(...arr));
      // Unicidad global por si alguna carrera aparece en 2 categorías
      return Array.from(new Set(all)).sort((a, b) =>
        a.localeCompare(b, 'es', { sensitivity: 'base' })
      );
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  /** ====== API pública ====== */

  // Ciudades
  getCities(): Observable<string[]> {
    return this.cities$;
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
