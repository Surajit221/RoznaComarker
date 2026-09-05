import { fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { CheckoutSuccessComponent } from './checkout-success';

const free: any = { plan: { slug: 'free' }, billing: { status: null } };
const active: any = { plan: { slug: 'essential_monthly' }, billing: { status: 'ACTIVE' } };

describe('CheckoutSuccessComponent authoritative refresh', () => {
  const router = { url: '/billing/paypal/success' } as any;

  it('refreshes credits after an immediately ACTIVE backend response', async () => {
    const state = { refreshSubscription: jasmine.createSpy().and.resolveTo(active), refreshCredits: jasmine.createSpy().and.resolveTo({ availableCredits: 300 }) } as any;
    const component = new CheckoutSuccessComponent(state, router);
    await component.ngOnInit();
    expect(state.refreshSubscription).toHaveBeenCalledTimes(1);
    expect(state.refreshCredits).toHaveBeenCalledTimes(1);
    expect(component.active).toBeTrue();
  });

  it('polls delayed authoritative activation, refreshes credits, and stops immediately', fakeAsync(() => {
    let response = 0;
    const state = { refreshSubscription: jasmine.createSpy().and.callFake(async () => ++response < 3 ? free : active),
      refreshCredits: jasmine.createSpy().and.resolveTo({ availableCredits: 300 }) } as any;
    const component = new CheckoutSuccessComponent(state, router);
    void component.ngOnInit(); flushMicrotasks();
    tick(1000); flushMicrotasks(); tick(1000); flushMicrotasks();
    expect(state.refreshSubscription).toHaveBeenCalledTimes(3);
    expect(state.refreshCredits).toHaveBeenCalledTimes(1);
    expect(component.active).toBeTrue();
    tick(5000); expect(state.refreshSubscription).toHaveBeenCalledTimes(3);
  }));

  it('never fakes activation while the backend remains pending and times out safely', fakeAsync(() => {
    const state = { refreshSubscription: jasmine.createSpy().and.resolveTo(free), refreshCredits: jasmine.createSpy() } as any;
    const component = new CheckoutSuccessComponent(state, router);
    void component.ngOnInit(); flushMicrotasks();
    for (let attempt = 0; attempt < CheckoutSuccessComponent.maxPollAttempts; attempt += 1) { tick(1000); flushMicrotasks(); }
    expect(component.active).toBeFalse();
    expect(component.finishedWaiting).toBeTrue();
    expect(state.refreshCredits).not.toHaveBeenCalled();
    expect(state.refreshSubscription).toHaveBeenCalledTimes(CheckoutSuccessComponent.maxPollAttempts);
  }));

  it('does not create a subscription when the return callback is initialized more than once', async () => {
    const state = { refreshSubscription: jasmine.createSpy().and.resolveTo(active), refreshCredits: jasmine.createSpy().and.resolveTo({}) } as any;
    await new CheckoutSuccessComponent(state, router).ngOnInit();
    await new CheckoutSuccessComponent(state, router).ngOnInit();
    expect(Object.keys(state)).not.toContain('createPayPalSubscription');
    expect(state.refreshSubscription).toHaveBeenCalledTimes(2);
  });
});
