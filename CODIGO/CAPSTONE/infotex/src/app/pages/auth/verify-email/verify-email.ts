import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './verify-email.html',
  styleUrl: './verify-email.scss'
})
export class VerifyEmail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);

  protected readonly loading = signal(true);
  protected readonly success = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token');

    if (!token) {
      this.errorMessage.set('El enlace de verificación es inválido o está incompleto.');
      this.loading.set(false);
      return;
    }

    try {
      await firstValueFrom(this.authService.verifyEmail(token));
      this.success.set(true);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo verificar el correo electrónico. Intenta nuevamente.';
      this.errorMessage.set(message);
    } finally {
      this.loading.set(false);
    }
  }
}
