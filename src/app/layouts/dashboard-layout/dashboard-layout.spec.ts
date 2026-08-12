import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';

import { AuthService } from '../../auth/auth.service';
import { NotificationApiService } from '../../api/notification-api.service';
import { SubscriptionApiService } from '../../api/subscription-api.service';
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

  async function render(role: 'teacher' | 'student', billing: any = null, viewport: 'desktop' | 'mobile' = 'desktop') {
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
        {
          provide: NotificationApiService,
          useValue: {
            listMyNotifications: () => Promise.resolve([]),
            getUnreadCount: () => Promise.resolve(0),
            markRead: () => Promise.resolve(),
            markAllRead: () => Promise.resolve()
          }
        },
        {
          provide: NotificationRealtimeService,
          useValue: { connect: () => undefined, disconnect: () => undefined, notifications$: of() }
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
    return { getMySubscription, createCustomerPortal };
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
});
