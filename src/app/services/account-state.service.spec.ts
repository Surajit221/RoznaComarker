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

  it('two simultaneous refreshSubscription() calls → one HTTP call', async () => {
    let resolve!: (value: any) => void;
    const getMySubscription = jasmine.createSpy().and.returnValue(new Promise((done) => { resolve = done; }));
    TestBed.configureTestingModule({ providers: [
      AccountStateService,
      { provide: SubscriptionApiService, useValue: { getMySubscription } },
      { provide: CreditsApiService, useValue: { getWallet: jasmine.createSpy().and.resolveTo(null) } },
      { provide: InstitutionApiService, useValue: { getMine: jasmine.createSpy().and.resolveTo(null) } }
    ] });
    const state = TestBed.inject(AccountStateService);
    const first = state.refreshSubscription();
    const second = state.refreshSubscription();
    expect(getMySubscription).toHaveBeenCalledTimes(1);
    resolve({ plan: { slug: 'essential' } });
    await Promise.all([first, second]);
    expect(getMySubscription).toHaveBeenCalledTimes(1);
  });

  it('completed subscription fetch + stale-aware call within TTL → no new HTTP call', async () => {
    const getMySubscription = jasmine.createSpy().and.resolveTo({ plan: { slug: 'essential' } });
    TestBed.configureTestingModule({ providers: [
      AccountStateService,
      { provide: SubscriptionApiService, useValue: { getMySubscription } },
      { provide: CreditsApiService, useValue: { getWallet: jasmine.createSpy().and.resolveTo(null) } },
      { provide: InstitutionApiService, useValue: { getMine: jasmine.createSpy().and.resolveTo(null) } }
    ] });
    const state = TestBed.inject(AccountStateService);
    await state.refreshSubscription();
    expect(getMySubscription).toHaveBeenCalledTimes(1);
    await state.refreshSubscriptionIfStale(30_000);
    expect(getMySubscription).toHaveBeenCalledTimes(1);
  });

  it('stale-aware call after TTL → new HTTP call', async () => {
    const getMySubscription = jasmine.createSpy().and.resolveTo({ plan: { slug: 'essential' } });
    TestBed.configureTestingModule({ providers: [
      AccountStateService,
      { provide: SubscriptionApiService, useValue: { getMySubscription } },
      { provide: CreditsApiService, useValue: { getWallet: jasmine.createSpy().and.resolveTo(null) } },
      { provide: InstitutionApiService, useValue: { getMine: jasmine.createSpy().and.resolveTo(null) } }
    ] });
    const state = TestBed.inject(AccountStateService);
    await state.refreshSubscription();
    expect(getMySubscription).toHaveBeenCalledTimes(1);
    await state.refreshSubscriptionIfStale(0);
    expect(getMySubscription).toHaveBeenCalledTimes(2);
  });

  it('force refresh always fetches again', async () => {
    const getMySubscription = jasmine.createSpy().and.resolveTo({ plan: { slug: 'essential' } });
    TestBed.configureTestingModule({ providers: [
      AccountStateService,
      { provide: SubscriptionApiService, useValue: { getMySubscription } },
      { provide: CreditsApiService, useValue: { getWallet: jasmine.createSpy().and.resolveTo(null) } },
      { provide: InstitutionApiService, useValue: { getMine: jasmine.createSpy().and.resolveTo(null) } }
    ] });
    const state = TestBed.inject(AccountStateService);
    await state.refreshSubscription();
    await state.refreshSubscription();
    expect(getMySubscription).toHaveBeenCalledTimes(2);
  });

  it('wallet freshness does not affect subscription freshness', async () => {
    const getMySubscription = jasmine.createSpy().and.resolveTo({ plan: { slug: 'essential' } });
    const getWallet = jasmine.createSpy().and.resolveTo({ availableCredits: 12 });
    TestBed.configureTestingModule({ providers: [
      AccountStateService,
      { provide: SubscriptionApiService, useValue: { getMySubscription } },
      { provide: CreditsApiService, useValue: { getWallet } },
      { provide: InstitutionApiService, useValue: { getMine: jasmine.createSpy().and.resolveTo(null) } }
    ] });
    const state = TestBed.inject(AccountStateService);
    await state.refreshSubscription();
    await state.refreshCredits();
    expect(getMySubscription).toHaveBeenCalledTimes(1);
    await state.refreshSubscriptionIfStale(30_000);
    expect(getMySubscription).toHaveBeenCalledTimes(1);
  });

  it('institution freshness does not affect wallet freshness', async () => {
    const getWallet = jasmine.createSpy().and.resolveTo({ availableCredits: 12 });
    const getMine = jasmine.createSpy().and.resolveTo({ name: 'Test Institution' });
    TestBed.configureTestingModule({ providers: [
      AccountStateService,
      { provide: SubscriptionApiService, useValue: { getMySubscription: jasmine.createSpy().and.resolveTo(null) } },
      { provide: CreditsApiService, useValue: { getWallet } },
      { provide: InstitutionApiService, useValue: { getMine } }
    ] });
    const state = TestBed.inject(AccountStateService);
    await state.refreshCredits();
    await state.refreshInstitution();
    expect(getWallet).toHaveBeenCalledTimes(1);
    await state.refreshCreditsIfStale(30_000);
    expect(getWallet).toHaveBeenCalledTimes(1);
  });

  it('concurrent stale-aware callers share one in-flight request', async () => {
    let resolve!: (value: any) => void;
    const getMySubscription = jasmine.createSpy().and.returnValue(new Promise((done) => { resolve = done; }));
    TestBed.configureTestingModule({ providers: [
      AccountStateService,
      { provide: SubscriptionApiService, useValue: { getMySubscription } },
      { provide: CreditsApiService, useValue: { getWallet: jasmine.createSpy().and.resolveTo(null) } },
      { provide: InstitutionApiService, useValue: { getMine: jasmine.createSpy().and.resolveTo(null) } }
    ] });
    const state = TestBed.inject(AccountStateService);
    const first = state.refreshSubscriptionIfStale(0);
    const second = state.refreshSubscriptionIfStale(0);
    expect(getMySubscription).toHaveBeenCalledTimes(1);
    resolve({ plan: { slug: 'essential' } });
    await Promise.all([first, second]);
    expect(getMySubscription).toHaveBeenCalledTimes(1);
  });

  it('refreshIfStale checks resources independently', async () => {
    const getMySubscription = jasmine.createSpy().and.resolveTo({ plan: { slug: 'essential' } });
    const getWallet = jasmine.createSpy().and.resolveTo({ availableCredits: 12 });
    const getMine = jasmine.createSpy().and.resolveTo({ name: 'Test Institution' });
    TestBed.configureTestingModule({ providers: [
      AccountStateService,
      { provide: SubscriptionApiService, useValue: { getMySubscription } },
      { provide: CreditsApiService, useValue: { getWallet } },
      { provide: InstitutionApiService, useValue: { getMine } }
    ] });
    const state = TestBed.inject(AccountStateService);
    await state.refreshSubscription();
    await state.refreshCredits();
    await state.refreshInstitution();
    expect(getMySubscription).toHaveBeenCalledTimes(1);
    expect(getWallet).toHaveBeenCalledTimes(1);
    expect(getMine).toHaveBeenCalledTimes(1);
    await state.refreshIfStale(0, 30_000, 30_000);
    expect(getMySubscription).toHaveBeenCalledTimes(2);
    expect(getWallet).toHaveBeenCalledTimes(1);
    expect(getMine).toHaveBeenCalledTimes(1);
  });

  it('failed request does not incorrectly mark resource fresh', async () => {
    const getMySubscription = jasmine.createSpy().and.rejectWith(new Error('Network error'));
    TestBed.configureTestingModule({ providers: [
      AccountStateService,
      { provide: SubscriptionApiService, useValue: { getMySubscription } },
      { provide: CreditsApiService, useValue: { getWallet: jasmine.createSpy().and.resolveTo(null) } },
      { provide: InstitutionApiService, useValue: { getMine: jasmine.createSpy().and.resolveTo(null) } }
    ] });
    const state = TestBed.inject(AccountStateService);
    await state.refreshSubscription().catch(() => {});
    expect(getMySubscription).toHaveBeenCalledTimes(1);
    await state.refreshSubscriptionIfStale(30_000);
    expect(getMySubscription).toHaveBeenCalledTimes(2);
  });
});
