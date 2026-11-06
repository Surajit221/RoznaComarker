import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AppUpdateService } from './app-update.service';
import { ActivityTracker } from './activity-tracker';
import { UPDATE_ENVIRONMENT, UpdateEnvironment } from './update-environment';
import { KeyValueStore, POLL_INTERVAL_MS } from './app-update.logic';
import { UnsavedWorkRegistry } from './unsaved-work';
import { UpdateBanner } from './update-banner';

@Component({ template: '' }) class PageA {}
@Component({ template: '' }) class PageB {}
const RUNNING = 'a'.repeat(24), NEXT = 'b'.repeat(24), ORIGIN = 'https://app.example';

class FakeEnvironment implements UpdateEnvironment {
  dev = false; release: string | null = RUNNING; published: unknown = { releaseId: RUNNING }; fetchFails = false; focused = false;
  fetches = 0; reloads = 0; assigned: string[] = []; clock = 1_000_000;
  timers: { callback: () => void; ms: number; cleared: boolean }[] = [];
  listeners: { target: string; type: string; handler: (e: Event) => void }[] = [];
  store = new Map<string, string>();
  session(): KeyValueStore { return { getItem: k => this.store.get(k) ?? null, setItem: (k, v) => { this.store.set(k, v); } }; }
  devMode() { return this.dev; }
  runningRelease() { return this.release; }
  async fetchVersion() { this.fetches++; if (this.fetchFails) throw new Error('offline'); return this.published; }
  origin() { return ORIGIN; }
  reload() { this.reloads++; }
  assign(url: string) { this.assigned.push(url); }
  editableFocused() { return this.focused; }
  visible() { return true; }
  now() { return this.clock; }
  setTimer(callback: () => void, ms: number) { const t = { callback, ms, cleared: false }; this.timers.push(t); return t; }
  clearTimer(handle: unknown) { (handle as { cleared: boolean }).cleared = true; }
  listen(target: 'window' | 'document', type: string, handler: (e: Event) => void) {
    const entry = { target, type, handler }; this.listeners.push(entry);
    return () => { this.listeners = this.listeners.filter(l => l !== entry); };
  }
  pending() { return this.timers.filter(t => !t.cleared); }
  async runNextTimer() { const t = this.pending()[0]; t.cleared = true; t.callback(); await Promise.resolve(); await Promise.resolve(); }
  fire(type: string, event: Event = new Event(type)) { this.listeners.filter(l => l.type === type).forEach(l => l.handler(event)); }
}

function setup(configure: (env: FakeEnvironment) => void = () => undefined) {
  const env = new FakeEnvironment(); configure(env);
  TestBed.configureTestingModule({ providers: [
    provideRouter([
      { path: 'a', component: PageA },
      { path: 'b', component: PageB },
      { path: 'lazy', loadComponent: () => Promise.reject(new TypeError('Failed to fetch dynamically imported module: https://app.example/chunk-OLD.js')) },
    ]),
    { provide: UPDATE_ENVIRONMENT, useValue: env },
  ] });
  const service = TestBed.inject(AppUpdateService), router = TestBed.inject(Router), activity = TestBed.inject(ActivityTracker);
  return { env, service, router, activity };
}
async function publishNewRelease(env: FakeEnvironment, service: AppUpdateService) {
  env.published = { releaseId: NEXT };
  await service.check();
  expect(service.updateAvailable()).toBeTrue();
}

