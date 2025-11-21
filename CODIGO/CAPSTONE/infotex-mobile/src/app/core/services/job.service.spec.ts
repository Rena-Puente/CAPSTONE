import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';

import { API_BASE } from '../../../environments/environment';
import { Application, Job } from '../models';
import { JobService, JobPayload, ApplyJobPayload, ApplicationSummary } from './job.service';
import { SessionService } from './session.service';

describe('JobService', () => {
  let service: JobService;
  let httpMock: HttpTestingController;
  let sessionService: jasmine.SpyObj<SessionService>;

  beforeEach(() => {
    sessionService = jasmine.createSpyObj('SessionService', ['getAccessToken']);
    sessionService.getAccessToken.and.resolveTo('token-123');

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [JobService, { provide: SessionService, useValue: sessionService }],
    });

    service = TestBed.inject(JobService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should list public jobs and default to an empty array when offers are missing', () => {
    let jobs: Job[] | undefined;

    service.getPublicJobs().subscribe((response) => (jobs = response));

    const req = httpMock.expectOne(`${API_BASE}/offers`);
    expect(req.request.method).toBe('GET');

    req.flush({ ok: true, offers: null });

    expect(jobs).toEqual([]);
  });

  it('should apply to a job using auth header and map the backend response', fakeAsync(() => {
    const payload: ApplyJobPayload = {
      coverLetter: 'Hola, me interesa',
      answers: [{ question: 'Pregunta 1', answer: 'Respuesta 1' }],
    };
    const apiResponse: Application = {
      id: 10,
      offerId: 42,
      userId: 5,
      status: 'en_revision',
      coverLetter: 'Hola, me interesa',
      submittedAt: '2024-12-01T00:00:00Z',
      answers: [{ question: 'Pregunta 1', answer: 'Respuesta 1' }],
      questions: [{ text: 'Pregunta 1', required: true }],
    };

    let application: Application | undefined;

    service.applyToJob(42, payload).subscribe((response) => (application = response));

    tick();
    const req = httpMock.expectOne(`${API_BASE}/offers/42/apply`);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-123');
    expect(req.request.body).toEqual(payload);

    req.flush({ ok: true, application: apiResponse });
    tick();

    expect(application).toEqual(apiResponse);
  }));

  it('should create a job with auth headers and return the created offer', fakeAsync(() => {
    const payload: JobPayload = {
      title: 'Dev',
      description: 'Build things',
      locationType: 'remoto',
      city: 'Santiago',
      country: 'CL',
      seniority: 'ssr',
      contractType: 'full-time',
      questions: [{ text: '¿Tienes experiencia?', required: false }],
    };
    const createdOffer: Job = {
      id: 77,
      companyId: 3,
      title: 'Dev',
      description: 'Build things',
      locationType: 'remoto',
      city: 'Santiago',
      country: 'CL',
      seniority: 'ssr',
      contractType: 'full-time',
      createdAt: '2025-01-20T00:00:00Z',
      active: true,
      questions: [{ text: '¿Tienes experiencia?', required: false }],
    };

    let offer: Job | undefined;

    service.createJob(payload).subscribe((response) => (offer = response));

    tick();
    const req = httpMock.expectOne(`${API_BASE}/companies/offers`);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-123');
    expect(req.request.body).toEqual(payload);

    req.flush({ ok: true, offer: createdOffer });
    tick();

    expect(offer).toEqual(createdOffer);
  }));

  it('should list company applicants returning summary and default applicants array', fakeAsync(() => {
    const summary: ApplicationSummary = {
      totalApplications: 2,
      totalOffers: 1,
      activeOffers: 1,
      lastApplicationAt: '2025-02-01T10:00:00Z',
      lastUpdatedAt: '2025-02-01T10:00:00Z',
      byStatus: {
        enviada: 1,
        en_revision: 1,
        aceptada: 0,
        rechazada: 0,
      },
    };

    let result: { applicants: Application[]; summary?: ApplicationSummary } | undefined;

    service.listCompanyApplicants().subscribe((response) => (result = response));

    tick();
    const req = httpMock.expectOne(`${API_BASE}/companies/me/applicants`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-123');

    req.flush({ ok: true, applicants: null, summary });
    tick();

    expect(result).toEqual({ applicants: [], summary });
  }));

  it('should update application status and return the mapped payload', fakeAsync(() => {
    const apiResponse = { id: 9, status: 'aceptada', previousStatus: 'en_revision' };
    let applicationStatus:
      | { id: number; status: string | null; previousStatus: string | null }
      | undefined;

    service.updateApplicationStatus(9, 'aceptada').subscribe((response) => (applicationStatus = response));

    tick();
    const req = httpMock.expectOne(`${API_BASE}/companies/me/applicants/9/status`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-123');
    expect(req.request.body).toEqual({ status: 'aceptada' });

    req.flush({ ok: true, application: apiResponse });
    tick();

    expect(applicationStatus).toEqual(apiResponse);
  }));
});
