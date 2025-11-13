import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Aplications } from './aplications';

describe('Aplications', () => {
  let component: Aplications;
  let fixture: ComponentFixture<Aplications>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Aplications]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Aplications);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
