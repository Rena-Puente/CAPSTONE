import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { Home } from './home';
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

describe('Home', () => {
  let component: Home;
  let fixture: ComponentFixture<Home>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        { provide: OffersService, useClass: OffersServiceStub },
        { provide: ProfileService, useClass: ProfileServiceStub }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(Home);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
