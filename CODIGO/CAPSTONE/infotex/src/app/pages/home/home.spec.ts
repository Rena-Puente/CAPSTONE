import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';

import { Home } from './home';
import { ApplicationsService } from '../../services/applications.service';
import { OffersService, PublicOffer, OfferApplicationResult } from '../../services/offers.service';
import { ProfileData, ProfileService } from '../../services/profile.service';

class OffersServiceStub {
  listOffers() {
    return of<PublicOffer[]>([]);
  }

  applyToOffer(): ReturnType<OffersService['applyToOffer']> {
    const result: OfferApplicationResult = {
      id: 1,
      offerId: 1,
      userId: 1,
      status: 'enviada',
      coverLetter: null,
      submittedAt: new Date().toISOString()
    };

    return of(result);
  }
}

class ProfileServiceStub {
  getProfile() {
    const profile = {
      displayName: 'Usuario de prueba',
      biography: 'Biografía de prueba',
      country: null,
      city: null,
      career: null,
      avatarUrl: null,
      slug: null
    } as unknown as ProfileData;

    return of(profile);
  }
}

class ApplicationsServiceStub {
  listCurrentUserApplications() {
    return of([]);
  }
}

describe('Home', () => {
  let component: Home;
  let fixture: ComponentFixture<Home>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Home, RouterTestingModule],
      providers: [
        { provide: OffersService, useClass: OffersServiceStub },
        { provide: ProfileService, useClass: ProfileServiceStub },
        { provide: ApplicationsService, useClass: ApplicationsServiceStub }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(Home);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should navigate to the profile editor when requested', async () => {
    const navigateSpy = spyOn(router, 'navigate').and.resolveTo(true);

    await component['openProfileEditor']();

    expect(navigateSpy).toHaveBeenCalledWith(['/profile'], {
      queryParams: { profileEditor: 'open' },
      queryParamsHandling: 'merge'
    });
  });
});
