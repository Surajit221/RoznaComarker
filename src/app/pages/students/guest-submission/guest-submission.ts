import { GuestSubmissionFeature } from '../../../services/guest-submission-feature.service';
import { SourceFidelityComponent } from '../../../components/source-fidelity/source-fidelity';
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../auth/auth.service';
import { AssignmentQrRedirect } from '../assignment-qr-redirect/assignment-qr-redirect';

@Component({
  selector: 'app-guest-submission',
  imports: [SourceFidelityComponent,CommonModule, FormsModule, RouterLink, AssignmentQrRedirect],
  templateUrl: './guest-submission.html',
  styleUrl: './guest-submission.css',
})
export class GuestSubmissionPage {
  private guestFeature = inject(GuestSubmissionFeature);
  guestUnavailable = false;
  private async guestAvailable(): Promise<boolean> {
    this.guestUnavailable = !(await this.guestFeature.load());
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
  files: File[] = [];
  assignment: any = null;
  result: any = null;
  confirmation: any = null;
  practice: any = null;
  answers: Record<string, string> = {};
  answerResults: Record<string, string> = {};
  draftMessage = '';
  dragging = false;
  get viewingResults(): boolean { return !!this.submissionId; }
  feedbackSections = [{ key: 'strengths', label: 'Strengths' }, { key: 'areasForImprovement', label: 'Areas for improvement' }, { key: 'actionSteps', label: 'Next steps' }];

  async ngOnInit(): Promise<void> {
    this.submissionId = this.route.snapshot.paramMap.get('submissionId') || '';
    if (this.submissionId) {
      this.token = this.route.snapshot.fragment || '';
      // Keep bearer material only in memory. Remove it before API requests or rendering links.
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
      const response = await firstValueFrom(this.http.get<any>(`${this.base}/assignments/${encodeURIComponent(this.qrToken)}`));
      this.assignment = response.data;
    } catch (error: any) {
      if (error?.error?.code === 'GUEST_SUBMISSION_UNAVAILABLE') this.guestUnavailable = true;
      else if (error?.status === 404) {
        await this.router.navigate(['/login'], { queryParams: { returnUrl: this.currentPath } });
      } else this.error = 'Unable to open this assignment. Please try again.';
    } finally { this.loading = false; }
  }
  selectFiles(event: Event): void {
    this.files = Array.from((event.target as HTMLInputElement).files || []);
    this.requestKey = '';
    this.error = this.files.length > 20 ? 'Choose no more than 20 files.' : '';
  }
  dropFiles(event: DragEvent): void {
    event.preventDefault();
    this.dragging = false;
    if (this.busy || !event.dataTransfer?.files.length) return;
    // Presentation adapter: picker and drop use exactly the same selection logic.
    this.selectFiles({ target: { files: event.dataTransfer.files } } as unknown as Event);
  }
  async submit(): Promise<void> {
    if (this.busy || !this.files.length || this.files.length > 20) return;
    if (!this.name.trim() || this.name.trim().length > 120 || !/[^\s@]+@[^\s@]+\.[^\s@]+/.test(this.email.trim()) || this.email.trim().length > 254) {
      this.error = 'Enter your name and a valid email address.';
      return;
    }
    this.busy = true; this.error = '';
    try {
      // Retain the same reference on ambiguous network failures so retry cannot charge twice.
      this.requestKey ||= crypto.randomUUID();
      const body = new FormData();
      body.append('name', this.name.trim()); body.append('email', this.email.trim());
      this.files.forEach(file => body.append('files', file));
      const response = await firstValueFrom(this.http.post<any>(`${this.base}/assignments/${encodeURIComponent(this.qrToken)}/submit`, body,
        { headers: new HttpHeaders({ 'Idempotency-Key': this.requestKey }) }));
      this.confirmation = response.data;
      this.recoveryEmail = this.email;
    } catch (error: any) {
      if (error?.error?.code === 'GUEST_SUBMISSION_UNAVAILABLE') this.guestUnavailable = true;
      this.error = error?.error?.message || 'Submission could not be confirmed. Retry with the same files or recover your return link.';
      if ([400, 422].includes(error?.status)) this.requestKey = '';
    } finally { this.busy = false; }
  }
  async loadResults(): Promise<void> {
    this.loading = true; this.error = '';
    try {
      const response = await firstValueFrom(this.http.get<any>(`${this.base}/submissions/${encodeURIComponent(this.submissionId)}`,
        { headers: new HttpHeaders({ 'X-Guest-Token': this.token }) }));
      this.result = response.data;
    } catch (error: any) {
      if (error?.error?.code === 'GUEST_SUBMISSION_UNAVAILABLE') this.guestUnavailable = true;
      if ([401, 403, 404, 410].includes(error?.status)) {
        this.result = null; this.practice = null;
        this.answers = {}; this.answerResults = {}; this.draftMessage = '';
      }
      this.error = error?.error?.message || 'Unable to load results. Reopen your emailed link and try again.';
    } finally { this.loading = false; }
  }
  async recover(): Promise<void> {
    if (this.recovering) return;
    this.recovering = true;
    try {
      const response = await firstValueFrom(this.http.post<any>(`${this.base}/assignments/${encodeURIComponent(this.qrToken)}/recover`, { email: this.recoveryEmail }));
      this.recoveryMessage = response.data.message;
    } catch { this.recoveryMessage = 'Please wait a few minutes before trying again.'; }
    finally { this.recovering = false; }
  }
  private resultUrl(suffix: string): string { return `${this.base}/submissions/${encodeURIComponent(this.submissionId)}/${suffix}`; }
  private guestHeaders(): HttpHeaders { return new HttpHeaders({ 'X-Guest-Token': this.token }); }
  async downloadPdf(): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.error = '';
    try {
      const blob = await firstValueFrom(this.http.get(this.resultUrl('pdf'), { headers: this.guestHeaders(), responseType: 'blob' }));
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = 'submission-feedback.pdf'; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { this.error = 'The report could not be downloaded. Please try again.'; }
    finally { this.busy = false; }
  }
  async loadPractice(): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.error = '';
    try {
      const response = await firstValueFrom(this.http.post<any>(this.resultUrl('practice'), { retry: true }, { headers: this.guestHeaders() }));
      this.practice = response.data;
    } catch (error: any) { this.error = error?.error?.message || 'Practice is temporarily unavailable.'; }
    finally { this.busy = false; }
  }
  async checkAnswer(activity: any, question: any): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.error = '';
    try {
      const response = await firstValueFrom(this.http.post<any>(this.resultUrl(`practice/${encodeURIComponent(this.practice.session._id)}/${encodeURIComponent(activity.activityId)}`),
        { questionId: question.questionId, response: this.answers[question.questionId], retry: true }, { headers: this.guestHeaders() }));
      const result = response.data?.attempt?.result;
      this.answerResults[question.questionId] = result ? `${result.summary || ''} ${result.nextImprovement || ''}` : 'Your answer is being checked. Please try again shortly.';
    } catch (error: any) { this.error = error?.error?.message || 'Your answer could not be checked.'; }
    finally { this.busy = false; }
  }
  async loadDrafts(): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.error = '';
    try {
      const response = await firstValueFrom(this.http.get<any>(this.resultUrl('drafts'), { headers: this.guestHeaders() }));
      this.draftMessage = response.data.available ? `Score change from previous draft: ${response.data.overall?.delta ?? ''}`
        : response.data.message || 'This submission has no previous assessed draft.';
    } catch (error: any) { this.error = error?.error?.message || 'Draft progress is unavailable.'; }
    finally { this.busy = false; }
  }
}
