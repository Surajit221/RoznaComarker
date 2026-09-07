import { TestBed } from '@angular/core/testing';
import { PayPalSdkLoaderService, PayPalSdkConfig } from './paypal-sdk-loader.service';

describe('PayPalSdkLoaderService', () => {
  let service: PayPalSdkLoaderService;
  let createElementSpy: jasmine.Spy;
  let mockScript: HTMLScriptElement;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PayPalSdkLoaderService);
    
    // Mock document.createElement
    mockScript = document.createElement('script') as HTMLScriptElement;
    createElementSpy = spyOn(document, 'createElement').and.returnValue(mockScript);
    
    // Mock appendChild to not actually add to DOM
    spyOn(document.head, 'appendChild').and.callThrough();
  });

  afterEach(() => {
    const scripts = document.querySelectorAll('script[data-paypal-buttons-sdk="true"]');
    scripts.forEach(script => script.remove());
    delete (globalThis as any).paypalCapture;
    delete (globalThis as any).paypalSubscription;
    createElementSpy?.calls?.reset();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should load SDK with capture namespace', async () => {
    const config: PayPalSdkConfig = { clientId: 'test', currency: 'USD', mode: 'capture' };
    
    const mockSdk = {
      FUNDING: { PAYPAL: 'PAYPAL', CARD: 'CARD' },
      Buttons: jasmine.createSpy().and.returnValue({ isEligible: () => true, render: () => Promise.resolve() })
    };
    
    // Set up the mock to trigger onload with the SDK
    setTimeout(() => {
      (globalThis as any).paypalCapture = mockSdk;
      if (mockScript.onload) {
        mockScript.onload(new Event('load'));
      }
    }, 0);

    const sdk = await service.loadButtons(config);
    expect(sdk).toBe(mockSdk);
    expect((globalThis as any).paypalCapture).toBeDefined();
  });

  it('should load SDK with subscription namespace', async () => {
    const config: PayPalSdkConfig = { clientId: 'test', currency: 'USD', mode: 'subscription' };
    
    const mockSdk = {
      FUNDING: { PAYPAL: 'PAYPAL', CARD: 'CARD' },
      Buttons: jasmine.createSpy().and.returnValue({ isEligible: () => true, render: () => Promise.resolve() })
    };
    
    setTimeout(() => {
      (globalThis as any).paypalSubscription = mockSdk;
      if (mockScript.onload) {
        mockScript.onload(new Event('load'));
      }
    }, 0);

    const sdk = await service.loadButtons(config);
    expect(sdk).toBe(mockSdk);
    expect((globalThis as any).paypalSubscription).toBeDefined();
  });

  it('should cache SDK per configuration', async () => {
    const config: PayPalSdkConfig = { clientId: 'test', currency: 'USD', mode: 'capture' };
    
    const mockSdk = {
      FUNDING: { PAYPAL: 'PAYPAL', CARD: 'CARD' },
      Buttons: jasmine.createSpy().and.returnValue({ isEligible: () => true, render: () => Promise.resolve() })
    };
    
    setTimeout(() => {
      (globalThis as any).paypalCapture = mockSdk;
      if (mockScript.onload) {
        mockScript.onload(new Event('load'));
      }
    }, 0);

    const sdk1 = await service.loadButtons(config);
    const sdk2 = await service.loadButtons(config);
    expect(sdk1).toBe(sdk2);
  });

  it('should not delete global SDK on release', async () => {
    const config: PayPalSdkConfig = { clientId: 'test', currency: 'USD', mode: 'capture' };
    
    const mockSdk = {
      FUNDING: { PAYPAL: 'PAYPAL', CARD: 'CARD' },
      Buttons: jasmine.createSpy().and.returnValue({ isEligible: () => true, render: () => Promise.resolve() })
    };
    
    setTimeout(() => {
      (globalThis as any).paypalCapture = mockSdk;
      if (mockScript.onload) {
        mockScript.onload(new Event('load'));
      }
    }, 0);

    await service.loadButtons(config);
    service.release(config);
    expect((globalThis as any).paypalCapture).toBeDefined();
  });

  it('should allow loading same namespace after release', async () => {
    const config: PayPalSdkConfig = { clientId: 'test', currency: 'USD', mode: 'capture' };
    
    const mockSdk = {
      FUNDING: { PAYPAL: 'PAYPAL', CARD: 'CARD' },
      Buttons: jasmine.createSpy().and.returnValue({ isEligible: () => true, render: () => Promise.resolve() })
    };
    
    setTimeout(() => {
      (globalThis as any).paypalCapture = mockSdk;
      if (mockScript.onload) {
        mockScript.onload(new Event('load'));
      }
    }, 0);

    await service.loadButtons(config);
    service.release(config);
    const sdk = await service.loadButtons(config);
    expect(sdk).toBe(mockSdk);
  });

  it('should support both capture and subscription namespaces in same session', async () => {
    const captureConfig: PayPalSdkConfig = { clientId: 'test', currency: 'USD', mode: 'capture' };
    const subscriptionConfig: PayPalSdkConfig = { clientId: 'test', currency: 'USD', mode: 'subscription' };
    
    const captureSdk = {
      FUNDING: { PAYPAL: 'PAYPAL_CAPTURE', CARD: 'CARD_CAPTURE' },
      Buttons: jasmine.createSpy().and.returnValue({ isEligible: () => true, render: () => Promise.resolve() })
    };
    
    const subscriptionSdk = {
      FUNDING: { PAYPAL: 'PAYPAL_SUB', CARD: 'CARD_SUB' },
      Buttons: jasmine.createSpy().and.returnValue({ isEligible: () => true, render: () => Promise.resolve() })
    };
    
    // Load capture first
    setTimeout(() => {
      (globalThis as any).paypalCapture = captureSdk;
      if (mockScript.onload) {
        mockScript.onload(new Event('load'));
      }
    }, 0);

    const loadedCapture = await service.loadButtons(captureConfig);
    
    // Reset the spy for the next load
    createElementSpy.calls.reset();
    const mockScript2 = document.createElement('script');
    createElementSpy.and.returnValue(mockScript2);
    
    // Load subscription second
    setTimeout(() => {
      (globalThis as any).paypalSubscription = subscriptionSdk;
      if (mockScript2.onload) {
        mockScript2.onload(new Event('load'));
      }
    }, 0);

    const loadedSubscription = await service.loadButtons(subscriptionConfig);
    
    expect(loadedCapture).toBe(captureSdk);
    expect(loadedSubscription).toBe(subscriptionSdk);
    expect(loadedCapture).not.toBe(loadedSubscription);
  });

  it('subscription script src does NOT contain data-namespace', async () => {
    const config: PayPalSdkConfig = { clientId: 'test', currency: 'USD', mode: 'subscription' };
    
    const mockSdk = {
      FUNDING: { PAYPAL: 'PAYPAL', CARD: 'CARD' },
      Buttons: jasmine.createSpy().and.returnValue({ isEligible: () => true, render: () => Promise.resolve() })
    };
    
    setTimeout(() => {
      (globalThis as any).paypalSubscription = mockSdk;
      if (mockScript.onload) {
        mockScript.onload(new Event('load'));
      }
    }, 0);

    await service.loadButtons(config);
    
    expect(mockScript.src).not.toContain('data-namespace');
  });

  it('subscription script element has data-namespace attribute', async () => {
    const config: PayPalSdkConfig = { clientId: 'test', currency: 'USD', mode: 'subscription' };
    
    const mockSdk = {
      FUNDING: { PAYPAL: 'PAYPAL', CARD: 'CARD' },
      Buttons: jasmine.createSpy().and.returnValue({ isEligible: () => true, render: () => Promise.resolve() })
    };
    
    setTimeout(() => {
      (globalThis as any).paypalSubscription = mockSdk;
      if (mockScript.onload) {
        mockScript.onload(new Event('load'));
      }
    }, 0);

    await service.loadButtons(config);
    
    expect(mockScript.getAttribute('data-namespace')).toBe('paypalSubscription');
  });

  it('capture script src does NOT contain data-namespace', async () => {
    const config: PayPalSdkConfig = { clientId: 'test', currency: 'USD', mode: 'capture' };
    
    const mockSdk = {
      FUNDING: { PAYPAL: 'PAYPAL', CARD: 'CARD' },
      Buttons: jasmine.createSpy().and.returnValue({ isEligible: () => true, render: () => Promise.resolve() })
    };
    
    setTimeout(() => {
      (globalThis as any).paypalCapture = mockSdk;
      if (mockScript.onload) {
        mockScript.onload(new Event('load'));
      }
    }, 0);

    await service.loadButtons(config);
    
    expect(mockScript.src).not.toContain('data-namespace');
  });

  it('capture script element has data-namespace attribute', async () => {
    const config: PayPalSdkConfig = { clientId: 'test', currency: 'USD', mode: 'capture' };
    
    const mockSdk = {
      FUNDING: { PAYPAL: 'PAYPAL', CARD: 'CARD' },
      Buttons: jasmine.createSpy().and.returnValue({ isEligible: () => true, render: () => Promise.resolve() })
    };
    
    setTimeout(() => {
      (globalThis as any).paypalCapture = mockSdk;
      if (mockScript.onload) {
        mockScript.onload(new Event('load'));
      }
    }, 0);

    await service.loadButtons(config);
    
    expect(mockScript.getAttribute('data-namespace')).toBe('paypalCapture');
  });

  it('subscription resolves window.paypalSubscription', async () => {
    const config: PayPalSdkConfig = { clientId: 'test', currency: 'USD', mode: 'subscription' };
    
    const mockSdk = {
      FUNDING: { PAYPAL: 'PAYPAL', CARD: 'CARD' },
      Buttons: jasmine.createSpy().and.returnValue({ isEligible: () => true, render: () => Promise.resolve() })
    };
    
    setTimeout(() => {
      (globalThis as any).paypalSubscription = mockSdk;
      if (mockScript.onload) {
        mockScript.onload(new Event('load'));
      }
    }, 0);

    const sdk = await service.loadButtons(config);
    expect(sdk).toBe((globalThis as any).paypalSubscription);
  });

  it('capture resolves window.paypalCapture', async () => {
    const config: PayPalSdkConfig = { clientId: 'test', currency: 'USD', mode: 'capture' };
    
    const mockSdk = {
      FUNDING: { PAYPAL: 'PAYPAL', CARD: 'CARD' },
      Buttons: jasmine.createSpy().and.returnValue({ isEligible: () => true, render: () => Promise.resolve() })
    };
    
    setTimeout(() => {
      (globalThis as any).paypalCapture = mockSdk;
      if (mockScript.onload) {
        mockScript.onload(new Event('load'));
      }
    }, 0);

    const sdk = await service.loadButtons(config);
    expect(sdk).toBe((globalThis as any).paypalCapture);
  });

  it('release does not delete global SDK or remove script', async () => {
    const config: PayPalSdkConfig = { clientId: 'test', currency: 'USD', mode: 'capture' };
    
    const mockSdk = {
      FUNDING: { PAYPAL: 'PAYPAL', CARD: 'CARD' },
      Buttons: jasmine.createSpy().and.returnValue({ isEligible: () => true, render: () => Promise.resolve() })
    };
    
    setTimeout(() => {
      (globalThis as any).paypalCapture = mockSdk;
      if (mockScript.onload) {
        mockScript.onload(new Event('load'));
      }
    }, 0);

    await service.loadButtons(config);
    
    const appendChildSpy = document.head.appendChild as jasmine.Spy;
    const appendCallCount = appendChildSpy.calls.count();
    service.release(config);
    
    expect(appendChildSpy.calls.count()).toBe(appendCallCount);
    expect((globalThis as any).paypalCapture).toBeDefined();
  });
});
