import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogRef } from '@angular/cdk/dialog';

// Resultado que el diálogo devuelve al cerrar
export type LoginResult = { success: boolean; email?: string };

@Component({
  standalone: true,
  selector: 'app-login-dialog',
  imports: [FormsModule],
  template: `
    <div class="dialog-body position-relative" animate.enter="fade-in" animate.leave="fade-out">
      <div class="dialog-card card shadow-lg border-0 position-relative">
        <!-- Botón X -->
        <button
          type="button"
          class="btn-close position-absolute top-0 end-0 m-3"
          aria-label="Cerrar"
          (click)="onCancel()"
        ></button>

        <div class="card-body p-4 p-md-5">
          <!-- Logo opcional -->
          <div class="text-center mb-3">
            <!-- Reemplaza por tu logo en /assets si tienes -->
            <!-- <img src="assets/logo.svg" alt="Logo" width="56" height="56" /> -->
          </div>

          <h3 class="login-title text-center mb-4">Iniciar Sesión</h3>

          <form (ngSubmit)="onSubmit()" novalidate>
            <!-- Email con ícono -->
            <div class="mb-3 input-group input-group-lg">
              <span class="input-group-text"><i class="bi bi-envelope"></i></span>
              <input
                class="form-control"
                type="email"
                [(ngModel)]="email"
                name="email"
                placeholder="tucorreo@dominio.com"
                required
                autofocus
              />
            </div>

            <!-- Password con ícono -->
            <div class="mb-4 input-group input-group-lg">
              <span class="input-group-text"><i class="bi bi-lock"></i></span>
              <input
                class="form-control"
                type="password"
                [(ngModel)]="password"
                name="password"
                placeholder="••••••••"
                required
              />
            </div>

            <div class="d-grid gap-2">
              <button type="submit" class="btn btn-success btn-lg">Entrar</button>
              <button type="button" class="btn btn-outline-secondary btn-lg" (click)="onCancel()">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `
})
export class LoginDialogComponent {
  email = '';
  password = '';

  constructor(private ref: DialogRef<LoginResult>) {}

  onSubmit() {
    // Aquí pondrías tu autenticación real
    this.ref.close({ success: true, email: this.email });
  }

  onCancel() {
    this.ref.close({ success: false });
  }
}
