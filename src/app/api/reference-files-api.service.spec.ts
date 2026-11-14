import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import type { RubricDesigner } from '../models/submission-feedback.model';
import { REFERENCE_FILES_OFF, ReferenceFilesApiService, referenceError, type ReferenceUploadEvent } from './reference-files-api.service';

const base = `${environment.apiUrl}/reference-files`;

describe('ReferenceFilesApiService', () => {
  let api: ReferenceFilesApiService, http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(ReferenceFilesApiService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('config fails closed: off, an error or a malformed answer all mean "hidden"', async () => {
    let pending = api.config();
    http.expectOne(`${base}/config`).flush({ success: true, data: { enabled: true, maxFiles: 5, maxFileBytes: 10485760 } });
    expect(await pending).toEqual({ enabled: true, maxFiles: 5, maxFileBytes: 10485760 });
    pending = api.config();
    http.expectOne(`${base}/config`).flush({ success: true, data: { enabled: false } });
    expect(await pending).toEqual(REFERENCE_FILES_OFF);
    pending = api.config();
    http.expectOne(`${base}/config`).flush({ message: 'Not found.' }, { status: 404, statusText: 'Not Found' });
    expect(await pending).toEqual(REFERENCE_FILES_OFF);
    pending = api.config();
    http.expectOne(`${base}/config`).flush({ success: true, data: { enabled: true, maxFiles: 'five' } });
    expect(await pending).toEqual(REFERENCE_FILES_OFF);
  });

  it('lists class and assignment files', async () => {
    const classes = api.list('class', 'c1');
    http.expectOne(`${base}/classes/c1`).flush({ success: true, data: { files: [], limits: { maxFiles: 5, maxFileBytes: 1 } } });
    expect((await classes).files).toEqual([]);
    const assignment = api.list('assignment', 'a1');
    http.expectOne(`${base}/assignments/a1`).flush({ success: true, data: { files: [], classFiles: [], limits: { maxFiles: 5, maxFileBytes: 1 } } });
    expect((await assignment).classFiles).toEqual([]);
  });

  it('uploads one file as multipart with its request id and progress; the rubric tick only for assignments', () => {
    const file = new File(['x'], 'plan.docx');
    const events: ReferenceUploadEvent[] = [];
    api.upload('assignment', 'a1', { file, requestId: 'req-12345678', markedAsRubric: true }).subscribe(event => events.push(event));
    const req = http.expectOne(`${base}/assignments/a1`);
    const form = req.request.body as FormData;
    expect([form.get('requestId'), form.get('markedAsRubric'), (form.get('file') as File).name]).toEqual(['req-12345678', 'true', 'plan.docx']);
    expect(req.request.reportProgress).toBeTrue();
    req.flush({ success: true, data: { duplicate: false, file: { id: 'f1' } } });
    expect(events.at(-1)).toEqual({ type: 'done', duplicate: false, file: jasmine.objectContaining({ id: 'f1' }) });

    api.upload('class', 'c1', { file, requestId: 'req-87654321', markedAsRubric: true }).subscribe();
    const classReq = http.expectOne(`${base}/classes/c1`);
    expect((classReq.request.body as FormData).get('markedAsRubric')).toBeNull();
    classReq.flush({ success: true, data: { duplicate: true, file: { id: 'f2' } } });
  });

  it('status, remove, rubric draft and apply', async () => {
    const got = api.get('f1');
    http.expectOne(`${base}/f1`).flush({ success: true, data: { file: { id: 'f1', status: 'ready' } } });
    expect((await got).status).toBe('ready');
    const removed = api.remove('f1');
    const del = http.expectOne(`${base}/f1`);
    expect(del.request.method).toBe('DELETE');
    del.flush({ success: true, data: { removed: true, file: { id: 'f1', status: 'removed' } } });
    expect((await removed).status).toBe('removed');
    const draft = api.draftRubric('f1');
    http.expectOne(`${base}/f1/rubric-draft`).flush({ success: true, data: { rubricDesigner: { title: 'R' }, notes: [], hasExistingRubric: true } });
    expect((await draft).hasExistingRubric).toBeTrue();
    const applied = api.applyRubric('f1', { title: 'R' } as unknown as RubricDesigner, true);
    const apply = http.expectOne(`${base}/f1/apply-rubric`);
    expect(apply.request.body).toEqual({ rubricDesigner: { title: 'R' }, replace: true });
    apply.flush({ success: true, data: { applied: true, replaced: true, assignmentId: 'a1' } });
    expect((await applied).replaced).toBeTrue();
  });
});

describe('referenceError', () => {
  const err = (status: number, error: unknown = null) => new HttpErrorResponse({ status, error });
  it('keeps the backend\'s teacher-facing message and code; never an internal error', () => {
    expect(referenceError(err(400, { code: 'REFERENCE_FILE_OLD_POWERPOINT', message: 'Old PowerPoint files (.ppt) are not supported. Please save as .pptx.' })))
      .toEqual({ status: 400, code: 'REFERENCE_FILE_OLD_POWERPOINT', message: 'Old PowerPoint files (.ppt) are not supported. Please save as .pptx.' });
    expect(referenceError(err(503, { code: 'REFERENCE_RUBRIC_AI_UNAVAILABLE', message: 'Rubric conversion is unavailable right now. Please try again in a few minutes.' })).message)
      .toContain('unavailable right now');
    expect(referenceError(err(500, { message: 'TypeError: x is undefined' })).message).toBe('Something went wrong on our side. Please try again.');
    expect(referenceError(err(404, { code: 'NOT_FOUND', message: 'Not found.' }))).toEqual({ status: 404, code: 'NOT_FOUND', message: 'This file could not be found. It may have been removed.' });
    expect(referenceError(err(0)).message).toContain('offline');
    expect(referenceError(new Error('boom')).message).toBe('Something went wrong. Please try again.');
  });
});
