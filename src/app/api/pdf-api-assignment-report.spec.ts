import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { environment } from '../../environments/environment';
import { PdfApiService } from './pdf-api.service';

describe('PdfApiService assignment report PDF', () => {
  let service: PdfApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(PdfApiService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('downloads a blob with the time zone and returns the server filename when it is readable and safe', async () => {
    const result = service.downloadAssignmentReportPdf('a/1', 'Asia/Dhaka');
    const req = http.expectOne((r) => r.url === `${environment.apiUrl}/pdf/assignment-report/a%2F1`);
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    expect(req.request.params.get('tz')).toBe('Asia/Dhaka');
    req.flush(new Blob(['%PDF'], { type: 'application/pdf' }), { headers: { 'Content-Disposition': 'attachment; filename="Rubrilo-report-essay-2026-11-14.pdf"' } });
    const { blob, filename } = await result;
    expect(blob.size).toBe(4);
    expect(filename).toBe('Rubrilo-report-essay-2026-11-14.pdf');
  });

  it('returns no filename when the header is missing (cross-origin) or unsafe', async () => {
    const result = service.downloadAssignmentReportPdf('a1', 'UTC');
    http.expectOne(() => true).flush(new Blob(['%PDF']), { headers: { 'Content-Disposition': 'attachment; filename="../x.exe"' } });
    expect((await result).filename).toBeNull();
    const second = service.downloadAssignmentReportPdf('a1', 'UTC');
    http.expectOne(() => true).flush(new Blob(['%PDF']));
    expect((await second).filename).toBeNull();
  });
});
