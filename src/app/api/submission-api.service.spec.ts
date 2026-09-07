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
    const desktopRequest = http.expectOne((request) => request.url === `${environment.apiUrl}/submissions/assignment/assignment-1/my`
      && request.params.get('_refresh') === 'desktop-token');
    expect(desktopRequest.request.method).toBe('GET');
    desktopRequest.flush({ success: true, data: { _id: 'submission-1' } });
    const mobile = service.getMySubmissionByAssignmentId('assignment-1', 'mobile-token');
    const mobileRequest = http.expectOne((request) => request.url === `${environment.apiUrl}/submissions/assignment/assignment-1/my`
      && request.params.get('_refresh') === 'mobile-token');
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

  it('uses the teacher submission removal endpoint with DELETE', async () => {
    const removal = service.removeSubmission('submission/unsafe');
    const req = http.expectOne(`${environment.apiUrl}/submissions/submission%2Funsafe`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true, message: 'Submission removed successfully.' });
    await removal;
  });

  describe('BUG 2: Cache-busting for draft comparison', () => {
    it('getSubmissionsByAssignment must send _refresh query param when cacheBustToken is provided', async () => {
      const submissions = service.getSubmissionsByAssignment('assignment-1', 'refresh-token-123');
      const req = http.expectOne((request) =>
        request.url === `${environment.apiUrl}/submissions/assignment/assignment-1`
        && request.params.get('_refresh') === 'refresh-token-123'
      );
      expect(req.request.method).toBe('GET');
      req.flush({ success: true, data: [{ _id: 'submission-1' }] });
      await submissions;
    });

    it('getSubmissionsByAssignment must NOT send _refresh when cacheBustToken is null', async () => {
      const submissions = service.getSubmissionsByAssignment('assignment-1', null);
      const req = http.expectOne((request) =>
        request.url === `${environment.apiUrl}/submissions/assignment/assignment-1`
        && request.params.get('_refresh') === null
      );
      expect(req.request.method).toBe('GET');
      req.flush({ success: true, data: [{ _id: 'submission-1' }] });
      await submissions;
    });

    it('getSubmissionsByAssignment must NOT send _refresh when cacheBustToken is undefined', async () => {
      const submissions = service.getSubmissionsByAssignment('assignment-1', undefined);
      const req = http.expectOne((request) =>
        request.url === `${environment.apiUrl}/submissions/assignment/assignment-1`
        && request.params.get('_refresh') === null
      );
      expect(req.request.method).toBe('GET');
      req.flush({ success: true, data: [{ _id: 'submission-1' }] });
      await submissions;
    });

    it('getDraftComparison must send _refresh query param when cacheBustToken is provided', async () => {
      const comparison = service.getDraftComparison('submission-1', 'refresh-token-456');
      const req = http.expectOne((request) =>
        request.url === `${environment.apiUrl}/submissions/submission-1/draft-comparison`
        && request.params.get('_refresh') === 'refresh-token-456'
      );
      expect(req.request.method).toBe('GET');
      req.flush({ success: true, data: { previousScore: 80, currentScore: 85 } });
      await comparison;
    });

    it('getDraftComparison must NOT send _refresh when cacheBustToken is null', async () => {
      const comparison = service.getDraftComparison('submission-1', null);
      const req = http.expectOne((request) =>
        request.url === `${environment.apiUrl}/submissions/submission-1/draft-comparison`
        && request.params.get('_refresh') === null
      );
      expect(req.request.method).toBe('GET');
      req.flush({ success: true, data: { previousScore: 80, currentScore: 85 } });
      await comparison;
    });

    it('getDraftComparison must NOT send _refresh when cacheBustToken is undefined', async () => {
      const comparison = service.getDraftComparison('submission-1', undefined);
      const req = http.expectOne((request) =>
        request.url === `${environment.apiUrl}/submissions/submission-1/draft-comparison`
        && request.params.get('_refresh') === null
      );
      expect(req.request.method).toBe('GET');
      req.flush({ success: true, data: { previousScore: 80, currentScore: 85 } });
      await comparison;
    });

    it('cache-bust token must be converted to string in query param', async () => {
      const submissions = service.getSubmissionsByAssignment('assignment-1', 12345);
      const req = http.expectOne((request) =>
        request.url === `${environment.apiUrl}/submissions/assignment/assignment-1`
        && request.params.get('_refresh') === '12345'
      );
      expect(req.request.method).toBe('GET');
      req.flush({ success: true, data: [{ _id: 'submission-1' }] });
      await submissions;
    });
  });
});
