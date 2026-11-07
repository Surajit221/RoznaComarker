import { ChangeDetectionStrategy, Component, OnChanges, OnDestroy, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { TeacherRecoveryLinkService } from './teacher-recovery-link.service';
import { RecoveryCooldown } from '../../../services/recovery-cooldown';

export type RecoveryActionState = 'loading' | 'ready' | 'confirming' | 'sending' | 'sent' | 'throttled' | 'failed' | 'unavailable' | 'not_allowed';

/**
 * "Send recovery link" for one guest submission (teacher view). Confirms with the MASKED address, then the server emails a new
 * private link to the address stored on the submission. The teacher never sees the link or the full address here.
 */
@Component({
  selector: 'app-guest-recovery-link-action',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="recovery-action" aria-live="polite">
      @switch (state()) {
        @case ('loading') { <p class="note">Checking recovery link…</p> }
        @case ('unavailable') { <p class="note" data-state="unavailable">{{ unavailableText() }}</p> }
        @case ('not_allowed') { <p class="note" data-state="not_allowed">You cannot send a link for this submission.</p> }
        @case ('confirming') {
          <div class="confirm" role="dialog" aria-modal="false" aria-labelledby="recovery-confirm-text">
            <p id="recovery-confirm-text">Send a new access link to <strong>{{ emailMasked() }}</strong>?</p>
            <p class="note">The student's current links keep working.</p>
            <div class="buttons">
              <button type="button" class="btn-primary" (click)="send()">Send link</button>
              <button type="button" class="btn-info" (click)="cancel()">Cancel</button>
            </div>
          </div>
        }
        @default {
          <button type="button" class="btn-primary" data-action="open"
            [disabled]="state() === 'sending' || cooldown.active" (click)="confirm()">
            {{ state() === 'sending' ? 'Sending…' : cooldown.active ? 'You can send again in ' + cooldown.label : 'Send recovery link' }}
          </button>
          @if (state() === 'sent') { <p class="note" data-state="sent" role="status">Link sent to {{ emailMasked() }}.</p> }
          @if (state() === 'throttled') { <p class="note" data-state="throttled" role="status">{{ message() }}</p> }
          @if (state() === 'failed') { <p class="note error" data-state="failed" role="alert">{{ message() }}</p> }
          @if (lastSentAt()) { <p class="note">Last sent {{ lastSentAt() | date: 'medium' }}</p> }
        }
      }
    </div>
  `,
  styles: [`
    :host { min-width: 0; max-width: 100%; }
    button { min-height: 44px; max-width: 100%; white-space: normal; overflow-wrap: anywhere; }
    .recovery-action { display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .note { font-size: 13px; color: #6b7280; margin: 0; }
    .note.error { color: #b42318; }
    .confirm { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; }
    .buttons { display: flex; gap: 8px; }
  `],
})
export class GuestRecoveryLinkAction implements OnChanges, OnDestroy {
  readonly submissionId = input.required<string>();
  private readonly api = inject(TeacherRecoveryLinkService);
  readonly cooldown = new RecoveryCooldown();
  readonly state = signal<RecoveryActionState>('loading');
  readonly emailMasked = signal<string | null>(null);
  readonly lastSentAt = signal<string | null>(null);
  readonly message = signal('');
  readonly reason = signal<string | null>(null);
  private loadedFor = '';

  ngOnChanges(): void {
    if (this.submissionId() && this.submissionId() !== this.loadedFor) void this.load();
  }

  ngOnDestroy(): void { this.cooldown.stop(); }

  async load(): Promise<void> {
    const id = this.submissionId();
    this.loadedFor = id; this.state.set('loading'); this.cooldown.stop(); this.message.set('');
    try {
      const status = await this.api.status(id);
      if (id !== this.submissionId()) return;
      this.emailMasked.set(status.emailMasked); this.lastSentAt.set(status.lastSentAt); this.reason.set(status.reason);
      this.state.set(status.available ? 'ready' : 'unavailable');
    } catch (error) {
      this.state.set([403, 404].includes((error as HttpErrorResponse)?.status) ? 'not_allowed' : 'failed');
      this.message.set('Could not check the recovery link. Please try again.');
    }
  }

  unavailableText(): string {
    return this.reason() === 'registered' ? 'This student has an account and can sign in to see their work.'
      : this.reason() === 'revoked' ? 'Guest access to this submission was revoked.'
        : 'There is no email address on record for this submission.';
  }

  confirm(): void { if (!this.cooldown.active) this.state.set('confirming'); }
  cancel(): void { this.state.set('ready'); }

  async send(): Promise<void> {
    this.state.set('sending'); this.message.set('');
    try {
      const sent = await this.api.send(this.submissionId());
      this.emailMasked.set(sent.emailMasked); this.lastSentAt.set(sent.lastSentAt);
      this.state.set('sent');
    } catch (error) {
      const response = error as HttpErrorResponse, body = response?.error || {};
      if (body.emailMasked) this.emailMasked.set(body.emailMasked);
      if (response?.status === 429) {
        this.cooldown.start(body.retryAfterSeconds);
        this.message.set(body.message || 'Please wait before sending another link.');
        this.state.set('throttled');
      } else if (response?.status === 409) {
        this.reason.set(body.code === 'REGISTERED_STUDENT' ? 'registered' : body.code === 'GUEST_ACCESS_REVOKED' ? 'revoked' : 'no_email');
        this.state.set('unavailable');
      } else if ([403, 404].includes(response?.status)) {
        this.state.set('not_allowed');
      } else {
        this.message.set(body.message || 'The link could not be sent. Please try again.');
        this.state.set('failed');
      }
    }
  }
}
