import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PlansApiService } from './plans-api.service';
import { environment } from '../../environments/environment';

describe('PlansApiService', () => {
  beforeEach(() => TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting()]}));
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('rejects malformed public catalog responses', async () => {
    const pending=TestBed.inject(PlansApiService).getActivePlans();
    TestBed.inject(HttpTestingController).expectOne(environment.apiUrl+'/plans').flush({success:true,data:null});
    await expectAsync(pending).toBeRejected();
  });
});
