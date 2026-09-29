import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CreditsApiService } from './credits-api.service';
import { environment } from '../../environments/environment';

describe('CreditsApiService catalog contract', () => {
  beforeEach(() => TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting()]}));
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('accepts a successful empty catalog', async () => {
    const pending=TestBed.inject(CreditsApiService).getPacks();
    TestBed.inject(HttpTestingController).expectOne(environment.apiUrl+'/credits/packs').flush({success:true,packs:[],paymentProvider:'paypal'});
    expect((await pending).packs).toEqual([]);
  });
  it('distinguishes configuration failure from an empty catalog', async () => {
    const pending=TestBed.inject(CreditsApiService).getPacks();
    TestBed.inject(HttpTestingController).expectOne(environment.apiUrl+'/credits/packs').flush({success:false},{status:503,statusText:'Unavailable'});
    await expectAsync(pending).toBeRejected();
  });
  it('requests the authenticated browser-safe Card Fields token endpoint',async()=>{
    const pending=TestBed.inject(CreditsApiService).getPayPalCardClientToken();
    TestBed.inject(HttpTestingController).expectOne(environment.apiUrl+'/credits/paypal/card/client-token')
      .flush({success:true,data:{browserToken:'browser-safe'}});
    await expectAsync(pending).toBeResolvedTo('browser-safe');
  });
  it('creates a Card Fields order with only the trusted pack and attempt identifiers',async()=>{
    const pending=TestBed.inject(CreditsApiService).createPayPalCardOrder('PACK','00000000-0000-4000-8000-000000000001');
    const request=TestBed.inject(HttpTestingController).expectOne(environment.apiUrl+'/credits/paypal/card/create-order');
    expect(request.request.body).toEqual({packCode:'PACK',checkoutAttemptId:'00000000-0000-4000-8000-000000000001'});
    request.flush({success:true,data:{attemptId:'00000000-0000-4000-8000-000000000001',orderId:'ORDER',status:'approval_pending'}});
    expect((await pending).orderId).toBe('ORDER');
  });
});
