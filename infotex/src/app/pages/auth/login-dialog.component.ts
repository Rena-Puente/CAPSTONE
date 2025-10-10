import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DialogRef } from '@angular/cdk/dialog';
import { switchMap, map } from 'rxjs/operators';
import { AuthService } from '../../core/auth/auth.service'; // ajusta la ruta si difiere

export type LoginResult = { success: boolean; email?: string };

@Component({
  standalone: true,
  selector: 'app-login-dialog',
  imports: [FormsModule],
  template: `
    <div class="dialog-body position-relative">
      <div class="dialog-card card shadow-lg border-0 position-relative">
        <button type="button" class="btn-close position-absolute top-0 end-0 m-3"
                aria-label="Cerrar" (click)="onCancel()"></button>

        <div class="card-body p-4 p-md-5">
          <h3 class="login-title text-center mb-4">
            {{ isSignup ? 'Registro' : 'Iniciar Sesión' }}
          </h3>

          <form (ngSubmit)="onSubmit()" novalidate>
            <!-- EMAIL -->
            <div class="mb-3 input-group input-group-lg">
              <span class="input-group-text"><i class="bi bi-envelope"></i></span>
              <input class="form-control" type="email" [(ngModel)]="email" name="email"
                     placeholder="tucorreo@dominio.com" required autofocus />
            </div>

            <!-- PASSWORD -->
            <div class="mb-3 input-group input-group-lg">
              <span class="input-group-text"><i class="bi bi-lock"></i></span>
              <input class="form-control" type="password" [(ngModel)]="password" name="password"
                     placeholder="••••••••" required />
            </div>

            <!-- CONFIRM PASSWORD solo en Registro -->
            @if (isSignup) {
              <div class="mb-4 input-group input-group-lg">
                <span class="input-group-text"><i class="bi bi-lock-fill"></i></span>
                <input class="form-control" type="password" [(ngModel)]="password2" name="password2"
                       placeholder="Repite tu contraseña" required />
              </div>
            } @else {
              <div class="mb-4"></div>
            }

            <!-- Mensaje de error -->
            @if (errorMsg) {
              <div class="alert alert-danger py-2">{{ errorMsg }}</div>
            }

            <div class="d-grid gap-2">
              <button type="submit" class="btn btn-success btn-lg" [disabled]="busy">
                {{ busy ? (isSignup ? 'Creando...' : 'Entrando...') : (isSignup ? 'Crear cuenta' : 'Entrar') }}
              </button>
              <button type="button" class="btn btn-outline-secondary btn-lg" (click)="onCancel()" [disabled]="busy">
                Cancelar
              </button>
            </div>
          </form>

          <!-- Toggle de modo -->
          <div class="text-center mt-3">
            @if (!isSignup) {
              <small class="text-muted">
                ¿Aún no tienes cuenta?
                <a class="link-primary text-decoration-none" role="button" (click)="switchToSignup()">Regístrate</a>
              </small>
            } @else {
              <small class="text-muted">
                ¿Ya tienes cuenta?
                <a class="link-primary text-decoration-none" role="button" (click)="switchToLogin()">Inicia sesión</a>
              </small>
            }
          </div>
        </div>
      </div>
    </div>
  `
})
export class LoginDialogComponent {
  isSignup = false;
  email = '';
  password = '';
  password2 = '';
  errorMsg = '';
  busy = false;

  private http = inject(HttpClient);
  private authSvc = inject(AuthService);

  constructor(private ref: DialogRef<LoginResult>) {}

  switchToSignup() { this.isSignup = true; this.errorMsg = ''; }
  switchToLogin()  { this.isSignup = false; this.errorMsg = ''; }

  // =====================================================
  // === REGISTRO / LOGIN CON VALIDACIÓN DE TOKEN ========
  // =====================================================
  onSubmit() {
    this.errorMsg = '';
    this.busy = true;
    this.email = this.email.trim();
    this.password = this.password.trim();
    if (this.isSignup) { this.password2 = this.password2.trim(); }

    // === REGISTRO ===
    if (this.isSignup) {
      this.http.post<{ success: boolean }>(
        'http://localhost:3000/api/auth/register',
        { email: this.email, password: this.password, password2: this.password2 },
        { withCredentials: true, headers: { 'Content-Type': 'application/json' } }
      )
      .pipe(
        switchMap(() =>
          this.http.get<any>('http://localhost:3000/api/auth/me', { withCredentials: true })
        )
      )
      .subscribe({
        next: (me) => {
          this.busy = false;
          this.ref.close({ success: true, email: me?.correo ?? this.email });
        },
        error: (err) => {
          this.busy = false;
          if (err?.status === 409) this.errorMsg = 'El correo ya está registrado.';
          else if (err?.status === 400) this.errorMsg = 'Las contraseñas no coinciden o faltan datos.';
          else if (err?.status === 500) this.errorMsg = 'Error del servidor en registro.';
          else this.errorMsg = 'No se pudo registrar.';
        }
      });
      return;
    }

    // === LOGIN ===
    this.http.post<{ ok: boolean; accessToken: string }>(
      'http://localhost:3000/api/auth/login',
      { email: this.email, password: this.password },
      { withCredentials: true, headers: { 'Content-Type': 'application/json' } }
    )
    .pipe(
      switchMap((loginResponse) => {
        // Guardamos el access token en memoria para el interceptor/guard
        this.authSvc.setAccessToken(loginResponse.accessToken);

        // Validamos sesión llamando a /me con el token recién emitido
        return this.http.get<any>('http://localhost:3000/api/auth/me', {
          withCredentials: true,
          headers: { Authorization: `Bearer ${loginResponse.accessToken}` }
        }).pipe(
          // Pasamos adelante también el accessToken por si lo quisieras usar
          map(me => ({ me, accessToken: loginResponse.accessToken }))
        );
      })
    )
    .subscribe({
      next: ({ me }) => {
        this.busy = false;
        this.ref.close({ success: true, email: me?.correo ?? this.email });
      },
      error: (err) => {
        this.busy = false;
        if (err?.status === 401) this.errorMsg = 'Credenciales inválidas o token expirado.';
        else if (err?.status === 500) this.errorMsg = 'Error del servidor (login).';
        else this.errorMsg = 'No se pudo iniciar sesión.';
      }
    });
  }

  onCancel() {
    this.ref.close({ success: false });
  }
}
