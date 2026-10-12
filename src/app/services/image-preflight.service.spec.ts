import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ImagePreflightService } from './image-preflight.service';
import { environment } from '../../environments/environment';

describe('ImagePreflightService', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('uses the analysis-only endpoint with the selected file', () => {
    const file = new File(['page'], 'page.png', { type: 'image/png' });
    const result = { ready: false, checks: [{ id: 'resolution', status: 'fail', required: true, label: 'Resolution' }] };
    const received = jasmine.createSpy();
    TestBed.inject(ImagePreflightService).check(file).subscribe(received);
    const req = TestBed.inject(HttpTestingController).expectOne(`${environment.apiUrl}/submissions/image-preflight`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.get('file')).toBe(file);
    req.flush({ success: true, data: result });
    expect(received).toHaveBeenCalledWith(result);
  });

  it('cancels the HTTP request when an image is removed', () => {
    const sub = TestBed.inject(ImagePreflightService).check(new File(['x'], 'x.png')).subscribe();
    const req = TestBed.inject(HttpTestingController).expectOne(`${environment.apiUrl}/submissions/image-preflight`);
    sub.unsubscribe();
    expect(req.cancelled).toBeTrue();
  });

  it('does not treat a malformed response as ready', () => {
    const error = jasmine.createSpy();
    TestBed.inject(ImagePreflightService).check(new File(['x'], 'x.png')).subscribe({ error });
    TestBed.inject(HttpTestingController).expectOne(`${environment.apiUrl}/submissions/image-preflight`)
      .flush({ success: true, data: { ready: true } });
    expect(error).toHaveBeenCalled();
  });
});
