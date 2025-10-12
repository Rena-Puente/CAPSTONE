import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './welcome.html',
  styleUrl: './welcome.scss'
})
export class Welcome {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly isMenuOpen = signal(false);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly loginForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  protected openMenu(): void {
    this.isMenuOpen.set(true);
  }

  protected closeMenu(): void {
    this.isMenuOpen.set(false);
    this.errorMessage.set(null);
    this.loginForm.reset({ email: '', password: '' });
  }

  protected get emailControl() {
    return this.loginForm.controls.email;
  }

  protected get passwordControl() {
    return this.loginForm.controls.password;
  }

  protected async submit(): Promise<void> {
    this.errorMessage.set(null);

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);

    const { email, password } = this.loginForm.getRawValue();

    try {
      await firstValueFrom(this.authService.login(email, password));
      this.closeMenu();
      await this.router.navigate(['/home']);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo iniciar sesión.';
      this.errorMessage.set(message);
    } finally {
      this.loading.set(false);
    }
  }
}
