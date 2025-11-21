import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ResumenAnual } from './resumen-anual';
import { ResumenEjecutivoService } from '../../../services/resumen-ejecutivo.service';
import { ResumenEjecutivo } from '../../../models/resumen-ejecutivo';

const serviceStub = {
  obtenerResumen: jasmine.createSpy('obtenerResumen')
};

function createResumen(): ResumenEjecutivo {
  return {
    postulantes_por_mes: [
      { mes: '2024-01', total: 10 },
      { mes: '2024-02', total: 8 }
    ],
    empresas_por_mes: [{ mes: '2024-01', total: 3 }],
    ofertas_por_mes: [{ mes: '2024-01', total: 5 }],
    postulaciones_por_mes: [{ mes: '2024-02', total: 12 }],
    avg_postulantes_por_oferta: 2.5,
    ofertas_activas: 6,
    empresas_inactivas: 1
  };
}

describe('ResumenAnual', () => {
  let component: ResumenAnual;
  let fixture: ComponentFixture<ResumenAnual>;

  beforeEach(async () => {
    serviceStub.obtenerResumen.calls.reset();

    await TestBed.configureTestingModule({
      imports: [ResumenAnual],
      providers: [{ provide: ResumenEjecutivoService, useValue: serviceStub }]
    }).compileComponents();

    fixture = TestBed.createComponent(ResumenAnual);
    component = fixture.componentInstance;
  });

  it('debería validar que la fecha inicio no supere a la fecha fin', async () => {
    component.form.setValue({ fechaInicio: '2024-03-10', fechaFin: '2024-03-01' });

    await component.consultar();

    expect(component.form.invalid).toBeTrue();
    expect(serviceStub.obtenerResumen).not.toHaveBeenCalled();
  });

  it('debería renderizar los datos devueltos por el servicio', async () => {
    const resumen = createResumen();
    serviceStub.obtenerResumen.and.returnValue(of(resumen));

    component.form.setValue({ fechaInicio: '2024-01-01', fechaFin: '2024-12-31' });

    await component.consultar();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.admin-summary__metric-value')?.textContent?.trim()).toBe('2.5');
    expect(serviceStub.obtenerResumen).toHaveBeenCalledWith('2024-01-01', '2024-12-31');
  });

  it('debería mostrar un error cuando el servicio falla', async () => {
    serviceStub.obtenerResumen.and.returnValue(throwError(() => new Error('Falló la API')));

    component.form.setValue({ fechaInicio: '2024-01-01', fechaFin: '2024-12-31' });

    await component.consultar();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.alert-danger')?.textContent).toContain('Falló la API');
  });
});
