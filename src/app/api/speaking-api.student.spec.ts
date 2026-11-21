import { TestBed } from '@angular/core/testing';
import { HttpEventType } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { SpeakingApiService, newRecordingRequestId } from './speaking-api.service';
import { httpTestingProviders, verifyHttpRequestsAfterEach } from '../../testing/standalone-test-providers';

const API = 'http://localhost:5000/api';
const LIMITS = { maxRecordingSeconds: 180, minDurationSeconds: 5, maxFileBytes: 41943040 };

describe('SpeakingApiService (student: status, upload, result, retry)', () => {
  let api: SpeakingApiService, http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...httpTestingProviders] });
    api = TestBed.inject(SpeakingApiService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(verifyHttpRequestsAfterEach);

  it('my status: GET /speaking/:assignmentId/my returns the submission (or null) and the limits', async () => {
    const status = api.getMyStatus('a 1');
    const req = http.expectOne(`${API}/speaking/a%201/my`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: { submission: null, limits: LIMITS } });
    expect(await status).toEqual({ submission: null, limits: LIMITS });
  });

  it('upload: POST /speaking/:assignmentId as multipart field "audio", with the Idempotency-Key header and upload progress', () => {
    const file = new File(['RIFF'], 'recording.wav', { type: 'audio/wav' });
    const events: number[] = [];
    api.uploadRecording('a1', file, 'rec_0123456789abcdef').subscribe(event => events.push(event.type));
    const req = http.expectOne(`${API}/speaking/a1`);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Idempotency-Key')).toBe('rec_0123456789abcdef');
    expect(req.request.reportProgress).toBeTrue();
    const body = req.request.body as FormData;
    expect(body instanceof FormData).toBeTrue();
    expect((body.get('audio') as File).name).toBe('recording.wav');
    req.event({ type: HttpEventType.UploadProgress, loaded: 2, total: 4 });
    req.flush({ success: true, data: { id: 's1' } }, { status: 201, statusText: 'Created' });
    expect(events).toContain(HttpEventType.UploadProgress);
    expect(events).toContain(HttpEventType.Response);
  });

  it('result: GET /speaking/submissions/:id/result; retry: POST .../retry-transcription', async () => {
    const result = api.getResult('s1');
    http.expectOne(`${API}/speaking/submissions/s1/result`).flush({ success: true, data: { submissionId: 's1', state: 'transcribing' } });
    expect((await result).state).toBe('transcribing');
    const retry = api.retryTranscription('s1');
    const req = http.expectOne(`${API}/speaking/submissions/s1/retry-transcription`);
    expect(req.request.method).toBe('POST');
    req.flush({ success: true, data: {} });
    await retry;
  });

  it('a new request id per recording: 16 to 80 letters, digits, - or _ (the backend rule), never repeated', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newRecordingRequestId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^[\w-]{16,80}$/);
  });
});
