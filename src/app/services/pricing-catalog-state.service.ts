import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BackendPlan, PlansApiService } from '../api/plans-api.service';
import { CreditPack, CreditPaymentProvider, CreditsApiService } from '../api/credits-api.service';
import { NotificationRealtimeService } from './notification-realtime.service';
import { AccountStateService } from './account-state.service';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class PricingCatalogStateService {
  readonly plans = signal<BackendPlan[]>([]);
  readonly packs = signal<CreditPack[]>([]);
  readonly paymentProvider = signal<CreditPaymentProvider>('paypal');
  readonly plansLoading = signal(false);
  readonly plansError = signal(false);
  readonly creditPacksLoading = signal(false);
  readonly creditPacksError = signal(false);
  private readonly destroyRef = inject(DestroyRef);
  private readonly plansApi = inject(PlansApiService);
  private readonly creditsApi = inject(CreditsApiService);
  private readonly account = inject(AccountStateService);
  private readonly auth = inject(AuthService);
  private plansRequest: Promise<void> | null = null;
  private packsRequest: Promise<void> | null = null;
  private packsOwner: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(NotificationRealtimeService).events$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(event => {
      if (event.type === 'pricing_config_updated') this.invalidate();
    });
    this.destroyRef.onDestroy(() => { if (this.timer) clearTimeout(this.timer); });
  }

  refresh(): Promise<void> { return this.refreshPlans(); }

  refreshPlans(): Promise<void> {
    if (this.plansRequest) return this.plansRequest;
    this.plansLoading.set(true); this.plansError.set(false);
    this.plansRequest = this.plansApi.getActivePlans().then(plans => this.plans.set(plans))
      .catch(error => { this.plansError.set(true); throw error; })
      .finally(() => { this.plansLoading.set(false); this.plansRequest = null; });
    return this.plansRequest;
  }

  refreshCreditPacks(): Promise<void> {
    const owner = this.auth.getBackendJwt();
    if (!owner || this.auth.getBackendRole() !== 'teacher') {
      this.packs.set([]); this.creditPacksError.set(true);
      return Promise.reject(new Error('Teacher authentication is required.'));
    }
    if (this.packsRequest && this.packsOwner === owner) return this.packsRequest;
    if (this.packsOwner !== owner) this.packs.set([]);
    this.packsOwner = owner; this.creditPacksLoading.set(true); this.creditPacksError.set(false);
    const request = this.creditsApi.getPacks().then(options => {
      if (this.auth.getBackendJwt() !== owner) return;
      this.packs.set(options.packs); this.paymentProvider.set(options.paymentProvider);
    }).catch(error => {
      if (this.packsOwner === owner) { this.packs.set([]); this.creditPacksError.set(true); }
      throw error;
    }).finally(() => {
      if (this.packsRequest === request) { this.creditPacksLoading.set(false); this.packsRequest = null; }
    });
    this.packsRequest = request;
    return request;
  }

  invalidate(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      const requests = [this.refreshPlans()];
      if (this.auth.getBackendRole() === 'teacher') {
        if (this.packsOwner) requests.push(this.refreshCreditPacks());
        requests.push(this.account.refresh());
      }
      void Promise.allSettled(requests);
    }, 180);
  }
}
