// src/app/core/auth/auth.service.ts
import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { tap, map } from 'rxjs/operators';
import { of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private base = 'http://localhost:3000';

  // access token en memoria
  readonly accessToken = signal<string | null>(null);
  readonly isLoggedIn  = signal(false);

  constructor(private http: HttpClient) {}

  setAccessToken(token: string | null) {
    this.accessToken.set(token);
    this.isLoggedIn.set(!!token);
  }

  hydrateFromRefresh() {
    return this.http
      .post<{ accessToken: string }>(`${this.base}/api/auth/refresh`, {}, { withCredentials: true })
      .pipe(tap(r => this.setAccessToken(r.accessToken)), map(() => true));
  }

  me() {
    const t = this.accessToken();
    if (!t) return of({ ok: false } as any);
    return this.http.get<any>(`${this.base}/api/auth/me`, {
      withCredentials: true,
      headers: new HttpHeaders({ Authorization: `Bearer ${t}` }),
    });
  }

  logout() {
    const t = this.accessToken();
    return this.http
      .post<{ ok: boolean }>(`${this.base}/api/auth/logout`, {}, {
        withCredentials: true,
        headers: t ? new HttpHeaders({ Authorization: `Bearer ${t}` }) : undefined,
      })
      .pipe(tap(() => this.setAccessToken(null)));
  }
}

