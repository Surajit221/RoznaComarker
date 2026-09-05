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
    expect(request.request.body).toEqual({ planCode: 'essential_monthly', checkoutAttemptId: 'attempt-1' });
    expect(http.match(`${environment.apiUrl}/subscription/paypal/create`).length).toBe(0);

    request.flush({ success: true, data: {
      subscriptionId: 'I-PAYPAL', approvalUrl: 'https://www.sandbox.paypal.com/approve', status: 'APPROVAL_PENDING'
    } });
    expect((await pending).subscriptionId).toBe('I-PAYPAL');
  });
});
