import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';

import { of, Subject } from 'rxjs';
import { ImagePreflightService, ImagePreflightResult } from '../../../../../services/image-preflight.service';
import { UploadEssayForm } from './upload-essay-form';

describe('UploadEssayForm', () => {
  const ready: ImagePreflightResult = { ready: true, checks: [
    { id: 'resolution', label: 'Resolution', required: true, status: 'pass' },
    { id: 'lighting', label: 'Exposure', required: true, status: 'pass' },
    { id: 'orientation', label: 'Upright image', required: true, status: 'pass' },
    { id: 'clarity', label: 'Image clarity', required: false, status: 'unavailable', message: 'Check yourself' },
  ] };
  let check: jasmine.Spy;
  let component: UploadEssayForm;
  let fixture: ComponentFixture<UploadEssayForm>;

  beforeEach(async () => {
    check = jasmine.createSpy().and.returnValue(of(ready));
    await TestBed.configureTestingModule({
      imports: [UploadEssayForm], providers: [{ provide: ImagePreflightService, useValue: { check } }]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UploadEssayForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('reorders the authoritative selected-file array before upload', () => {
    const introduction = new File(['intro'], 'introduction.jpg', { type: 'image/jpeg' });
    const continuation = new File(['next'], 'continuation.jpg', { type: 'image/jpeg' });
    component.files = [
      { file: continuation, name: continuation.name, size: continuation.size },
      { file: introduction, name: introduction.name, size: introduction.size }
    ];
    let emitted: File[] = [];
    component.filesSelected.subscribe((files) => { emitted = files; });

    component.moveFile(new Event('click'), 1, -1);

    expect(component.files.map((entry) => entry.name)).toEqual(['introduction.jpg', 'continuation.jpg']);
    expect(emitted).toEqual([introduction, continuation]);
  });

  it('opens an image-only picker without submitting, while retaining PDF selection', () => {
    const imagePicker = component.imageInput.nativeElement;
    const allFilesPicker = component.fileInput.nativeElement;
    const open = spyOn(imagePicker, 'click');

    component.openImagePicker();

    expect(open).toHaveBeenCalledTimes(1);
    expect(imagePicker.accept).toContain('image/png');
    expect(imagePicker.accept).not.toContain('pdf');
    expect(allFilesPicker.accept).toContain('application/pdf');

    const pdf = new File(['%PDF-1.4'], 'essay.pdf', { type: 'application/pdf' });
    const selection = new DataTransfer();
    selection.items.add(pdf);
    component.onFilesSelected({ target: { files: selection.files, value: '' } } as unknown as Event);
    expect(component.files.map((entry) => entry.name)).toEqual(['essay.pdf']);
  });

  it('does not add a PDF selected through the image-only control', () => {
    const pdf = new File(['%PDF-1.4'], 'essay.pdf', { type: 'application/pdf' });
    const selection = new DataTransfer();
    selection.items.add(pdf);
    component.onImagesSelected({ target: { files: selection.files, value: '' } } as unknown as Event);
    expect(component.files).toEqual([]);
    expect(component.validationError).toContain('JPG and PNG');
  });

  it('keeps multiple images selected and rejects unsupported or oversized files', () => {
    const first = new File(['first'], 'first.jpg', { type: 'image/jpeg' });
    const second = new File(['second'], 'second.png', { type: 'image/png' });
    const images = new DataTransfer();
    images.items.add(first);
    images.items.add(second);
    const selected: File[][] = [];
    component.filesSelected.subscribe((files) => selected.push(files));

    component.onFilesSelected({ target: { files: images.files, value: '' } } as unknown as Event);
    expect(selected.at(-1)).toEqual([first, second]);
    expect(component.files.map((entry) => entry.name)).toEqual(['first.jpg', 'second.png']);

    const invalid = new DataTransfer();
    invalid.items.add(new File(['text'], 'notes.txt', { type: 'text/plain' }));
    const oversized = new File(['x'], 'large.jpg', { type: 'image/jpeg' });
    Object.defineProperty(oversized, 'size', { value: 10 * 1024 * 1024 + 1 });
    invalid.items.add(oversized);
    component.onFilesSelected({ target: { files: invalid.files, value: '' } } as unknown as Event);
    expect(component.files.map((entry) => entry.name)).toEqual(['first.jpg', 'second.png']);
    expect(component.validationError).toContain('Only JPG, PNG, and PDF');
  });

  it('respects the existing 20-file upload limit', () => {
    component.files = Array.from({ length: 20 }, (_, i) => {
      const file = new File(['page'], `page-${i}.pdf`, { type: 'application/pdf' });
      return { file, name: file.name, size: file.size };
    });
    const more = new DataTransfer();
    more.items.add(new File(['extra'], 'extra.pdf', { type: 'application/pdf' }));
    component.onFilesSelected({ target: { files: more.files, value: '' } } as unknown as Event);
    expect(component.files.length).toBe(20);
    expect(component.validationError).toContain('20 files');
  });

  function select(name: string) {
    const file = new File(['test'], name, { type: 'image/png' });
    const selection = new DataTransfer(); selection.items.add(file);
    component.onFilesSelected({ target: { files: selection.files, value: '' } } as unknown as Event);
    const entry = component.files.find(item => item.file === file);
    if (entry) component.useImage(entry);
    return file;
  }

  it('blocks while checking and emits ready only when every image passes', () => {
    const a = new Subject<ImagePreflightResult>(), b = new Subject<ImagePreflightResult>();
    check.and.returnValues(a, b);
    const states: boolean[] = [];
    component.readinessChange.subscribe(state => states.push(state));
    select('a.png'); select('b.png');
    expect(component.ready).toBeFalse();
    expect(check).toHaveBeenCalledTimes(1);
    a.next(ready); a.complete();
    expect(check).toHaveBeenCalledTimes(2);
    expect(component.ready).toBeFalse();
    b.next({ ready: false, checks: [{ id: 'orientation', label: 'Upright image', required: true, status: 'fail' }] }); b.complete();
    expect(component.files[0].quality?.ready).toBeTrue();
    expect(component.files[1].quality?.ready).toBeFalse();
    expect(states.at(-1)).toBeFalse();
    component.removeFile(new Event('click'), 1);
    expect(states.at(-1)).toBeTrue();
  });
  it('keeps exact handwriting failures disabled, shows the existing readability row, and does not reread on rendering', () => {
    component.assignmentId = 'assignment';const pending = new Subject<ImagePreflightResult>();check.and.returnValue(pending);
    select('exact.png');expect(check).toHaveBeenCalledWith(jasmine.any(File), 'assignment');
    const state: ImagePreflightResult = { ready: false, sourceReadRequired: true, sourceReadStatus: 'CHECKING', checks: [
      { id: 'handwritingReadability', label: 'Handwriting readability', required: true, status: 'checking', message: 'Checking source' }] };
    pending.next(state);fixture.detectChanges();expect(component.ready).toBeFalse();expect(fixture.nativeElement.textContent).toContain('Handwriting readability');
    fixture.detectChanges();fixture.detectChanges();expect(check).toHaveBeenCalledTimes(1);
    pending.next({ ...state, sourceReadStatus: 'FAILED_IMAGE', checks: [{ ...state.checks[0], status: 'fail' }] });pending.complete();fixture.detectChanges();
    expect(component.ready).toBeFalse();expect(fixture.nativeElement.textContent).toContain('Needs a clearer image');
  });
  it('keeps source progress indeterminate, cancels removed files and checks a replacement once', fakeAsync(() => {
    const old = new Subject<ImagePreflightResult>(), replacement = new Subject<ImagePreflightResult>();
    check.and.returnValues(old, replacement);
    const pending: ImagePreflightResult = { ready: false, sourceReadRequired: true, sourceReadStatus: 'CHECKING',
      processingProgress:{status:'processing',stage:'source',percent:60,message:'Reading handwriting and verifying readability',active:true,completed:false,failed:false},
      checks: [{ id: 'handwritingReadability', label: 'Handwriting readability', required: true, status: 'checking' }] };
    select('old.png'); old.next(pending); fixture.detectChanges();
    expect(component.handwritingChecking).toBeTrue();
    tick(60000); fixture.detectChanges(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="progressbar"]').hasAttribute('aria-valuenow')).toBeFalse();
    expect(fixture.nativeElement.textContent).not.toContain('60%');
    expect(check).toHaveBeenCalledTimes(1);
    component.removeFile(new Event('click'), 0);
    expect(old.observed).toBeFalse();
    expect(component.handwritingChecking).toBeFalse();
    expect(fixture.nativeElement.querySelector('[role="progressbar"]')).toBeNull();
    select('replacement.png'); replacement.next(pending); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Reading handwriting and verifying readability');
    old.next({ ...ready, sourceReadRequired: true, sourceReadStatus: 'PASSED', canSubmit: true });
    expect(component.ready).toBeFalse();
    replacement.next({ ...ready, sourceReadRequired: true, sourceReadStatus: 'PASSED', canSubmit: true }); replacement.complete(); fixture.detectChanges();
    expect(component.ready).toBeTrue(); expect(component.handwritingChecking).toBeFalse();
    expect(fixture.nativeElement.querySelector('[role="progressbar"]')).toBeNull();
    tick(60000); expect(check).toHaveBeenCalledTimes(2);
  }));

  it('uses no timed stage guesses and cancels checks on reset or destroy', fakeAsync(() => {
    // Keep the source pending as the real two-phase service does.
    const pending = new Subject<ImagePreflightResult>(); check.and.returnValue(pending);
    const state: ImagePreflightResult = { ready: false, sourceReadRequired: true, sourceReadStatus: 'CHECKING', checks: [] };
    const schedule = spyOn(window, 'setTimeout').and.callThrough();
    select('reset.png'); pending.next(state); fixture.detectChanges();
    component.reset();
    select('destroy.png'); pending.next(state); fixture.detectChanges();
    fixture.destroy();
    const stageHandles = schedule.calls.all().filter(call => [5000, 20000, 45000].includes(Number(call.args[1]))).map(call => call.returnValue);
    expect(stageHandles).toEqual([]);
    expect(pending.observed).toBeFalse();
    tick(60000); expect(check).toHaveBeenCalledTimes(2);
  }));
  it('blocks basic-only checking and enables submission only when source verification passes', () => {
    const pending = new Subject<ImagePreflightResult>();check.and.returnValue(pending);
    select('pending.png');
    pending.next({ready:false,checks:[],sourceReadRequired:true,sourceReadStatus:'CHECKING',basicChecksPassed:true,canSubmit:false});
    expect(component.ready).toBeFalse();
    pending.next({ready:true,checks:[],sourceReadRequired:true,sourceReadStatus:'PASSED',basicChecksPassed:true,canSubmit:true});pending.complete();
    expect(component.ready).toBeTrue();
  });
  it('retries service failure with the same selected image and displays its error only once', () => {
    const message = 'Handwriting verification is temporarily unavailable. Please try again later.';
    check.and.returnValues(of({ready:false,sourceReadRequired:true,sourceReadStatus:'FAILED_SERVICE',canSubmit:false,message,
      checks:[{id:'handwritingReadability',label:'Handwriting readability',required:true,status:'unavailable',message}],
      processingProgress:{status:'failed',stage:'source',percent:60,message,active:false,completed:false,failed:true}}),
      of({ready:true,checks:[],sourceReadRequired:true,sourceReadStatus:'PASSED',canSubmit:true}));
    const file = select('retry.png');fixture.detectChanges();expect(component.ready).toBeFalse();
    const text = fixture.nativeElement.textContent as string;expect(text.split(message).length - 1).toBe(1);
    expect(text).toMatch(/Retry image check/i);
    component.retryQuality(component.files[0]);fixture.detectChanges();
    expect(component.files.length).toBe(1);expect(check.calls.mostRecent().args[0]).toBe(file);expect(component.ready).toBeTrue();
  });
  it('requires explicit accepted exact source status even if an inconsistent response says ready', () => {
    check.and.returnValue(of({ ready: true, checks: [], sourceReadRequired: true, sourceReadStatus: 'FAILED_SERVICE', canSubmit: false }));select('blocked.png');expect(component.ready).toBeFalse();
    component.reset();check.and.returnValue(of({ ready: true, checks: [], sourceReadRequired: true, sourceReadStatus: 'PASSED', canSubmit: true }));select('accepted.png');expect(component.ready).toBeTrue();
  });
  it('shows provider failure as service unavailability in the checklist and summary without blaming image quality', () => {
    const message = 'Handwriting verification is temporarily unavailable. Please try again later.';
    check.and.returnValue(of({ ready: false, checks: [{ id: 'handwritingReadability', label: 'Handwriting readability', required: true, status: 'unavailable', message }],
      sourceReadRequired: true, sourceReadStatus: 'FAILED_SERVICE', canSubmit: false, message }));
    select('service.png');fixture.detectChanges();expect(component.ready).toBeFalse();
    const text = fixture.nativeElement.textContent as string;expect(text).toContain('Temporarily unavailable');expect(text).not.toContain('Image needs attention');expect(text).not.toContain('clearer image');
  });

  it('ignores late results from a removed image and evaluates its replacement', () => {
    const a = new Subject<ImagePreflightResult>(), b = new Subject<ImagePreflightResult>();
    check.and.returnValues(a, b);
    select('a.png');
    const revoke = spyOn(URL, 'revokeObjectURL');
    component.removeFile(new Event('click'), 0);
    select('b.png');
    a.next({ ready: false, checks: [] }); a.complete();
    expect(component.files[0].name).toBe('b.png');
    expect(component.files[0].quality).toBeUndefined();
    b.next(ready); b.complete();
    expect(component.ready).toBeTrue();
    expect(revoke).toHaveBeenCalled();
  });

  it('shows a technical retry state and does not duplicate an active check', () => {
    const pending = new Subject<ImagePreflightResult>();
    check.and.returnValue(pending);
    select('retry.png');
    component.retryQuality(component.files[0]);
    expect(check).toHaveBeenCalledTimes(1);
    pending.error(new Error('offline'));
    fixture.detectChanges();
    expect(component.ready).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('We could not check this image');
    expect(fixture.nativeElement.textContent).not.toContain('unreadable');
    check.and.returnValue(of(ready));
    component.retryQuality(component.files[0]);
    expect(component.ready).toBeTrue();
  });

  it('cancels checks on reset and destruction', () => {
    const pending = new Subject<ImagePreflightResult>();
    check.and.returnValue(pending);
    select('a.png'); component.reset(); pending.next(ready);
    expect(component.files).toEqual([]);
    select('b.png'); component.ngOnDestroy(); pending.next(ready); pending.complete();
    expect(component.files[0].quality).toBeUndefined();
  });

  it('prevents changing files while the parent uploads a checked batch', () => {
    select('a.png'); component.disabled = true;
    component.removeFile(new Event('click'), 0); select('b.png');
    expect(component.files.length).toBe(1);
    expect(check).toHaveBeenCalledTimes(1);
  });

  for (const width of [360, 768, 1280]) {
    it('keeps checklist content and controls within its container at ' + width + 'px', () => {
      select('a-long-assignment-image-filename.png');
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;
      host.style.display = 'block'; host.style.width = width + 'px';
      expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth);
      expect(host.querySelectorAll('app-image-quality-checklist li.passed').length).toBe(3);
      expect(host.textContent).toContain('Check yourself');
      expect(host.querySelector('[role="status"]')?.getAttribute('aria-live')).toBe('polite');
    });
  }

  it('clears a rotated failure when replaced by an upright image', () => {
    check.and.returnValue(of({ready:false,checks:[{id:'orientation',label:'Upright image',required:true,status:'fail',message:'Please rotate the image so the writing is upright.'}]}));
    select('sideways.png'); fixture.detectChanges();
    expect(component.ready).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('Please rotate');
    component.removeFile(new Event('click'),0);
    check.and.returnValue(of(ready)); select('upright.png'); fixture.detectChanges();
    expect(component.ready).toBeTrue();
    expect(fixture.nativeElement.textContent).not.toContain('Please rotate');
  });
  it('blocks unavailable required orientation without showing rotated', () => {
    check.and.returnValue(of({ready:false,checks:[{id:'orientation',label:'Upright image',required:true,status:'unavailable',message:'Could not verify orientation. Please try again.'}]}));
    select('uncertain.png'); fixture.detectChanges();
    expect(component.ready).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('Could not check');
    expect(fixture.nativeElement.querySelector('li.failed')).toBeNull();
  });

});
