import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { UnsavedWorkRegistry, unsavedWorkGuard } from './unsaved-work';

@Component({ template: '' }) class PageA {}
@Component({ template: '' }) class PageB {}

describe('UnsavedWorkRegistry', () => {
  let registry: UnsavedWorkRegistry;
  beforeEach(() => { registry = TestBed.inject(UnsavedWorkRegistry); });
  afterEach(() => { registry.clear('a'); registry.clear('b'); });

  // A real beforeunload event would trip Karma's own "full page reload" detector, so the listener is observed through a spy.
  function watchBeforeUnload() {
    const attached = new Set<EventListenerOrEventListenerObject>();
    spyOn(window, 'addEventListener').and.callFake(((type: string, handler: EventListenerOrEventListenerObject) => { if (type === 'beforeunload') attached.add(handler); }) as typeof window.addEventListener);
    spyOn(window, 'removeEventListener').and.callFake(((type: string, handler: EventListenerOrEventListenerObject) => { if (type === 'beforeunload') attached.delete(handler); }) as typeof window.removeEventListener);
    return attached;
  }

  it('tracks registrations; a second registrant keeps it busy', () => {
    expect(registry.hasWork()).toBeFalse();
    registry.register('a'); registry.register('a'); registry.register('b');
    expect(registry.hasWork()).toBeTrue();
    registry.clear('a');
    expect(registry.hasWork()).toBeTrue();
    registry.clear('b');
    expect(registry.hasWork()).toBeFalse();
  });

  it('tab close prompts only while something is unsaved', () => {
    const attached = watchBeforeUnload();
    expect(attached.size).toBe(0);
    registry.register('a');
    expect(attached.size).toBe(1);
    const event = new Event('beforeunload', { cancelable: true });
    (([...attached][0]) as EventListener)(event);
    expect(event.defaultPrevented).toBeTrue();
    registry.clear('a');
    expect(attached.size).toBe(0);
  });

  it('confirmLeave: nothing unsaved passes silently', () => {
    const confirm = spyOn(window, 'confirm');
    expect(registry.confirmLeave()).toBeTrue();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('confirmLeave: refusing keeps the work; agreeing clears it', () => {
    const attached = watchBeforeUnload();
    registry.register('a');
    const confirm = spyOn(window, 'confirm').and.returnValue(false);
    expect(registry.confirmLeave()).toBeFalse();
    expect(registry.hasWork()).toBeTrue();
    confirm.and.returnValue(true);
    expect(registry.confirmLeave()).toBeTrue();
    expect(registry.hasWork()).toBeFalse();
    expect(attached.size).toBe(0);
  });

  it('confirmLeave: says what would be lost when a registrant described it; the default is unsaved corrections', () => {
    const confirm = spyOn(window, 'confirm').and.returnValue(false);
    registry.register('corrections');
    registry.confirmLeave();
    expect(confirm).toHaveBeenCalledWith('You have unsaved changes to corrections. Leave and discard them?');
    registry.register('student-uploads', 'You have student work that is not saved yet. Leave and discard it?');
    registry.confirmLeave();
    expect(confirm.calls.mostRecent().args[0]).toBe('You have student work that is not saved yet. Leave and discard it?');
    registry.clear('student-uploads');
    registry.confirmLeave();
    expect(confirm.calls.mostRecent().args[0]).toBe('You have unsaved changes to corrections. Leave and discard them?');
  });
});

describe('unsavedWorkGuard', () => {
  function setup() {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'a', component: PageA, canDeactivate: [unsavedWorkGuard] }, { path: 'b', component: PageB }])] });
    return { router: TestBed.inject(Router), registry: TestBed.inject(UnsavedWorkRegistry) };
  }
  it('blocks the route change when the user refuses, allows it otherwise', async () => {
    const { router, registry } = setup();
    await router.navigateByUrl('/a');
    registry.register('a');
    const confirm = spyOn(window, 'confirm').and.returnValue(false);
    expect(await router.navigateByUrl('/b')).toBeFalse();
    expect(router.url).toBe('/a');
    confirm.and.returnValue(true);
    expect(await router.navigateByUrl('/b')).toBeTrue();
    expect(router.url).toBe('/b');
    expect(registry.hasWork()).toBeFalse();
  });
  it('no prompt when nothing is unsaved', async () => {
    const { router } = setup();
    await router.navigateByUrl('/a');
    const confirm = spyOn(window, 'confirm');
    expect(await router.navigateByUrl('/b')).toBeTrue();
    expect(confirm).not.toHaveBeenCalled();
  });
});
