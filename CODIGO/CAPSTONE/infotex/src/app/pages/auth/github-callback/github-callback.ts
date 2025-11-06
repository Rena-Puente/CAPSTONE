import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { resolveDefaultRouteForUserType } from '../../../constants/user-type-routing';
import {
  AuthService,
  GithubOAuthMode,
  GithubOAuthSession
} from '../../../services/auth.service';
import {
  GITHUB_LINK_FEEDBACK_KEY,
  GithubAccountResponse,
  ProfileService
} from '../../../services/profile.service';

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
  private readonly profileService = inject(ProfileService);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly flowMode = signal<GithubOAuthMode>('login');

  async ngOnInit(): Promise<void> {
    const queryParams = this.route.snapshot.queryParamMap;
    const code = queryParams.get('code');
    const state = queryParams.get('state');

    try {
      if (!code || !state) {
        throw new Error('No se recibieron los parámetros necesarios desde GitHub.');
      }

      const flow = this.authService.readGithubOAuthState();

      if (flow) {
        this.flowMode.set(flow.mode);
      }

      if (!flow) {
        throw new Error('No se encontró una solicitud de autenticación activa. Vuelve a iniciar el proceso.');
      }

      if (flow.state !== state) {
        throw new Error('La validación de seguridad de la conexión con GitHub falló. Intenta nuevamente.');
      }

      if (flow.mode === 'link') {
        await this.completeGithubLink(flow, code, state);
        return;
      }

      const { userType, isProfileComplete } = await firstValueFrom(
        this.authService.completeGithubLogin(code, state)
      );
      const destinationOverride = resolveDefaultRouteForUserType(userType);
      const destination = destinationOverride ?? (isProfileComplete ? '/home' : '/profile');
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
      this.authService.clearGithubOAuthState();
    }
  }

  private async completeGithubLink(flow: GithubOAuthSession, code: string, state: string): Promise<void> {
    const response: GithubAccountResponse = await firstValueFrom(
      this.profileService.completeGithubLink(code, state)
    );

    this.persistGithubLinkFeedback(response.message);

    const navigated = await this.router.navigate(['/profile']);

    if (!navigated) {
      throw new Error('No se pudo redirigir al perfil después de vincular GitHub.');
    }
  }

  private persistGithubLinkFeedback(message: string | null | undefined): void {
    const feedback = typeof message === 'string' && message.trim().length > 0
      ? message.trim()
      : 'Tu cuenta de GitHub se vinculó correctamente.';

    try {
      if (typeof sessionStorage === 'undefined') {
        return;
      }

      sessionStorage.setItem(GITHUB_LINK_FEEDBACK_KEY, feedback);
    } catch {
      // Ignored on purpose
    }
  }
}
