import { DatePipe } from '@angular/common';
import { Component, HostListener, type OnDestroy, type OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom, type Subscription } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../auth/auth.service';
import { GuestSubmissionFeature } from '../../../services/guest-submission-feature.service';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import { PublicBrand } from '../../../shared/public-brand/public-brand';
import { AssignmentQrRedirect } from '../assignment-qr-redirect/assignment-qr-redirect';
import { AnalysisProgress, type ProcessingProgress } from '../../../components/analysis-progress/analysis-progress';
import { SpeakingUploadPicker } from '../../../components/student/speaking-upload-picker/speaking-upload-picker';
import { SpeakingAudioPlayer } from '../../../components/speaking/speaking-audio-player/speaking-audio-player';
import { SpeakingTranscript } from '../../../components/speaking/speaking-transcript/speaking-transcript';
import { SpeakingResultView } from '../../../components/speaking/speaking-result-view/speaking-result-view';
import { newRecordingRequestId, type SpeakingLimits, type SpeakingResult } from '../../../api/speaking-api.service';
import { SPEAKING_GENERIC_MESSAGE, speakingErrorMessage } from '../../../utils/speaking-messages';
import { SPEAKING_POLL_MS, SpeakingPoller, speakingProgress, studentSpeakingStatus } from '../../../utils/speaking-status';
import { RECOVERY_EMAIL_PROMPT, RecoveryCooldown, recoveryRequestError } from '../../../services/recovery-cooldown';
import { GUEST_SPEAKING_PROVIDERS, GuestSpeakingAccess, type GuestSpeakingEntry, type GuestSpeakingView } from './guest-speaking-access';

interface GuestConfirmation { received: boolean; duplicate?: boolean; returnUrl?: string; emailSent?: boolean; }
type Session = Awaited<ReturnType<AuthService['ensureQrBackendSession']>>;

const UNSAVED_KEY = 'guest-speaking-upload';
const UNSAVED_MESSAGE = 'Your recording is still uploading. Leave and cancel the upload?';
const GUARDIAN = 'If you are under 18, ask a parent or guardian before recording.';
const IDENTITY_MESSAGE = 'Enter your name and a valid email address.';

/**
 * Guests on a speaking assignment (stage 10b), built like the essay guest page (guest-submission.ts, unchanged) and with its look (the same
 * stylesheet). Two addresses:
 * - /student/assignments/qr/<token>/speaking (the assignment's guest link and QR code): a signed-in student or teacher is sent on exactly as on
 *   the essay page; a guest gives their name and email, accepts the notice (required; its text and version come from the server), chooses a
 *   recording (the 7d checks), and uploads it with progress. One upload reference per chosen recording, kept when that upload is tried again.
 * - /guest/speaking/<id>#<token> (the emailed link, or the recovery portal): the recording, its status in fixed words, and once marked the 7e/7f
 *   result pieces. The link token leaves the address bar before any request. Every refusal is a fixed message; the server's text is never shown.
 */
@Component({
  selector: 'app-guest-speaking',
  imports: [DatePipe, FormsModule, RouterLink, PublicBrand, AssignmentQrRedirect, AnalysisProgress, SpeakingUploadPicker, SpeakingAudioPlayer,
    SpeakingTranscript, SpeakingResultView],
  providers: [...GUEST_SPEAKING_PROVIDERS],
  templateUrl: './guest-speaking.html',
  styleUrls: ['../guest-submission/guest-submission.css', './guest-speaking.css'],
})
export class GuestSpeakingPage implements OnInit, OnDestroy {
  private readonly access = inject(GuestSpeakingAccess);
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly guestFeature = inject(GuestSubmissionFeature);
  private readonly unsaved = inject(UnsavedWorkRegistry);
  private readonly base = `${environment.apiUrl}/guest`;
  @ViewChild(SpeakingUploadPicker) private picker?: SpeakingUploadPicker;

  submissionId = '';
  qrToken = '';
  currentPath = '';
  registered = false;
  /** A signed-in student who is not a member of this class (the registered QR lookup answered 403), as on the essay guest page. */
  signedInNotMember = false;
  /** That student, when this assignment does not accept guests (or guest submission is off): show the join-class card. */
  membershipRequired = false;
  authResolution: 'RESOLVING' | 'AUTHENTICATED' | 'ANONYMOUS' | 'RECOVERY_FAILED' = 'RESOLVING';
  guestUnavailable = false;
  loading = true;
  /** The guest link does not open (not open to guests, closed, or speaking switched off). */
  entryClosed = false;
  loadError = '';

