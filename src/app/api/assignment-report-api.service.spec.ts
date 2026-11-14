import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { environment } from '../../environments/environment';
import { AssignmentReportApiService, browserTimeZone, reportErrorState } from './assignment-report-api.service';

describe('AssignmentReportApiService', () => {
  let service: AssignmentReportApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AssignmentReportApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends the time zone and returns the report data', async () => {
    const result = service.getReport('a/1', 'Asia/Dhaka');
    const req = http.expectOne((r) => r.url === `${environment.apiUrl}/assignments/a%2F1/report`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('tz')).toBe('Asia/Dhaka');
    req.flush({ success: true, data: { version: 'assignment-report-v1' } });
    expect((await result).version).toBe('assignment-report-v1');
  });

  it('uses the browser time zone by default', async () => {
    const result = service.getReport('a1');
    const req = http.expectOne((r) => r.url === `${environment.apiUrl}/assignments/a1/report`);
    expect(req.request.params.get('tz')).toBe(browserTimeZone());
    req.flush({ success: true, data: {} });
    await result;
  });

  it('falls back to UTC when the browser cannot name its zone', () => {
    spyOn(Intl, 'DateTimeFormat').and.throwError('unsupported');
    expect(browserTimeZone()).toBe('UTC');
  });

  it('propagates HTTP errors', async () => {
    const result = service.getReport('a1', 'UTC');
    const rejected = expectAsync(result).toBeRejectedWith(jasmine.objectContaining({ status: 404 }));
    http.expectOne(() => true).flush({ message: 'Assignment not found' }, { status: 404, statusText: 'Not Found' });
    await rejected;
  });

  it('maps errors to page states and never to the raw server message', () => {
    const err = (status: number) => new HttpErrorResponse({ status, error: { message: 'raw server text' } });
    expect(reportErrorState(err(404))).toBe('not_found');
    expect(reportErrorState(err(409))).toBe('unsupported');
    expect(reportErrorState(err(429))).toBe('busy');
    expect(reportErrorState(err(503))).toBe('busy');
    expect(reportErrorState(err(500))).toBe('error');
    expect(reportErrorState(err(0))).toBe('error');
    expect(reportErrorState(new Error('boom'))).toBe('error');
    expect(reportErrorState(null)).toBe('error');
  });
});
