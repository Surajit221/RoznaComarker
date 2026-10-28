import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { UploadEssayForm } from './upload-essay-form';
import { ImagePreflightResult, ImagePreflightService } from '../../../../../services/image-preflight.service';

describe('Shared upload crop source lifecycle', () => {
  let fixture: ComponentFixture<UploadEssayForm>, form: UploadEssayForm, check: jasmine.Spy;
  const passed: ImagePreflightResult = {ready:true,checks:[],sourceReadRequired:true,sourceReadStatus:'PASSED',canSubmit:true};
  const rect = {x:.1,y:.1,width:.8,height:.8};
  const file = (name: string) => new File([name], name + '.png', {type:'image/png'});
  function select(...files: File[]) {
    const transfer = new DataTransfer(); files.forEach(f => transfer.items.add(f));
    form.onFilesSelected({target:{files:transfer.files,value:''}} as unknown as Event);
  }
  beforeEach(async () => {
    check = jasmine.createSpy().and.returnValue(of(passed));
    await TestBed.configureTestingModule({imports:[UploadEssayForm],providers:[{provide:ImagePreflightService,useValue:{check}}]}).compileComponents();
    fixture = TestBed.createComponent(UploadEssayForm); form = fixture.componentInstance; fixture.detectChanges();
  });
  afterEach(() => fixture.destroy());
  it('shows preview before checks, allows optional crop, and Cancel leaves the original untouched with zero requests', () => {
    const original = file('original'); select(original); const entry = form.files[0], preview = entry.preview;
    expect(preview).toBeTruthy(); expect(form.ready).toBeFalse(); expect(check).not.toHaveBeenCalled();
    form.openCrop(entry); expect(form.editingEntry).toBe(entry); form.cancelCrop();
    expect(entry.file).toBe(original); expect(entry.preview).toBe(preview); expect(check).not.toHaveBeenCalled();
    form.useImage(entry); expect(check).toHaveBeenCalledOnceWith(original, null); expect(form.ready).toBeTrue();
  });
  it('invalidates accepted evidence before emitting cropped bytes; reset checks the original again', () => {
    select(file('original')); const entry = form.files[0], original = entry.file; form.useImage(entry);
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
    form.openCrop(entry); form.applyCrop(entry,{file:crop,rect}); expect(form.ready).toBeFalse();
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
    select(file('one'),file('two'),file('three')); form.files.forEach(entry => form.useImage(entry));
    const [one,two,three] = form.files, onePreview = one.preview, threeQuality = three.quality;
    const a = new Subject<ImagePreflightResult>(), b = new Subject<ImagePreflightResult>(); check.and.returnValues(a,b);
    form.openCrop(two); form.applyCrop(two,{file:file('crop-a'),rect}); expect(a.observed).toBeTrue();
    form.openCrop(two); form.applyCrop(two,{file:file('crop-b'),rect}); expect(a.observed).toBeFalse();
    a.next(passed); a.complete(); expect(form.ready).toBeFalse(); expect(two.quality).toBeUndefined();
    expect(form.files).toEqual([one,two,three]); expect(one.preview).toBe(onePreview); expect(three.quality).toBe(threeQuality);
    b.next(passed); b.complete(); expect(form.ready).toBeTrue();
    const revoke = spyOn(URL,'revokeObjectURL').and.callThrough(), preview = two.preview;
    form.openCrop(two); form.removeFile(new Event('click'),1);
    expect(form.editingEntry).toBeUndefined(); expect(form.files).toEqual([one,three]); expect(revoke).toHaveBeenCalledOnceWith(preview!);
  });
  it('rapid apply/reset/apply remains deterministic and destroy cancels the final check', () => {
    select(file('original')); const entry = form.files[0]; const pending = new Subject<ImagePreflightResult>(); check.and.returnValue(pending);
    form.openCrop(entry); form.applyCrop(entry,{file:file('a'),rect}); form.resetCrop(entry);
    form.openCrop(entry); const b = file('b'); form.applyCrop(entry,{file:b,rect});
    expect(entry.file).toBe(b); expect(entry.quality).toBeUndefined(); expect(form.ready).toBeFalse();
    fixture.destroy(); expect(pending.observed).toBeFalse();
  });
  it('never crops PDFs or alters their existing automatic check flow', () => {
    select(new File(['pdf'],'page.pdf',{type:'application/pdf'})); const entry = form.files[0];
    expect(entry.original).toBeUndefined(); form.openCrop(entry); expect(form.editingEntry).toBeUndefined();
    expect(check).toHaveBeenCalledTimes(1);
  });
});
