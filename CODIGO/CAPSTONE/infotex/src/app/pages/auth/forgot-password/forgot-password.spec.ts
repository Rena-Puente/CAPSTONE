import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { Router } from '@angular/router';

import { ForgotPassword } from './forgot-password';
import { AuthService } from '../../../services/auth.service';

class AuthServiceStub {
  requestPasswordReset = jasmine.createSpy('requestPasswordReset').and.returnValue(of('Mensaje enviado.'));
}

class RouterStub {
  navigate = jasmine.createSpy('navigate').and.resolveTo(true);
}

describe('ForgotPassword', () => {
  let component: ForgotPassword;
  let fixture: ComponentFixture<ForgotPassword>;
  let authService: AuthServiceStub;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ForgotPassword],
      providers: [
        { provide: AuthService, useClass: AuthServiceStub },
        { provide: Router, useClass: RouterStub }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ForgotPassword);
    component = fixture.componentInstance;
    authService = TestBed.inject(AuthService) as unknown as AuthServiceStub;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should mark the control as touched when submitting an invalid form', async () => {
    expect(component.emailControl.touched).toBeFalse();

    await component.submit();

    expect(component.emailControl.touched).toBeTrue();
    expect(authService.requestPasswordReset).not.toHaveBeenCalled();
  });

  it('should call the service when the form is valid', async () => {
    component.form.setValue({ email: 'user@example.com' });

    await component.submit();

    expect(authService.requestPasswordReset).toHaveBeenCalledWith('user@example.com');
  });

  it('should surface service errors as friendly messages', async () => {
    authService.requestPasswordReset.and.returnValue(
      throwError(() => new Error('No se pudo enviar el correo.'))
    );

    component.form.setValue({ email: 'user@example.com' });

    await component.submit();

    const errorMessageSignal = (component as unknown as { errorMessage: () => string | null }).errorMessage;
    expect(errorMessageSignal()).toBe('No se pudo enviar el correo.');
  });
});
