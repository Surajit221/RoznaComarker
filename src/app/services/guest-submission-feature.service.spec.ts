import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GuestSubmissionFeature } from './guest-submission-feature.service';
import { environment } from '../../environments/environment';

describe('guest feature availability is backend-owned and fail-closed', () => {
 let feature: GuestSubmissionFeature, http: HttpTestingController;
 beforeEach(() => { TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }); feature = TestBed.inject(GuestSubmissionFeature); http = TestBed.inject(HttpTestingController); });
 afterEach(() => http.verify());
 it('starts disabled and reflects explicit backend enable/disable', async () => {
  expect(feature.enabled()).toBeFalse(); let pending = feature.load();
  http.expectOne(`${environment.apiUrl}/guest/status`).flush({ data: { enabled: true } }); expect(await pending).toBeTrue();
  pending = feature.load(); http.expectOne(`${environment.apiUrl}/guest/status`).flush({ data: { enabled: false } }); expect(await pending).toBeFalse(); expect(feature.enabled()).toBeFalse();
 });
 it('fails closed on status request failure and malformed responses', async () => {
  let pending = feature.load(); http.expectOne(`${environment.apiUrl}/guest/status`).flush({}, { status: 503, statusText: 'Unavailable' }); expect(await pending).toBeFalse();
  pending = feature.load(); http.expectOne(`${environment.apiUrl}/guest/status`).flush({ data: { enabled: 'true' } }); expect(await pending).toBeFalse();
 });
 it('coalesces concurrent checks without persisting stale availability', async () => {
  const a = feature.load(), b = feature.load(); expect(a).toBe(b); http.expectOne(`${environment.apiUrl}/guest/status`).flush({ data: { enabled: false } }); await a;
  const next = feature.load(); http.expectOne(`${environment.apiUrl}/guest/status`).flush({ data: { enabled: true } }); expect(await next).toBeTrue();
 });
});
