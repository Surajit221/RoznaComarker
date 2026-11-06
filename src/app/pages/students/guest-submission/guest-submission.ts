import { GuestSubmissionFeature } from '../../../services/guest-submission-feature.service';
import { CommonModule } from '@angular/common';
import { Component, HostListener, inject, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../auth/auth.service';
import { AssignmentQrRedirect } from '../assignment-qr-redirect/assignment-qr-redirect';
import { UploadEssayForm } from '../my-class-student-pages/detail-my-class-student-pages/upload-essay-form/upload-essay-form';
import { MySubmissionPage } from '../my-class-student-pages/detail-my-class-student-pages/my-submission-page/my-submission-page';
import { GUEST_STUDENT_PROVIDERS, GuestStudentAccess } from '../../../services/guest-student-access.service';
import { ImagePreflightService } from '../../../services/image-preflight.service';
import { CanonicalSubmissionResultCoordinator } from '../../../services/canonical-submission-result-coordinator.service';
import { RecoveryCooldown, recoveryRequestError } from '../../../services/recovery-cooldown';

interface GuestAssignment { title: string; instructions?: string; deadline?: string; [key: string]: unknown; }
interface GuestConfirmation { received: boolean; duplicate?: boolean; message?: string; returnUrl?: string; emailSent?: boolean; }
interface Response<T> { data: T; }

@Component({
  selector: 'app-guest-submission',
  imports: [CommonModule, FormsModule, RouterLink, AssignmentQrRedirect, UploadEssayForm, MySubmissionPage],
  providers: [...GUEST_STUDENT_PROVIDERS, ImagePreflightService, CanonicalSubmissionResultCoordinator],
  templateUrl: './guest-submission.html',
  styleUrl: './guest-submission.css',
})
export class GuestSubmissionPage implements OnInit, OnDestroy {
  readonly access = inject(GuestStudentAccess);
  identityEstablished = false;
  uploadReady = false;
  revising = false;
  continueWithIdentity(): void {
    if (!this.name.trim() || this.name.trim().length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim())) {
      this.error = 'Enter your name and a valid email address.'; return;
    }
    this.error = '';
    Object.assign(this.access, { name: this.name.trim(), email: this.email.trim(), qrToken: this.qrToken });
    this.identityEstablished = true;
  }
  onUploadFiles(files: File[]): void {
    this.files = files;
    this.requestKey = '';
    this.access.requestKey = '';
  }
  private guestFeature = inject(GuestSubmissionFeature);
  guestUnavailable = false;
  authResolution: 'RESOLVING' | 'AUTHENTICATED' | 'ANONYMOUS' | 'RECOVERY_FAILED' = 'RESOLVING';
  get showGuestUnavailable(): boolean {
    return this.guestUnavailable && (this.viewingResults || !this.auth.hasFirebaseIdentity?.());
  }
  @HostListener('window:pageshow')
  @HostListener('window:focus')
  @HostListener('window:storage')
  async recheckEntrySession(): Promise<void> {
    if (this.viewingResults || this.registered || !this.guestUnavailable || this.loading) return;
    this.guestUnavailable = false; this.loading = true; this.error = '';
    try { await this.guestAvailable(); }
    catch { this.authResolution = 'RECOVERY_FAILED'; this.error = 'Your sign-in session could not be restored. Please retry.'; }
    finally { this.loading = false; }
  }
  private async guestAvailable(): Promise<boolean> {
    const enabled = await this.guestFeature.load();
    // Auth can change in another tab while the feature request is in flight.
    // Return-link routes are capability routes and deliberately remain separate.
    if (!this.submissionId) {
      this.authResolution = 'RESOLVING';
      const session = await this.auth.ensureQrBackendSession();
      this.authResolution = session.state === 'anonymous' ? 'ANONYMOUS' : 'AUTHENTICATED';
      if (session.state !== 'anonymous') {
        await this.routeAuthenticated(session);
        return false;
      }
    }
    this.guestUnavailable = !enabled;
    if (this.guestUnavailable) this.loading = false;
    return !this.guestUnavailable;
  }
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);
  private base = `${environment.apiUrl}/guest`;
  private token = '';
  private submissionId = '';
  private requestKey = '';
  qrToken = '';
  currentPath = '';
  registered = false;
  loading = true;
  busy = false;
  error = '';
  name = '';
  email = '';
  recoveryEmail = '';
  recoveryMessage = '';
  recovering = false;
  recoveryError = false;
  /** Why a result link cannot be shown: no link at all, an expired/revoked link, or a closed assignment/class. */
  linkProblem: 'missing' | 'expired' | 'closed' | null = null;
  readonly recoveryCooldown = new RecoveryCooldown();
  files: File[] = [];
  assignment: GuestAssignment | null = null;
  result: { title?: string; [key: string]: unknown } | null = null;
  confirmation: GuestConfirmation | null = null;
  get viewingResults(): boolean { return !!this.submissionId; }

  private async routeAuthenticated(session: Awaited<ReturnType<AuthService['ensureQrBackendSession']>>): Promise<void> {
    this.guestUnavailable = false;
    if (session.state === 'ready') {
      if (session.role === 'student') this.registered = true;
      else await this.router.navigate([session.role === 'teacher' ? '/teacher/my-classes' : '/select-role']);
    } else if (session.state === 'verification') {
      await this.router.navigate(['/verify-email'], { queryParams: { returnUrl: this.currentPath } });
    }
  }

  async ngOnInit(): Promise<void> {
    this.loading = true; this.authResolution = 'RESOLVING'; this.error = '';
    this.access.onRevisionRequested = () => { void this.openRevision(); };
    this.submissionId = this.route.snapshot.paramMap.get('submissionId') || '';
    if (this.submissionId) {
      this.token = this.access.restoreReturnToken(this.submissionId, this.route.snapshot.fragment);
      // Remove bearer material before API requests or rendering links. The tab keeps the link
      // (sessionStorage, this tab only) so a refresh or a reopened tab still works; the emailed link remains authoritative.
      history.replaceState(history.state, '', location.pathname + location.search);
      if (!(await this.guestAvailable())) return;
      await this.loadResults();
      return;
    }
    this.qrToken = this.route.snapshot.paramMap.get('qrToken') || '';
    this.currentPath = `/student/assignments/qr/${encodeURIComponent(this.qrToken)}`;
    try {
      // Preserve Firebase restoration, including Safari, before deciding anonymous access.
      const session = await this.auth.ensureQrBackendSession();
      this.authResolution = session.state === 'anonymous' ? 'ANONYMOUS' : 'AUTHENTICATED';
      if (session.state === 'ready') {
        if (session.role === 'student') { this.registered = true; return; }
        await this.router.navigate([session.role === 'teacher' ? '/teacher/my-classes' : '/select-role']);
        return;
      }
      if (session.state === 'verification') {
        await this.router.navigate(['/verify-email'], { queryParams: { returnUrl: this.currentPath } });
        return;
      }
      if (!(await this.guestAvailable())) return;
      const response = await firstValueFrom(this.http.get<Response<GuestAssignment>>(`${this.base}/assignments/${encodeURIComponent(this.qrToken)}`));
      this.assignment = response.data;
    } catch (error: unknown) {
      if (this.authResolution === 'RESOLVING') this.authResolution = 'RECOVERY_FAILED';
      if ((error as HttpErrorResponse)?.error?.code === 'GUEST_SUBMISSION_UNAVAILABLE') {
        try { await this.guestAvailable(); }
        catch { this.authResolution = 'RECOVERY_FAILED'; this.error = 'Your sign-in session could not be restored. Please retry.'; }
      }
      else if ((error as HttpErrorResponse)?.status === 404) {
        await this.router.navigate(['/login'], { queryParams: { returnUrl: this.currentPath } });
      } else this.error = 'Unable to open this assignment. Please try again.';
    } finally { this.loading = false; }
  }
  private async openRevision(): Promise<void> {
    const presentation = await this.access.presentation();
    this.assignment = { ...presentation.assignment };
    this.result = null; this.confirmation = null;
    this.revising = true; this.identityEstablished = true;
    this.files = []; this.uploadReady = false; this.requestKey = ''; this.access.requestKey = '';
  }
  async submit(): Promise<void> {
    if (this.busy || !this.files.length || this.files.length > 20) return;
    if (!this.revising && (!this.name.trim() || this.name.trim().length > 120 || !/[^\s@]+@[^\s@]+\.[^\s@]+/.test(this.email.trim()) || this.email.trim().length > 254)) {
      this.error = 'Enter your name and a valid email address.';
      return;
    }
    this.busy = true; this.error = '';
    try {
      // Retain the same reference on ambiguous network failures so retry cannot charge twice.
      this.requestKey ||= this.access.requestKey || crypto.randomUUID();
      const body = new FormData();
      body.append('name', this.name.trim()); body.append('email', this.email.trim());
      this.files.forEach(file => body.append('files', file));
      const url = this.revising ? this.access.url('revise') : `${this.base}/assignments/${encodeURIComponent(this.qrToken)}/submit`;
      const response = await firstValueFrom(this.http.post<Response<GuestConfirmation>>(url, body,
        { headers: (this.revising ? this.access.headers : new HttpHeaders()).set('Idempotency-Key', this.requestKey) }));
      this.confirmation = response.data;
      this.recoveryEmail = this.email;
    } catch (error: unknown) {
      if ((error as HttpErrorResponse)?.error?.code === 'GUEST_SUBMISSION_UNAVAILABLE') this.guestUnavailable = true;
      this.error = (error as HttpErrorResponse)?.error?.message || 'Submission could not be confirmed. Retry with the same files or recover your return link.';
      if ([400, 422].includes((error as HttpErrorResponse)?.status)) this.requestKey = '';
    } finally { this.busy = false; }
  }
  /**
   * "Open your results" on the confirmation. After ANOTHER draft the guest is already on this submission's results page, and the address bar
   * no longer holds the #token (removed on load), so the link would only add a fragment to the same page: the browser makes a same-document
   * jump that neither reloads nor routes, and nothing happens. In that case the results are reloaded here instead. Any other case (a first
   * submission on the QR page, another submission or origin) follows the link as before.
   */
  async openResults(event: Event): Promise<void> {
    const href = this.confirmation?.returnUrl;
    if (!href || !this.viewingResults) return;
    let target: URL;
    try { target = new URL(href, location.href); } catch { return; }
    if (target.origin !== location.origin || target.pathname !== location.pathname) return;
    event.preventDefault();
    this.confirmation = null; this.revising = false; this.assignment = null;
    this.files = []; this.uploadReady = false; this.requestKey = ''; this.access.requestKey = '';
    await this.loadResults();
  }
  async loadResults(): Promise<void> {
    this.loading = true; this.error = ''; this.linkProblem = null;
    Object.assign(this.access, { submissionId: this.submissionId, token: this.token });
    // No link token and no recovery-portal session: nothing can open this page, so ask for the link instead of
    // sending a request that can only fail (the server would answer 410 exactly as before).
    if (!this.access.hasAccess()) { this.result = null; this.linkProblem = 'missing'; this.loading = false; return; }
    try {
      const presentation = await this.access.presentation(true);
      this.result = { title: presentation.assignment.title };
    } catch (error: unknown) {
      const response = error as HttpErrorResponse;
      if (response?.error?.code === 'GUEST_SUBMISSION_UNAVAILABLE') this.guestUnavailable = true;
      else if ([401, 403, 404, 410].includes(response?.status)) {
        this.result = null;
        this.access.forgetReturnToken();
        // 404: the assignment or class is no longer open; the link itself may be fine. Otherwise the link is expired or revoked.
        this.linkProblem = response.status === 404 ? 'closed' : 'expired';
      }
      if (!this.linkProblem) this.error = response?.error?.message || 'Unable to load results. Reopen your emailed link and try again.';
    } finally { this.loading = false; }
  }
  get linkHeading(): string {
    return this.linkProblem === 'missing' ? 'Open the private link from your email'
      : this.linkProblem === 'closed' ? 'This assignment is no longer available' : 'This link has expired or is no longer valid';
  }
  get linkText(): string {
    return this.linkProblem === 'missing' ? 'This page opens with the private link we emailed you. If you no longer have that email, enter your submission email below and we will send a new link.'
      : this.linkProblem === 'closed' ? 'Your teacher has closed this assignment or class, so its results can no longer be opened here. Please contact your teacher.'
        : 'Enter the email address you used when submitting, and we will send you a new link.';
  }
  async recover(): Promise<void> {
    if (this.recovering || this.recoveryCooldown.active) return;
    this.recovering = true; this.recoveryError = false;
    try {
      const recoveryUrl = this.submissionId ? `${this.base}/submissions/${encodeURIComponent(this.submissionId)}/recover`
        : `${this.base}/assignments/${encodeURIComponent(this.qrToken)}/recover`;
      const response = await firstValueFrom(this.http.post<Response<{ message: string; retryAfterSeconds?: number }>>(recoveryUrl, { email: this.recoveryEmail }));
      // The same answer and countdown for every address: nothing here says whether an email exists or was sent.
      this.recoveryMessage = response.data.message;
      this.recoveryCooldown.start(response.data.retryAfterSeconds);
    } catch (error) { this.recoveryMessage = recoveryRequestError(error, this.recoveryCooldown); this.recoveryError = true; }
    finally { this.recovering = false; }
  }
  ngOnDestroy(): void { this.recoveryCooldown.stop(); }
}
