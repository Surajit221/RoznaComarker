import { trustedPayPalApprovalUrl, trustedStripePortalUrl } from './trusted-navigation.util';

describe('trustedStripePortalUrl', () => {
  it('allows Stripe Customer Portal HTTPS URLs', () => {
    expect(trustedStripePortalUrl('https://billing.stripe.com/p/session/test#fragment'))
      .toBe('https://billing.stripe.com/p/session/test#fragment');
  });

  it('rejects executable, insecure, credential-confused, and non-Stripe URLs', () => {
    expect(trustedStripePortalUrl('javascript:alert(1)')).toBeNull();
    expect(trustedStripePortalUrl('http://billing.stripe.com/p/session/test')).toBeNull();
    expect(trustedStripePortalUrl('https://billing.stripe.com@evil.test/p/session/test')).toBeNull();
    expect(trustedStripePortalUrl('https://billing.stripe.com.evil.test/p/session/test')).toBeNull();
  });
});

describe('trustedPayPalApprovalUrl', () => {
  it('allows HTTPS PayPal approval URLs', () => {
    expect(trustedPayPalApprovalUrl('https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=test'))
      .toContain('sandbox.paypal.com');
  });

  it('rejects executable, insecure, credential-confused, and non-PayPal URLs', () => {
    expect(trustedPayPalApprovalUrl('javascript:alert(1)')).toBeNull();
    expect(trustedPayPalApprovalUrl('http://www.paypal.com/approve')).toBeNull();
    expect(trustedPayPalApprovalUrl('https://paypal.com@evil.test/approve')).toBeNull();
    expect(trustedPayPalApprovalUrl('https://paypal.com.evil.test/approve')).toBeNull();
  });
});
