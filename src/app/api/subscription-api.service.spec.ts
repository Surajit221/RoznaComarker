import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { SubscriptionApiService } from './subscription-api.service';

describe('SubscriptionApiService', () => {
  let service: SubscriptionApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(SubscriptionApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts PayPal subscription creation to the canonical endpoint exactly once', async () => {
    const pending = service.createPayPalSubscription('essential_monthly', 'attempt-1');
    const request = http.expectOne(`${environment.apiUrl}/subscription/paypal/create`);

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ planCode: 'essential_monthly', checkoutAttemptId: 'attempt-1', billingPeriod: 'monthly' });
    expect(http.match(`${environment.apiUrl}/subscription/paypal/create`).length).toBe(0);

    request.flush({ success: true, data: {
      subscriptionId: 'I-PAYPAL', approvalUrl: 'https://www.sandbox.paypal.com/approve', status: 'APPROVAL_PENDING'
    } });
    expect((await pending).subscriptionId).toBe('I-PAYPAL');
  });

  it('sends annual selection without a browser price or provider plan ID', async () => {
    const pending = service.createPayPalSubscription('essential', 'attempt-annual', 'annual');
    const request = http.expectOne(environment.apiUrl + '/subscription/paypal/create');
    expect(request.request.body).toEqual({ planCode: 'essential', checkoutAttemptId: 'attempt-annual', billingPeriod: 'annual' });
    request.flush({ success: true, data: { subscriptionId: 'I-ANNUAL' } });
    expect((await pending).subscriptionId).toBe('I-ANNUAL');
  });

  it('creates and captures a prepaid plan Order using identifiers only', async () => {
    const creating = service.createPayPalPlanOrder('pro', 'attempt-plan', 'annual');
    const create = http.expectOne(environment.apiUrl + '/subscription/paypal/orders/create');
    expect(create.request.body).toEqual({ planCode: 'pro', checkoutAttemptId: 'attempt-plan', billingPeriod: 'annual' });
    expect(create.request.body.price).toBeUndefined();
    create.flush({ success: true, data: { attemptId: 'attempt-plan', orderId: 'ORDER-1', status: 'approval_pending' } });
    expect((await creating).orderId).toBe('ORDER-1');
    const capturing = service.capturePayPalPlanOrder('attempt-plan');
    const capture = http.expectOne(environment.apiUrl + '/subscription/paypal/orders/capture');
    expect(capture.request.body).toEqual({ checkoutAttemptId: 'attempt-plan' });
    capture.flush({ success: true, data: { attemptId: 'attempt-plan', status: 'fulfilled', fulfilled: true } });
    expect((await capturing).fulfilled).toBeTrue();
  });
});
