import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, RouterLinkActive } from '@angular/router';
import { Subject } from 'rxjs';

import { AuthService } from '../../auth/auth.service';
import { BackendNotification, NotificationApiService } from '../../api/notification-api.service';
import { SubscriptionApiService } from '../../api/subscription-api.service';
import { CreditsApiService } from '../../api/credits-api.service';
import { DeviceService } from '../../services/device.service';
import { NotificationRealtimeService } from '../../services/notification-realtime.service';
import { RoleService } from '../../services/role.service';
import { DashboardLayout } from './dashboard-layout';
import { routedComponentProviders } from '../../../testing/standalone-test-providers';
import { AccountStateService } from '../../services/account-state.service';

describe('DashboardLayout subscription ownership', () => {
  let fixture: ComponentFixture<DashboardLayout>;

  function jwtFor(role: 'teacher' | 'student'): string {
    return `${btoa('{}')}.${btoa(JSON.stringify({ role }))}.signature`;
  }

  async function render(
    role: 'teacher' | 'student',
    billing: any = null,
    viewport: 'desktop' | 'mobile' = 'desktop',
    unreadCount = 0,
    realtimeNotifications = new Subject<BackendNotification>(),
    creditApiOverrides: Record<string, any> = {}
  ) {
    const realtimeEvents = new Subject<any>();
    const getMySubscription = jasmine.createSpy('getMySubscription').and.resolveTo({
      plan: {
        name: 'Free',
        slug: 'free',
        price: 0,
        currency: 'USD',
        billingInterval: 'month',
        popular: false,
        features: {
          maxClasses: 5,
          maxStudents: 50,
          essayAnalysesPerMonth: 100,
          storageMB: 500,
          aiFlashcards: true,
          aiFlashcardsLimit: 10,
          aiWorksheets: true,
          aiWorksheetsLimit: 10,
          adaptiveLearning: true,
          adaptiveLearningLimit: 10,
          priorityAIProcessing: false,
          analyticsAccess: false,
          dedicatedSupport: false
        },
        display: {
          title: 'Free',
          description: 'Perfect to try the workflow.',
          priceLabel: '$0',
          cta: 'Get Started'
        }
      },
      planStartedAt: null,
      planExpiresAt: null,
      billing,
      usage: { classes: 0, assignments: 0, students: 0, submissions: 0, storageMB: 0 }
    });
    const createCustomerPortal = jasmine.createSpy('createCustomerPortal').and.rejectWith(new Error('stop redirect'));
    const creditsApi = {
      getWallet: jasmine.createSpy('getWallet').and.resolveTo({ plan: 'free', monthlyCredits: 25, monthlyCreditsUsed: 0,
        monthlyCreditsRemaining: 25, purchasedCredits: 0, bonusCredits: 0, availableCredits: 25,
        resetDate: '2026-09-01', billingCycleStart: '2026-08-01', billingCycleEnd: '2026-09-01',
        usagePercent: 0, nudgeThresholds: { soft: 50, warning: 80 }, warningAcknowledged: false }),
      getPacks: jasmine.createSpy('getPacks').and.resolveTo({ packs: [], paymentProvider: 'stripe' }),
      createTopupCheckout: jasmine.createSpy('createTopupCheckout'),
      createPayPalOrder: jasmine.createSpy('createPayPalOrder'),
      capturePayPalOrder: jasmine.createSpy('capturePayPalOrder'),
      getPayPalPurchase: jasmine.createSpy('getPayPalPurchase'),
      cancelPayPalPurchase: jasmine.createSpy('cancelPayPalPurchase'),
      acknowledgeNudge: jasmine.createSpy('acknowledgeNudge').and.rejectWith(new Error('not active')),
      ...creditApiOverrides
    };

    localStorage.setItem('backend_jwt', jwtFor(role));
    await TestBed.configureTestingModule({
      imports: [DashboardLayout],
      providers: [
        ...routedComponentProviders(),
        {
          provide: AuthService,
          useValue: {
            getBackendJwt: () => jwtFor(role),
            getMeProfile: () => Promise.resolve({
              id: `${role}-1`,
              email: `${role}@example.test`,
              displayName: `Test ${role}`,
              role
            }),
            logout: () => Promise.resolve()
          }
        },
        { provide: SubscriptionApiService, useValue: { getMySubscription, createCustomerPortal } },
        { provide: CreditsApiService, useValue: creditsApi },
        {
          provide: NotificationApiService,
          useValue: {
            listMyNotifications: () => Promise.resolve([]),
            getUnreadCount: () => Promise.resolve(unreadCount),
            markRead: () => Promise.resolve(),
            markAllRead: () => Promise.resolve()
          }
        },
        {
          provide: NotificationRealtimeService,
          useValue: {
            connect: () => undefined,
            disconnect: () => undefined,
            notifications$: realtimeNotifications.asObservable(),
            events$: realtimeEvents.asObservable()
          }
        },
        {
          provide: DeviceService,
          useValue: {
            isDesktop: signal(viewport === 'desktop'),
            isTablet: signal(false),
            isMobile: signal(viewport === 'mobile')
          }
        },
        { provide: RoleService, useValue: { currentRole: signal(role) } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardLayout);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { getMySubscription, createCustomerPortal, realtimeNotifications, realtimeEvents, creditsApi };
  }

  afterEach(() => {
    localStorage.removeItem('backend_jwt');
  });

  it('keeps teacher usage, Upgrade Plan, notifications, profile, and navigation visible', async () => {
    const { getMySubscription } = await render('teacher');
    const text = fixture.nativeElement.textContent;
    const subscriptionCtas = fixture.nativeElement.querySelectorAll('[data-testid="subscription-cta"]');

    expect(getMySubscription).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('app-chart-storage')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-account-usage')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="account-storage-indicator"]').textContent.trim()).toContain('Storage');
    expect(fixture.nativeElement.querySelector('[data-testid="assessment-credit-wallet"]')).toBeNull();
    expect(subscriptionCtas.length).toBe(1);
    expect(subscriptionCtas[0].textContent.trim()).toBe('Upgrade Plan');
    expect(text).toContain('My Classes');
    expect(fixture.nativeElement.querySelector('#notif-menu')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#user-menu')).not.toBeNull();

    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    subscriptionCtas[0].click();
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(['/billing/paypal/manage']);
  });

  it('reacts to shared subscription and storage changes without recreating the layout', async () => {
    await render('teacher');
    const state = TestBed.inject(AccountStateService);
    state.subscription.set({ ...state.subscription()!, billing: { provider: 'paypal', status: 'ACTIVE', subscriptionId: 'I-LIVE',
      customerConfigured: true, currentPeriodEnd: null, cancelAtPeriodEnd: false, paymentIssue: false, canManageSubscription: true },
      usage: { ...state.subscription()!.usage, storageMB: 250 } });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="subscription-cta"]').textContent.trim()).toBe('Manage Plan');
    expect(fixture.nativeElement.querySelector('[data-testid="account-storage-indicator"]').textContent).toContain('250 MB / 500 MB');
  });

  it('receives a credit usage notification in realtime and ignores duplicate SSE delivery', async () => {
    const { realtimeNotifications } = await render('teacher');
    const notification = { _id: 'credit-nudge-50', type: 'credit_usage_nudge',
      title: 'Half of your monthly credits used', description: '50 monthly credits remain.',
      recipient: 'teacher-1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as BackendNotification;
    realtimeNotifications.next(notification); realtimeNotifications.next(notification); fixture.detectChanges();
    expect(fixture.componentInstance.notifications.filter((item) => item._id === notification._id)).toHaveSize(1);
    expect(fixture.componentInstance.unreadCount).toBe(1);
    expect(fixture.componentInstance.iconFor(notification).icon).toBe('bxs-wallet');
  });

  it('refreshes wallet and referral summary from a realtime referral reward without reloading', async () => {
    const { realtimeEvents } = await render('teacher');
    const state = TestBed.inject(AccountStateService);
    const refresh = spyOn(state, 'refresh').and.resolveTo();
    realtimeEvents.next({ type: 'credits_updated', data: { type: 'referral_reward', referralId: 'ref-1' } });
    await fixture.whenStable();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not fetch or render subscription controls for students', async () => {
    const { getMySubscription } = await render('student');
    const text = fixture.nativeElement.textContent;

    expect(getMySubscription).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('app-chart-storage')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('[data-testid="subscription-cta"]').length).toBe(0);
    expect(text).not.toContain('Upgrade Plan');
    expect(text).not.toContain('Manage Plan');
    expect(text).not.toContain('Manage Billing');
    expect(text).toContain('My Classes');
    expect(fixture.nativeElement.querySelector('#notif-menu')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#user-menu')).not.toBeNull();
  });

  it('shows Manage Plan for an active Starter teacher', async () => {
    const { createCustomerPortal } = await render('teacher', { status: 'active', paymentIssue: false });
    const subscriptionCtas = fixture.nativeElement.querySelectorAll('[data-testid="subscription-cta"]');
    expect(subscriptionCtas.length).toBe(1);
    expect(subscriptionCtas[0].textContent.trim()).toBe('Manage Plan');
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    subscriptionCtas[0].click();
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(['/billing/paypal/manage']);
    expect(createCustomerPortal).not.toHaveBeenCalled();
  });

  it('opens native PayPal management without creating a Stripe portal', async () => {
    const { createCustomerPortal } = await render('teacher', { provider: 'paypal', status: 'ACTIVE', paymentIssue: false,
      subscriptionId: 'I-SAFE', canManageSubscription: true });
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const button = fixture.nativeElement.querySelector('[data-testid="subscription-cta"]');
    expect(button.textContent.trim()).toBe('Manage Plan');
    button.click(); await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(['/billing/paypal/manage']);
    expect(createCustomerPortal).not.toHaveBeenCalled();
  });

  it('shows Manage Billing for a teacher with a payment issue', async () => {
    await render('teacher', { status: 'past_due', paymentIssue: true });
    const subscriptionCtas = fixture.nativeElement.querySelectorAll('[data-testid="subscription-cta"]');
    expect(subscriptionCtas.length).toBe(1);
    expect(subscriptionCtas[0].textContent.trim()).toBe('Manage Billing');
  });

  it('shows one compact mobile storage row without permanent credit detail', async () => {
    await render('teacher', null, 'mobile');
    const row = fixture.nativeElement.querySelector('[data-testid="mobile-teacher-account-row"]');
    const ctas = fixture.nativeElement.querySelectorAll('[data-testid="subscription-cta"]');
    expect(row).not.toBeNull();
    expect(row.textContent).toContain('Storage');
    expect(row.textContent).toContain('0 MB / 500 MB');
    expect(fixture.nativeElement.querySelector('.mobile-credit-warning')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="mobile-assessment-credit-wallet"]')).toBeNull();
    expect(ctas.length).toBe(1);
    expect(ctas[0].textContent.trim()).toBe('Upgrade Plan');
    expect(fixture.nativeElement.querySelector('#user-menu')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-chart-storage')).toBeNull();
  });

  it('uses Manage Plan and Manage Billing labels in the mobile teacher row', async () => {
    await render('teacher', { status: 'active', paymentIssue: false }, 'mobile');
    expect(fixture.nativeElement.querySelector('[data-testid="subscription-cta"]').textContent.trim()).toBe('Manage Plan');
    TestBed.resetTestingModule();
    await render('teacher', { status: 'past_due', paymentIssue: true }, 'mobile');
    expect(fixture.nativeElement.querySelector('[data-testid="subscription-cta"]').textContent.trim()).toBe('Manage Billing');
  });

  it('does not render the mobile account row for students', async () => {
    await render('student', null, 'mobile');
    expect(fixture.nativeElement.querySelector('[data-testid="mobile-teacher-account-row"]')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('[data-testid="subscription-cta"]').length).toBe(0);
  });

  it('uses the existing teacher Reports route in mobile nav and removes the redundant Notification item', async () => {
    await render('teacher', null, 'mobile');
    const nav = fixture.nativeElement.querySelector('nav');
    const links = [...nav.querySelectorAll('a')] as HTMLAnchorElement[];
    const labels = links.map((link) => link.textContent?.trim());
    const reportsLink = links.find((link) => link.textContent?.trim() === 'Reports');

    expect(labels).toEqual(['Dashboard', 'My Classes', 'Reports', 'Profile']);
    expect(labels).not.toContain('Notification');
    expect(reportsLink?.getAttribute('href')).toBe('/teacher/reports');

    const reportsDebugElement = fixture.debugElement
      .queryAll(By.directive(RouterLinkActive))
      .find((item) => item.nativeElement.textContent.trim() === 'Reports');
    expect(reportsDebugElement?.injector.get(RouterLinkActive).routerLinkActiveOptions).toEqual({ exact: false });
  });

  it('keeps student mobile navigation role-specific without exposing teacher Reports', async () => {
    await render('student', null, 'mobile');
    const nav = fixture.nativeElement.querySelector('nav');
    const links = [...nav.querySelectorAll('a')] as HTMLAnchorElement[];
    const labels = links.map((link) => link.textContent?.trim());
    const hrefs = links.map((link) => link.getAttribute('href'));

    expect(labels).toEqual(['Dashboard', 'My Classes', 'Notification', 'Profile']);
    expect(labels).not.toContain('Reports');
    expect(hrefs).toEqual([
      '/student/dashboard',
      '/student/my-classes',
      '/student/my-notification',
      '/student/my-profile'
    ]);
  });

  it('shows teacher and student unread counts from the shared layout source and hides zero', async () => {
    await render('teacher', null, 'mobile', 5);
    expect(fixture.nativeElement.querySelector('[data-testid="mobile-notification-badge"]').textContent.trim()).toBe('5');

    TestBed.resetTestingModule();
    await render('student', null, 'mobile', 3);
    expect(fixture.nativeElement.querySelector('[data-testid="mobile-notification-badge"]').textContent.trim()).toBe('3');

    TestBed.resetTestingModule();
    await render('student', null, 'mobile', 0);
    expect(fixture.nativeElement.querySelector('[data-testid="mobile-notification-badge"]')).toBeNull();
  });

  it('updates and caps the mobile badge when the existing realtime service emits', async () => {
    const { realtimeNotifications } = await render('teacher', null, 'mobile', 99);
    realtimeNotifications.next({ _id: 'new-1', type: 'test', title: 'New', description: 'New', recipient: 'teacher-1' } as BackendNotification);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="mobile-notification-badge"]').textContent.trim()).toBe('99+');
  });

  it('opens each role existing notification route from the mobile bell', async () => {
    await render('teacher', null, 'mobile', 5);
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    fixture.nativeElement.querySelector('[data-testid="mobile-notification"] button').click();
    expect(navigate).toHaveBeenCalledWith(['/', 'teacher', 'my-notification']);

    TestBed.resetTestingModule();
    await render('student', null, 'mobile', 3);
    const studentNavigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture.nativeElement.querySelector('[data-testid="mobile-notification"] button').click();
    expect(studentNavigate).toHaveBeenCalledWith(['/', 'student', 'my-notification']);
  });

  it('opens Add Credits and renders authoritative backend pack values', async () => {
    const pack = { name: 'Occasional', code: 'TOPUP_SMALL', credits: 10, price: 4.99, currency: 'USD',
      allowedPlans: ['free'], displayOrder: 1 };
    const getPacks = jasmine.createSpy('getPacks').and.resolveTo({ packs: [pack], paymentProvider: 'paypal' });
    await render('teacher', null, 'desktop', 0, new Subject<BackendNotification>(), { getPacks });
    await fixture.componentInstance.onAddCredits(); fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(getPacks).toHaveBeenCalledTimes(1); expect(dialog.textContent).toContain('10 Credits');
    expect(dialog.textContent).toContain('$4.99'); expect(dialog.textContent).toContain('Buy with PayPal');
  });

});
