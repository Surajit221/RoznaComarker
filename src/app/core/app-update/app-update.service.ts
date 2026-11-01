import { DestroyRef, Injectable, NgZone, inject, signal } from '@angular/core';
import { GuardsCheckEnd, NavigationError, Router } from '@angular/router';
import { ActivityTracker } from './activity-tracker';
import { UPDATE_ENVIRONMENT } from './update-environment';
import {
  MIN_CHECK_GAP_MS, acquireChunkReload, isBusy, isChunkLoadError, isNewRelease, isReleaseId, nextPollDelay, parseVersionPayload, sameOriginUrl,
} from './app-update.logic';

const APPLY_WAIT_MS = 1000;

/**
 * Keeps open tabs on the latest deployment without ever interrupting work:
 *  - polls version.json (interval, tab focus/visibility, reconnect; backoff on failure; silent on any error),
 *  - when a new release exists, shows a banner and switches to the new version at the next safe moment: a router navigation that
 *    passed its guards, with no request running, no field focused and no navigation state to lose (or when the user clicks Refresh),
 *  - recovers from a missing lazy chunk (old page, new server) with ONE guarded reload.
 * Never clears storage, cookies or caches. Off in dev mode and when the page carries no release id.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  readonly updateAvailable = signal(false);
  readonly dismissed = signal(false);
  readonly waitingToApply = signal(false);

  private readonly env = inject(UPDATE_ENVIRONMENT);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly activity = inject(ActivityTracker);
  private running: string | null = null;
  private failures = 0;
  private lastCheck = 0;
  private checking = false;
  private started = false;
  private pollTimer: unknown = null;
  private applyTimer: unknown = null;
  private readonly cleanups: (() => void)[] = [];

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  start(): void {
    if (this.started || this.env.devMode()) return;
    this.started = true;
    this.running = this.env.runningRelease();
    const routerEvents = this.router.events.subscribe(event => {
      if (event instanceof NavigationError && isChunkLoadError(event.error)) this.recoverFromChunkError(event.url);
      else if (event instanceof GuardsCheckEnd && event.shouldActivate) this.applyOnNavigation(event.urlAfterRedirects);
    });
    this.cleanups.push(() => routerEvents.unsubscribe());
    this.zone.runOutsideAngular(() => {
      this.cleanups.push(this.env.listen('window', 'unhandledrejection', event => {
        if (isChunkLoadError((event as PromiseRejectionEvent).reason)) this.recoverFromChunkError(null);
      }));
      if (!isReleaseId(this.running)) return;   // no release id on this page (for example a build without the stamp): no polling
      const soon = () => this.checkSoon();
      this.cleanups.push(this.env.listen('document', 'visibilitychange', () => { if (this.env.visible()) soon(); }));
      this.cleanups.push(this.env.listen('window', 'focus', soon));
      this.cleanups.push(this.env.listen('window', 'online', () => { this.failures = 0; soon(); }));
      this.schedule(nextPollDelay(0));
    });
  }

  stop(): void {
    this.cleanups.splice(0).forEach(cleanup => cleanup());
    if (this.pollTimer !== null) this.env.clearTimer(this.pollTimer);
    if (this.applyTimer !== null) this.env.clearTimer(this.applyTimer);
    this.pollTimer = this.applyTimer = null;
    this.started = false;
  }

  /** One version check. Never throws; failures only lengthen the next delay. */
  async check(): Promise<void> {
    if (this.checking || this.updateAvailable() || !isReleaseId(this.running)) return;
    this.checking = true;
    this.lastCheck = this.env.now();
    try {
      const published = parseVersionPayload(await this.env.fetchVersion());
      if (!published) throw new Error('invalid');
      this.failures = 0;
      if (isNewRelease(this.running, published)) this.zone.run(() => this.updateAvailable.set(true));
    } catch {
      this.failures++;
    } finally {
      this.checking = false;
      if (!this.updateAvailable() && this.started) this.schedule(nextPollDelay(this.failures));
    }
  }

  busy(): boolean {
    return isBusy({ inFlightRequests: this.activity.inFlight(), editableFocused: this.env.editableFocused() });
  }

  /** Banner "Refresh": reload now, or as soon as running requests (an upload, a submission) have finished. */
  applyNow(): void {
    if (this.activity.inFlight() === 0) { this.env.reload(); return; }
    this.waitingToApply.set(true);
    this.zone.runOutsideAngular(() => this.waitThenReload());
  }

  dismiss(): void { this.dismissed.set(true); }

  private waitThenReload(): void {
    this.applyTimer = this.env.setTimer(() => {
      this.applyTimer = null;
      if (this.activity.inFlight() === 0) this.env.reload(); else this.waitThenReload();
    }, APPLY_WAIT_MS);
  }

  private schedule(ms: number): void {
    if (this.pollTimer !== null) this.env.clearTimer(this.pollTimer);
    this.pollTimer = this.env.setTimer(() => { this.pollTimer = null; void this.check(); }, ms);
  }

  private checkSoon(): void {
    if (this.env.now() - this.lastCheck >= MIN_CHECK_GAP_MS) void this.check();
  }

  /** The user is leaving the current page anyway: load the destination fresh instead of navigating inside the old version. */
  private applyOnNavigation(url: string): void {
    if (!this.updateAvailable() || this.busy()) return;
    // Pages that pass data through navigation state (results pages, verification notices) would lose it on a full load.
    if (this.router.getCurrentNavigation()?.extras?.state) return;
    const target = sameOriginUrl(url, this.env.origin());
    if (target) this.env.assign(target);
  }

  /** An old page asked for a chunk the new deployment no longer has. One reload fetches fresh assets; the guard prevents a loop. */
  private recoverFromChunkError(url: string | null): void {
    if (!this.busy() && acquireChunkReload(this.env.session(), this.env.now())) {
      const target = url === null ? null : sameOriginUrl(url, this.env.origin());
      if (target) this.env.assign(target); else this.env.reload();
      return;
    }
    // Busy, or a reload already happened recently: never reload again automatically. Offer the banner instead.
    this.zone.run(() => { this.dismissed.set(false); this.updateAvailable.set(true); });
  }
}
