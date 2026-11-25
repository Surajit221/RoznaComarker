import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { HttpEventType } from '@angular/common/http';
import { SpeakingCoachApiService, newPracticeRequestId, type CoachClient, type CoachView } from './speaking-coach-api.service';
import { GuestSpeakingAccess } from '../pages/students/guest-speaking/guest-speaking-access';
import { RecoveryPortalService } from '../services/recovery-portal.service';
import { httpTestingProviders } from '../../testing/standalone-test-providers';

const API = 'http://localhost:5000/api';
const VIEW: CoachView = { state: 'idle', session: null };

describe('SpeakingCoachApiService', () => {
  let api: SpeakingCoachApiService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...httpTestingProviders] });
    api = TestBed.inject(SpeakingCoachApiService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  describe('the student client', () => {
    let client: CoachClient;
    beforeEach(() => { client = api.forStudent('sub 1'); });

    it('reads the session; a 404 (the feature switched off, or not the owner) reads as null so the page shows nothing', async () => {
      const first = client.getSession();
      http.expectOne(`${API}/speaking-coach/submissions/sub%201`).flush({ success: true, data: VIEW });
      expect(await first).toEqual(VIEW);
      const hidden = client.getSession();
      http.expectOne(`${API}/speaking-coach/submissions/sub%201`).flush({ success: false, code: 'NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
      expect(await hidden).toBeNull();
    });

    it('starts (no notice for a student) and passes other errors on', async () => {
      const started = client.start();
      const req = http.expectOne(`${API}/speaking-coach/submissions/sub%201/start`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush({ success: true, data: { ...VIEW, state: 'ready' } });
      expect((await started).state).toBe('ready');
      const failing = client.getSession();
      http.expectOne(`${API}/speaking-coach/submissions/sub%201`).flush({ success: false, code: 'X' }, { status: 503, statusText: 'Unavailable' });
      await expectAsync(failing).toBeRejected();
    });

    it('uploads one recording as the "audio" field with its Idempotency-Key and upload progress', () => {
      const events: number[] = [];
      client.uploadAttempt('s1', 't1', new Blob([new Uint8Array(4)], { type: 'audio/webm' }), 'practice.webm', 'prc_abc').subscribe(e => events.push(e.type));
      const req = http.expectOne(`${API}/speaking-coach/sessions/s1/tasks/t1/attempts`);
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('Idempotency-Key')).toBe('prc_abc');
      const body = req.request.body as FormData;
      expect((body.get('audio') as File).name).toBe('practice.webm');
      expect(req.request.reportProgress).toBeTrue();
      req.flush({ success: true, data: {} });
      expect(events).toContain(HttpEventType.Response);
    });

    it('reads and retries an attempt', async () => {
      const read = client.getAttempt('s1', 'a1');
      http.expectOne(`${API}/speaking-coach/sessions/s1/attempts/a1`).flush({ success: true, data: { session: {}, attempt: { id: 'a1' } } });
      expect((await read).attempt.id).toBe('a1');
      const retried = client.retry('s1', 'a1');
      const req = http.expectOne(`${API}/speaking-coach/sessions/s1/attempts/a1/retry`);
      expect(req.request.method).toBe('POST');
      req.flush({ success: true, data: { session: {}, attempt: { id: 'a1' } } });
      await retried;
    });
  });

  describe('the teacher', () => {
    it('reads progress (null on 404) and one task\'s attempt history', async () => {
      const progress = api.getTeacherProgress('sub1');
      http.expectOne(`${API}/speaking-coach/teacher/submissions/sub1/progress`).flush({ success: false }, { status: 404, statusText: 'Not Found' });
      expect(await progress).toBeNull();
      const page = api.getTeacherAttempts('s1', 't2', 2, 10);
      http.expectOne(`${API}/speaking-coach/teacher/sessions/s1/tasks/t2/attempts?page=2&limit=10`).flush({ success: true, data: { attempts: [], pagination: {} } });
      expect((await page).attempts).toEqual([]);
    });
  });

  it('request ids: 16 to 80 letters, digits, - or _', () => {
    const id = newPracticeRequestId();
    expect(id).toMatch(/^[\w-]{16,80}$/);
    expect(newPracticeRequestId()).not.toBe(id);
  });
});

describe('GuestSpeakingAccess coach client', () => {
  let access: GuestSpeakingAccess;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...httpTestingProviders, GuestSpeakingAccess,
      { provide: RecoveryPortalService, useValue: { session: () => null, headers: () => undefined } }] });
    access = TestBed.inject(GuestSpeakingAccess);
    http = TestBed.inject(HttpTestingController);
    access.submissionId = 'g1';
    access.token = 'T'.repeat(43);
  });
  afterEach(() => http.verify());

  it('uses the guest coach routes with the link token; start sends the notice version', async () => {
    const client = access.coachClient();
    const read = client.getSession();
    const get = http.expectOne(`${API}/guest/speaking/submissions/g1/coach`);
    expect(get.request.headers.get('X-Guest-Token')).toBe('T'.repeat(43));
    get.flush({ success: true, data: VIEW });
    await read;
    const started = client.start('speaking-coach-guest-2026-11');
    const post = http.expectOne(`${API}/guest/speaking/submissions/g1/coach/start`);
    expect(post.request.body).toEqual({ noticeVersion: 'speaking-coach-guest-2026-11' });
    post.flush({ success: true, data: VIEW });
    await started;
    client.uploadAttempt('s1', 't1', new Blob([new Uint8Array(4)], { type: 'audio/mp4' }), 'practice.m4a', 'prc_xyz').subscribe();
    const upload = http.expectOne(`${API}/guest/speaking/submissions/g1/coach/sessions/s1/tasks/t1/attempts`);
    expect(upload.request.headers.get('X-Guest-Token')).toBe('T'.repeat(43));
    expect(upload.request.headers.get('Idempotency-Key')).toBe('prc_xyz');
    upload.flush({ success: true, data: {} });
    client.getAttempt('s1', 'a1');
    http.expectOne(`${API}/guest/speaking/submissions/g1/coach/sessions/s1/attempts/a1`).flush({ success: true, data: {} });
    client.retry('s1', 'a1');
    http.expectOne(`${API}/guest/speaking/submissions/g1/coach/sessions/s1/attempts/a1/retry`).flush({ success: true, data: {} });
  });

  it('can practise only with the link (a read-only recovery-portal session cannot)', () => {
    expect(access.canPractise()).toBeTrue();
    access.token = '';
    expect(access.canPractise()).toBeFalse();
  });
});
