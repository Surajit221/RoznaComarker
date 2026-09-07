import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

export interface PayPalButtonInstance { isEligible():boolean;render(selector:string):Promise<void>;close?():void; }
export interface PayPalButtonsSdk { FUNDING:{PAYPAL:unknown;CARD:unknown};Buttons(options:Record<string,unknown>):PayPalButtonInstance; }
export interface PayPalSdkConfig { clientId:string;currency:string;mode:'capture'|'subscription'; }

@Injectable({providedIn:'root'})
export class PayPalSdkLoaderService {
  private readonly document=inject(DOCUMENT);private readonly platformId=inject(PLATFORM_ID);
  private readonly sdkCache=new Map<string,Promise<PayPalButtonsSdk>>();
  private readonly scriptCache=new Map<string,HTMLScriptElement>();

  loadButtons(config:PayPalSdkConfig):Promise<PayPalButtonsSdk>{
    if(!isPlatformBrowser(this.platformId))return Promise.reject(new Error('PAYPAL_SDK_LOAD_FAILED'));
    const namespace=config.mode==='capture'?'paypalCapture':'paypalSubscription';
    const key=this.key(config);
    const existing=this.sdkCache.get(key);
    if(existing)return existing;
    const sdkPromise=this.loadSdk(config,namespace);
    this.sdkCache.set(key,sdkPromise);
    return sdkPromise;
  }

  release(config:PayPalSdkConfig):void{
    const key=this.key(config);
    this.sdkCache.delete(key);
  }

  private loadSdk(config:PayPalSdkConfig,namespace:string):Promise<PayPalButtonsSdk>{
    return new Promise<PayPalButtonsSdk>((resolve,reject)=>{
      const existingScript=this.scriptCache.get(namespace);
      if(existingScript){
        const sdk=this.getGlobalSdk(namespace);
        if(sdk?.Buttons){resolve(sdk);return;}
      }
      const script=this.document.createElement('script');
      const params:Record<string,string>={'client-id':config.clientId,components:'buttons',currency:config.currency.toUpperCase(),intent:config.mode};
      if(config.mode==='subscription')params['vault']='true';
      script.src=`https://www.paypal.com/sdk/js?${new URLSearchParams(params).toString()}`;
      script.async=true;
      script.setAttribute('data-namespace',namespace);
      script.dataset['paypalButtonsSdk']='true';
      script.onload=()=>{
        const sdk=this.getGlobalSdk(namespace);
        sdk?.Buttons?resolve(sdk):reject(new Error('PAYPAL_SDK_LOAD_FAILED'));
      };
      script.onerror=()=>reject(new Error('PAYPAL_SDK_LOAD_FAILED'));
      this.document.head.appendChild(script);
      this.scriptCache.set(namespace,script);
    });
  }

  private getGlobalSdk(namespace:string):PayPalButtonsSdk|undefined{
    return (globalThis as any)[namespace] as PayPalButtonsSdk|undefined;
  }

  private key(config:PayPalSdkConfig):string{
    return JSON.stringify({clientId:config.clientId,currency:config.currency.toUpperCase(),components:'buttons',intent:config.mode,vault:config.mode==='subscription'});
  }
}
