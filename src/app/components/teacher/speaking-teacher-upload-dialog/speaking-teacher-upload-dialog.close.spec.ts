import { ComponentFixture, TestBed, fakeAsync, flush, flushMicrotasks } from '@angular/core/testing';
import { SpeakingTeacherUploadDialog } from './speaking-teacher-upload-dialog';
import { DeviceService } from '../../../services/device.service';
import { AlertService } from '../../../services/alert.service';
import { httpTestingProviders } from '../../../../testing/standalone-test-providers';

const LIMITS = { maxRecordingSeconds: 180, minDurationSeconds: 5, maxFileBytes: 41943040 };

// Closing "Upload student recordings" (X, Cancel, Esc and now the backdrop): the SweetAlert (AlertService.showConfirm, English labels)
// replaces window.confirm. Uploads in progress: "Stop the upload?". Unsaved students or recordings: asks before discarding.
describe('SpeakingTeacherUploadDialog closing', () => {
  let fixture: ComponentFixture<SpeakingTeacherUploadDialog>, dialog: SpeakingTeacherUploadDialog;
  let confirm: jasmine.Spy, answer: (value: boolean) => void, closed: number, nativeConfirm: jasmine.Spy;
  beforeEach(() => {
    // SweetAlerts left in the shared test document by other specs.
    document.querySelectorAll('.swal2-container').forEach(el => el.remove());
    confirm = jasmine.createSpy('showConfirm').and.callFake(() => new Promise<boolean>(resolve => { answer = resolve; }));
    TestBed.configureTestingModule({ imports: [SpeakingTeacherUploadDialog],
      providers: [...httpTestingProviders, { provide: DeviceService, useValue: { isDesktop: () => true, isMobile: () => false, isTablet: () => false } },
        { provide: AlertService, useValue: { showConfirm: confirm, showToast: jasmine.createSpy('showToast') } }] });
    nativeConfirm = spyOn(window, 'confirm').and.returnValue(true);
    fixture = TestBed.createComponent(SpeakingTeacherUploadDialog);
    dialog = fixture.componentInstance;
    fixture.componentRef.setInput('assignmentId', 'a1');
    fixture.componentRef.setInput('limits', LIMITS);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    closed = 0;
    dialog.closed.subscribe(() => closed++);
  });
  afterEach(() => fixture.destroy());
  const root = () => fixture.nativeElement as HTMLElement;
  const typeName = (value: string) => {
    const input = root().querySelector<HTMLInputElement>(`#student-name-${dialog.students()[0].id}`)!;
    input.value = value; input.dispatchEvent(new Event('input')); fixture.detectChanges();
  };
  const xButton = () => root().querySelector<HTMLButtonElement>('.upload-dialog__close')!;
  const cancelButton = () => Array.from(root().querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent!.trim() === 'Cancel')!;
  const esc = () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); fixture.detectChanges(); };
  const backdrop = () => { root().querySelector<HTMLElement>('.upload-overlay')!.click(); fixture.detectChanges(); };
  const uploading = () => {
    dialog.students.set([{ ...dialog.students()[0], name: 'Ana', email: 'ana@example.com', state: 'uploading' } as never]);
    dialog.step.set('saving'); fixture.detectChanges();
  };
  const paths: [string, () => void][] = [['X', () => xButton().click()], ['Cancel', () => cancelButton().click()], ['Esc', esc], ['backdrop', backdrop]];

  for (const [name, close] of paths) {
    it(`${name}, nothing entered: closes at once`, fakeAsync(() => {
      close(); flushMicrotasks(); flush();
      expect(closed).toBe(1);
      expect(confirm).not.toHaveBeenCalled();
    }));

    it(`${name}, students entered: asks with the SweetAlert; Keep editing keeps them, Discard closes`, fakeAsync(() => {
      typeName('Ana');
      close(); flushMicrotasks();
      expect(confirm).toHaveBeenCalledOnceWith('Discard the student recordings you added?', 'They have not been saved.', 'Discard', 'Keep editing', { returnFocus: false });
      answer(false); flushMicrotasks();
      expect(closed).toBe(0);
      expect(dialog.students()[0].name).toBe('Ana');
      close(); flushMicrotasks(); answer(true); flushMicrotasks(); flush();
      expect(closed).toBe(1);
      expect(nativeConfirm).not.toHaveBeenCalled();
    }));
  }

  for (const [name, close] of paths) {
    if (name === 'Cancel') continue; // the saving step has no Cancel button (its footer offers "Cancel uploads", which stops them directly)
    it(`${name} during uploads: "Stop the upload?"; Keep uploading continues, Stop upload stops them and closes`, fakeAsync(() => {
      uploading();
      const stop = spyOn(dialog, 'cancelUploads').and.callThrough();
      close(); flushMicrotasks();
      expect(confirm).toHaveBeenCalledOnceWith('Stop the upload?', 'The upload is still in progress. If you close now, it will be cancelled.', 'Stop upload', 'Keep uploading', { returnFocus: false });
      answer(false); flushMicrotasks();
      expect(stop).not.toHaveBeenCalled();
      expect(closed).toBe(0);
      close(); flushMicrotasks(); answer(true); flushMicrotasks(); flush();
      expect(stop).toHaveBeenCalledTimes(1);
      expect(closed).toBe(1);
      expect(nativeConfirm).not.toHaveBeenCalled();
    }));
  }

  it('a click inside the dialog is not a backdrop click', fakeAsync(() => {
    root().querySelector<HTMLElement>('.upload-dialog')!.click(); fixture.detectChanges(); flushMicrotasks();
    expect(closed).toBe(0);
  }));

  it('Esc while the SweetAlert is open is left to the SweetAlert (no second prompt); Tab is not trapped away from it', fakeAsync(() => {
    typeName('Ana');
    esc(); flushMicrotasks();
    const container = document.createElement('div'); container.className = 'swal2-container';
    const swalButton = document.createElement('button'); container.innerHTML = '<div class="swal2-popup"></div>'; container.firstElementChild!.appendChild(swalButton); document.body.appendChild(container);
    swalButton.focus();
    esc();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    swalButton.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBeFalse();
    expect(confirm).toHaveBeenCalledTimes(1);
    answer(false); flushMicrotasks(); container.remove();
    expect(closed).toBe(0);
  }));

  it('a toast on screen (e.g. "Recording uploaded") does not block Esc', fakeAsync(() => {
    const toast = document.createElement('div'); toast.className = 'swal2-container';
    toast.innerHTML = '<div class="swal2-popup swal2-toast"></div>'; document.body.appendChild(toast);
    esc(); flushMicrotasks(); flush();
    toast.remove();
    expect(closed).toBe(1);
  }));

  it('double close while asking: one prompt, one close', fakeAsync(() => {
    typeName('Ana');
    xButton().click(); backdrop(); flushMicrotasks();
    expect(confirm).toHaveBeenCalledTimes(1);
    answer(true); flushMicrotasks(); flush();
    expect(closed).toBe(1);
  }));
});
