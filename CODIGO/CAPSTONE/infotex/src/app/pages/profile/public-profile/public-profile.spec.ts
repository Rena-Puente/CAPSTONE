import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { EMPTY, of } from 'rxjs';
import { DOCUMENT } from '@angular/common';
import { Title, Meta } from '@angular/platform-browser';

import { PublicProfile } from './public-profile';
import { ProfileService, PublicProfileData, GithubRepositoryCollection } from '../../../services/profile.service';

class ProfileServiceStub {
  getPublicProfile() {
    return of(createMockPublicProfileData());
  }

  getPublicGithubRepositories() {
    return of({ repositories: [], languages: [] } satisfies GithubRepositoryCollection);
  }
}

function createMockPublicProfileData(): PublicProfileData {
  return {
    profile: {
      displayName: 'Test User',
      biography: 'Bio',
      country: 'Chile',
      city: 'Santiago',
      career: 'Ingeniería',
      avatarUrl: null,
      slug: 'test-user'
    },
    education: {
      entries: [],
      summary: null
    },
    experience: {
      entries: [],
      summary: null
    },
    skills: {
      entries: [],
      summary: null
    },
    githubRepositories: [],
    githubLanguages: []
  } satisfies PublicProfileData;
}

describe('PublicProfile GitHub section', () => {
  let fixture: ComponentFixture<PublicProfile>;
  let component: PublicProfile;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PublicProfile],
      providers: [
        { provide: ActivatedRoute, useValue: { paramMap: EMPTY } },
        { provide: ProfileService, useClass: ProfileServiceStub },
        { provide: Title, useValue: { setTitle: jasmine.createSpy('setTitle') } },
        { provide: Meta, useValue: { updateTag: jasmine.createSpy('updateTag') } },
        { provide: DOCUMENT, useValue: { location: { origin: 'http://localhost' } } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(PublicProfile);
    component = fixture.componentInstance;
    component['loading'].set(false);
    component['error'].set(null);
    component['profile'].set(createMockPublicProfileData());
  });

  it('should hide GitHub section when there is no data', () => {
    component['githubDataLoading'].set(false);
    component['githubDataError'].set(null);
    component['githubRepositories'].set([]);
    component['githubLanguages'].set([]);

    fixture.detectChanges();

    const githubSection = fixture.nativeElement.querySelector('.public-profile__section--github');
    expect(githubSection).toBeNull();
  });

  it('should display highlighted repositories when data is available', () => {
    component['githubDataLoading'].set(false);
    component['githubDataError'].set(null);
    component['githubRepositories'].set([
      {
        id: '1',
        name: 'demo-repo',
        description: 'Repositorio de ejemplo',
        stars: 25,
        forks: 5,
        language: 'TypeScript',
        htmlUrl: 'https://example.com/repo',
        updatedAt: null
      }
    ]);
    component['githubLanguages'].set([]);

    fixture.detectChanges();

    const githubSection = fixture.nativeElement.querySelector('.public-profile__section--github');
    expect(githubSection).not.toBeNull();
    const cards = fixture.nativeElement.querySelectorAll('.public-profile__github-card');
    expect(cards.length).toBe(1);
  });
});
