import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../../services/auth.service';

const EMAIL_ALLOWED_CHARACTERS = /^[a-zA-Z0-9._%+@-]+$/;

function allowedEmailCharactersValidator(control: AbstractControl): ValidationErrors | null {
  const value = control.value as string | null;

  if (!value) {
    return null;
  }

  return EMAIL_ALLOWED_CHARACTERS.test(value) ? null : { invalidCharacters: true };
}

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss'
})
export class ForgotPassword {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email, allowedEmailCharactersValidator]]
  });

  readonly loading = signal(false);
  readonly successMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  get emailControl() {
    return this.form.controls.email;
  }

  async submit(): Promise<void> {
    if (this.loading()) {
      return;
    }

    this.errorMessage.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);

    const { email } = this.form.getRawValue();

    try {
      const message = await firstValueFrom(this.authService.requestPasswordReset(email));
      this.successMessage.set(message);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo enviar el enlace de restablecimiento. Intenta de nuevo.';
      this.errorMessage.set(message);
    } finally {
      this.loading.set(false);
    }
  }

  async returnToLogin(): Promise<void> {
    await this.router.navigate(['/auth/login'], { queryParams: { passwordResetRequested: '1' } });
  }

  tryAgain(): void {
    this.successMessage.set(null);
    this.errorMessage.set(null);
    this.form.reset({ email: '' });
  }
}
