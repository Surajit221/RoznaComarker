import { Component, OnDestroy, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { provideRouter, RouterOutlet } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject } from 'rxjs';

import { AuthService } from '../../auth/auth.service';
import { CreditsApiService } from '../../api/credits-api.service';
import { InstitutionApiService } from '../../api/institution-api.service';
import { NotificationApiService } from '../../api/notification-api.service';
import { SubscriptionApiService } from '../../api/subscription-api.service';
import { DeviceService } from '../../services/device.service';
import { NotificationRealtimeService } from '../../services/notification-realtime.service';
import { PricingCatalogStateService } from '../../services/pricing-catalog-state.service';
import { RoleService } from '../../services/role.service';
import { DashboardLayout } from './dashboard-layout';

/** Stands in for any routed page: one plain textarea, whose text lives only in the DOM, and one reactive form control. */
@Component({ standalone: true, imports: [ReactiveFormsModule],
  template: '<textarea data-plain></textarea><input data-reactive [formControl]="control" />' })
class RoutedPage implements OnDestroy {
  static created = 0;
  static destroyed = 0;
  control = new FormControl('');
  constructor() { RoutedPage.created += 1; }
  ngOnDestroy(): void { RoutedPage.destroyed += 1; }
}

describe('DashboardLayout across the 1024px layout switch', () => {
  const desktop = signal(true), tablet = signal(false), mobile = signal(false);
  const setViewport = (viewport: 'desktop' | 'tablet' | 'mobile') => {
    desktop.set(viewport === 'desktop'); tablet.set(viewport === 'tablet'); mobile.set(viewport === 'mobile');
  };
  const jwt = `${btoa('{}')}.${btoa(JSON.stringify({ role: 'teacher' }))}.signature`;

  async function open(start: 'desktop' | 'tablet' | 'mobile') {
    setViewport(start);
    RoutedPage.created = 0; RoutedPage.destroyed = 0;
    localStorage.setItem('backend_jwt', jwt);
    TestBed.configureTestingModule({
      imports: [DashboardLayout, RouterOutlet],
      providers: [
        provideRouter([{ path: 'teacher', component: DashboardLayout, children: [{ path: 'page', component: RoutedPage }] }]),
        { provide: AuthService, useValue: { getBackendJwt: () => jwt, logout: () => Promise.resolve(),
          getMeProfile: () => Promise.resolve({ id: 'teacher-1', email: 'teacher@example.test', displayName: 'Teacher', role: 'teacher' }) } },
        { provide: SubscriptionApiService, useValue: { getMySubscription: () => new Promise(() => undefined), createCustomerPortal: () => Promise.reject(new Error('unused')) } },
        { provide: CreditsApiService, useValue: { getWallet: () => new Promise(() => undefined), getPacks: () => Promise.resolve({ packs: [], paymentProvider: 'paypal' }) } },
        { provide: InstitutionApiService, useValue: { getMine: () => Promise.resolve(null) } },
        { provide: PricingCatalogStateService, useValue: { packs: signal([]), refreshCreditPacks: () => Promise.resolve() } },
        { provide: NotificationApiService, useValue: { listMyNotifications: () => Promise.resolve([]), getUnreadCount: () => Promise.resolve(0), markRead: () => Promise.resolve(), markAllRead: () => Promise.resolve() } },
        { provide: NotificationRealtimeService, useValue: { connect: () => undefined, disconnect: () => undefined, notifications$: new Subject().asObservable(), events$: new Subject().asObservable() } },
        { provide: DeviceService, useValue: { isDesktop: desktop, isTablet: tablet, isMobile: mobile } },
        { provide: RoleService, useValue: { currentRole: signal('teacher') } },
      ],
    });
    const harness = await RouterTestingHarness.create('/teacher/page');
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    return harness;
  }
  const type = (harness: RouterTestingHarness) => {
    const root: HTMLElement = harness.routeNativeElement!;
    const plain = root.querySelector<HTMLTextAreaElement>('[data-plain]')!;
    const reactive = root.querySelector<HTMLInputElement>('[data-reactive]')!;
    plain.value = 'A note the teacher has not saved';
    plain.dispatchEvent(new Event('input'));
    reactive.value = 'A comment the teacher has not saved';
    reactive.dispatchEvent(new Event('input'));
    harness.detectChanges();
    return plain;
  };
  const expectSurvived = (harness: RouterTestingHarness, plain: HTMLTextAreaElement) => {
    const root: HTMLElement = harness.routeNativeElement!;
    expect(RoutedPage.created).withContext('the routed page is created once').toBe(1);
    expect(RoutedPage.destroyed).withContext('the routed page is never destroyed').toBe(0);
    expect(root.querySelector('[data-plain]')).withContext('the same textarea element stays in the page').toBe(plain);
    expect(plain.isConnected).toBeTrue();
    expect(plain.value).toBe('A note the teacher has not saved');
    expect(root.querySelector<HTMLInputElement>('[data-reactive]')!.value).toBe('A comment the teacher has not saved');
  };

  afterEach(() => localStorage.removeItem('backend_jwt'));

  for (const [start, other] of [['desktop', 'tablet'], ['tablet', 'desktop'], ['desktop', 'mobile'], ['mobile', 'desktop']] as const) {
    it(`keeps unsaved text from ${start} to ${other} and back`, async () => {
      const harness = await open(start);
      const plain = type(harness);
      setViewport(other);
      harness.detectChanges();
      expectSurvived(harness, plain);
      setViewport(start);
      harness.detectChanges();
      expectSurvived(harness, plain);
    });
  }

  it('moving between tablet and mobile, which has always shared a layout, keeps the text too', async () => {
    const harness = await open('tablet');
    const plain = type(harness);
    setViewport('mobile');
    harness.detectChanges();
    expectSurvived(harness, plain);
  });

  it('still shows the desktop layout on desktop and the compact layout below it, with the same classes', async () => {
    const harness = await open('desktop');
    const root: HTMLElement = harness.fixture.nativeElement;
    expect(root.querySelector('aside')).not.toBeNull();
    expect(root.querySelector('.desktop-dashboard-header')).not.toBeNull();
    expect(root.querySelector('.mobile-dashboard-header')).toBeNull();
    expect(root.querySelector('nav.fixed.bottom-0')).toBeNull();
    const desktopMain = root.querySelector('main')!;
    expect(desktopMain.className.split(/\s+/)).toEqual(jasmine.arrayContaining(['flex-1', 'overflow-y-auto', 'p-6']));
    setViewport('tablet');
    harness.detectChanges();
    expect(root.querySelector('aside')).toBeNull();
    expect(root.querySelector('.desktop-dashboard-header')).toBeNull();
    expect(root.querySelector('.mobile-dashboard-header')).not.toBeNull();
    expect(root.querySelector('nav.fixed.bottom-0')).not.toBeNull();
    const compactMain = root.querySelector('main')!;
    expect(compactMain).withContext('the page stays in one main element').toBe(desktopMain);
    expect(compactMain.className.split(/\s+/)).toEqual(jasmine.arrayContaining(['flex-1', 'overflow-auto']));
    expect(compactMain.className).not.toContain('p-6');
    expect(compactMain.querySelector(':scope > div')!.className.split(/\s+/)).toEqual(jasmine.arrayContaining(['mt-20', 'px-4']));
  });
});
