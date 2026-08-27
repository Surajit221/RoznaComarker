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
    realtimeNotifications = new Subject<BackendNotification>()
  ) {
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
        { provide: CreditsApiService, useValue: {
          getWallet: () => Promise.resolve({ plan: 'free', monthlyCredits: 25, monthlyCreditsUsed: 0,
            monthlyCreditsRemaining: 25, purchasedCredits: 0, bonusCredits: 0, availableCredits: 25,
            resetDate: '2026-09-01', billingCycleStart: '2026-08-01', billingCycleEnd: '2026-09-01',
            usagePercent: 0, nudgeThresholds: { soft: 50, warning: 80 }, warningAcknowledged: false }),
          getPacks: () => Promise.resolve([]), acknowledgeNudge: () => Promise.reject()
        } },
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
            events$: new Subject<any>().asObservable()
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
    return { getMySubscription, createCustomerPortal, realtimeNotifications };
  }

  afterEach(() => {
    localStorage.removeItem('backend_jwt');
  });

  it('keeps teacher usage, Upgrade Plan, notifications, profile, and navigation visible', async () => {
    const { getMySubscription } = await render('teacher');
    const text = fixture.nativeElement.textContent;
    const subscriptionCtas = fixture.nativeElement.querySelectorAll('[data-testid="subscription-cta"]');

    expect(getMySubscription).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('app-chart-storage')).not.toBeNull();
    expect(subscriptionCtas.length).toBe(1);
    expect(subscriptionCtas[0].textContent.trim()).toBe('Upgrade Plan');
    expect(text).toContain('My Classes');
    expect(fixture.nativeElement.querySelector('#notif-menu')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#user-menu')).not.toBeNull();

    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    subscriptionCtas[0].click();
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(['/pricing']);
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
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    subscriptionCtas[0].click();
    await fixture.whenStable();
    expect(createCustomerPortal).toHaveBeenCalledTimes(1);
  });

  it('shows Manage Billing for a teacher with a payment issue', async () => {
    await render('teacher', { status: 'past_due', paymentIssue: true });
    const subscriptionCtas = fixture.nativeElement.querySelectorAll('[data-testid="subscription-cta"]');
    expect(subscriptionCtas.length).toBe(1);
    expect(subscriptionCtas[0].textContent.trim()).toBe('Manage Billing');
  });

  it('shows one compact mobile teacher storage row and reuses the subscription CTA', async () => {
    await render('teacher', null, 'mobile');
    const row = fixture.nativeElement.querySelector('[data-testid="mobile-teacher-account-row"]');
    const ctas = fixture.nativeElement.querySelectorAll('[data-testid="subscription-cta"]');
    expect(row).not.toBeNull();
    expect(row.textContent).toContain('0 MB / 500 MB used');
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
});
