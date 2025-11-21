import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { CANDIDATE_USER_TYPE, resolveDefaultRouteForUserType } from '../../constants/user-type-routing';
import { AuthService } from '../../services/auth.service';

type AuthPanelTab = 'login' | 'register';

function passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value ?? '';
  const confirmation = control.get('passwordConfirmation')?.value ?? '';

  if (!password && !confirmation) {
    return null;
  }

  return password === confirmation ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './welcome.html',
  styleUrl: './welcome.scss'
})
export class Welcome implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly isMenuOpen = signal(false);
  protected readonly activeTab = signal<AuthPanelTab>('login');
  protected readonly loginLoading = signal(false);
  protected readonly registerLoading = signal(false);
  protected readonly loginErrorMessage = signal<string | null>(null);
  protected readonly loginSuccessMessage = signal<string | null>(null);
  protected readonly registerErrorMessage = signal<string | null>(null);
  protected readonly githubLoading = signal(false);
  protected readonly githubErrorMessage = signal<string | null>(null);
  protected readonly passwordResetBannerMessage = signal<string | null>(null);

  protected readonly loginForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  protected readonly registerForm = this.fb.nonNullable.group(
    {
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      passwordConfirmation: ['', [Validators.required, Validators.minLength(6)]]
    },
    { validators: passwordsMatchValidator }
  );

  protected openMenu(tab: AuthPanelTab = 'login'): void {
    this.isMenuOpen.set(true);
    this.githubLoading.set(false);
    this.githubErrorMessage.set(null);
    this.setActiveTab(tab);
  }

  protected closeMenu(): void {
    this.isMenuOpen.set(false);
    this.loginErrorMessage.set(null);
    this.loginSuccessMessage.set(null);
    this.registerErrorMessage.set(null);
    this.loginForm.reset({ email: '', password: '' });
    this.registerForm.reset({ email: '', password: '', passwordConfirmation: '' });
    this.activeTab.set('login');
    this.githubLoading.set(false);
    this.githubErrorMessage.set(null);
  }

  protected switchToLogin(): void {
    this.setActiveTab('login');
  }

  protected switchToRegister(): void {
    this.setActiveTab('register');
  }

  private setActiveTab(tab: AuthPanelTab): void {
    this.activeTab.set(tab);

    if (tab === 'login') {
      this.registerErrorMessage.set(null);
      this.registerForm.markAsUntouched();
    } else {
      this.loginErrorMessage.set(null);
      this.loginSuccessMessage.set(null);
      this.loginForm.markAsUntouched();
    }
  }

  protected get emailControl() {
    return this.loginForm.controls.email;
  }

  protected get passwordControl() {
    return this.loginForm.controls.password;
  }

  protected get registerEmailControl() {
    return this.registerForm.controls.email;
  }

  protected get registerPasswordControl() {
    return this.registerForm.controls.password;
  }

  protected get registerPasswordConfirmationControl() {
    return this.registerForm.controls.passwordConfirmation;
  }

  ngOnInit(): void {
    const queryParams = this.route.snapshot.queryParamMap;
    const requestFlag = queryParams.get('passwordResetRequested');
    const completedFlag = queryParams.get('passwordResetCompleted');

    if (requestFlag === '1') {
      this.passwordResetBannerMessage.set(
        'Si tu correo está registrado, recibirás un enlace de restablecimiento en los próximos minutos.'
      );
    } else if (completedFlag === '1') {
      this.passwordResetBannerMessage.set(
        'Tu contraseña se actualizó correctamente. Inicia sesión con tu nueva credencial.'
      );
    }

    if (requestFlag || completedFlag) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {
          passwordResetRequested: null,
          passwordResetCompleted: null
        },
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    }
  }

  protected dismissPasswordResetBanner(): void {
    this.passwordResetBannerMessage.set(null);
  }

  protected async submitLogin(): Promise<void> {
    this.loginErrorMessage.set(null);
    this.loginSuccessMessage.set(null);

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.loginLoading.set(true);

    const { email, password } = this.loginForm.getRawValue();

    try {
      const { userType, isProfileComplete } = await firstValueFrom(
        this.authService.login(email, password)
      );

      const destinationOverride = resolveDefaultRouteForUserType(userType);

      if (!destinationOverride && userType === CANDIDATE_USER_TYPE && isProfileComplete === null) {
        this.isMenuOpen.set(true);
        this.setActiveTab('login');
        this.loginErrorMessage.set('No se pudo verificar el estado del perfil. Intenta nuevamente.');
        return;
      }

      const destination = destinationOverride ?? (isProfileComplete ? '/home' : '/profile');
      let navigated = false;

      try {
        navigated = await this.router.navigate([destination]);
      } catch (navigationError) {
        console.error('[Welcome] Navigation to destination failed', { destination, navigationError });
        this.isMenuOpen.set(true);
        this.setActiveTab('login');
        this.loginErrorMessage.set('No se pudo redirigir a la página solicitada.');
        return;
      }

      if (!navigated) {
        console.error('[Welcome] Navigation to destination was cancelled', { destination });
        this.isMenuOpen.set(true);
        this.setActiveTab('login');
        this.loginErrorMessage.set('No se pudo redirigir a la página solicitada.');
        return;
      }

      this.closeMenu();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo iniciar sesión.';
      this.isMenuOpen.set(true);
      this.setActiveTab('login');
      this.loginErrorMessage.set(message);
    } finally {
      this.loginLoading.set(false);
    }
  }

  protected async submitRegistration(): Promise<void> {
    this.registerErrorMessage.set(null);

    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.registerLoading.set(true);

    const { email, password, passwordConfirmation } = this.registerForm.getRawValue();

    try {
      await firstValueFrom(this.authService.register(email, password, passwordConfirmation));
      this.registerForm.reset({ email: '', password: '', passwordConfirmation: '' });
      this.loginForm.patchValue({ email, password: '' });
      this.loginSuccessMessage.set('Tu cuenta fue creada. Verifica tu correo para ingresar.');
      this.setActiveTab('login');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo crear la cuenta.';
      this.registerErrorMessage.set(message);
    } finally {
      this.registerLoading.set(false);
    }
  }

  protected async continueWithGithub(): Promise<void> {
    if (this.githubLoading()) {
      return;
    }

    this.githubErrorMessage.set(null);

    if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
      this.githubErrorMessage.set('Tu navegador no soporta la autenticación segura con GitHub.');
      return;
    }

    const state = crypto.randomUUID();
    let redirected = false;

    this.githubLoading.set(true);

    try {
      const authorizeUrl = await firstValueFrom(this.authService.getGithubAuthorizeUrl(state));

      if (!authorizeUrl) {
        throw new Error('No se recibió la URL de autenticación de GitHub.');
      }

      if (!this.authService.storeGithubOAuthState({ state, mode: 'login' })) {
        throw new Error('No se pudo preparar la sesión segura. Habilita el almacenamiento de sesión e inténtalo de nuevo.');
      }

      redirected = true;
      window.location.href = authorizeUrl;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo conectar con GitHub en este momento. Vuelve a intentarlo.';
      this.githubErrorMessage.set(message);
    } finally {
      if (!redirected) {
        this.githubLoading.set(false);
      }
    }
  }


}
