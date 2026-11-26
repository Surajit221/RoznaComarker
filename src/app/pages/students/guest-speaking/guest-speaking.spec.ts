// Stage 10b: the guest speaking pages. Upload (reached from the assignment's guest link or QR code): the essay guest page's details and identity
// step, then the versioned notice to accept (required), the recording picker with the 7d checks, progress, fixed messages, UnsavedWork while
// uploading, and a "received" state with the email note. Results (/guest/speaking/<id>#token): the 7e/7f result pieces with fixed status text,
// nothing internal on screen, and the lost-link screen.
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, type TestRequest } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { GuestSpeakingPage } from './guest-speaking';
import { AuthService } from '../../../auth/auth.service';
import { GuestSubmissionFeature } from '../../../services/guest-submission-feature.service';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import { environment } from '../../../../environments/environment';

const API = `${environment.apiUrl}/guest`;
const NOTICE = 'Your recording and its transcript are saved with your submission and shared with your teacher. The audio is sent to a speech-to-text '
  + 'service to create the transcript, and the result is marked with AI to help your teacher. It is kept until your teacher deletes the submission. '
  + 'If you are under 18, ask a parent or guardian before recording.';
const ENTRY = { kind: 'speaking', title: 'Describe your town', instructions: 'Talk for two minutes.', deadline: '2026-12-01T10:00:00.000Z', allowGuestSubmission: true,
  limits: { maxRecordingSeconds: 420, minDurationSeconds: 5, maxFileBytes: 41943040 }, consent: { version: 'speaking-guest-2026-11', text: NOTICE } };
const SUB = 'd'.repeat(24), TOKEN = 'k'.repeat(43);
const wav = () => new File([new Uint8Array(4000)], 'answer.wav', { type: 'audio/wav' });
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

interface Setup { params: Record<string, string>; fragment?: string | null; session?: { state: string; role?: string }; guestsOn?: boolean }
function setup({ params, fragment = null, session = { state: 'anonymous' }, guestsOn = true }: Setup) {
  sessionStorage.clear();
  TestBed.configureTestingModule({ imports: [GuestSpeakingPage], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
    { provide: AuthService, useValue: { ensureQrBackendSession: jasmine.createSpy().and.resolveTo(session), hasFirebaseIdentity: () => false } },
    { provide: GuestSubmissionFeature, useValue: { enabled: () => guestsOn, load: () => Promise.resolve(guestsOn) } },
    { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(params), fragment } } }] });
  if (!jasmine.isSpy(history.replaceState)) spyOn(history, 'replaceState');
  const fixture = TestBed.createComponent(GuestSpeakingPage);
  const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  return { fixture, page: fixture.componentInstance, http: TestBed.inject(HttpTestingController), navigate, root: fixture.nativeElement as HTMLElement };
}
async function render(fixture: ComponentFixture<GuestSpeakingPage>) { await settle(); fixture.detectChanges(); await settle(); fixture.detectChanges(); }

