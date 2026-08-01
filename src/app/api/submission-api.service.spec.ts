import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../environments/environment';
import { SubmissionApiService } from './submission-api.service';

describe('SubmissionApiService canonical reads', () => {
  let service: SubmissionApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(SubmissionApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uses the same canonical assignment URL for desktop and mobile consumers', async () => {
    const desktop = service.getMySubmissionByAssignmentId('assignment-1', 'desktop-token');
    const desktopRequest = http.expectOne(`${environment.apiUrl}/submissions/assignment/assignment-1/my`);
    expect(desktopRequest.request.method).toBe('GET');
    desktopRequest.flush({ success: true, data: { _id: 'submission-1' } });
    const mobile = service.getMySubmissionByAssignmentId('assignment-1', 'mobile-token');
    const mobileRequest = http.expectOne(`${environment.apiUrl}/submissions/assignment/assignment-1/my`);
    expect(mobileRequest.request.method).toBe('GET');
    mobileRequest.flush({ success: true, data: { _id: 'submission-1' } });
    expect((await desktop)._id).toBe((await mobile)._id);
  });

  it('keeps result observation GET-only and retry explicitly POST-only', async () => {
    const read = service.getMySubmissionByAssignmentId('assignment-1');
    const readRequest = http.expectOne(`${environment.apiUrl}/submissions/assignment/assignment-1/my`);
    expect(readRequest.request.method).toBe('GET');
    readRequest.flush({ success: true, data: { _id: 'submission-1' } });
    await read;
    const retry = service.regenerateCanonicalCorrections('submission-1');
    const retryRequest = http.expectOne(`${environment.apiUrl}/submissions/submission-1/ocr-corrections/regenerate`);
    expect(retryRequest.request.method).toBe('POST');
    retryRequest.flush({ success: true });
    await retry;
  });
});
