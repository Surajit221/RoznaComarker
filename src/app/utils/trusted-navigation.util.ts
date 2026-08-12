/** Accept only Stripe's HTTPS-hosted Customer Portal as a top-level navigation target. */
export function trustedStripePortalUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'billing.stripe.com') return null;
    return url.href;
  } catch {
    return null;
  }
}
