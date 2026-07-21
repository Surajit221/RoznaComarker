import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdaptivePracticeApiService, AdaptivePracticeContractError } from './adaptive-practice-api.service';

describe('AdaptivePracticeApiService response contract', () => {
  let service: AdaptivePracticeApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdaptivePracticeApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('unwraps one valid session envelope', () => {
    let actual: unknown;
    service.getSession('submission-1').subscribe((value) => actual = value);
    http.expectOne((request) => request.url.endsWith('/adaptive-practice/submissions/submission-1'))
      .flush({ success: true, data: { state: 'idle', session: null } });
    expect(actual).toEqual({ state: 'idle', session: null });
  });

  it('reports missing data as a controlled contract error', () => {
    let actual: unknown;
    service.getSession('submission-1').subscribe({ error: (error) => actual = error });
    http.expectOne((request) => request.url.endsWith('/adaptive-practice/submissions/submission-1'))
      .flush({ success: true });
    expect(actual).toBeInstanceOf(AdaptivePracticeContractError);
  });

  it('reports missing state as a controlled contract error', () => {
    let actual: unknown;
    service.generateSession('submission-1').subscribe({ error: (error) => actual = error });
    http.expectOne((request) => request.url.endsWith('/adaptive-practice/submissions/submission-1/generate'))
      .flush({ success: true, data: { session: null } });
    expect(actual).toBeInstanceOf(AdaptivePracticeContractError);
  });

  it('uses the same validated contract for polling responses', () => {
    let actual: unknown;
    service.getSession('submission-1').subscribe((value) => actual = value);
    http.expectOne((request) => request.url.endsWith('/adaptive-practice/submissions/submission-1'))
      .flush({ success: true, data: { state: 'generating', session: null } });
    expect(actual).toEqual({ state: 'generating', session: null });
  });
});
