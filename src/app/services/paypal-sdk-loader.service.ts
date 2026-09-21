import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

export interface PayPalButtonInstance { isEligible():boolean;render(selector:string):Promise<void>;close?():void; }
export interface PayPalButtonsSdk { FUNDING:{PAYPAL:unknown;CARD:unknown};Buttons(options:Record<string,unknown>):PayPalButtonInstance; }
export interface PayPalSdkConfig { clientId:string;currency:string;mode:'capture'|'subscription'; }
interface SdkEntry { key: string; refs: number; script: HTMLScriptElement; promise: Promise<PayPalButtonsSdk>; loading: boolean; }

@Injectable({providedIn:'root'})
export class PayPalSdkLoaderService {
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly entries = new Map<string, SdkEntry>();

  loadButtons(config: PayPalSdkConfig): Promise<PayPalButtonsSdk> {
    if (!isPlatformBrowser(this.platformId)) return Promise.reject(new Error('PAYPAL_SDK_LOAD_FAILED'));
    const namespace = config.mode === 'capture' ? 'paypalCapture' : 'paypalSubscription';
    const key = JSON.stringify([config.clientId, config.currency.toUpperCase(), config.mode]);
    const old = this.entries.get(namespace);
    if (old?.key === key) { old.refs++; return old.promise; }
    if (old && (old.refs || old.loading)) return Promise.reject(new Error('PAYPAL_SDK_CONFIGURATION_IN_USE'));
    if (old) this.remove(namespace, old);
    const script = this.document.createElement('script');
    const params: Record<string,string> = { 'client-id': config.clientId, currency: config.currency.toUpperCase(), components: 'buttons', intent: config.mode };
    if (config.mode === 'subscription') params['vault'] = 'true';
    script.src = 'https://www.paypal.com/sdk/js?' + new URLSearchParams(params).toString();
    script.async = true;
    script.setAttribute('data-namespace', namespace);
    script.dataset['paypalButtonsSdk'] = 'true';
    const entry: SdkEntry = { key, refs: 1, script, loading: true, promise: Promise.resolve(undefined as unknown as PayPalButtonsSdk) };
    entry.promise = new Promise<PayPalButtonsSdk>((resolve, reject) => {
      script.onload = () => {
        entry.loading = false;
        const sdk = this.globals()[namespace];
        if (sdk?.Buttons) resolve(sdk); else reject(new Error('PAYPAL_SDK_LOAD_FAILED'));
      };
      script.onerror = () => reject(new Error('PAYPAL_SDK_LOAD_FAILED'));
    }).catch(error => { if (this.entries.get(namespace) === entry) this.remove(namespace, entry); throw error; });
    this.entries.set(namespace, entry);
    this.document.head.appendChild(script);
    return entry.promise;
  }

  release(config: PayPalSdkConfig): void {
    const namespace = config.mode === 'capture' ? 'paypalCapture' : 'paypalSubscription';
    const entry = this.entries.get(namespace);
    const key = JSON.stringify([config.clientId, config.currency.toUpperCase(), config.mode]);
    if (entry?.key === key) entry.refs = Math.max(0, entry.refs - 1);
    // Retain an idle identical SDK; replace it only for a new configuration.
  }
  private globals(): Record<string, PayPalButtonsSdk | undefined> {
    return globalThis as unknown as Record<string, PayPalButtonsSdk | undefined>;
  }
  private remove(namespace: string, entry: SdkEntry): void {
    entry.script.onload = null; entry.script.onerror = null; entry.script.remove();
    delete this.globals()[namespace]; this.entries.delete(namespace);
  }
}
