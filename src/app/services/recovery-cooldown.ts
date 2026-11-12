import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';

export const DEFAULT_RECOVERY_COOLDOWN_SECONDS = 120;

/**
 * Countdown after a recovery-link request. It starts after EVERY accepted request with the server's fixed cool-down, whatever the
 * address, so it never hints whether an email exists or was sent. Shared by the guest result page and the recovery portal.
 */
export class RecoveryCooldown {
  readonly remaining = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;
  private until = 0;

  start(seconds: unknown): void {
    const s = typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 && seconds <= 3600 ? Math.ceil(seconds) : DEFAULT_RECOVERY_COOLDOWN_SECONDS;
    this.stop();
    this.until = Date.now() + s * 1000;
    this.tick();
    this.timer = setInterval(() => this.tick(), 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.remaining.set(0);
  }

  get active(): boolean { return this.remaining() > 0; }

  /** "1:05" */
  get label(): string {
    const s = this.remaining();
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  private tick(): void {
    const left = Math.max(0, Math.ceil((this.until - Date.now()) / 1000));
    this.remaining.set(left);
    if (!left) this.stop();
  }
}

/** Shared wording: a guest's email may have been entered by their teacher (uploaded work) or by themselves (QR submission). */
export const RECOVERY_EMAIL_PROMPT = 'Enter the email address your teacher used or you used when submitting.';

/** The honest message for a failed recovery request. Rate limits also start the countdown (Retry-After, else 5 minutes). */
export function recoveryRequestError(error: unknown, cooldown: RecoveryCooldown): string {
  const response = error as HttpErrorResponse;
  if (response?.status === 429) {
    const retryAfter = Number(response.headers?.get?.('Retry-After'));
    cooldown.start(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 300);
    return 'Too many requests. Please wait before asking for another link.';
  }
  if (response?.status === 400) return RECOVERY_EMAIL_PROMPT;
  return 'We could not send your request. Please check your connection and try again.';
}
