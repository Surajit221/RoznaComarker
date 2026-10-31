import { fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
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

 const status = `${environment.apiUrl}/guest/status`;
 it('keeps the last known value while a refresh is pending and after it fails', async () => {
  let pending = feature.load(); http.expectOne(status).flush({ data: { enabled: true } }); await pending;
  pending = feature.load();
  expect(feature.enabled()).toBeTrue(); expect(feature.state()).toBe('enabled'); // no reset while pending
  http.expectOne(status).flush({}, { status: 503, statusText: 'Unavailable' });
  expect(await pending).toBeFalse(); // load() itself still fails closed for guest entry
  expect(feature.enabled()).toBeTrue(); expect(feature.state()).toBe('unavailable');
 });
 it('treats a malformed answer as unavailable and only an explicit false as disabled', async () => {
  let pending = feature.load(); http.expectOne(status).flush({ data: { enabled: true } }); await pending;
  pending = feature.load(); http.expectOne(status).flush({ data: { enabled: 'false' } }); await pending;
  expect(feature.state()).toBe('unavailable'); expect(feature.enabled()).toBeTrue();
  pending = feature.load(); http.expectOne(status).flush({ data: { enabled: false } }); await pending;
  expect(feature.state()).toBe('disabled'); expect(feature.enabled()).toBeFalse();
 });
 it('treats a status timeout as unavailable without dropping the last known value', fakeAsync(() => {
  void feature.load(); http.expectOne(status).flush({ data: { enabled: true } }); flushMicrotasks();
  void feature.load(); const request = http.expectOne(status);
  tick(5001); flushMicrotasks();
  expect(request.cancelled).toBeTrue(); expect(feature.state()).toBe('unavailable'); expect(feature.enabled()).toBeTrue();
 }));
 it('settled() reuses an in-flight check, skips the request when known, and retries once when unavailable', async () => {
  expect(feature.state()).toBe('unknown');
  const first = feature.load(), waiting = feature.settled();
  http.expectOne(status).flush({ data: { enabled: true } }); await first;
  expect(await waiting).toBe('enabled');
  expect(await feature.settled()).toBe('enabled'); http.expectNone(status);
  const failing = feature.load(); http.expectOne(status).error(new ProgressEvent('error')); await failing;
  expect(feature.state()).toBe('unavailable');
  const retry = feature.settled(); await Promise.resolve();
  http.expectOne(status).flush({ data: { enabled: false } }); expect(await retry).toBe('disabled');
 });
 it('settled() starts the first check itself when nothing has loaded yet', async () => {
  const settled = feature.settled(); http.expectOne(status).flush({ data: { enabled: true } });
  expect(await settled).toBe('enabled');
 });
});
