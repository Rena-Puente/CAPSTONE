import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonGrid,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonPage,
  IonRow,
  IonCol,
  IonText,
  IonTitle,
  IonToast,
  IonToolbar,
  IonSpinner,
} from '@ionic/angular/standalone';
import { AuthService, LoginCredentials } from '../../../core/services/auth.service';

@Component({
  standalone: true,
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  imports: [
    ReactiveFormsModule,
    IonButton,
    IonContent,
    IonGrid,
    IonHeader,
    IonInput,
    IonItem,
    IonLabel,
    IonPage,
    IonRow,
    IonCol,
    IonText,
    IonTitle,
    IonToast,
    IonToolbar,
    IonSpinner,
  ],
})
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  loading = false;
  toast = {
    open: false,
    message: '',
    color: 'primary' as const,
  };

  get emailControl() {
    return this.form.controls.email;
  }

  get passwordControl() {
    return this.form.controls.password;
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.toast.open = false;

    const credentials: LoginCredentials = this.form.getRawValue();

    this.authService.login(credentials).subscribe({
      next: (result) => {
        this.loading = false;
        this.showToast('Inicio de sesión exitoso', 'success');

        const nextUrl = result.isProfileComplete ? '/tabs/tab1' : '/profile/setup';
        void this.router.navigateByUrl(nextUrl);
      },
      error: (error) => {
        this.loading = false;
        const message = error?.message || 'No fue posible iniciar sesión.';
        this.showToast(message, 'danger');
      },
    });
  }

  onToastDismiss(): void {
    this.toast.open = false;
  }

  private showToast(message: string, color: 'primary' | 'success' | 'danger'): void {
    this.toast = {
      open: true,
      message,
      color,
    };
  }
}
