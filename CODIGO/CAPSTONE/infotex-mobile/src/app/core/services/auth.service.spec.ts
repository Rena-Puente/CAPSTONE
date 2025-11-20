import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_AUTH_BASE } from '../../../environments/environment';
import {
  AuthApiResponse,
  AuthResult,
  AuthService,
  AuthServiceError,
  LoginCredentials,
  RegisterPayload,
  SessionService
} from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let sessionService: jasmine.SpyObj<SessionService>;

  beforeEach(() => {
    sessionService = jasmine.createSpyObj('SessionService', ['setTokens', 'clear']);
    sessionService.setTokens.and.resolveTo();
    sessionService.clear.and.resolveTo();

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AuthService, { provide: SessionService, useValue: sessionService }]
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should login and normalize token/user info while persisting tokens', () => {
    const credentials: LoginCredentials = { email: 'user@example.com', password: 'secret' };
    const apiResponse: AuthApiResponse = {
      token: 'access-123',
      refresh_token: 'refresh-456',
      user: { role: 'admin', profileCompleted: true }
    };

    let result: AuthResult | undefined;

    service.login(credentials).subscribe((response) => {
      result = response;
    });

    const req = httpMock.expectOne(`${API_AUTH_BASE}/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(credentials);

    req.flush(apiResponse);

    expect(result).toEqual({
      tokens: { accessToken: 'access-123', refreshToken: 'refresh-456' },
      userType: 'admin',
      isProfileComplete: true
    });
    expect(sessionService.setTokens).toHaveBeenCalledWith({
      accessToken: 'access-123',
      refreshToken: 'refresh-456'
    });
  });

  it('should register using nested data payloads and persist tokens', () => {
    const payload: RegisterPayload = { email: 'new@example.com', password: 'welcome' };
    const apiResponse: AuthApiResponse = {
      data: {
        accessToken: 'nested-access',
        refreshToken: 'nested-refresh',
        userType: 'candidate',
        isProfileComplete: false
      }
    };

    let result: AuthResult | undefined;

    service.register(payload).subscribe((response) => {
      result = response;
    });

    const req = httpMock.expectOne(`${API_AUTH_BASE}/register`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);

    req.flush(apiResponse);

    expect(result).toEqual({
      tokens: { accessToken: 'nested-access', refreshToken: 'nested-refresh' },
      userType: 'candidate',
      isProfileComplete: false
    });
    expect(sessionService.setTokens).toHaveBeenCalledWith({
      accessToken: 'nested-access',
      refreshToken: 'nested-refresh'
    });
  });

  it('should map HTTP errors to AuthServiceError with translation keys', (done) => {
    const credentials: LoginCredentials = { email: 'oops@example.com', password: 'badpass' };

    service.login(credentials).subscribe({
      next: () => fail('Login should have failed'),
      error: (error: unknown) => {
        expect(error instanceof AuthServiceError).toBeTrue();
        const authError = error as AuthServiceError;
        expect(authError.translationKey).toBe('auth.errors.invalidCredentials');
        expect(authError.status).toBe(401);
        expect(authError.message).toBe('Credenciales inválidas');
        done();
      }
    });

    const req = httpMock.expectOne(`${API_AUTH_BASE}/login`);
    req.flush({ message: 'Credenciales inválidas' }, { status: 401, statusText: 'Unauthorized' });
  });

  it('should handle registration conflicts using correct translation key', (done) => {
    const payload: RegisterPayload = { email: 'exists@example.com', password: 'any' };

    service.register(payload).subscribe({
      next: () => fail('Register should have failed'),
      error: (error: unknown) => {
        expect(error instanceof AuthServiceError).toBeTrue();
        const authError = error as AuthServiceError;
        expect(authError.translationKey).toBe('auth.errors.userAlreadyExists');
        expect(authError.status).toBe(409);
        expect(authError.message).toBe('El usuario ya existe');
        done();
      }
    });

    const req = httpMock.expectOne(`${API_AUTH_BASE}/register`);
    req.flush({ message: 'El usuario ya existe' }, { status: 409, statusText: 'Conflict' });
  });
});