  // Upload
  assignment: GuestSpeakingEntry | null = null;
  name = '';
  email = '';
  identityEstablished = false;
  consented = false;
  file: File | null = null;
  uploading = false;
  progress: number | null = null;
  error = '';
  confirmation: GuestConfirmation | null = null;
  confirmedEmail = '';
  private requestId: string | null = null;
  private upload$: Subscription | null = null;

  // Results
  view: GuestSpeakingView | null = null;
  linkProblem: 'missing' | 'expired' | null = null;
  private readonly poller = new SpeakingPoller(() => this.refresh());
  private pollStart: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  // Lost link
  recoveryEmail = '';
  recoveryMessage = '';
  recovering = false;
  recoveryError = false;
  readonly recoveryCooldown = new RecoveryCooldown();

  get viewingResults(): boolean { return Boolean(this.submissionId); }
  get showGuestUnavailable(): boolean { return this.guestUnavailable && (this.viewingResults || !this.auth.hasFirebaseIdentity?.()); }
  get limits(): SpeakingLimits | null { return this.assignment?.limits ?? null; }
  /** The notice without its last sentence, which is shown on a line of its own when the notice has it. */
  get noticeText(): string { return (this.assignment?.consent.text ?? '').replace(` ${GUARDIAN}`, '').replace(GUARDIAN, '').trim(); }
  get guardianLine(): string { return this.assignment?.consent.text.includes(GUARDIAN) ? GUARDIAN : ''; }
  get limitsLine(): string {
    const megabytes = Math.round((this.limits?.maxFileBytes ?? 40 * 1024 * 1024) / (1024 * 1024));
    const minutes = Math.max(1, Math.round((this.limits?.maxRecordingSeconds ?? 420) / 60));
    return `MP3, M4A, WebM, Ogg or WAV · Maximum ${megabytes} MB · Up to ${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  get canSubmit(): boolean { return Boolean(this.file) && this.consented && !this.uploading; }
  /** The result with this page's submission id (the shape the 7e/7f pieces read); set once per answer from the server. */
  result: SpeakingResult | null = null;
  get status() { return this.result ? studentSpeakingStatus(this.result) : null; }
  get progressView(): ProcessingProgress { return speakingProgress(this.status ?? { tone: 'progress', message: 'Checking your recording…' }); }
  get durationText(): string {
    const seconds = this.view?.recording.durationSeconds;
    if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '';
    const whole = Math.round(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  }
  get linkHeading(): string {
    return this.linkProblem === 'missing' ? 'Open the private link from your email' : 'This link has expired or is no longer valid';
  }
  get linkText(): string {
    return this.linkProblem === 'missing'
      ? 'This page opens with the private link we emailed you. If you no longer have that email, enter your submission email below and we will send a new link.'
      : `${RECOVERY_EMAIL_PROMPT} We will send you a new link.`;
  }

  async ngOnInit(): Promise<void> {
    this.loading = true; this.loadError = ''; this.entryClosed = false;
    this.submissionId = this.route.snapshot.paramMap.get('submissionId') || '';
    if (this.submissionId) {
      this.access.submissionId = this.submissionId;
      this.access.token = this.access.restoreReturnToken(this.submissionId, this.route.snapshot.fragment);
      // Bearer material leaves the address bar before any request or link is made.
      history.replaceState(history.state, '', location.pathname + location.search);
      this.authResolution = 'ANONYMOUS';
      if (!(await this.guestFeature.load())) { this.guestUnavailable = true; this.loading = false; return; }
      await this.loadView();
      return;
    }
    this.qrToken = this.route.snapshot.paramMap.get('qrToken') || '';
    this.currentPath = `/student/assignments/qr/${encodeURIComponent(this.qrToken)}/speaking`;
    try {
      // As on the essay page: Firebase restoration first, so a signed-in student is never treated as a guest.
      const session = await this.auth.ensureQrBackendSession();
      this.authResolution = session.state === 'anonymous' ? 'ANONYMOUS' : 'AUTHENTICATED';
      if (session.state !== 'anonymous') { await this.routeAuthenticated(session); return; }
      if (!(await this.guestFeature.load())) { this.guestUnavailable = true; return; }
      this.assignment = await this.access.entry(this.qrToken);
    } catch (error) {
      if (this.authResolution === 'RESOLVING') { this.authResolution = 'RECOVERY_FAILED'; return; }
      const response = error as HttpErrorResponse;
      if (response?.error?.code === 'GUEST_SUBMISSION_UNAVAILABLE') this.guestUnavailable = true;
      else if (response?.status === 404) this.entryClosed = true;
      else this.loadError = 'Unable to open this assignment. Please check your connection and try again.';
    } finally { this.loading = false; }
  }

  /** Back to the page (another tab may have signed in), as on the essay page. */
  @HostListener('window:pageshow')
  @HostListener('window:focus')
  async recheckEntrySession(): Promise<void> {
    // A signed-in non-member on the guest fallback stays there: rechecking the session would only send them back to the 403.
    if (this.viewingResults || this.registered || this.signedInNotMember || !this.guestUnavailable || this.loading) return;
    this.guestUnavailable = false;
    await this.ngOnInit();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.poller.stop();
    if (this.pollStart) clearTimeout(this.pollStart);
    this.recoveryCooldown.stop();
    this.upload$?.unsubscribe();
    if (this.uploading) this.unsaved.clear(UNSAVED_KEY);
  }

  /**
   * The registered lookup says this signed-in student is not in the class (as on the essay guest page). If the assignment accepts guests,
   * the guest form opens: the student submits as a guest with the name and email they type (no prefill), and the guest requests carry no
   * bearer token (/api/guest is public in classifyBackendRequest), so the account is never linked or charged. Otherwise a join-the-class card.
   */
  async onNotMember(): Promise<void> {
    this.registered = false; this.signedInNotMember = true; this.membershipRequired = false;
    this.loading = true; this.loadError = ''; this.entryClosed = false;
    try {
      if (!(await this.guestFeature.load())) { this.membershipRequired = true; return; }
      this.assignment = await this.access.entry(this.qrToken);
    } catch (error: unknown) {
      const response = error as HttpErrorResponse;
      if (response?.status === 404 || response?.error?.code === 'GUEST_SUBMISSION_UNAVAILABLE') this.membershipRequired = true;
      else this.loadError = 'Unable to open this assignment. Please check your connection and try again.';
    } finally { this.loading = false; }
  }

  private async routeAuthenticated(session: Session): Promise<void> {
    if (session.state === 'ready') {
      if (session.role === 'student') this.registered = true;
      else await this.router.navigate([session.role === 'teacher' ? '/teacher/my-classes' : '/select-role']);
    } else if (session.state === 'verification') {
      await this.router.navigate(['/verify-email'], { queryParams: { returnUrl: this.currentPath } });
    }
  }

  // ---- Upload ---------------------------------------------------------------------------------------------------------------------
  continueWithIdentity(): void {
    const name = this.name.trim(), email = this.email.trim();
    if (!name || name.length > 120 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { this.error = IDENTITY_MESSAGE; return; }
    this.error = '';
    this.identityEstablished = true;
  }

  onFile(file: File | null): void {
    if (this.uploading) return;
    if (file !== this.file) this.requestId = null;
    this.file = file;
    this.error = '';
    this.progress = null;
  }

  async submit(): Promise<void> {
    if (!this.canSubmit || !this.assignment || !this.file) return;
    this.requestId ??= newRecordingRequestId();
    this.uploading = true; this.error = ''; this.progress = 0;
    this.unsaved.register(UNSAVED_KEY, UNSAVED_MESSAGE);
    const form = new FormData();
    form.append('name', this.name.trim());
    form.append('email', this.email.trim());
    form.append('consent', 'true');
    form.append('consentVersion', this.assignment.consent.version);
    form.append('audio', this.file, this.file.name);
    await new Promise<void>(resolve => {
      this.upload$ = this.http.post<{ success: boolean; data: GuestConfirmation }>(`${this.base}/speaking/assignments/${encodeURIComponent(this.qrToken)}/submit`, form,
        { headers: { 'Idempotency-Key': this.requestId! }, reportProgress: true, observe: 'events' }).subscribe({
        next: event => {
          if (event.type === HttpEventType.UploadProgress) {
            this.progress = event.total ? Math.min(100, Math.max(0, Math.round((100 * event.loaded) / event.total))) : 0;
          } else if (event.type === HttpEventType.Response) {
            this.finishUpload();
            const data = event.body?.success === true ? event.body.data : null;
            if (!data?.received) { this.error = SPEAKING_GENERIC_MESSAGE; this.progress = null; }
            else { this.confirmation = data; this.confirmedEmail = this.email.trim(); this.recoveryEmail = this.confirmedEmail; }
            resolve();
          }
        },
        error: (error: unknown) => {
          this.finishUpload();
          this.progress = null;
          const response = error as HttpErrorResponse;
          if (response?.error?.code === 'GUEST_SUBMISSION_UNAVAILABLE') this.guestUnavailable = true;
          // The identity is checked again by the server; its refusal has no code.
          this.error = response?.status === 400 && !response.error?.code ? IDENTITY_MESSAGE
            : speakingErrorMessage(error, { maxFileBytes: this.limits?.maxFileBytes, maxRecordingSeconds: this.limits?.maxRecordingSeconds });
          // A refused request (bad identity or recording) gets a new reference next time; a lost connection keeps it, so a retry is never saved twice.
          if ([400, 413, 422].includes(response?.status)) this.requestId = null;
          resolve();
        }
      });
    });
  }

  private finishUpload(): void {
    this.uploading = false;
    this.upload$ = null;
    this.unsaved.clear(UNSAVED_KEY);
  }

  /** Another recording through the same link (a new submission, as for essays). */
  uploadAnother(): void {
    this.confirmation = null; this.file = null; this.requestId = null; this.progress = null; this.error = ''; this.consented = false;
    this.picker?.reset();
  }

  // ---- Results --------------------------------------------------------------------------------------------------------------------
  async loadView(): Promise<void> {
    this.loading = true; this.loadError = ''; this.linkProblem = null;
    if (!this.access.hasAccess()) { this.linkProblem = 'missing'; this.loading = false; return; }
    try {
      this.applyView(await this.access.view());
      // Asked again every 10 seconds while it is turned into text or marked (the first answer is the one just read).
      if (!this.status?.final) this.pollStart = setTimeout(() => this.poller.start(), SPEAKING_POLL_MS);
    } catch (error) {
      const response = error as HttpErrorResponse;
      if (response?.error?.code === 'GUEST_SUBMISSION_UNAVAILABLE') this.guestUnavailable = true;
      else if (response?.status === 404 && response.error?.code === 'GUEST_LINK_INVALID') { this.access.forgetReturnToken(); this.linkProblem = 'expired'; }
      else if (response?.status === 404) this.loadError = 'Speaking feedback is not available right now. Please try again later.';
      else this.loadError = 'Unable to load your feedback. Check your connection and try again.';
    } finally { this.loading = false; }
  }

  /** One status check while the recording is turned into text or marked; true when nothing more will change on its own. */
  private async refresh(): Promise<boolean> {
    if (this.destroyed) return true;
    const next = await this.access.view();
    if (this.destroyed) return true;
    this.applyView(next);
    return this.status?.final === true;
  }

  private applyView(view: GuestSpeakingView): void {
    this.view = view;
    this.result = { ...view.result, submissionId: this.submissionId };
  }

  // ---- Lost link ------------------------------------------------------------------------------------------------------------------
  async recover(): Promise<void> {
    if (this.recovering || this.recoveryCooldown.active) return;
    this.recovering = true; this.recoveryError = false;
    try {
      const url = this.submissionId ? `${this.base}/submissions/${encodeURIComponent(this.submissionId)}/recover`
        : `${this.base}/speaking/assignments/${encodeURIComponent(this.qrToken)}/recover`;
      const response = await firstValueFrom(this.http.post<{ data: { message: string; retryAfterSeconds?: number } }>(url, { email: this.recoveryEmail }));
      // The same answer and countdown for every address: nothing here says whether an email exists or was sent.
      this.recoveryMessage = response.data.message;
      this.recoveryCooldown.start(response.data.retryAfterSeconds);
    } catch (error) { this.recoveryMessage = recoveryRequestError(error, this.recoveryCooldown); this.recoveryError = true; }
    finally { this.recovering = false; }
  }
}
