import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { PricingCatalogStateService } from './pricing-catalog-state.service';
import { PlansApiService } from '../api/plans-api.service';
import { CreditsApiService } from '../api/credits-api.service';
import { NotificationRealtimeService } from './notification-realtime.service';
import { AccountStateService } from './account-state.service';
import { AuthService } from '../auth/auth.service';

describe('PricingCatalogStateService',()=>{
  let state:PricingCatalogStateService;let plans:any;let credits:any;let token:string|null;
  beforeEach(()=>{token=null;plans={getActivePlans:jasmine.createSpy().and.resolveTo([])};credits={getPacks:jasmine.createSpy().and.resolveTo({packs:[],paymentProvider:'paypal'})};TestBed.configureTestingModule({providers:[PricingCatalogStateService,{provide:PlansApiService,useValue:plans},{provide:CreditsApiService,useValue:credits},{provide:NotificationRealtimeService,useValue:{events$:new Subject()}},{provide:AccountStateService,useValue:{refresh:()=>Promise.resolve()}},{provide:AuthService,useValue:{getBackendJwt:()=>token,getBackendRole:()=>token?'teacher':null}}]});state=TestBed.inject(PricingCatalogStateService)});
  it('loads public plans without private calls',async()=>{await state.refreshPlans();expect(plans.getActivePlans).toHaveBeenCalledTimes(1);expect(credits.getPacks).not.toHaveBeenCalled()});
  it('isolates private failures from plans',async()=>{token='teacher';credits.getPacks.and.rejectWith(new Error('offline'));await state.refreshPlans();await expectAsync(state.refreshCreditPacks()).toBeRejected();expect(state.plansError()).toBeFalse();expect(state.creditPacksError()).toBeTrue()});
});
