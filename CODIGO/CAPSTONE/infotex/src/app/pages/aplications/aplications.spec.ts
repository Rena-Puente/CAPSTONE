import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { Aplications } from './aplications';
import { ApplicationsService } from '../../services/applications.service';

class ApplicationsServiceStub {
  listCurrentUserApplications() {
    return of([]);
  }
}

describe('Aplications', () => {
  let component: Aplications;
  let fixture: ComponentFixture<Aplications>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Aplications],
      providers: [{ provide: ApplicationsService, useClass: ApplicationsServiceStub }]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Aplications);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
