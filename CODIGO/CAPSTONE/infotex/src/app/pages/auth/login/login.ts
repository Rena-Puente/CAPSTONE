import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { CANDIDATE_USER_TYPE, resolveDefaultRouteForUserType } from '../../../constants/user-type-routing';
import { AuthService } from '../../../services/auth.service';

type LoginMessageType = 'success' | 'error';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: '../shared/auth-flow.scss'
})
export class Login implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  readonly loading = signal(false);
  readonly message = signal<{ type: LoginMessageType; text: string } | null>(null);

  get emailControl() {
    return this.form.controls.email;
  }

  get passwordControl() {
    return this.form.controls.password;
  }

  ngOnInit(): void {
    const queryParams = this.route.snapshot.queryParamMap;
    const registered = queryParams.get('registered') === '1';
    const resetRequested = queryParams.get('passwordResetRequested') === '1';
    const resetCompleted = queryParams.get('passwordResetCompleted') === '1';
    const email = queryParams.get('email');

    if (registered) {
      this.message.set({
        type: 'success',
        text: 'Tu cuenta fue creada. Inicia sesión con tu nueva contraseña.'
      });
    } else if (resetRequested) {
      this.message.set({
        type: 'success',
        text: 'Si tu correo está registrado, recibirás un enlace de restablecimiento en los próximos minutos.'
      });
    } else if (resetCompleted) {
      this.message.set({
        type: 'success',
        text: 'Tu contraseña se actualizó correctamente. Inicia sesión con tu nueva credencial.'
      });
    }

    if (email) {
      this.form.patchValue({ email });
    }

    if (registered || resetRequested || resetCompleted || email) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {
          registered: null,
          passwordResetRequested: null,
          passwordResetCompleted: null,
          email: null
        },
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    }
  }

  async submit(): Promise<void> {
    if (this.loading()) {
      return;
    }

    this.message.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);

    const { email, password } = this.form.getRawValue();
    const returnUrl = this.getReturnUrl();

    try {
      const { userType, isProfileComplete } = await firstValueFrom(
        this.authService.login(email, password)
      );

      const destinationOverride = resolveDefaultRouteForUserType(userType);

      if (!destinationOverride && userType === CANDIDATE_USER_TYPE && isProfileComplete === null) {
        this.message.set({
          type: 'error',
          text: 'No se pudo verificar el estado del perfil. Intenta nuevamente.'
        });
        return;
      }

      const destination =
        returnUrl ?? destinationOverride ?? (isProfileComplete ? '/home' : '/profile');

      const navigated = await this.router.navigate([destination]);

      if (!navigated) {
        this.message.set({
          type: 'error',
          text: 'No se pudo redirigir a la página solicitada.'
        });
      }
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : 'No se pudo iniciar sesión. Inténtalo nuevamente.';
      this.message.set({ type: 'error', text });
    } finally {
      this.loading.set(false);
    }
  }

  private getReturnUrl(): string | null {
    const value = this.route.snapshot.queryParamMap.get('returnUrl');

    if (value && value.startsWith('/')) {
      return value;
    }

    return null;
  }
}
