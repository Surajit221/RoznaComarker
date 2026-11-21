import { TestBed } from '@angular/core/testing';
import { HttpEventType } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { SpeakingTeacherUploadApiService } from './speaking-teacher-upload-api.service';
import { httpTestingProviders, verifyHttpRequestsAfterEach } from '../../testing/standalone-test-providers';

const BASE = 'http://localhost:5000/api/speaking/assignments/a%201/teacher-uploads';

describe('SpeakingTeacherUploadApiService (stage 9: the essay teacher-upload calls, for recordings)', () => {
  let api: SpeakingTeacherUploadApiService, http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...httpTestingProviders] });
    api = TestBed.inject(SpeakingTeacherUploadApiService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(verifyHttpRequestsAfterEach);

  it('list and check use the speaking teacher-upload routes', async () => {
    const list = api.list('a 1');
    http.expectOne(BASE).flush({ success: true, data: { items: [], credits: { available: 3 } } });
    expect((await list).credits.available).toBe(3);
    const check = api.check('a 1', [{ name: 'Ana', email: 'ana@example.com' }]);
    const req = http.expectOne(`${BASE}/check`);
    expect(req.request.body).toEqual({ students: [{ name: 'Ana', email: 'ana@example.com' }] });
    req.flush({ success: true, data: { students: [], credits: { needed: 1, available: 3 } } });
    await check;
  });

  it('upload: the six text fields, then the recording as "audio"; progress, then the saved item', () => {
    const events: string[] = [];
    api.upload('a 1', { name: 'Ana', email: 'ana@example.com', requestKey: 'k'.repeat(36), batchId: 'batch-1234', mode: 'replace', send: true,
      file: new File([new Uint8Array(4)], 'recording.wav', { type: 'audio/wav' }) }).subscribe(e => events.push(e.type));
    const req = http.expectOne(BASE);
    const body = req.request.body as FormData;
    expect([...body.keys()]).toEqual(['name', 'email', 'requestKey', 'batchId', 'mode', 'send', 'audio']);
    expect(body.get('send')).toBe('true');
    expect((body.get('audio') as File).name).toBe('recording.wav');
    req.event({ type: HttpEventType.UploadProgress, loaded: 2, total: 4 });
    req.flush({ success: true, data: { item: { submissionId: 's1' }, duplicate: false } });
    expect(events).toEqual(['progress', 'done']);
  });

  it('a plain Save sends no "send" field', () => {
    api.upload('a 1', { name: 'Ana', email: 'ana@example.com', requestKey: 'k'.repeat(36), batchId: 'batch-1234', mode: 'new', send: false,
      file: new File([new Uint8Array(4)], 'recording.wav', { type: 'audio/wav' }) }).subscribe();
    const req = http.expectOne(BASE);
    expect((req.request.body as FormData).has('send')).toBeFalse();
    req.flush({ success: true, data: { item: {}, duplicate: false } });
  });

  it('send, resend (with a request id) and retry', async () => {
    const send = api.send('a 1', 's1');
    const sent = http.expectOne(`${BASE}/s1/send`);
    expect(sent.request.body).toEqual({});
    sent.flush({ success: true, data: { item: {}, alreadyRequested: false } });
    await send;
    const resend = api.send('a 1', 's1', { requestId: 'r-1' });
    expect(http.expectOne(`${BASE}/s1/send`).request.body).toEqual({ resend: true, requestId: 'r-1' });
    http.match(`${BASE}/s1/send`).forEach(r => r.flush({}));
    const retry = api.retry('a 1', 's1');
    const r = http.expectOne(`${BASE}/s1/retry`);
    expect(r.request.method).toBe('POST');
    r.flush({ success: true, data: { item: {}, alreadyRequested: true } });
    await retry;
    void resend.catch(() => undefined);
  });
});
