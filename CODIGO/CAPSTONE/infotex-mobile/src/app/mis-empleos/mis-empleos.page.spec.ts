import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MisEmpleosPage } from './mis-empleos.page';

describe('MisEmpleosPage', () => {
  let component: MisEmpleosPage;
  let fixture: ComponentFixture<MisEmpleosPage>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(MisEmpleosPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
