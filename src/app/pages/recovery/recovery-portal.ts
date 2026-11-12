import { Component, DOCUMENT, OnDestroy, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { RECOVERY_EMAIL_PROMPT, RecoveryCooldown, recoveryRequestError } from '../../services/recovery-cooldown';
import { RecoveredAssignment, RecoveryPortalService } from '../../services/recovery-portal.service';

export type PortalState = 'request' | 'loading' | 'invalid' | 'empty' | 'list' | 'error';

/**
 * /recover          ask for a link (email form)
 * /recover/portal   the emailed link: #<token> is read, removed from the address bar BEFORE any request, exchanged once for a
 *                   short read-only session, then all submissions made with that email are listed. Choosing one opens the normal
 *                   guest result page, which uses the portal session and the server's usual visibility rules.
 */
@Component({
  selector: 'app-recovery-portal',
  imports: [FormsModule, DatePipe],
  templateUrl: './recovery-portal.html',
  styleUrls: ['../students/guest-submission/guest-submission.css', './recovery-portal.css'],
})
export class RecoveryPortalPage implements OnInit, OnDestroy {
  private readonly portal = inject(RecoveryPortalService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private referrerMeta: HTMLMetaElement | null = null;

  state: PortalState = 'loading';
  assignments: RecoveredAssignment[] = [];
  email = '';
  requesting = false;
  requestMessage = '';
  requestError = '';
  readonly cooldown = new RecoveryCooldown();
  readonly emailPrompt = RECOVERY_EMAIL_PROMPT;

  async ngOnInit(): Promise<void> {
    this.setNoReferrer();
    if (this.route.snapshot.data['mode'] !== 'portal') { this.state = 'request'; return; }
    const fragment = this.route.snapshot.fragment;
    // Bearer material leaves the address bar and history entry before anything else happens.
    if (fragment !== null) history.replaceState(history.state, '', location.pathname + location.search);
    this.state = 'loading';
    try {
      if (RecoveryPortalService.isToken(fragment)) await this.portal.exchange(fragment);
      else if (fragment !== null || !this.portal.session()) { this.state = 'invalid'; return; }
      await this.load();
    } catch (error) {
      this.state = this.isLinkProblem(error) ? 'invalid' : 'error';
      if (this.state === 'invalid') this.portal.forget();
    }
  }

  ngOnDestroy(): void {
    this.referrerMeta?.remove();
    this.cooldown.stop();
  }

  async load(): Promise<void> {
    this.state = 'loading';
    try {
      this.assignments = await this.portal.listAssignments();
      this.state = this.assignments.length ? 'list' : 'empty';
    } catch (error) {
      if (this.isLinkProblem(error)) { this.portal.forget(); this.state = 'invalid'; }
      else this.state = 'error';
    }
  }

  open(item: RecoveredAssignment): Promise<boolean> {
    return this.router.navigate(['/guest/results', item.id]);
  }

  async requestLink(): Promise<void> {
    const email = this.email.trim();
    this.requestError = ''; this.requestMessage = '';
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { this.requestError = RECOVERY_EMAIL_PROMPT; return; }
    if (this.requesting || this.cooldown.active) return;
    this.requesting = true;
    try {
      // The same answer and countdown for every address: nothing here says whether an email exists or was sent.
      const answer = await this.portal.requestLink(email);
      this.requestMessage = answer.message;
      this.cooldown.start(answer.retryAfterSeconds);
    } catch (error) { this.requestError = recoveryRequestError(error, this.cooldown); }
    finally { this.requesting = false; }
  }

  askForNewLink(): void {
    this.portal.forget();
    this.state = 'request';
  }

  statusLabel(status: RecoveredAssignment['status']): string {
    return status === 'ready' ? 'Feedback ready' : status === 'failed' ? 'Needs attention' : 'Being marked';
  }

  private isLinkProblem(error: unknown): boolean {
    return [401, 403, 404, 410].includes((error as HttpErrorResponse)?.status);
  }

  private setNoReferrer(): void {
    // Nothing on this page may send its address to another site.
    const meta = this.document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    this.document.head.appendChild(meta);
    this.referrerMeta = meta;
  }
}
