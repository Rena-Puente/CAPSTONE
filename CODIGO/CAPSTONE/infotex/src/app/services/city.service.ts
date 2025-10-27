import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';

type CityDataset = Record<string, Record<string, string>>;

@Injectable({
  providedIn: 'root'
})
export class CityService {
  private readonly http = inject(HttpClient);

  private readonly cities$ = this.http
    .get<CityDataset>('assets/data/ciudades.json')
    .pipe(
      map((dataset) => {
        const cities = new Set<string>();

        if (dataset && typeof dataset === 'object') {
          for (const province of Object.values(dataset)) {
            if (!province || typeof province !== 'object') {
              continue;
            }

            for (const city of Object.values(province)) {
              if (typeof city !== 'string') {
                continue;
              }

              const normalized = city.trim();

              if (normalized.length > 0) {
                cities.add(normalized);
              }
            }
          }
        }

        return Array.from(cities).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
      }),
      catchError((error) => {
        console.error('[CityService] Failed to load city dataset', error);
        return throwError(() => new Error('No se pudo cargar el listado de ciudades.'));
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );

  getCities(): Observable<string[]> {
    return this.cities$;
  }
}