import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { UsuarioLogueadoPage } from './usuario-logueado.page';

describe('UsuarioLogueadoPage', () => {
  let component: UsuarioLogueadoPage;
  let fixture: ComponentFixture<UsuarioLogueadoPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UsuarioLogueadoPage],
      providers: [provideRouter([])]
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(UsuarioLogueadoPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
