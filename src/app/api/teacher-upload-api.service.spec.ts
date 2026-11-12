import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { TeacherUploadApiService, TeacherUploadEvent, friendlyError } from './teacher-upload-api.service';

const base = `${environment.apiUrl}/assignments/a1/teacher-uploads`;

describe('TeacherUploadApiService', () => {
  let api: TeacherUploadApiService, http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(TeacherUploadApiService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('checks a student list', async () => {
    const pending = api.check('a1', [{ name: 'Sam', email: 'sam@example.com' }]);
    const req = http.expectOne(`${base}/check`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ students: [{ name: 'Sam', email: 'sam@example.com' }] });
    req.flush({ success: true, data: { students: [], credits: { needed: 1, available: 3 } } });
    expect((await pending).credits).toEqual({ needed: 1, available: 3 });
  });

  it('uploads one student\'s pages as multipart with progress, and cancels by unsubscribing', () => {
    const events: TeacherUploadEvent[] = [];
    const sub = api.upload('a1', { name: 'Sam', email: 'sam@example.com', requestKey: 'k'.repeat(36), batchId: 'batch-0001', mode: 'replace', send: true,
      files: [{ blob: new Blob(['x']), name: 'p1.jpg' }, { blob: new Blob(['y']), name: 'p2.jpg' }] }).subscribe(event => events.push(event));
    const req = http.expectOne(base);
    const form = req.request.body as FormData;
    expect([form.get('name'), form.get('email'), form.get('mode'), form.get('send'), form.get('batchId')]).toEqual(['Sam', 'sam@example.com', 'replace', 'true', 'batch-0001']);
    expect(form.getAll('files').length).toBe(2);
    expect(req.request.reportProgress).toBeTrue();
    sub.unsubscribe();
    expect(req.cancelled).toBeTrue();
    expect(events).toEqual([]);
  });

  it('reports the saved item when done', () => {
    const events: TeacherUploadEvent[] = [];
    api.upload('a1', { name: 'Sam', email: 'sam@example.com', requestKey: 'k'.repeat(36), batchId: 'batch-0001', mode: 'new', send: false,
      files: [{ blob: new Blob(['x']), name: 'p1.jpg' }] }).subscribe(event => events.push(event));
    const req = http.expectOne(base);
    expect((req.request.body as FormData).get('send')).toBeNull();
    req.flush({ success: true, data: { duplicate: false, item: { submissionId: 's1' } } });
    expect(events.at(-1)).toEqual({ type: 'done', result: { duplicate: false, item: jasmine.objectContaining({ submissionId: 's1' }) } });
  });

  it('lists uploads and queues an email', async () => {
    const listed = api.list('a1');
    http.expectOne(base).flush({ success: true, data: { items: [], credits: { available: 2 } } });
    expect((await listed).credits.available).toBe(2);
    const sent = api.send('a1', 's1');
    http.expectOne(`${base}/s1/send`).flush({ success: true, data: { alreadyRequested: true, item: { submissionId: 's1' } } });
    expect((await sent).alreadyRequested).toBeTrue();
  });

  it('sends a page check for one student, the same request shape as the student screen check', () => {
    const file = new File(['x'], 'page.png', { type: 'image/png' });
    let result: unknown;
    api.preflight('a1', { name: 'Sam Lee', email: 'sam@example.com' }, file, 'source').subscribe(r => result = r);
    const req = http.expectOne(`${base}/image-preflight`);
    expect(req.request.method).toBe('POST');
    const body = req.request.body as FormData;
    expect(body.get('file')).toBe(file); expect(body.get('phase')).toBe('source');
    expect(body.get('name')).toBe('Sam Lee'); expect(body.get('email')).toBe('sam@example.com');
    req.flush({ success: true, data: { ready: true, checks: [], sourceReadStatus: 'PASSED', canSubmit: true } });
    expect(result).toEqual({ success: true, data: jasmine.objectContaining({ sourceReadStatus: 'PASSED' }) });
  });

  it('retries marking', async () => {
    const retried = api.retry('a1', 's1');
    const req = http.expectOne(`${base}/s1/retry`);
    expect(req.request.method).toBe('POST');
    req.flush({ success: true, data: { alreadyRequested: false, item: { submissionId: 's1', status: 'uploaded' } } });
    expect((await retried).item.status).toBe('uploaded');
  });
});

describe('friendlyError', () => {
  const err = (status: number, error: unknown = null) => new HttpErrorResponse({ status, error });
  it('gives a plain message for every kind of failure', () => {
    expect(friendlyError(err(0)).message).toContain('offline');
    expect(friendlyError(err(401)).message).toContain('session has expired');
    expect(friendlyError(err(403, { code: 'FORBIDDEN' })).message).toContain('permission');
    expect(friendlyError(err(404, { message: 'Assignment not found.' })).message).toContain('could not be found');
    expect(friendlyError(err(429)).message).toContain('Too many requests');
    expect(friendlyError(err(413, { message: 'Upload payload is too large.' })).message).toContain('too large to upload together');
    expect(friendlyError(err(500, { message: 'TypeError: x is undefined' })).message).toBe('Something went wrong on our side. Please try again.');
    expect(friendlyError(new Error('boom')).message).toBe('Something went wrong. Please try again.');
  });
  it('keeps the backend\'s own plain message, code and details', () => {
    const credits = friendlyError(err(402, { code: 'INSUFFICIENT_CREDITS', message: 'You have no assessment credits left. Add credits to upload more work.' }));
    expect(credits).toEqual({ status: 402, code: 'INSUFFICIENT_CREDITS', message: 'You have no assessment credits left. Add credits to upload more work.' });
    const exists = friendlyError(err(409, { code: 'TEACHER_UPLOAD_EXISTS', message: 'Work for this student is already uploaded.', details: { pages: 2 } }));
    expect(exists.details).toEqual({ pages: 2 });
    expect(friendlyError(err(400, { code: 'UNSUPPORTED_FILE_TYPE', message: 'Please use JPG, PNG or PDF.' })).message).toBe('Please use JPG, PNG or PDF.');
    expect(friendlyError(err(409, { code: 'TEACHER_UPLOAD_MARKING_FAILED', message: 'Marking failed, so there is no feedback to email yet. Retry marking first.' })).message)
      .toBe('Marking failed, so there is no feedback to email yet. Retry marking first.');
    // The handwriting check's own "try again later" answer is shown; other server errors stay generic.
    expect(friendlyError(err(503, { code: 'OCR_GPT_PROVIDER_NETWORK', message: 'Handwriting verification is temporarily unavailable. Please try again later.' })).message)
      .toBe('Handwriting verification is temporarily unavailable. Please try again later.');
    expect(friendlyError(err(503, { message: 'upstream down' })).message).toBe('Something went wrong on our side. Please try again.');
    expect(friendlyError(err(413, { code: 'FILE_TOO_LARGE', message: 'Each image must be 10 MB or smaller.' })).message).toBe('Each image must be 10 MB or smaller.');
  });
});
