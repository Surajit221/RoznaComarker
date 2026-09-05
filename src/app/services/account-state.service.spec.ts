import { TestBed } from '@angular/core/testing';
import { CreditsApiService } from '../api/credits-api.service';
import { SubscriptionApiService } from '../api/subscription-api.service';
import { AccountStateService } from './account-state.service';
import { InstitutionApiService } from '../api/institution-api.service';

describe('AccountStateService', () => {
  it('coalesces concurrent refreshes and publishes only backend responses', async () => {
    let resolve!: (value: any) => void;
    const getMySubscription = jasmine.createSpy().and.returnValue(new Promise((done) => { resolve = done; }));
    const getWallet = jasmine.createSpy().and.resolveTo({ availableCredits: 12 });
    TestBed.configureTestingModule({ providers: [
      AccountStateService,
      { provide: SubscriptionApiService, useValue: { getMySubscription } },
      { provide: CreditsApiService, useValue: { getWallet } }
      ,{ provide: InstitutionApiService, useValue: { getMine: jasmine.createSpy().and.resolveTo(null) } }
    ] });
    const state = TestBed.inject(AccountStateService);
    const first = state.refreshSubscription(); const second = state.refreshSubscription();
    expect(getMySubscription).toHaveBeenCalledTimes(1);
    resolve({ plan: { slug: 'essential' }, usage: { storageMB: 5 } });
    await Promise.all([first, second]);
    expect(state.subscription()?.plan.slug).toBe('essential');
    await state.refreshCredits(); expect(state.wallet()?.availableCredits).toBe(12);
  });

  it('replaces state only with the complete authoritative subscription response after an upgrade', async () => {
    const before: any = { plan: { slug: 'free' }, usage: { storageMB: 2.25 }, storage: { usedBytes: 2359296, limitBytes: 524288000 } };
    const after: any = { plan: { slug: 'essential_annual' }, usage: { storageMB: 2.25 }, storage: { usedBytes: 2359296, limitBytes: 2147483648 } };
    const getMySubscription = jasmine.createSpy().and.returnValues(Promise.resolve(before), Promise.resolve(after));
    TestBed.configureTestingModule({ providers: [AccountStateService,{ provide: SubscriptionApiService, useValue: { getMySubscription } },
      { provide: CreditsApiService, useValue: { getWallet: jasmine.createSpy() } },{ provide: InstitutionApiService, useValue: { getMine: jasmine.createSpy() } }] });
    const state=TestBed.inject(AccountStateService);await state.refreshSubscription();await state.refreshSubscription();
    expect(state.subscription()?.storage?.usedBytes).toBe(2359296);expect(state.subscription()?.storage?.limitBytes).toBe(2147483648);
  });
});
