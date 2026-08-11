import { environment } from '../../../environments/environment';

declare global {
  interface Window { Stripe?: (key: string) => any; }
}

export async function loadStripeClient(): Promise<any> {
  if (!environment.stripePublishableKey || environment.stripePublishableKey.includes('replace_me')) {
    throw new Error('Stripe publishable key is not configured.');
  }
  if (!window.Stripe) {
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-rozna-stripe]');
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('Stripe.js failed to load.')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3/';
      script.async = true;
      script.dataset['roznaStripe'] = 'true';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Stripe.js failed to load.'));
      document.head.appendChild(script);
    });
  }
  if (!window.Stripe) throw new Error('Stripe.js is unavailable.');
  return window.Stripe(environment.stripePublishableKey);
}
