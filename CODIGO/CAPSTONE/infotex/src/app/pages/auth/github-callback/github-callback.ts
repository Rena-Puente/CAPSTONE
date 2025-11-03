import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService, GITHUB_OAUTH_STATE_KEY } from '../../../services/auth.service';

@Component({
  selector: 'app-github-callback',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './github-callback.html',
  styleUrl: './github-callback.scss'
})
export class GithubCallback implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const queryParams = this.route.snapshot.queryParamMap;
    const code = queryParams.get('code');
    const state = queryParams.get('state');

    try {
      if (!code || !state) {
        throw new Error('No se recibieron los parámetros necesarios desde GitHub.');
      }

      const storedState = this.getStoredState();

      if (!storedState) {
        throw new Error('No se encontró una solicitud de autenticación activa. Vuelve a iniciar el proceso.');
      }

      if (storedState !== state) {
        throw new Error('La validación de seguridad del inicio de sesión con GitHub falló. Intenta nuevamente.');
      }

      this.clearStoredState();

      const { isProfileComplete } = await firstValueFrom(this.authService.completeGithubLogin(code, state));
      const destination = isProfileComplete ? '/home' : '/profile';
      const navigated = await this.router.navigate([destination]);

      if (!navigated) {
        throw new Error('No se pudo redirigir a tu cuenta. Intenta nuevamente desde la página de inicio.');
      }

      return;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Ocurrió un problema al completar el inicio de sesión con GitHub. Vuelve a intentarlo.';
      this.errorMessage.set(message);
    } finally {
      this.loading.set(false);
      this.clearStoredState();
    }
  }

  private getStoredState(): string | null {
    try {
      if (typeof sessionStorage === 'undefined') {
        return null;
      }

      return sessionStorage.getItem(GITHUB_OAUTH_STATE_KEY);
    } catch {
      return null;
    }
  }

  private clearStoredState(): void {
    try {
      if (typeof sessionStorage === 'undefined') {
        return;
      }

      sessionStorage.removeItem(GITHUB_OAUTH_STATE_KEY);
    } catch {
      // Ignored
    }
  }
}
