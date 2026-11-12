import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Observable, Subject } from 'rxjs';
import { UploadStudentWorkDialog } from './upload-student-work-dialog';
import { TeacherUploadApiService, type TeacherUploadEvent, type TeacherUploadRequest } from '../../../api/teacher-upload-api.service';
import { ClassApiService } from '../../../api/class-api.service';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import { TeacherStudentPages } from './teacher-student-pages';

const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
function pngFile(name = 'page.png', size = 60): Promise<File> {
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size); ctx.fillStyle = '#000'; ctx.fillRect(10, 10, 20, 4);
  return new Promise(resolve => canvas.toBlob(blob => resolve(new File([blob!], name, { type: 'image/png' })), 'image/png'));
}
function selectFiles(input: HTMLInputElement, files: File[]): void {
  const transfer = new DataTransfer(); for (const f of files) transfer.items.add(f);
  input.files = transfer.files; input.dispatchEvent(new Event('change'));
}
const httpError = (status: number, body: unknown) => new HttpErrorResponse({ status, error: body });

describe('UploadStudentWorkDialog', () => {
  let fixture: ComponentFixture<UploadStudentWorkDialog>, component: UploadStudentWorkDialog, root: HTMLElement;
  let api: jasmine.SpyObj<TeacherUploadApiService>, classApi: jasmine.SpyObj<ClassApiService>, unsaved: UnsavedWorkRegistry;
  let uploads: { request: TeacherUploadRequest; stream: Subject<TeacherUploadEvent>; unsubscribed: boolean }[];
  let closed: { saved: number }[];

  beforeEach(async () => {
    api = jasmine.createSpyObj<TeacherUploadApiService>('TeacherUploadApiService', ['check', 'upload', 'list', 'send']);
    classApi = jasmine.createSpyObj<ClassApiService>('ClassApiService', ['getClassStudents']);
    uploads = [];
    api.upload.and.callFake((_id: string, request: TeacherUploadRequest) => {
      const stream = new Subject<TeacherUploadEvent>();
      const record = { request, stream, unsubscribed: false };
      let finished = false;
      uploads.push(record);
      return new Observable<TeacherUploadEvent>(subscriber => {
        const sub = stream.subscribe({ next: v => subscriber.next(v), error: e => { finished = true; subscriber.error(e); },
          complete: () => { finished = true; subscriber.complete(); } });
        return () => { if (!finished) record.unsubscribed = true; sub.unsubscribe(); };   // torn down before it finished: cancelled
      });
    });
    api.check.and.callFake(async (_id: string, students: { name: string; email: string }[]) => ({
      students: students.map((s, index) => ({ index, name: s.name, email: s.email, account: 'guest' as const })), credits: { needed: students.length, available: 10 } }));
    classApi.getClassStudents.and.resolveTo([{ id: 'u1', name: 'Mia Member', email: 'mia@example.com', joinedAt: null }, { id: 'u2', name: 'Leo Learner', email: 'leo@example.com', joinedAt: null }]);
    await TestBed.configureTestingModule({ imports: [UploadStudentWorkDialog],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: TeacherUploadApiService, useValue: api }, { provide: ClassApiService, useValue: classApi }] }).compileComponents();
    fixture = TestBed.createComponent(UploadStudentWorkDialog);
    component = fixture.componentInstance; root = fixture.nativeElement;
    unsaved = TestBed.inject(UnsavedWorkRegistry);
    closed = []; component.closed.subscribe(event => closed.push(event));
    fixture.componentRef.setInput('assignmentId', 'a1');
    fixture.componentRef.setInput('assignmentTitle', 'My Summer Holiday');
    fixture.componentRef.setInput('classId', 'c1');
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges(); await tick();
  });
  afterEach(() => { unsaved.clear('teacher-upload-student-work'); fixture.destroy(); });

  const q = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const buttonByText = (text: string | RegExp) => [...root.querySelectorAll('button')].find(b => typeof text === 'string' ? b.textContent!.trim().startsWith(text) : text.test(b.textContent!)) as HTMLButtonElement;
  const type = (input: HTMLInputElement, value: string) => { input.value = value; input.dispatchEvent(new Event('input')); fixture.detectChanges(); };
  const rows = () => [...root.querySelectorAll('.upload-student-row')] as HTMLElement[];
  async function fillManual(students: [string, string][]) {
    for (let i = 0; i < students.length; i++) {
      if (i > 0) { buttonByText('Add student').click(); fixture.detectChanges(); }
      const row = rows()[i];
      type(row.querySelector('input[id^="student-name-"]')!, students[i][0]);
      type(row.querySelector('input[id^="student-email-"]')!, students[i][1]);
    }
  }
  async function toPages(students: [string, string][] = [['Sam Lee', 'sam@example.com']]) {
    await fillManual(students);
    buttonByText('Next: add pages').click(); await tick(); fixture.detectChanges();
  }
  // Each student's pages are the student upload screen; it reports its files (cropped, compressed) and whether every page passed.
  const pageForms = () => fixture.debugElement.queryAll(By.directive(TeacherStudentPages)).map(d => d.componentInstance as TeacherStudentPages);
  async function addPages(studentIndex: number, files: File[], ready = true) {
    const form = pageForms()[studentIndex];
    form.filesSelected.emit(files); form.readinessChange.emit(ready);
    fixture.detectChanges(); await tick(); fixture.detectChanges();
  }
  async function toReview(students: [string, string][] = [['Sam Lee', 'sam@example.com']]) {
    await toPages(students);
    for (let i = 0; i < students.length; i++) await addPages(i, [await pngFile()]);
    buttonByText('Next: review').click(); await tick(); fixture.detectChanges();
  }

  describe('dialog behaviour', () => {
    it('is a labelled modal dialog that focuses its heading', () => {
      const dialog = q('[role="dialog"]');
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toContain('Upload student work');
      expect(document.activeElement).toBe(q('#upload-work-title'));
      expect(q('[aria-current="step"]').textContent).toContain('Students');
    });

    it('Esc closes straight away when nothing was added', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(closed).toEqual([{ saved: 0 }]);
    });

    it('traps Tab inside the dialog', () => {
      const focusable = [...q('[role="dialog"]').querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href]')]
        .filter(el => el.offsetParent !== null);
      const first = focusable[0], last = focusable[focusable.length - 1];
      last.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }));
      expect(document.activeElement).toBe(first);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true }));
      expect(document.activeElement).toBe(last);
    });

    it('guards unsaved work: registers it, asks before discarding, and clears it on close', async () => {
      await fillManual([['Sam Lee', 'sam@example.com']]);
      expect(unsaved.hasWork()).toBeTrue();
      const confirm = spyOn(window, 'confirm').and.returnValue(false);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(confirm).toHaveBeenCalledWith('Discard the student work you added? It has not been saved.');
      expect(closed).toEqual([]);
      confirm.and.returnValue(true);
      buttonByText('Cancel').click();
      expect(closed).toEqual([{ saved: 0 }]);
      expect(unsaved.hasWork()).toBeFalse();
    });
  });

  describe('step 1: students', () => {
    it('adds and removes manual rows', async () => {
      await fillManual([['Sam Lee', 'sam@example.com'], ['Mia', 'mia@example.com']]);
      expect(rows().length).toBe(2);
      (rows()[0].querySelector('button[aria-label^="Remove"]') as HTMLButtonElement).click(); fixture.detectChanges();
      expect(rows().length).toBe(1);
      expect((rows()[0].querySelector('input[id^="student-name-"]') as HTMLInputElement).value).toBe('Mia');
    });

    it('reads a CSV (BOM, quoted commas), shows row errors and lets the teacher fix or remove them', async () => {
      buttonByText('Upload a CSV').click(); fixture.detectChanges();
      expect(q<HTMLAnchorElement>('a[download]').getAttribute('download')).toBe('rubrilo-students-sample.csv');
      const csv = new File([String.fromCharCode(0xfeff) + 'name,email\n"Rahman, Aisha",aisha@example.com\nSam,not-an-email\nDup,AISHA@example.com\n'], 'class.csv', { type: 'text/csv' });
      selectFiles(q<HTMLInputElement>('#student-csv'), [csv]); await tick(20); fixture.detectChanges();
      expect(rows().length).toBe(3);
      expect((rows()[0].querySelector('input[id^="student-name-"]') as HTMLInputElement).value).toBe('Rahman, Aisha');
      expect(rows()[1].textContent).toContain('Enter a valid email address.');
      expect(rows()[2].textContent).toContain('already in the list');
      expect(root.textContent).toContain('3 students added from the file. 2 rows need fixing below');
      type(rows()[1].querySelector('input[id^="student-email-"]')!, 'sam@example.com');
      expect(rows()[1].textContent).not.toContain('Enter a valid email address.');
      (rows()[2].querySelector('button[aria-label^="Remove"]') as HTMLButtonElement).click(); fixture.detectChanges();
      buttonByText('Next: add pages').click(); await tick(); fixture.detectChanges();
      expect(api.check).toHaveBeenCalledWith('a1', [{ name: 'Rahman, Aisha', email: 'aisha@example.com' }, { name: 'Sam', email: 'sam@example.com' }]);
      expect(component.step()).toBe('pages');
    });

    it('loads the class list, searches it and adds the selected students once', async () => {
      buttonByText('From class list').click(); await tick(); fixture.detectChanges();
      expect(classApi.getClassStudents).toHaveBeenCalledWith('c1');
      type(q('#class-search'), 'leo');
      expect([...root.querySelectorAll('.upload-class-list li')].map(li => li.textContent!.trim())).toEqual([jasmine.stringContaining('Leo Learner') as unknown as string]);
      (q('.upload-class-list input[type="checkbox"]') as HTMLInputElement).click(); fixture.detectChanges();
      buttonByText('Add selected').click(); fixture.detectChanges();
      expect(rows().length).toBe(1);
      expect((rows()[0].querySelector('input[id^="student-email-"]') as HTMLInputElement).value).toBe('leo@example.com');
      const leo = q<HTMLInputElement>('.upload-class-list input[type="checkbox"]');
      expect(leo.disabled).toBeTrue(); expect(root.textContent).toContain('Added');
    });

    it('shows a plain message when the class list cannot be loaded', async () => {
      classApi.getClassStudents.and.rejectWith(httpError(0, null));
      buttonByText('From class list').click(); await tick(); fixture.detectChanges();
      expect(q('[role="alert"]').textContent).toContain('You appear to be offline');
    });

    it('blocks Next on local errors and focuses the first invalid field', async () => {
      await fillManual([['Sam', 'bad-email']]);
      buttonByText('Next: add pages').click(); await tick(); fixture.detectChanges(); await tick();
      expect(api.check).not.toHaveBeenCalled();
      expect(root.textContent).toContain('Fix the highlighted rows, or remove them.');
      expect(document.activeElement?.id).toMatch(/^student-email-/);
    });

    it('shows the server\'s verdict per row and existing uploads default to "add pages"', async () => {
      api.check.and.resolveTo({ students: [
        { index: 0, name: 'Sam Lee', email: 'sam@example.com', account: 'guest', existing: { submissionId: 's1', pages: 2 } },
        { index: 1, name: 'Mia', email: 'mia@example.com', account: 'member', errors: { email: 'This student already submitted their own work for this assignment. Open it from the submissions list.' } }],
        credits: { needed: 1, available: 5 } });
      await toPages([['Sam Lee', 'sam@example.com'], ['Mia', 'mia@example.com']]);
      expect(component.step()).toBe('students');
      expect(rows()[1].textContent).toContain('already submitted their own work');
      (rows()[1].querySelector('button[aria-label^="Remove"]') as HTMLButtonElement).click(); fixture.detectChanges();
      api.check.and.resolveTo({ students: [{ index: 0, name: 'Sam Lee', email: 'sam@example.com', account: 'guest', existing: { submissionId: 's1', pages: 2 } }], credits: { needed: 1, available: 5 } });
      buttonByText('Next: add pages').click(); await tick(); fixture.detectChanges();
      expect(component.step()).toBe('pages');
      expect(root.textContent).toContain('already uploaded (2 pages)');
      expect(component.students()[0].mode).toBe('add_pages');
    });

    it('shows a plain message for a server error on Next', async () => {
      api.check.and.rejectWith(httpError(429, { message: 'Too many' }));
      await toPages();
      expect(q('[role="alert"]').textContent).toContain('Too many requests. Please wait a minute and try again.');
    });
  });

  describe('step 2: pages', () => {
    it('shows the student upload screen for each student, bound to that student', async () => {
      await toPages([['Sam Lee', 'sam@example.com'], ['Mia', 'mia@example.com']]);
      expect(root.querySelectorAll('app-teacher-student-pages app-upload-essay-form').length).toBe(2);
      expect(pageForms().map(f => [f.name, f.email, f.assignmentId])).toEqual([['Sam Lee', 'sam@example.com', 'a1'], ['Mia', 'mia@example.com', 'a1']]);
    });

    it('needs pages for every student, and every page to have passed its check, before review', async () => {
      await toPages([['Sam Lee', 'sam@example.com'], ['Mia', 'mia@example.com']]);
      expect(buttonByText('Next: review').disabled).toBeTrue();
      await addPages(0, [await pngFile('a.png')]);
      expect(buttonByText('Next: review').disabled).toBeTrue();
      await addPages(1, [await pngFile('b.png')], false);              // still checking (or a page failed its check)
      expect(buttonByText('Next: review').disabled).toBeTrue();
      pageForms()[1].readinessChange.emit(true); fixture.detectChanges();
      expect(buttonByText('Next: review').disabled).toBeFalse();
    });

    it('keeps each student\'s pages (crops and checks) when going back and forth between steps', async () => {
      await toPages();
      const form = pageForms()[0];
      await addPages(0, [await pngFile()]);
      buttonByText('Next: review').click(); await tick(); fixture.detectChanges();
      buttonByText('Back').click(); await tick(); fixture.detectChanges();
      expect(pageForms()[0]).toBe(form);                                  // the same screen, not a fresh empty one
      expect(buttonByText('Next: review').disabled).toBeFalse();
    });
  });

  describe('step 3: review and save', () => {
    it('says that every page is checked by AI and that large batches take longer', async () => {
      await toReview();
      expect(q('[data-ai-check-note]').textContent).toContain('Each page is checked by AI for readable handwriting when it is added, so large batches take longer.');
    });

    it('a check that is out of date asks to check that student\'s pages again, then saves with the same reference', async () => {
      await toReview();
      buttonByText('Save').click(); fixture.detectChanges(); await tick();
      const firstKey = uploads[0].request.requestKey;
      uploads[0].stream.error(httpError(409, { code: 'TEACHER_UPLOAD_RECHECK_REQUIRED',
        message: 'The handwriting check for these pages is out of date. Check the pages again, then save.' }));
      await tick(); fixture.detectChanges();
      expect(root.textContent).toContain('The handwriting check for these pages is out of date. Check the pages again, then save.');
      const recheck = spyOn(pageForms()[0], 'recheck');
      buttonByText(/^Check pages again/).click(); await tick(); fixture.detectChanges();
      expect(component.step()).toBe('pages');
      expect(recheck).toHaveBeenCalledTimes(1);
      expect(buttonByText('Next: review').disabled).toBeTrue();          // until the pages pass again
      pageForms()[0].readinessChange.emit(true); fixture.detectChanges();
      buttonByText('Next: review').click(); await tick(); fixture.detectChanges();
      buttonByText('Save').click(); fixture.detectChanges(); await tick();
      expect(uploads[1].request.requestKey).toBe(firstKey);
    });

    it('shows credits needed vs available and warns clearly when short', async () => {
      api.check.and.callFake(async (_id, students) => ({ students: students.map((s, index) => ({ index, ...s, account: 'guest' as const })), credits: { needed: 2, available: 1 } }));
      await toReview([['Sam Lee', 'sam@example.com'], ['Mia', 'mia@example.com']]);
      expect(q('.upload-credits').textContent).toContain('Credits needed: 2 · Available: 1');
      expect(q('.upload-credits [role="alert"]').textContent).toContain('You do not have enough credits. Only 1 of 2 students can be saved now');
    });

    it('asks to confirm "replace" with "Old images will be permanently deleted."', async () => {
      api.check.and.callFake(async (_id, students) => ({ students: students.map((s, index) => ({ index, ...s, account: 'guest' as const, existing: { submissionId: 's1', pages: 1 } })), credits: { needed: 1, available: 5 } }));
      await toPages();
      (root.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]).click(); fixture.detectChanges();
      expect(root.textContent).toContain('The old images will be permanently deleted when you save.');
      await addPages(0, [await pngFile()]);
      buttonByText('Next: review').click(); await tick(); fixture.detectChanges();
      buttonByText('Save and send').click(); fixture.detectChanges(); await tick();
      const confirm = q('[role="alertdialog"]');
      expect(confirm.textContent).toContain('Old images will be permanently deleted.');
      expect(document.activeElement?.id).toBe('confirm-replace');
      expect(api.upload).not.toHaveBeenCalled();
      buttonByText('Go back').click(); fixture.detectChanges();
      expect(q('[role="alertdialog"]')).toBeNull();
      buttonByText('Save and send').click(); fixture.detectChanges();
      buttonByText('Delete old images and save').click(); fixture.detectChanges(); await tick();
      expect(uploads[0].request).toEqual(jasmine.objectContaining({ mode: 'replace', send: true, name: 'Sam Lee', email: 'sam@example.com' }));
    });

    it('saves with progress, sends when asked, and clears the unsaved-work guard', async () => {
      await toReview([['Sam Lee', 'sam@example.com'], ['Mia', 'mia@example.com']]);
      buttonByText('Save', ).click(); fixture.detectChanges(); await tick();
      expect(uploads.length).toBe(2);
      expect(uploads.every(u => u.request.send === false && u.request.mode === 'new' && u.request.files.length === 1)).toBeTrue();
      // The exact files the student screen produced (and checked) are uploaded: re-encoding would invalidate the check.
      expect(uploads[0].request.files[0].blob).toBe(component.students()[0].files[0]);
      uploads[0].stream.next({ type: 'progress', loaded: 50, total: 100 }); fixture.detectChanges();
      expect(q('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('50');
      for (const u of uploads) { u.stream.next({ type: 'done', result: { duplicate: false, item: { submissionId: 'x' } as never } }); u.stream.complete(); }
      await tick(); fixture.detectChanges();
      expect(component.step()).toBe('done');
      expect(root.textContent).toContain('2 saved.');
      expect(unsaved.hasWork()).toBeFalse();
      buttonByText('Done').click();
      expect(closed).toEqual([{ saved: 2 }]);
    });

    it('shows a plain message on failure and retries with the same reference', async () => {
      await toReview();
      buttonByText('Save').click(); fixture.detectChanges(); await tick();
      const firstKey = uploads[0].request.requestKey;
      uploads[0].stream.error(httpError(500, { message: 'TypeError: secret stack' })); await tick(); fixture.detectChanges();
      expect(root.textContent).toContain('Something went wrong on our side. Please try again.');
      expect(root.textContent).not.toContain('secret stack');
      buttonByText(/^Retry\s+Sam Lee/).click(); fixture.detectChanges(); await tick();
      expect(uploads.length).toBe(2);
      expect(uploads[1].request.requestKey).toBe(firstKey);
      uploads[1].stream.next({ type: 'done', result: { duplicate: true, item: { submissionId: 'x' } as never } }); uploads[1].stream.complete();
      await tick(); fixture.detectChanges();
      expect(root.textContent).toContain('1 saved.');
    });

    it('stops uploading the rest when credits run out, with the server\'s message', async () => {
      await toReview([['A One', 'a@example.com'], ['B Two', 'b@example.com'], ['C Three', 'c@example.com'], ['D Four', 'd@example.com'], ['E Five', 'e@example.com']]);
      buttonByText('Save').click(); fixture.detectChanges(); await tick();
      expect(uploads.length).toBe(4);                       // four at a time
      uploads[0].stream.error(httpError(402, { code: 'INSUFFICIENT_CREDITS', message: 'You have no assessment credits left. Add credits to upload more work.' }));
      for (const u of uploads.slice(1)) u.stream.error(httpError(402, { code: 'INSUFFICIENT_CREDITS', message: 'You have no assessment credits left. Add credits to upload more work.' }));
      await tick(); fixture.detectChanges();
      expect(uploads.length).toBe(4);                       // the fifth student was not uploaded
      expect(component.students().every(s => s.state === 'failed')).toBeTrue();
      expect(root.textContent).toContain('You have no assessment credits left');
      expect(buttonByText('Retry all not saved')).toBeTruthy();
    });

    it('cancel stops the uploads in progress and the ones not started', async () => {
      await toReview([['A One', 'a@example.com'], ['B Two', 'b@example.com'], ['C Three', 'c@example.com'], ['D Four', 'd@example.com'], ['E Five', 'e@example.com']]);
      buttonByText('Save').click(); fixture.detectChanges(); await tick();
      buttonByText('Cancel uploads').click(); await tick(); fixture.detectChanges();
      expect(uploads.length).toBe(4);
      expect(uploads.every(u => u.unsubscribed)).toBeTrue();
      expect(component.students().every(s => s.state === 'cancelled')).toBeTrue();
      expect(root.textContent).toContain('0 saved, 5 not saved.');
      expect(unsaved.hasWork()).toBeTrue();                 // still unsaved: the guard stays
    });

    it('asks before closing while uploads are running', async () => {
      await toReview();
      buttonByText('Save').click(); fixture.detectChanges(); await tick();
      const confirm = spyOn(window, 'confirm').and.returnValue(false);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(confirm).toHaveBeenCalledWith('Uploads are still in progress. Stop them and close?');
      expect(closed).toEqual([]); expect(uploads[0].unsubscribed).toBeFalse();
    });
  });
});
