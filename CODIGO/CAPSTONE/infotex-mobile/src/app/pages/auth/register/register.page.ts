import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, ValidationErrors, AbstractControl } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  IonButton,
  IonCol,
  IonContent,
  IonGrid,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonRow,
  IonSpinner,
  IonList,
  IonNote,
  IonText,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/angular/standalone';

import { AuthService, RegisterPayload } from '../../../core/services/auth.service';

type ToastColor = 'primary' | 'success' | 'danger';

@Component({
  standalone: true,
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  imports: [
    ReactiveFormsModule,
    IonButton,
    IonCol,
    IonContent,
    IonGrid,
    IonHeader,
    IonInput,
    IonItem,
    IonLabel,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardSubtitle,
    IonCardTitle,
    IonRow,
    IonSpinner,
    IonList,
    IonNote,
    IonText,
    IonTitle,
    IonToast,
    IonToolbar,
    RouterLink,
  ],
})
export class RegisterPage {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = this.fb.nonNullable.group(
    {
      fullName: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: [this.passwordsMatchValidator] }
  );

  loading = false;
  toast: { open: boolean; message: string; color: ToastColor } = {
    open: false,
    message: '',
    color: 'primary',
  };

  get fullNameControl() {
    return this.form.controls.fullName;
  }

  get emailControl() {
    return this.form.controls.email;
  }

  get passwordControl() {
    return this.form.controls.password;
  }

  get confirmPasswordControl() {
    return this.form.controls.confirmPassword;
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.toast.open = false;

    const { confirmPassword, ...rawPayload } = this.form.getRawValue();
    const payload: RegisterPayload = { ...rawPayload };

    this.authService.register(payload).subscribe({
      next: (result) => {
        this.loading = false;
        this.showToast('Registro exitoso. Redirigiendo...', 'success');

        const nextUrl = result.isProfileComplete ? '/tabs/tab1' : '/profile/setup';
        void this.router.navigateByUrl(nextUrl);
      },
      error: (error) => {
        this.loading = false;
        const message = error?.message || 'No fue posible completar el registro.';
        this.showToast(message, 'danger');
      },
    });
  }

  onToastDismiss(): void {
    this.toast.open = false;
  }

  private passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;

    if (password && confirmPassword && password !== confirmPassword) {
      return { passwordMismatch: true };
    }

    return null;
  }

  private showToast(message: string, color: ToastColor): void {
    this.toast = {
      open: true,
      message,
      color,
    };
  }
}
