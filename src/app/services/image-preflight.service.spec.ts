import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ImagePreflightService } from './image-preflight.service';
import { environment } from '../../environments/environment';

describe('ImagePreflightService', () => {
  it('source timeout cancels transport, keeps the selected file reusable and returns a blocked service state',fakeAsync(()=>{
    const file=new File(['synthetic'],'page.png'),received=jasmine.createSpy(),http=TestBed.inject(HttpTestingController);
    TestBed.inject(ImagePreflightService).check(file,'assignment').subscribe(received);
    http.expectOne(environment.apiUrl+'/submissions/image-preflight').flush({success:true,data:{ready:false,checks:[],sourceReadRequired:true,basicChecksPassed:true,sourceReadStatus:'CHECKING'}});
    const source=http.expectOne(environment.apiUrl+'/submissions/image-preflight');
    tick(239999);expect(source.cancelled).toBeFalse();tick(1);expect(source.cancelled).toBeTrue();
    expect(received.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ready:false,canSubmit:false,sourceReadStatus:'FAILED_SERVICE'}));
    TestBed.inject(ImagePreflightService).check(file,'assignment').subscribe();
    const retry=http.expectOne(environment.apiUrl+'/submissions/image-preflight');expect(retry.request.body.get('file')).toBe(file);
    retry.flush({success:true,data:{ready:false,checks:[],basicChecksPassed:false}});
  }));
  it('emits source-checking after basic checks, then performs one explicit assignment-bound source request', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const received = jasmine.createSpy(),http = TestBed.inject(HttpTestingController);
    TestBed.inject(ImagePreflightService).check(new File(['x'], 'x.png'), 'assignment').subscribe(received);
    const basic = http.expectOne(`${environment.apiUrl}/submissions/image-preflight`);
    expect(basic.request.body.get('phase')).toBe('basic');expect(basic.request.body.get('assignmentId')).toBe('assignment');
    basic.flush({ success: true, data: { ready: false, checks: [], basicChecksPassed: true, sourceReadRequired: true, sourceReadStatus: 'CHECKING' } });
    expect(received.calls.mostRecent().args[0].sourceReadStatus).toBe('CHECKING');
    const source = http.expectOne(`${environment.apiUrl}/submissions/image-preflight`);expect(source.request.body.get('phase')).toBe('source');
    source.flush({ success: true, data: { ready: true, checks: [], sourceReadRequired: true, sourceReadStatus: 'PASSED', canSubmit: true } });
    expect(received.calls.count()).toBe(2);http.verify();
  });
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('ignores a legacy upload-pending flag and still requires the source request', () => {
    const received=jasmine.createSpy(),http=TestBed.inject(HttpTestingController);
    TestBed.inject(ImagePreflightService).check(new File(['x'],'x.png'),'assignment').subscribe(received);
    http.expectOne(environment.apiUrl+'/submissions/image-preflight').flush({success:true,data:{ready:false,checks:[],
      sourceReadRequired:true,basicChecksPassed:true,canUploadPending:true,sourceReadStatus:'CHECKING'}});
    expect(received.calls.mostRecent().args[0].sourceReadStatus).toBe('CHECKING');
    expect(received.calls.mostRecent().args[0].canSubmit).not.toBeTrue();
    const source = http.expectOne(environment.apiUrl+'/submissions/image-preflight');
    expect(source.request.body.get('phase')).toBe('source');
    source.flush({success:true,data:{ready:true,checks:[],sourceReadStatus:'PASSED',canSubmit:true}});
  });
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
