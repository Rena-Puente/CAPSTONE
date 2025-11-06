import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map } from 'rxjs/operators';
import { Observable, throwError } from 'rxjs';

const DEFAULT_API_URL = 'http://localhost:3000';
const configuredApiUrl = import.meta.env.NG_APP_API_URL as string | undefined;

export interface CompanyRegistrationPayload {
  name: string;
  website: string;
  country: string;
  city: string;
  email: string;
  password: string;
  rut: string;
  phone?: string;
  description?: string;
}

interface CompanyResponseItem {
  id: number;
  name: string;
  website: string;
  country: string;
  city: string;
  email: string;
  rut: string;
}

interface RegisterCompanyResponse {
  ok: boolean;
  message?: string;
  error?: string;
  company?: CompanyResponseItem | null;
}

@Injectable({
  providedIn: 'root'
})
export class CompanyService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = (configuredApiUrl?.replace(/\/$/, '') || DEFAULT_API_URL).replace(/\/$/, '');

  registerCompany(payload: CompanyRegistrationPayload): Observable<CompanyResponseItem> {
    return this.http.post<RegisterCompanyResponse>(`${this.apiUrl}/companies`, payload).pipe(
      map((response) => {
        if (!response.ok || !response.company) {
          const message =
            response.error ||
            response.message ||
            'No se pudo registrar la empresa. Inténtalo nuevamente en unos minutos.';
          throw new Error(message);
        }

        return response.company;
      }),
      catchError((error) => {
        const message =
          error?.error?.error ||
          error?.error?.message ||
          error?.message ||
          'No se pudo registrar la empresa. Inténtalo nuevamente en unos minutos.';

        console.error('[CompanyService] Company registration failed', { error: message });
        return throwError(() => new Error(message));
      })
    );
  }
}
