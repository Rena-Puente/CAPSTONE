import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';

import { ResetPassword } from './reset-password';
import { AuthService } from '../../../services/auth.service';

class AuthServiceStub {
  resetPassword = jasmine.createSpy('resetPassword').and.returnValue(of('Contraseña actualizada.'));
}

class RouterStub {
  navigate = jasmine.createSpy('navigate').and.resolveTo(true);
}

describe('ResetPassword', () => {
  let component: ResetPassword;
  let fixture: ComponentFixture<ResetPassword>;
  let authService: AuthServiceStub;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResetPassword],
      providers: [
        { provide: AuthService, useClass: AuthServiceStub },
        { provide: Router, useClass: RouterStub },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({ token: 'valid-token' })
            }
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ResetPassword);
    component = fixture.componentInstance;
    authService = TestBed.inject(AuthService) as unknown as AuthServiceStub;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should mark controls as touched when the form is invalid', async () => {
    component.form.setValue({ password: '12345678', passwordConfirmation: '00000000' });

    await component.submit();

    expect(component.passwordControl.touched).toBeTrue();
    expect(component.passwordConfirmationControl.touched).toBeTrue();
    expect(component.form.hasError('passwordMismatch')).toBeTrue();
    expect(authService.resetPassword).not.toHaveBeenCalled();
  });

  it('should call the service with the provided data', async () => {
    component.form.setValue({ password: '12345678', passwordConfirmation: '12345678' });

    await component.submit();

    expect(authService.resetPassword).toHaveBeenCalledWith(
      'valid-token',
      '12345678',
      '12345678'
    );
  });

  it('should surface service errors as friendly messages', async () => {
    authService.resetPassword.and.returnValue(
      throwError(() => new Error('El enlace expiró.'))
    );

    component.form.setValue({ password: '12345678', passwordConfirmation: '12345678' });

    await component.submit();

    const errorMessageSignal = (component as unknown as { errorMessage: () => string | null }).errorMessage;
    expect(errorMessageSignal()).toBe('El enlace expiró.');
  });
});

describe('ResetPassword without token', () => {
  let component: ResetPassword;
  let fixture: ComponentFixture<ResetPassword>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResetPassword],
      providers: [
        { provide: AuthService, useClass: AuthServiceStub },
        { provide: Router, useClass: RouterStub },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({})
            }
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ResetPassword);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should disable the form when no token is present', () => {
    expect(component.form.disabled).toBeTrue();
    const tokenMissingSignal = (component as unknown as { tokenMissing: () => boolean }).tokenMissing;
    expect(tokenMissingSignal()).toBeTrue();
  });
});
