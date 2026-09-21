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
});
