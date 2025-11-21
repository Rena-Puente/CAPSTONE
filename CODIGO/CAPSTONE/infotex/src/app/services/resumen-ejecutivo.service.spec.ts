import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { ResumenEjecutivoService } from './resumen-ejecutivo.service';

const authStub = {
  getAccessToken: jasmine.createSpy('getAccessToken').and.returnValue('token-123')
};

describe('ResumenEjecutivoService', () => {
  let service: ResumenEjecutivoService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [{ provide: AuthService, useValue: authStub }]
    });

    service = TestBed.inject(ResumenEjecutivoService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should map JSON strings dentro de la respuesta', (done) => {
    const payload = {
      postulantes_por_mes: [{ mes: '2024-01', total: 5 }],
      empresas_por_mes: [],
      ofertas_por_mes: [],
      postulaciones_por_mes: [],
      avg_postulantes_por_oferta: 1.5,
      ofertas_activas: 2,
      empresas_inactivas: 0
    };

    service.obtenerResumen('2024-01-01', '2024-12-31').subscribe((data) => {
      expect(data.avg_postulantes_por_oferta).toBe(1.5);
      expect(data.postulantes_por_mes[0].mes).toBe('2024-01');
      done();
    });

    const req = httpMock.expectOne('http://localhost:3000/admin/resumen-ejecutivo');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-123');
    expect(req.request.body).toEqual({ fecha_inicio: '2024-01-01', fecha_fin: '2024-12-31' });
    req.flush({ data: JSON.stringify(payload) });
  });

  it('should fallback to defaults on errors', (done) => {
    authStub.getAccessToken.and.returnValue('token-123');

    service.obtenerResumen('2024-01-01', '2024-12-31').subscribe({
      next: () => done.fail('expected error'),
      error: (error) => {
        expect(error).toBeTruthy();
        done();
      }
    });

    const req = httpMock.expectOne('http://localhost:3000/admin/resumen-ejecutivo');
    req.error(new ProgressEvent('Network error'));
  });
});
