import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { UploadEssayForm } from './upload-essay-form';
import { ImagePreflightResult, ImagePreflightService } from '../../../../../services/image-preflight.service';
import { UPLOAD_MAX_BYTES } from '../../../../../components/image-crop/image-crop.util';

describe('Shared upload crop source lifecycle', () => {
  let fixture: ComponentFixture<UploadEssayForm>, form: UploadEssayForm, check: jasmine.Spy;
  const passed: ImagePreflightResult = {ready:true,checks:[],sourceReadRequired:true,sourceReadStatus:'PASSED',canSubmit:true};
  const rect = {x:.1,y:.1,width:.8,height:.8};
  const file = (name: string) => new File([name], name + '.png', {type:'image/png'});
  function select(...files: File[]) {
    const transfer = new DataTransfer(); files.forEach(f => transfer.items.add(f));
    form.onFilesSelected({target:{files:transfer.files,value:''}} as unknown as Event);
  }
  /** Finishes the automatic crop step for the image currently in the editor, keeping it uncropped. */
  const useFull = () => form.useFullImage(form.editingEntry!);
  beforeEach(async () => {
    check = jasmine.createSpy().and.returnValue(of(passed));
    await TestBed.configureTestingModule({imports:[UploadEssayForm],providers:[{provide:ImagePreflightService,useValue:{check}}]}).compileComponents();
    fixture = TestBed.createComponent(UploadEssayForm); form = fixture.componentInstance; fixture.detectChanges();
  });
  afterEach(() => fixture.destroy());

  it('opens the crop editor automatically when an image is picked, with no "Use Image" step', () => {
    select(file('original')); fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    expect(form.editingEntry).toBe(form.files[0]); expect(form.reviewing).toBeTrue();
    expect(host.querySelector('app-image-crop')).toBeTruthy();
    const labels = Array.from(host.querySelectorAll('app-image-crop button')).map(button => button.textContent?.trim());
    expect(labels).toContain('Crop & Continue'); expect(labels).toContain('Use full image');
    expect(host.textContent).not.toContain('Use Image');
    expect(host.querySelector('app-image-crop h3')?.textContent).toBe('Crop your image');
    expect(check).not.toHaveBeenCalled(); expect(form.ready).toBeFalse();
  });

  it('"Use full image" keeps the original and starts the image check automatically', () => {
    const original = file('original'); select(original); const entry = form.files[0], preview = entry.preview;
    useFull();
    expect(form.editingEntry).toBeUndefined(); expect(entry.file).toBe(original); expect(entry.preview).toBe(preview);
    expect(entry.crop).toBeUndefined(); expect(check).toHaveBeenCalledOnceWith(original, null); expect(form.ready).toBeTrue();
  });

  it('cancelling the crop step keeps the original image and still runs the check', () => {
    const original = file('original'); select(original); const entry = form.files[0], preview = entry.preview;
    form.cancelCrop();
    expect(form.editingEntry).toBeUndefined(); expect(entry.file).toBe(original); expect(entry.preview).toBe(preview);
    expect(check).toHaveBeenCalledOnceWith(original, null); expect(form.ready).toBeTrue();
  });

  it('"Crop & Continue" checks the cropped bytes automatically, never the original', () => {
    const original = file('original'), crop = file('crop'); select(original); const entry = form.files[0];
    form.applyCrop(entry, {file: crop, rect});
    expect(entry.file).toBe(crop); expect(entry.original).toBe(original); expect(entry.crop).toEqual(rect);
    expect(check).toHaveBeenCalledOnceWith(crop, null); expect(form.ready).toBeTrue();
  });

  it('steps through several images one at a time, checking each as soon as it is finished', () => {
    const [a, b, c] = ['a', 'b', 'c'].map(file), crop = file('b-crop'); select(a, b, c); fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement, heading = () => host.querySelector('app-image-crop h3')?.textContent;
    expect(form.editingEntry!.file).toBe(a); expect(heading()).toBe('Image 1 of 3');
    expect(host.querySelectorAll('app-image-crop').length).toBe(1);
    expect(host.textContent).toContain('Waiting for the crop step');
    useFull(); fixture.detectChanges();
    expect(check).toHaveBeenCalledOnceWith(a, null); // a is checked while b is being cropped
    expect(form.editingEntry!.file).toBe(b); expect(heading()).toBe('Image 2 of 3'); expect(form.ready).toBeFalse();
    form.applyCrop(form.editingEntry!, {file: crop, rect}); fixture.detectChanges();
    expect(form.editingEntry!.file).toBe(c); expect(heading()).toBe('Image 3 of 3');
    form.cancelCrop(); fixture.detectChanges();
    expect(form.editingEntry).toBeUndefined(); expect(host.querySelector('app-image-crop')).toBeNull();
    expect(check.calls.allArgs().map(args => args[0])).toEqual([a, crop, c]);
    expect(form.files.map(entry => entry.file)).toEqual([a, crop, c]); expect(form.ready).toBeTrue();
  });

  it('opens a fresh editor for each image instead of reusing the previous preview', () => {
    select(file('a'), file('b')); fixture.detectChanges();
    const first = (fixture.nativeElement.querySelector('app-image-crop img') as HTMLImageElement).src;
    useFull(); fixture.detectChanges();
    const second = (fixture.nativeElement.querySelector('app-image-crop img') as HTMLImageElement).src;
    expect(second).not.toBe(first);
  });

  it('removing the image being cropped moves to the next one; removing a waiting image updates the count', () => {
    select(file('a'), file('b'), file('c'), file('d')); fixture.detectChanges();
    expect(form.editorHeading).toBe('Image 1 of 4');
    form.removeFile(new Event('click'), 3); expect(form.editorHeading).toBe('Image 1 of 3');
    form.removeFile(new Event('click'), 0); expect(form.editingEntry!.name).toBe('b.png'); expect(form.editorHeading).toBe('Image 1 of 2');
    useFull(); expect(form.editorHeading).toBe('Image 2 of 2');
    useFull(); expect(form.editingEntry).toBeUndefined(); expect(form.editorHeading).toBe('Crop Image');
  });

  it('shows Crop and Reset to Original only as small secondary actions on a finished image', () => {
    select(file('a'), file('b')); fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement, actions = () => Array.from(host.querySelectorAll('.crop-actions button')).map(b => b.textContent?.trim());
    expect(actions()).toEqual([]);
    useFull(); fixture.detectChanges();
    expect(actions()).toEqual(['Crop']); // only the finished image; the other is being cropped
    form.applyCrop(form.editingEntry!, {file: file('b-crop'), rect}); fixture.detectChanges();
    expect(actions()).toEqual(['Crop', 'Crop', 'Reset to Original']);
  });

  it('keeps the original selection and runs no new check when re-cropping a finished image is cancelled', () => {
    const original = file('original'); select(original); const entry = form.files[0]; useFull(); fixture.detectChanges();
    form.openCrop(entry); expect(form.reviewing).toBeFalse(); expect(form.editorHeading).toBe('Crop Image'); expect(form.ready).toBeFalse();
    form.cancelCrop();
    expect(entry.file).toBe(original); expect(check).toHaveBeenCalledTimes(1); expect(form.ready).toBeTrue();
  });

  it('invalidates accepted evidence before emitting cropped bytes; reset checks the original again', () => {
    select(file('original')); const entry = form.files[0], original = entry.file; useFull();
    expect(form.ready).toBeTrue(); const next = new Subject<ImagePreflightResult>(); check.and.returnValue(next);
    const emitted: File[][] = []; form.filesSelected.subscribe(files => { expect(form.ready).toBeFalse(); emitted.push(files); });
    const preview = entry.preview, revoke = spyOn(URL, 'revokeObjectURL').and.callThrough();
    const crop = file('crop'); form.openCrop(entry); expect(form.ready).toBeFalse();
    form.applyCrop(entry, {file:crop,rect});
    expect(entry.quality).toBeUndefined(); expect(entry.file).toBe(crop); expect(entry.preview).not.toBe(preview);
    expect(revoke).toHaveBeenCalledWith(preview!); expect(emitted.at(-1)).toEqual([crop]);
    expect(check.calls.mostRecent().args[0]).toBe(crop); expect(form.ready).toBeFalse();
    next.next({...passed,ready:false,sourceReadStatus:'CHECKING',canSubmit:false}); expect(form.ready).toBeFalse();
    next.next(passed); next.complete(); expect(form.ready).toBeTrue();
    check.and.returnValue(new Subject<ImagePreflightResult>()); form.resetCrop(entry);
    expect(entry.file).toBe(original); expect(entry.crop).toBeUndefined(); expect(entry.quality).toBeUndefined();
    expect(form.ready).toBeFalse(); expect(check.calls.mostRecent().args[0]).toBe(original);
  });

  it('keeps rejected crop for replacement and retries a service failure with the same replacement bytes', () => {
    select(file('original')); const entry = form.files[0], crop = file('crop');
    check.and.returnValue(of({...passed,ready:false,canSubmit:false,sourceReadStatus:'FAILED_IMAGE'}));
    form.applyCrop(entry,{file:crop,rect}); expect(form.ready).toBeFalse();
    const calls=check.calls.count();form.retryQuality(entry);
    expect(check.calls.count()).toBe(calls);expect(entry.file).toBe(crop);expect(form.ready).toBeFalse();
    const replacement=file('replacement-crop');
    check.and.returnValue(of({...passed,ready:false,canSubmit:false,sourceReadStatus:'FAILED_SERVICE'}));
    form.openCrop(entry);form.applyCrop(entry,{file:replacement,rect});expect(form.ready).toBeFalse(); const preview = entry.preview;
    check.and.returnValue(of(passed)); form.retryQuality(entry);
    expect(entry.preview).toBe(preview); expect(entry.crop).toEqual(rect); expect(entry.file).toBe(replacement);
    expect(check.calls.mostRecent().args[0]).toBe(replacement); expect(form.ready).toBeTrue();
  });

  it('isolates Page 2 crop, cancels its old check, ignores stale responses, and preserves order and other passes', () => {
    select(file('one'),file('two'),file('three')); for (let i = 0; i < 3; i++) useFull();
    const [one,two,three] = form.files, onePreview = one.preview, threeQuality = three.quality;
    const a = new Subject<ImagePreflightResult>(), b = new Subject<ImagePreflightResult>(); check.and.returnValues(a,b);
    form.openCrop(two); form.applyCrop(two,{file:file('crop-a'),rect}); expect(a.observed).toBeTrue();
    form.openCrop(two); form.applyCrop(two,{file:file('crop-b'),rect}); expect(a.observed).toBeFalse();
    a.next(passed); a.complete(); expect(form.ready).toBeFalse(); expect(two.quality).toBeUndefined();
    expect(form.files).toEqual([one,two,three]); expect(one.preview).toBe(onePreview); expect(three.quality).toBe(threeQuality);
    b.next(passed); b.complete(); expect(form.ready).toBeTrue();
    const revoke = spyOn(URL,'revokeObjectURL').and.callThrough(), preview = two.preview;
    form.openCrop(two); form.removeFile(new Event('click'),1);
    // The live editor also revokes its own preview URL when it closes; the removed page's preview must be revoked exactly once.
    expect(form.editingEntry).toBeUndefined(); expect(form.files).toEqual([one,three]);
    expect(revoke.calls.allArgs().filter(args => args[0] === preview).length).toBe(1);
  });

  it('rapid apply/reset/apply remains deterministic and destroy cancels the final check', () => {
    select(file('original')); const entry = form.files[0]; const pending = new Subject<ImagePreflightResult>(); check.and.returnValue(pending);
    form.applyCrop(entry,{file:file('a'),rect}); form.resetCrop(entry);
    form.openCrop(entry); const b = file('b'); form.applyCrop(entry,{file:b,rect});
    expect(entry.file).toBe(b); expect(entry.quality).toBeUndefined(); expect(form.ready).toBeFalse();
    fixture.destroy(); expect(pending.observed).toBeFalse();
  });

  it('never crops PDFs or alters their existing automatic check flow', () => {
    select(new File(['pdf'],'page.pdf',{type:'application/pdf'})); const entry = form.files[0];
    expect(entry.original).toBeUndefined(); form.openCrop(entry); expect(form.editingEntry).toBeUndefined();
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('checks a PDF immediately while an image selected with it waits in the crop editor', () => {
    const pdf = new File(['pdf'],'page.pdf',{type:'application/pdf'}); select(file('photo'), pdf);
    expect(form.editingEntry!.name).toBe('photo.png'); expect(check).toHaveBeenCalledOnceWith(pdf, null); expect(form.ready).toBeFalse();
    useFull(); expect(form.ready).toBeTrue();
  });

  describe('photos over the 10MB upload limit', () => {
    let previousTimeout: number;
    beforeEach(() => { previousTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL; jasmine.DEFAULT_TIMEOUT_INTERVAL = 120000; });
    afterEach(() => { jasmine.DEFAULT_TIMEOUT_INTERVAL = previousTimeout; });
    const waitFor = async (condition: () => boolean) => { for (let i = 0; i < 1200 && !condition(); i++) await new Promise<void>(r => setTimeout(r, 50)); };
    async function heavyPhoto(name: string) {
      const canvas = document.createElement('canvas'); canvas.width = 4000; canvas.height = 3000;
      const context = canvas.getContext('2d')!, data = context.createImageData(4000, 3000);
      for (let offset = 0; offset < data.data.length; offset += 65536) crypto.getRandomValues(data.data.subarray(offset, offset + 65536));
      for (let i = 3; i < data.data.length; i += 4) data.data[i] = 255;
      context.putImageData(data, 0, 0);
      const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/jpeg', 1));
      canvas.width = 0; canvas.height = 0;
      return new File([blob], name, { type: 'image/jpeg' });
    }

    it('compresses an uncropped photo instead of rejecting it, then checks the compressed file', async () => {
      const photo = await heavyPhoto('IMG 1.jpg'); expect(photo.size).toBeGreaterThan(UPLOAD_MAX_BYTES);
      select(photo); const entry = form.files[0];
      expect(entry.qualityState).toBe('preparing'); expect(form.validationError).toBeNull();
      expect(form.ready).toBeFalse(); expect(form.editingEntry).toBeUndefined(); expect(check).not.toHaveBeenCalled();
      await waitFor(() => form.editingEntry === entry);
      expect(form.editingEntry).toBe(entry); expect(entry.file).not.toBe(photo);
      expect(entry.size).toBeLessThanOrEqual(UPLOAD_MAX_BYTES); expect(entry.name).toBe('IMG_1-compressed.jpg');
      useFull();
      expect(check).toHaveBeenCalledOnceWith(entry.file, null); expect(form.ready).toBeTrue();
    });

    it('keeps selection order when a heavy photo is followed by a normal one', async () => {
      const photo = await heavyPhoto('big.jpg'), small = file('small'); select(photo, small);
      const [big] = form.files; expect(form.editingEntry).toBeUndefined(); // waits for the first image, not skipping ahead
      await waitFor(() => form.editingEntry === big);
      expect(form.editorHeading).toBe('Image 1 of 2'); useFull();
      expect(form.editingEntry!.file).toBe(small); expect(form.editorHeading).toBe('Image 2 of 2');
    });

    it('still rejects a PDF over 10MB', () => {
      const pdf = new File(['%PDF'], 'big.pdf', {type: 'application/pdf'});
      Object.defineProperty(pdf, 'size', {value: UPLOAD_MAX_BYTES + 1});
      select(pdf);
      expect(form.files).toEqual([]); expect(form.validationError).toContain('Only JPG, PNG, and PDF');
      expect(form.validationError).toContain('PDFs must be 10MB or smaller'); expect(check).not.toHaveBeenCalled();
    });

    it('rejects a photo too large to process at all', () => {
      const huge = file('huge'); Object.defineProperty(huge, 'size', {value: 51 * 1024 * 1024});
      select(huge); expect(form.files).toEqual([]); expect(form.validationError).toContain('too large to process');
    });

    it('drops an unreadable oversized photo with a clear message and no check', async () => {
      const broken = new File([new Uint8Array(UPLOAD_MAX_BYTES + 1)], 'broken.jpg', {type: 'image/jpeg'});
      select(broken); expect(form.files.length).toBe(1);
      await waitFor(() => form.files.length === 0);
      expect(form.files).toEqual([]); expect(form.validationError).toContain('Unable to open this image');
      expect(check).not.toHaveBeenCalled(); expect(form.editingEntry).toBeUndefined();
    });
  });
});