describe('AppUpdateService', () => {
  afterEach(() => TestBed.inject(AppUpdateService).stop());

  it('does nothing in dev mode: no polling, no listeners', () => {
    const { env, service } = setup(e => { e.dev = true; });
    service.start();
    expect(env.timers.length).toBe(0);
    expect(env.listeners.length).toBe(0);
  });

  it('does not poll when the page carries no release id, but still listens for chunk errors', () => {
    const { env, service } = setup(e => { e.release = null; });
    service.start();
    expect(env.timers.length).toBe(0);
    expect(env.listeners.map(l => l.type)).toEqual(['unhandledrejection']);
  });

  it('polls on an interval; the same release keeps polling quietly; a new release shows the update', async () => {
    const { env, service } = setup();
    service.start();
    expect(env.pending()[0].ms).toBe(POLL_INTERVAL_MS);
    await env.runNextTimer();
    expect(env.fetches).toBe(1);
    expect(service.updateAvailable()).toBeFalse();
    env.published = { releaseId: NEXT };
    await env.runNextTimer();
    expect(service.updateAvailable()).toBeTrue();
    expect(env.pending().length).toBe(0);              // known: no more polling
    expect(env.reloads + env.assigned.length).toBe(0); // and never a forced reload
  });

  it('fails silently with backoff (offline, bad JSON), then checks on reconnect', async () => {
    const { env, service } = setup(e => { e.fetchFails = true; });
    service.start();
    await env.runNextTimer();
    expect(env.pending()[0].ms).toBe(POLL_INTERVAL_MS * 2);
    await env.runNextTimer();
    expect(env.pending()[0].ms).toBe(POLL_INTERVAL_MS * 4);
    env.fetchFails = false; env.published = '<!doctype html>';  // a 404 page served as text
    await env.runNextTimer();
    expect(service.updateAvailable()).toBeFalse();
    env.published = { releaseId: NEXT }; env.clock += 120_000;
    env.fire('online');
    await Promise.resolve(); await Promise.resolve();
    expect(service.updateAvailable()).toBeTrue();
  });

  it('checks on focus, but not more than once a minute', async () => {
    const { env, service } = setup();
    service.start();
    env.fire('focus'); await Promise.resolve();
    env.fire('focus'); await Promise.resolve();
    expect(env.fetches).toBe(1);
  });

  it('applies a new release at the next navigation when nothing is running', async () => {
    const { env, service, router } = setup();
    service.start();
    await router.navigateByUrl('/a');
    await publishNewRelease(env, service);
    await router.navigateByUrl('/b?tab=2');
    expect(env.assigned).toEqual([`${ORIGIN}/b?tab=2`]);
  });

  it('never auto-reloads while a request (upload, submission) is running', async () => {
    const { env, service, router, activity } = setup();
    service.start();
    await publishNewRelease(env, service);
    activity.start();
    await router.navigateByUrl('/b');
    expect(env.assigned).toEqual([]);
    expect(env.reloads).toBe(0);
  });

  it('never auto-reloads while the user is typing in a field', async () => {
    const { env, service, router } = setup();
    service.start();
    await publishNewRelease(env, service);
    env.focused = true;
    await router.navigateByUrl('/b');
    expect(env.assigned).toEqual([]);
  });

  it('never auto-reloads a navigation that carries state (it would be lost)', async () => {
    const { env, service, router } = setup();
    service.start();
    await publishNewRelease(env, service);
    await router.navigateByUrl('/b', { state: { result: 1 } });
    expect(env.assigned).toEqual([]);
  });

  it('Refresh waits for running requests, then reloads once', async () => {
    const { env, service, activity } = setup();
    service.start();
    await publishNewRelease(env, service);
    activity.start();
    service.applyNow();
    expect(service.waitingToApply()).toBeTrue();
    await env.runNextTimer();
    expect(env.reloads).toBe(0);
    activity.end();
    await env.runNextTimer();
    expect(env.reloads).toBe(1);
  });

  it('a chunk-load error reloads the target page once, and never twice', async () => {
    const { env, service, router } = setup();
    service.start();
    await router.navigateByUrl('/lazy').catch(() => undefined);
    expect(env.assigned).toEqual([`${ORIGIN}/lazy`]);
    // The reloaded page hits the same error (same session storage): no second reload, the banner instead.
    await router.navigateByUrl('/lazy').catch(() => undefined);
    expect(env.assigned.length).toBe(1);
    expect(env.reloads).toBe(0);
    expect(service.updateAvailable()).toBeTrue();
  });

  it('a chunk-load error while busy shows the banner instead of reloading', async () => {
    const { env, service, router, activity } = setup();
    service.start();
    activity.start();
    await router.navigateByUrl('/lazy').catch(() => undefined);
    expect(env.assigned).toEqual([]);
    expect(service.updateAvailable()).toBeTrue();
  });

  it('an unhandled chunk rejection outside the router reloads once', () => {
    const { env, service } = setup();
    service.start();
    const event = Object.assign(new Event('unhandledrejection'), { reason: new TypeError('Importing a module script failed.') });
    env.fire('unhandledrejection', event);
    env.fire('unhandledrejection', event);
    expect(env.reloads).toBe(1);
  });

  it('never clears storage when reloading', async () => {
    const { env, service, router } = setup();
    env.store.set('authToken', 'keep-me');
    service.start();
    await router.navigateByUrl('/lazy').catch(() => undefined);
    expect(env.store.get('authToken')).toBe('keep-me');
  });

  describe('unsaved work (a dirty form, focused or not)', () => {
    afterEach(() => TestBed.inject(UnsavedWorkRegistry).clear('form'));

    it('counts as busy although no field is focused', () => {
      const { service } = setup();
      const registry = TestBed.inject(UnsavedWorkRegistry);
      expect(service.busy()).toBeFalse();
      registry.register('form');
      expect(service.busy()).toBeTrue();
      registry.clear('form');
      expect(service.busy()).toBeFalse();
    });

    it('a navigation does not apply the update while a form is dirty', async () => {
      const { env, service, router } = setup();
      service.start();
      await publishNewRelease(env, service);
      TestBed.inject(UnsavedWorkRegistry).register('form');
      await router.navigateByUrl('/a');
      expect(env.assigned).toEqual([]);
      expect(env.reloads).toBe(0);
    });

    it('Refresh waits for the form to be saved or discarded, then reloads once', async () => {
      const { env, service } = setup();
      service.start();
      await publishNewRelease(env, service);
      const registry = TestBed.inject(UnsavedWorkRegistry);
      registry.register('form');
      service.applyNow();
      expect(env.reloads).toBe(0);
      expect(service.waitingToApply()).toBeTrue();
      await env.runNextTimer();
      expect(env.reloads).toBe(0);
      registry.clear('form');
      await env.runNextTimer();
      expect(env.reloads).toBe(1);
    });

    it('a chunk-load error while a form is dirty shows the banner instead of reloading', async () => {
      const { env, service, router } = setup();
      service.start();
      TestBed.inject(UnsavedWorkRegistry).register('form');
      await router.navigateByUrl('/lazy').catch(() => undefined);
      expect(env.reloads + env.assigned.length).toBe(0);
      expect(service.updateAvailable()).toBeTrue();
    });

    it('after the user agrees to discard on leaving, the next navigation applies the update', async () => {
      const { env, service, router } = setup();
      service.start();
      await publishNewRelease(env, service);
      const registry = TestBed.inject(UnsavedWorkRegistry);
      registry.register('form');
      spyOn(window, 'confirm').and.returnValue(true);
      expect(registry.confirmLeave()).toBeTrue();
      await router.navigateByUrl('/a');
      expect(env.assigned).toEqual([ORIGIN + '/a']);
    });

    it('the banner says "Updating when you finish" and offers no Refresh while a form is dirty; it offers Refresh again afterwards', async () => {
      const { env, service } = setup();
      service.start();
      await publishNewRelease(env, service);
      const registry = TestBed.inject(UnsavedWorkRegistry);
      registry.register('form');
      const fixture = TestBed.createComponent(UpdateBanner);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('Updating when you finish');
      expect([...el.querySelectorAll('button')].some(b => b.textContent?.includes('Refresh'))).toBeFalse();
      expect(env.reloads).toBe(0);
      registry.clear('form');
      fixture.detectChanges();
      expect(el.textContent).toContain('A new version is available');
      expect([...el.querySelectorAll('button')].some(b => b.textContent?.includes('Refresh'))).toBeTrue();
    });
  });
});
