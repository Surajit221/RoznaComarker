import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { SimilarityApiService, isReport, newSimilarityRequestId, similarityErrorOf, type SimilarityReport } from './similarity-api.service';
import { httpTestingProviders } from '../../testing/standalone-test-providers';

const API = 'http://localhost:5000/api/similarity';
const PANEL = { state: 'none', eligible: true, reason: null, wordCount: 80, checksLeftToday: 20, checksLeftForSubmission: 3, externalAvailable: true,
  noticeShown: true } as const;
const REPORT = { ...PANEL, state: 'completed', revision: 4 } as unknown as SimilarityReport;

describe('SimilarityApiService', () => {
  let api: SimilarityApiService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...httpTestingProviders] });
    api = TestBed.inject(SimilarityApiService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('reads the panel; a 404 (feature off, or not the owner) reads as null; other errors are passed on', async () => {
    const first = api.get('sub 1');
    http.expectOne(`${API}/submissions/sub%201`).flush({ success: true, data: PANEL });
    expect(await first).toEqual(PANEL);
    const hidden = api.get('sub 1');
    http.expectOne(`${API}/submissions/sub%201`).flush({ success: false, code: 'NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    expect(await hidden).toBeNull();
    const broken = api.get('sub 1');
    http.expectOne(`${API}/submissions/sub%201`).flush({}, { status: 500, statusText: 'Server Error' });
    await expectAsync(broken).toBeRejected();
  });

  it('starts a check with an Idempotency-Key, with confirmPermission only when given', async () => {
    const started = api.startCheck('s1', 'sim_abc');
    const req = http.expectOne(`${API}/submissions/s1/checks`);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Idempotency-Key')).toBe('sim_abc');
    expect(req.request.body).toEqual({});
    req.flush({ success: true, data: { ...PANEL, state: 'queued' } });
    expect((await started).state).toBe('queued');
    const confirmed = api.startCheck('s1', 'sim_def', true);
    const req2 = http.expectOne(`${API}/submissions/s1/checks`);
    expect(req2.request.body).toEqual({ confirmPermission: true });
    req2.flush({ success: true, data: PANEL });
    await confirmed;
  });

  it('retry, exclude, restore one and restore all send the documented bodies', async () => {
    const retried = api.retry('s1', 'sim_r');
    const r = http.expectOne(`${API}/submissions/s1/checks/retry`);
    expect(r.request.headers.get('Idempotency-Key')).toBe('sim_r');
    r.flush({ success: true, data: REPORT });
    await retried;
    const excluded = api.setExcluded('s1', 's2', true, 4, 'sim_x');
    const x = http.expectOne(`${API}/submissions/s1/sources/s2`);
    expect(x.request.method).toBe('PATCH');
    expect(x.request.body).toEqual({ excluded: true, revision: 4, requestId: 'sim_x' });
    x.flush({ success: true, data: REPORT });
    expect(await excluded).toEqual(REPORT);
    const all = api.restoreAll('s1', 5, 'sim_y');
    const y = http.expectOne(`${API}/submissions/s1/sources/restore-all`);
    expect(y.request.body).toEqual({ revision: 5, requestId: 'sim_y' });
    y.flush({ success: true, data: REPORT });
    await all;
  });

  it('the PDF is a blob; the notice is null when unavailable', async () => {
    const pdf = api.pdf('s1');
    const p = http.expectOne(`${API}/submissions/s1/pdf`);
    expect(p.request.responseType).toBe('blob');
    p.flush(new Blob(['%PDF']));
    expect(await pdf).toBeInstanceOf(Blob);
    const notice = api.notice();
    http.expectOne(`${API}/notice`).flush({}, { status: 404, statusText: 'Not Found' });
    expect(await notice).toBeNull();
    const shown = api.notice();
    http.expectOne(`${API}/notice`).flush({ success: true, data: { version: 'essay-similarity-2026-11', text: 'Line.' } });
    expect(await shown).toEqual({ version: 'essay-similarity-2026-11', text: 'Line.' });
  });

  it('error helper: code, reason and the conflict report; request ids are unique', () => {
    const conflict = new HttpErrorResponse({ status: 409, error: { success: false, code: 'SIMILARITY_REVISION_CONFLICT', data: REPORT } });
    expect(similarityErrorOf(conflict)).toEqual({ status: 409, code: 'SIMILARITY_REVISION_CONFLICT', reason: null, report: REPORT });
    const notEligible = new HttpErrorResponse({ status: 409, error: { code: 'SIMILARITY_NOT_ELIGIBLE', reason: 'too_long' } });
    expect(similarityErrorOf(notEligible)).toEqual({ status: 409, code: 'SIMILARITY_NOT_ELIGIBLE', reason: 'too_long', report: null });
    expect(similarityErrorOf(new Error('x'))).toEqual({ status: 0, code: null, reason: null, report: null });
    expect(isReport(PANEL)).toBeFalse();
    expect(isReport(REPORT)).toBeTrue();
    expect(isReport(null)).toBeFalse();
    const a = newSimilarityRequestId();
    expect(a).toMatch(/^sim_[a-f0-9]{32}$/);
    expect(newSimilarityRequestId()).not.toBe(a);
  });
});
