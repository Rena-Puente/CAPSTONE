import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, of } from 'rxjs';

import { Profile } from './profile';
import { AuthService } from '../../services/auth.service';
import { ProfileFieldsService } from '../../services/profilefields.service';
import { ProfileData, ProfileService } from '../../services/profile.service';

class ProfileServiceStub {
  getProfile() {
    const profile = {
      displayName: 'Usuario de prueba',
      biography: 'A'.repeat(120),
      country: 'Chile',
      city: 'Santiago',
      phoneNumber: '123456789',
      career: 'Ingeniería',
      avatarUrl: '/avatars/avatar1.png',
      slug: 'usuario-prueba',
      isComplete: false,
      missingFields: [],
      githubAccount: {
        linked: false,
        username: null,
        profileUrl: null,
        providerId: null,
        lastSyncedAt: null
      }
    } as unknown as ProfileData;

    return of(profile);
  }

  getSkillCatalog() {
    return of([]);
  }

  getEducation() {
    return of({ education: [], educationSummary: null });
  }

  getExperience() {
    return of({ experience: [], experienceSummary: null });
  }

  getSkills() {
    return of({ skills: [], skillsSummary: null });
  }

  getGithubRepositories() {
    return of({ repositories: [], languages: [] });
  }

  checkSlugAvailability() {
    return of({ available: true });
  }
}

class AuthServiceStub {
  ensureAuthenticated() {
    return of(true);
  }

  getUserId() {
    return 1;
  }

  storeGithubOAuthState() {
    return true;
  }
}

class ProfileFieldsServiceStub {
  getCareerMap() {
    return of({});
  }

  getCities() {
    return of([]);
  }

  getInstitutions() {
    return of([]);
  }
}

class ActivatedRouteStub {
  private readonly subject = new BehaviorSubject(convertToParamMap({}));
  readonly queryParamMap = this.subject.asObservable();

  setQueryParams(params: Record<string, string | null | undefined>): void {
    this.subject.next(convertToParamMap(params));
  }
}

describe('Profile', () => {
  let component: Profile;
  let fixture: ComponentFixture<Profile>;
  let routeStub: ActivatedRouteStub;

  beforeEach(async () => {
    routeStub = new ActivatedRouteStub();

    await TestBed.configureTestingModule({
      imports: [Profile, RouterTestingModule],
      providers: [
        { provide: ProfileService, useClass: ProfileServiceStub },
        { provide: AuthService, useClass: AuthServiceStub },
        { provide: ProfileFieldsService, useClass: ProfileFieldsServiceStub },
        { provide: ActivatedRoute, useValue: routeStub }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(Profile);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should open the editor when the query parameter requests it', async () => {
    routeStub.setQueryParams({ profileEditor: 'open' });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component['editorOpen']()).toBeTrue();
  });

  it('should close the editor when Escape is pressed', () => {
    component['openEditor']();
    fixture.detectChanges();

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(event);

    expect(component['editorOpen']()).toBeFalse();
  });
});
