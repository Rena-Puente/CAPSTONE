import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { defaultResumenEjecutivo, normalizeResumenEjecutivo, ResumenEjecutivo } from '../models/resumen-ejecutivo';
import { AuthService } from './auth.service';

const DEFAULT_API_URL = 'http://localhost:3000';
const configuredApiUrl = import.meta.env.NG_APP_API_URL as string | undefined;

interface ResumenEjecutivoResponse {
  ok?: boolean;
  data?: unknown;
  resumen?: unknown;
  payload?: unknown;
  result?: unknown;
  clob?: unknown;
  error?: string | null;
  message?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class ResumenEjecutivoService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly apiUrl = (configuredApiUrl?.replace(/\/$/, '') || DEFAULT_API_URL).replace(/\/$/, '');

  obtenerResumen(fechaInicio: string, fechaFin: string): Observable<ResumenEjecutivo> {
    let options: { headers: HttpHeaders };

    try {
      options = this.buildAuthOptions();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Debes iniciar sesión para continuar.';
      return throwError(() => new Error(message));
    }

    const payload = {
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin
    };

    return this.http
      .post<ResumenEjecutivoResponse | string>(`${this.apiUrl}/admin/resumen-ejecutivo`, payload, options)
      .pipe(
        map((response) => this.parseResponse(response)),
        catchError((error) => {
          const message =
            error?.error?.error ||
            error?.error?.message ||
            error?.message ||
            'No se pudo obtener el resumen ejecutivo.';
          console.error('[ResumenEjecutivoService] Error al obtener resumen', error);
          return throwError(() => new Error(message));
        })
      );
  }

  private parseResponse(response: ResumenEjecutivoResponse | string): ResumenEjecutivo {
    const parsedPayload = this.extractPayload(response);

    try {
      return normalizeResumenEjecutivo(parsedPayload);
    } catch (error) {
      console.warn('[ResumenEjecutivoService] No se pudo normalizar el resumen, se usarán valores por defecto', error);
      return defaultResumenEjecutivo;
    }
  }

  private extractPayload(response: ResumenEjecutivoResponse | string): unknown {
    if (typeof response === 'string') {
      return this.tryParseJson(response);
    }

    const candidates = [response.data, response.resumen, response.payload, response.result, response.clob];

    for (const candidate of candidates) {
      if (typeof candidate === 'string') {
        const parsed = this.tryParseJson(candidate);
        if (parsed !== null) {
          return parsed;
        }
      }

      if (candidate !== undefined) {
        return candidate;
      }
    }

    return response;
  }

  private tryParseJson(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
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
