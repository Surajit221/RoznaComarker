import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { SpeakingUploadDialog } from './speaking-upload-dialog';
import { DeviceService } from '../../../services/device.service';
import { AlertService } from '../../../services/alert.service';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import { httpTestingProviders } from '../../../../testing/standalone-test-providers';

const API = 'http://localhost:5000/api';
const LIMITS = { maxRecordingSeconds: 180, minDurationSeconds: 5, maxFileBytes: 41943040 };
const ASSIGNMENT = { id: 'a1', title: 'Describe your town', instructions: 'Speak for two minutes about your town.', deadline: '2099-05-01T10:00:00.000Z' };
const recording = () => new File([new Uint8Array(20)], 'answer.mp3', { type: 'audio/mpeg' });

// Closing the student speaking upload dialog (X, Cancel, Esc, backdrop): a chosen file that is not uploaded, or an upload in progress,
// is never lost without the SweetAlert. Nothing chosen: closes at once.
for (const desktop of [true, false]) {
  describe(`SpeakingUploadDialog closing (${desktop ? 'modal' : 'sheet'})`, () => {
    let fixture: ComponentFixture<SpeakingUploadDialog>, dialog: SpeakingUploadDialog, http: HttpTestingController;
    let confirm: jasmine.Spy, answer: (value: boolean) => void, closed: number;
    beforeEach(() => {
      confirm = jasmine.createSpy('showConfirm').and.callFake(() => new Promise<boolean>(resolve => { answer = resolve; }));
      TestBed.configureTestingModule({ imports: [SpeakingUploadDialog],
        providers: [...httpTestingProviders, { provide: DeviceService, useValue: { isDesktop: () => desktop, isMobile: () => !desktop, isTablet: () => false } },
          { provide: AlertService, useValue: { showToast: jasmine.createSpy('showToast'), showConfirm: confirm } }] });
      fixture = TestBed.createComponent(SpeakingUploadDialog);
      dialog = fixture.componentInstance;
      http = TestBed.inject(HttpTestingController);
      fixture.componentRef.setInput('assignment', ASSIGNMENT);
      fixture.componentRef.setInput('limits', LIMITS);
      fixture.componentRef.setInput('open', true);
      fixture.detectChanges();
      closed = 0;
      dialog.closed.subscribe(() => closed++);
    });
    afterEach(() => { fixture.destroy(); http.verify(); document.body.classList.remove('overflow-hidden'); });
    const root = () => fixture.nativeElement as HTMLElement;
    const xButton = () => root().querySelector<HTMLButtonElement>('button[aria-label="Close upload dialog"]')!;
    const cancelButton = () => Array.from(root().querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent!.trim() === 'Cancel')!;
    const esc = () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); fixture.detectChanges(); };
    const backdrop = () => { root().querySelector<HTMLElement>('.fixed.inset-0')!.click(); fixture.detectChanges(); };
    const paths: [string, () => void][] = [['X', () => xButton().click()], ['Cancel', () => cancelButton().click()], ['Esc', esc], ['backdrop', backdrop]];

    for (const [name, close] of paths) {
      it(`${name} with nothing chosen closes at once`, fakeAsync(() => {
        close(); flushMicrotasks();
        expect(closed).toBe(1);
        expect(confirm).not.toHaveBeenCalled();
      }));

      it(`${name} with a chosen file asks "Discard the selected file?"; Keep file keeps it, Discard closes`, fakeAsync(() => {
        dialog.onFile(recording()); fixture.detectChanges();
        close(); flushMicrotasks();
        expect(confirm).toHaveBeenCalledOnceWith('Discard the selected file?', 'The file has not been uploaded yet.', 'Discard', 'Keep file');
        answer(false); flushMicrotasks();
        expect(closed).toBe(0);
        expect(dialog.file).not.toBeNull();
        close(); flushMicrotasks();
        answer(true); flushMicrotasks();
        expect(closed).toBe(1);
        expect(dialog.file).toBeNull();
      }));
    }

    for (const [name, close] of paths.slice(0, 2)) {
      it(`${name} during an upload asks "Stop the upload?"; Keep uploading continues, Stop upload cancels and closes`, fakeAsync(() => {
        dialog.onFile(recording()); dialog.upload(); fixture.detectChanges();
        const req = http.expectOne(`${API}/speaking/a1`);
        close(); flushMicrotasks();
        expect(confirm).toHaveBeenCalledOnceWith('Stop the upload?', 'The upload is still in progress. If you close now, it will be cancelled.', 'Stop upload', 'Keep uploading');
        answer(false); flushMicrotasks();
        expect(req.cancelled).toBeFalse();
        expect(dialog.uploading).toBeTrue();
        expect(closed).toBe(0);
        close(); flushMicrotasks();
        answer(true); flushMicrotasks();
        expect(req.cancelled).toBeTrue();
        expect(TestBed.inject(UnsavedWorkRegistry).has('speaking-upload')).toBeFalse();
        expect(closed).toBe(1);
      }));
    }

    it('during an upload the backdrop and Esc do nothing (the dialog cannot be dismissed meanwhile, as before)', fakeAsync(() => {
      dialog.onFile(recording()); dialog.upload(); fixture.detectChanges();
      const req = http.expectOne(`${API}/speaking/a1`);
      backdrop(); esc(); flushMicrotasks();
      expect(confirm).not.toHaveBeenCalled();
      expect(closed).toBe(0);
      req.flush({ success: true, data: { id: 's1' } });
    }));

    it('an upload that finishes while the SweetAlert is open is not cancelled by a late "Stop upload"', fakeAsync(() => {
      dialog.onFile(recording()); dialog.upload(); fixture.detectChanges();
      const req = http.expectOne(`${API}/speaking/a1`);
      xButton().click(); flushMicrotasks();
      req.flush({ success: true, data: { id: 's1' } }); fixture.detectChanges();
      answer(true); flushMicrotasks();
      expect(closed).toBe(1);
    }));

    it('a second close request while asking does not ask twice or close twice', fakeAsync(() => {
      dialog.onFile(recording()); fixture.detectChanges();
      xButton().click(); cancelButton().click(); flushMicrotasks();
      expect(confirm).toHaveBeenCalledTimes(1);
      answer(true); flushMicrotasks();
      expect(closed).toBe(1);
    }));
  });
}

describe('SpeakingUploadDialog dialog semantics (desktop modal)', () => {
  it('role dialog, aria-modal, labelled by the visible title', () => {
    TestBed.configureTestingModule({ imports: [SpeakingUploadDialog],
      providers: [...httpTestingProviders, { provide: DeviceService, useValue: { isDesktop: () => true, isMobile: () => false, isTablet: () => false } },
        { provide: AlertService, useValue: { showToast: jasmine.createSpy('showToast'), showConfirm: jasmine.createSpy('showConfirm') } }] });
    const fixture = TestBed.createComponent(SpeakingUploadDialog);
    fixture.componentRef.setInput('assignment', ASSIGNMENT);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    const panel = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[role="dialog"]')!;
    expect(panel.getAttribute('aria-modal')).toBe('true');
    expect((fixture.nativeElement as HTMLElement).querySelector('#' + panel.getAttribute('aria-labelledby'))!.textContent!.trim()).toBe('Upload Recording');
    fixture.destroy();
  });
});
