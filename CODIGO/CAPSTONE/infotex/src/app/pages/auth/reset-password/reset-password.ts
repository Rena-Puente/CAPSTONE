import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../../services/auth.service';

function passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value ?? '';
  const confirmation = control.get('passwordConfirmation')?.value ?? '';

  if (!password && !confirmation) {
    return null;
  }

  return password === confirmation ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss'
})
export class ResetPassword {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = this.fb.nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(8)]],
      passwordConfirmation: ['', [Validators.required, Validators.minLength(8)]]
    },
    { validators: passwordsMatchValidator }
  );

  readonly loading = signal(false);
  readonly successMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly tokenMissing = signal(false);

  private readonly resetToken = this.route.snapshot.queryParamMap.get('token');

  constructor() {
    if (!this.resetToken) {
      this.tokenMissing.set(true);
      this.errorMessage.set(
        'El enlace de restablecimiento es inválido o ya fue utilizado. Solicita uno nuevo para continuar.'
      );
      this.form.disable();
    }
  }

  get passwordControl() {
    return this.form.controls.password;
  }

  get passwordConfirmationControl() {
    return this.form.controls.passwordConfirmation;
  }

  async submit(): Promise<void> {
    if (this.loading() || this.tokenMissing()) {
      return;
    }

    this.errorMessage.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);

    const { password, passwordConfirmation } = this.form.getRawValue();

    try {
      const message = await firstValueFrom(
        this.authService.resetPassword(this.resetToken as string, password, passwordConfirmation)
      );
      this.successMessage.set(message);
      this.form.disable();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo restablecer la contraseña. Intenta nuevamente.';
      this.errorMessage.set(message);
    } finally {
      this.loading.set(false);
    }
  }

  async goToLogin(): Promise<void> {
    await this.router.navigate(['/welcome'], { queryParams: { passwordResetCompleted: '1' } });
  }
}