describe('GuestSpeakingPage: upload (guest link / QR)', () => {
  afterEach(() => { TestBed.inject(HttpTestingController).verify(); sessionStorage.clear(); });

  async function opened() {
    const made = setup({ params: { qrToken: 'share-code' } });
    made.fixture.detectChanges();
    await settle();
    made.http.expectOne(`${API}/speaking/assignments/share-code`).flush({ success: true, data: ENTRY });
    await render(made.fixture);
    return made;
  }
  async function toRecording(made: Awaited<ReturnType<typeof opened>>) {
    made.page.name = 'Dee Guest'; made.page.email = 'dee@example.com';
    made.page.continueWithIdentity();
    await render(made.fixture);
  }
  const submitButton = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('[data-submit-recording]')!;

  it('shows the assignment like the essay guest page (badge, title, due date, instructions, name and email); never the essay endpoints', async () => {
    const { root, http } = await opened();
    expect(root.querySelector('.guest-badge')?.textContent?.trim()).toBe('Guest Submission');
    expect(root.querySelector('h1')?.textContent).toContain('Describe your town');
    expect(root.textContent).toContain('Talk for two minutes.');
    expect(root.querySelector('.due-date')).not.toBeNull();
    expect(root.querySelector('#guest-name')).not.toBeNull();
    expect(root.querySelector('#guest-email')).not.toBeNull();
    http.expectNone(r => r.url.includes('/guest/assignments/'));
  });

  it('a signed-in student is sent on as a registered student; nothing is asked of the guest routes', async () => {
    const { page, http } = setup({ params: { qrToken: 'share-code' }, session: { state: 'ready', role: 'student' } });
    await page.ngOnInit();
    expect(page.registered).toBeTrue();
    http.expectNone(r => r.url.includes('/guest/'));
  });

  it('guest submission switched off: the unavailable notice, and no assignment request', async () => {
    const { fixture, http, root } = setup({ params: { qrToken: 'share-code' }, guestsOn: false });
    fixture.detectChanges();
    await render(fixture);
    expect(root.textContent).toContain('Guest submission is temporarily unavailable');
    http.expectNone(r => r.url.includes('/speaking/assignments/'));
  });

  it('a link that is not open to guests: a friendly message with a way to sign in (no dead end, no redirect)', async () => {
    const { fixture, http, root, navigate } = setup({ params: { qrToken: 'share-code' } });
    fixture.detectChanges(); await settle();
    http.expectOne(`${API}/speaking/assignments/share-code`).flush({ success: false, code: 'ASSIGNMENT_UNAVAILABLE', message: 'RAW SERVER TEXT' },
      { status: 404, statusText: 'Not Found' });
    await render(fixture);
    expect(root.textContent).toContain("This assignment isn't open for guest recordings");
    expect(root.querySelector('[data-entry-closed] a[href^="/login"]')).not.toBeNull();
    expect(root.textContent).not.toContain('RAW SERVER TEXT');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('the notice is shown word for word, with the parent or guardian line on its own; upload stays disabled until the box is ticked', async () => {
    const made = await opened();
    await toRecording(made);
    const { root, page, fixture } = made;
    expect(root.querySelector('[data-consent-notice]')?.textContent?.trim()).toBe(NOTICE.replace(' If you are under 18, ask a parent or guardian before recording.', ''));
    expect(root.querySelector('[data-guardian-line]')?.textContent?.trim()).toBe('If you are under 18, ask a parent or guardian before recording.');
    expect(root.querySelector('app-speaking-upload-picker')).not.toBeNull();
    page.onFile(wav()); await render(fixture);
    expect(submitButton(root).disabled).toBeTrue();
    expect(root.querySelector('[data-consent-hint]')?.textContent).toContain('Tick the box to agree before you upload.');
    const box = root.querySelector<HTMLInputElement>('[data-consent]')!;
    box.click(); await render(fixture);
    expect(page.consented).toBeTrue();
    expect(submitButton(root).disabled).toBeFalse();
    page.consented = false;
    await page.submit();
    made.http.expectNone(r => r.url.endsWith('/submit'));
  });

  it('uploads with the consent version, one upload reference and progress; unsaved work while uploading; then "received" with the email note', async () => {
    const made = await opened();
    await toRecording(made);
    const { page, http, root, fixture } = made;
    const unsaved = TestBed.inject(UnsavedWorkRegistry);
    page.onFile(wav()); page.consented = true;
    void page.submit();
    const req = http.expectOne(`${API}/speaking/assignments/share-code/submit`);
    const body = req.request.body as FormData;
    expect(body.get('name')).toBe('Dee Guest');
    expect(body.get('email')).toBe('dee@example.com');
    expect(body.get('consent')).toBe('true');
    expect(body.get('consentVersion')).toBe('speaking-guest-2026-11');
    expect(body.get('audio')).toEqual(jasmine.any(File));
    expect(req.request.headers.get('Idempotency-Key')).toMatch(/^[\w-]{32,128}$/);
    expect(unsaved.has('guest-speaking-upload')).toBeTrue();
    await render(fixture);
    expect(root.querySelector('[role="progressbar"]')).not.toBeNull();
    req.flush({ success: true, data: { received: true, returnUrl: `https://school.example/guest/speaking/${SUB}#${TOKEN}`, emailSent: true, message: 'RAW SERVER TEXT' } });
    await render(fixture);
    expect(unsaved.has('guest-speaking-upload')).toBeFalse();
    const received = root.querySelector('[data-received]')!;
    expect(received.textContent).toContain('Your recording was received');
    expect(received.textContent).toContain('We emailed a private link to dee@example.com');
    expect(received.querySelector('a')?.getAttribute('href')).toBe(`https://school.example/guest/speaking/${SUB}#${TOKEN}`);
    expect(root.textContent).not.toContain('RAW SERVER TEXT');
  });

  it('the email could not be sent: the work is safe, keep the private link', async () => {
    const made = await opened();
    await toRecording(made);
    made.page.onFile(wav()); made.page.consented = true;
    void made.page.submit();
    made.http.expectOne(`${API}/speaking/assignments/share-code/submit`).flush({ success: true, data: { received: true, emailSent: false,
      returnUrl: `https://school.example/guest/speaking/${SUB}#${TOKEN}` } });
    await render(made.fixture);
    expect(made.root.textContent).toContain('Your recording is safe, but the email could not be delivered.');
  });

  it('every refusal is a fixed message (never the server text); the same recording keeps its reference after a lost connection, a new one gets a new one', async () => {
    const made = await opened();
    await toRecording(made);
    const { page, http, fixture, root } = made;
    const file = wav();
    page.onFile(file); page.consented = true;
    const attempt = async (answer: (r: TestRequest) => void) => {
      void page.submit();
      const req = http.expectOne(`${API}/speaking/assignments/share-code/submit`);
      const key = req.request.headers.get('Idempotency-Key');
      answer(req); await render(fixture);
      return key;
    };
    const fail = (status: number, code?: string) => (r: TestRequest) => r.flush({ success: false, message: 'RAW SERVER TEXT', ...(code ? { code } : {}) }, { status, statusText: 'x' });
    const first = await attempt(r => r.error(new ProgressEvent('error'), { status: 0 }));
    expect(page.error).toBe('Upload failed. Check your connection and try again.');
    const second = await attempt(fail(403, 'INSUFFICIENT_ASSESSMENT_CREDITS'));
    expect(second).toBe(first);
    expect(page.error).toBe("Your teacher can't receive recordings right now. Please contact your teacher.");
    await attempt(fail(400, 'SPEAKING_CONSENT_REQUIRED'));
    expect(page.error).toBe('Read the notice and tick the box to agree before you upload.');
    await attempt(fail(422, 'AUDIO_TOO_SHORT'));
    expect(page.error).toContain('shorter than 5 seconds');
    await attempt(fail(400));
    expect(page.error).toBe('Enter your name and a valid email address.');
    expect(root.textContent).not.toContain('RAW SERVER TEXT');
    page.onFile(wav());
    const fresh = await attempt(fail(429, 'AUDIO_UPLOADS_UNAVAILABLE'));
    expect(fresh).not.toBe(first);
    expect(page.error).toBe('Recording uploads are not available right now. Please try again later or ask your teacher.');
  });

  it('"Lost your link?" asks the speaking link route with the email', async () => {
    const made = await opened();
    made.page.recoveryEmail = 'dee@example.com';
    void made.page.recover();
    const req = made.http.expectOne(`${API}/speaking/assignments/share-code/recover`);
    expect(req.request.body).toEqual({ email: 'dee@example.com' });
    req.flush({ success: true, data: { message: 'If this email has a submission, we sent a new link.', retryAfterSeconds: 120 } });
    await render(made.fixture);
    expect(made.page.recoveryMessage).toContain('we sent a new link');
    made.page.recoveryCooldown.stop();
  });
});

describe('GuestSpeakingPage: results (/guest/speaking/<id>)', () => {
  // A ready result also asks for the Speaking Coach; here it answers as switched off (404), so nothing more is shown (its own test is below).
  const coachOff = (http: HttpTestingController) => http.match(r => r.url.endsWith(`/speaking/submissions/${SUB}/coach`))
    .forEach(r => r.flush({ success: false, code: 'NOT_FOUND' }, { status: 404, statusText: 'Not Found' }));
  afterEach(() => { const http = TestBed.inject(HttpTestingController); coachOff(http); http.verify(); sessionStorage.clear(); });
  const READY = { state: 'ready', reason: null, message: 'RAW SERVER TEXT', marksVisible: true, assessedText: 'My town is next to a wide river.',
    fluency: { wordsPerMinute: 120, fillersPer100Words: 2, pausesOverOneSecond: 1, longestPauseSeconds: 1.4, repetitions: 0 }, fillers: [],
    result: { overallScore: 78, maxScore: 100, grade: 'B', criteria: [{ criterionId: 'c1', title: 'Task', level: 'Good', weightPercent: 100, points: 78, comment: 'Clear answer.' }],
      categories: [], summary: 'A clear answer.', strengths: ['Good examples.'], improvements: ['Link ideas.'], actionSteps: [], teacherComments: '', scoreNote: null, assessedAt: null },
    corrections: [], errorCode: 'INSUFFICIENT_ASSESSMENT_CREDITS', offTopicCap: { cap: 50, uncappedScore: 81 } };
  const data = (result: Record<string, unknown>, over: Record<string, unknown> = {}) => ({ kind: 'speaking', title: 'Describe your town', instructions: '', deadline: null,
    name: 'Dee Guest', submittedAt: '2026-11-10T10:00:00.000Z', isLate: false, uploadedByTeacher: false,
    recording: { state: 'ready', durationSeconds: 63, contentType: 'audio/wav', mediaUrl: `/api/guest/speaking/submissions/${SUB}/media` }, result, ...over });

  async function results(answer: Record<string, unknown> | ((r: TestRequest) => void), fragment: string | null = TOKEN) {
    const made = setup({ params: { submissionId: SUB }, fragment });
    made.fixture.detectChanges(); await settle();
    const req = made.http.expectOne(`${API}/speaking/submissions/${SUB}`);
    if (typeof answer === 'function') answer(req); else req.flush({ success: true, data: answer });
    await render(made.fixture);
    return { ...made, req };
  }
  const flushMedia = (http: HttpTestingController) => http.match(r => r.url.endsWith('/media')).forEach(r => r.flush(new Blob([new Uint8Array(10)], { type: 'audio/wav' })));

  it('removes the link token from the address bar and sends it only as X-Guest-Token; the player reads the guest recording route', async () => {
    const { req, http, page } = await results(data(READY));
    expect(history.replaceState).toHaveBeenCalled();
    expect(String((history.replaceState as jasmine.Spy).calls.mostRecent().args[2])).not.toContain(TOKEN);
    expect(req.request.headers.get('X-Guest-Token')).toBe(TOKEN);
    const media = http.expectOne(`${API}/speaking/submissions/${SUB}/media`);
    expect(media.request.headers.get('X-Guest-Token')).toBe(TOKEN);
    expect(media.request.responseType).toBe('blob');
    media.flush(new Blob([new Uint8Array(10)], { type: 'audio/wav' }));
    page.ngOnDestroy();
  });

  it('ready: the transcript, the rubric, fluency and the feedback; nothing internal on screen (no server text, error code or cap)', async () => {
    const { root, http, page } = await results(data(READY));
    flushMedia(http);
    expect(root.querySelector('app-speaking-transcript')).not.toBeNull();
    expect(root.querySelector('app-speaking-result-view')).not.toBeNull();
    expect(root.textContent).toContain('Your recording has been marked.');
    expect(root.textContent).toContain('Clear answer.');
    for (const hidden of ['RAW SERVER TEXT', 'INSUFFICIENT_ASSESSMENT_CREDITS', 'credit', '81']) expect(root.textContent).not.toContain(hidden);
    page.ngOnDestroy();
  });

  it('ready: the Speaking Coach through the guest link (its notice shown); read only with a portal session', async () => {
    const { root, http, page, fixture } = await results(data(READY));
    flushMedia(http);
    const coach = http.expectOne(`${API}/speaking/submissions/${SUB}/coach`);
    expect(coach.request.headers.get('X-Guest-Token')).toBe(TOKEN);
    coach.flush({ success: true, data: { state: 'idle', session: null, notice: { version: 'speaking-coach-guest-2026-11', text: 'PRACTICE NOTICE TEXT', accepted: false } } });
    await render(fixture);
    expect(root.textContent).toContain('Practise your speaking');
    expect(root.textContent).toContain('PRACTICE NOTICE TEXT');
    expect(root.querySelector('input[type="checkbox"]')).not.toBeNull();
    page.ngOnDestroy();

    TestBed.resetTestingModule();
    const portal = setup({ params: { submissionId: SUB }, fragment: null });
    sessionStorage.setItem('comarker:recovery-session', JSON.stringify({ session: 'S'.repeat(43), until: Date.now() + 600000 }));
    portal.fixture.detectChanges(); await settle();
    portal.http.expectOne(`${API}/speaking/submissions/${SUB}`).flush({ success: true, data: data(READY) });
    await render(portal.fixture);
    flushMedia(portal.http);
    portal.http.expectOne(`${API}/speaking/submissions/${SUB}/coach`).flush({ success: true, data: { state: 'idle', session: null,
      notice: { version: 'speaking-coach-guest-2026-11', text: 'PRACTICE NOTICE TEXT', accepted: false } } });
    await render(portal.fixture);
    expect(portal.root.textContent).toContain('Open the private link from your email to practise');
    expect([...portal.root.querySelectorAll('button')].some(b => /Start practice/.test(b.textContent || ''))).toBeFalse();
    portal.page.ngOnDestroy();
  });

  it('still being marked: the guest coach card says practice opens when the result is ready; never for a recording that could not be marked', async () => {
    const assessing = { ...READY, state: 'assessing', assessedText: null, fluency: null, result: null };
    const { root, http, page, fixture } = await results(data(assessing));
    flushMedia(http);
    const coach = http.expectOne(`${API}/speaking/submissions/${SUB}/coach`);
    expect(coach.request.headers.get('X-Guest-Token')).toBe(TOKEN);
    coach.flush({ success: true, data: { state: 'unavailable', session: null, overview: { reason: 'result_not_ready', areas: [] },
      notice: { version: 'speaking-coach-guest-2026-11', text: 'PRACTICE NOTICE TEXT', accepted: false } } });
    await render(fixture);
    expect(root.textContent).toContain('Practice opens when your result is ready.');
    page.ngOnDestroy();

    TestBed.resetTestingModule();
    const failed = await results(data({ ...assessing, state: 'not_enough_speech' }));
    flushMedia(failed.http);
    expect(failed.http.match(r => r.url.endsWith(`/speaking/submissions/${SUB}/coach`)).length).toBe(0);
    expect(failed.root.querySelector('app-speaking-coach')).toBeNull();
    failed.page.ngOnDestroy();
  });

  it('marks hidden by the teacher: no score shown', async () => {
    const hidden = { ...READY, marksVisible: false, result: { ...READY.result, overallScore: undefined, grade: undefined } };
    const { root, http, page } = await results(data(hidden));
    flushMedia(http);
    expect(root.textContent).not.toContain('78');
    page.ngOnDestroy();
  });

  it('each status has its fixed text: transcribing, marking, the teacher will check, not enough speech, not English', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ state: 'transcribing', reason: null }, 'Turning your recording into text…'],
      [{ state: 'assessing', reason: null }, 'Marking your recording…'],
      [{ state: 'awaiting_teacher', reason: null }, 'Your teacher will check this recording.'],
      [{ state: 'not_enough_speech', reason: null, message: 'RAW SERVER TEXT' }, "There wasn't enough speech in this recording to mark it."],
      [{ state: 'not_assessable', reason: 'not_english' }, 'mostly not in English']];
    for (const [result, expected] of cases) {
      TestBed.resetTestingModule();
      const { root, http, page } = await results(data({ ...READY, ...result, result: null, assessedText: null, fluency: null }));
      flushMedia(http);
      expect(root.textContent).toContain(expected);
      expect(root.textContent).not.toContain('RAW SERVER TEXT');
      expect(root.querySelector('app-speaking-result-view')).toBeNull();
      // While the recording is being marked the coach card asks the server (it says when practice opens); never after a recording that failed.
      const coach = http.match(r => r.url.endsWith(`/speaking/submissions/${SUB}/coach`));
      expect(coach.length).toBe(['transcribing', 'assessing', 'awaiting_teacher'].includes(String(result['state'])) ? 1 : 0);
      coachOff(http);
      page.ngOnDestroy();
      http.verify();
    }
  });

  it('no link and no portal session: asks for the emailed link (no request), with the recovery form open', async () => {
    const made = setup({ params: { submissionId: SUB }, fragment: null });
    made.fixture.detectChanges(); await render(made.fixture);
    made.http.expectNone(r => r.url.includes(`/speaking/submissions/${SUB}`));
    expect(made.root.textContent).toContain('Open the private link from your email');
    expect(made.root.querySelector('details.recovery')?.hasAttribute('open')).toBeTrue();
  });

  it('an invalid or expired link: the lost-link screen; the recovery request goes to this submission\'s resend route', async () => {
    const made = await results(r => r.flush({ success: false, code: 'GUEST_LINK_INVALID', message: 'RAW' }, { status: 404, statusText: 'Not Found' }));
    expect(made.root.textContent).toContain('This link has expired or is no longer valid');
    expect(made.root.textContent).not.toContain('RAW');
    made.page.recoveryEmail = 'dee@example.com';
    void made.page.recover();
    made.http.expectOne(`${API}/submissions/${SUB}/recover`).flush({ success: true, data: { message: 'If this email has a submission, we sent a new link.' } });
    await settle();
    made.page.recoveryCooldown.stop();
  });

  it('opened from the recovery portal: the read-only portal session is sent instead of a link token', async () => {
    const made = setup({ params: { submissionId: SUB }, fragment: null });
    sessionStorage.setItem('comarker:recovery-session', JSON.stringify({ session: 'S'.repeat(43), until: Date.now() + 600000 }));
    made.fixture.detectChanges(); await settle();
    const req = made.http.expectOne(`${API}/speaking/submissions/${SUB}`);
    expect(req.request.headers.get('X-Recovery-Session')).toBe('S'.repeat(43));
    expect(req.request.headers.has('X-Guest-Token')).toBeFalse();
    req.flush({ success: true, data: data(READY) });
    await render(made.fixture);
    flushMedia(made.http);
    made.page.ngOnDestroy();
  });
});
