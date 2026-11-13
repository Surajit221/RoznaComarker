import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of, throwError } from 'rxjs';
import { ReferenceFilesField } from './reference-files-field';
import { ReferenceFilesApiService, type ReferenceFileView, type ReferenceUploadEvent } from '../../../api/reference-files-api.service';
import { AlertService } from '../../../services/alert.service';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import { RubricDesignerModal } from '../rubric-designer-modal/rubric-designer-modal';
import type { RubricDesigner } from '../../../models/submission-feedback.model';

const ON = { enabled: true, maxFiles: 5, maxFileBytes: 10 * 1024 * 1024 };
const view = (patch: Partial<ReferenceFileView> = {}): ReferenceFileView => ({
  id: 'f1', scope: 'assignment', classId: 'c1', assignmentId: 'a1', name: 'Unit plan.docx', kind: 'docx', sizeBytes: 2048, status: 'ready',
  failureCode: null, failureMessage: null, pages: null, slides: null, textTrimmed: false, markedAsRubric: false, rubricSuggestion: null,
  rubricAppliedAt: null, createdAt: '2026-11-12T00:00:00Z', updatedAt: '2026-11-12T00:00:00Z', ...patch });
const DESIGNER: RubricDesigner = { title: 'Essay rubric', totalPoints: 100, levels: [{ title: 'Low', maxPoints: 1 }, { title: 'High', maxPoints: 2 }],
  criteria: [{ title: 'Thesis', weight: 100, cells: ['Weak', 'Strong'] }] };
const file = (name: string, size = 1000) => { const f = new File(['x'], name); Object.defineProperty(f, 'size', { value: size }); return f; };
/** Lets pending promises run without waiting for timers (the 2 s polling would keep whenStable busy). */
const settle = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };
const httpError = (status: number, body: object) => new HttpErrorResponse({ status, error: body });

describe('ReferenceFilesField', () => {
  let fixture: ComponentFixture<ReferenceFilesField>, component: ReferenceFilesField;
  let api: jasmine.SpyObj<ReferenceFilesApiService>, alert: jasmine.SpyObj<AlertService>, unsaved: UnsavedWorkRegistry;

  async function create(scope: 'class' | 'assignment', targetId: string | null, config = ON) {
    api.config.and.resolveTo(config);
    fixture = TestBed.createComponent(ReferenceFilesField);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('scope', scope);
    fixture.componentRef.setInput('targetId', targetId);
    fixture.detectChanges();
    await settle(); fixture.detectChanges();
  }
  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent?.replace(/\s+/g, ' ') ?? '';

  beforeEach(async () => {
    api = jasmine.createSpyObj<ReferenceFilesApiService>('ReferenceFilesApiService', ['config', 'list', 'get', 'upload', 'remove', 'draftRubric', 'applyRubric']);
    alert = jasmine.createSpyObj<AlertService>('AlertService', ['showConfirm', 'showError', 'showToast', 'showWarning']);
    api.list.and.resolveTo({ files: [], classFiles: [], limits: { maxFiles: 5, maxFileBytes: ON.maxFileBytes } });
    await TestBed.configureTestingModule({ imports: [ReferenceFilesField],
      providers: [{ provide: ReferenceFilesApiService, useValue: api }, { provide: AlertService, useValue: alert }] }).compileComponents();
    unsaved = TestBed.inject(UnsavedWorkRegistry);
    try { localStorage.removeItem('rubrilo.referenceRubricDismissed'); } catch { /* none */ }
  });
  afterEach(() => fixture?.destroy());

  describe('feature switch', () => {
    it('renders nothing when the backend has the feature off, and never asks for files', async () => {
      await create('class', 'c1', { enabled: false, maxFiles: 5, maxFileBytes: 1 });
      expect(el().querySelector('[data-reference-files]')).toBeNull();
      expect(api.list).not.toHaveBeenCalled();
    });
    it('hides quietly when the server answers 404 (switched off, or not a writing assignment)', async () => {
      api.list.and.rejectWith(httpError(404, { code: 'NOT_FOUND', message: 'Not found.' }));
      await create('assignment', 'a1');
      expect(el().querySelector('[data-reference-files]')).toBeNull();
      expect(alert.showError).not.toHaveBeenCalled();
    });
    it('shows a load error with Try again for other failures', async () => {
      api.list.and.rejectWith(httpError(0, {}));
      await create('class', 'c1');
      expect(el().querySelector('[data-load-error]')?.textContent).toContain('You appear to be offline.');
      api.list.and.resolveTo({ files: [view({ scope: 'class' })], limits: { maxFiles: 5, maxFileBytes: 1 } });
      (el().querySelector('[data-load-error] button') as HTMLButtonElement).click();
      await settle(); fixture.detectChanges();
      expect(text()).toContain('Unit plan.docx');
    });
  });

  describe('listing', () => {
    it('empty state, help text and the add button', async () => {
      await create('class', 'c1');
      expect(el().querySelector('[data-empty]')?.textContent).toContain('No reference files yet.');
      expect(text()).toContain('They apply to every assignment in this class. Students never see these files.');
      expect(text()).toContain('up to 10 MB each and 5 files');
      expect(component.sizeLabel(2.5 * 1024 * 1024)).toBe('2.5 MB');
      expect(component.sizeLabel(1500)).toBe('1 KB');
      expect(el().querySelector('[data-add]')?.getAttribute('aria-describedby')).toBe(el().querySelector('.reference-files__help')?.id ?? 'x');
    });
    it('shows each file with its status and the teacher-facing reason; class files read-only inside an assignment', async () => {
      api.list.and.resolveTo({ files: [view(), view({ id: 'f2', name: 'Scan.pdf', kind: 'pdf', status: 'failed', failureMessage: 'No readable text found (scanned PDF).' }),
        view({ id: 'f3', name: 'Slides.pptx', kind: 'pptx', status: 'processing' })],
        classFiles: [view({ id: 'c9', scope: 'class', name: 'Course outline.pdf', kind: 'pdf' })], limits: { maxFiles: 5, maxFileBytes: 1 } });
      await create('assignment', 'a1');
      const rows = Array.from(el().querySelectorAll('.reference-files__list [data-file]'));
      expect(rows.map(row => row.querySelector('.reference-files__status')?.textContent?.trim())).toEqual(['Ready', 'Not usable', 'Reading…']);
      expect(rows[1].querySelector('[data-failure]')?.textContent).toBe('No readable text found (scanned PDF).');
      const inherited = el().querySelector('[data-class-files]')!;
      expect(inherited.querySelector('h4')?.textContent).toBe('Applies from your class');
      expect(inherited.textContent).toContain('Course outline.pdf');
      expect(inherited.querySelectorAll('button').length).toBe(0);
      expect(rows[0].querySelector('[data-use-rubric]')).not.toBeNull();      // ready assignment file
      expect(rows[1].querySelector('[data-use-rubric]')).toBeNull();          // failed
    });
    it('class files never offer the rubric actions', async () => {
      api.list.and.resolveTo({ files: [view({ scope: 'class' })], limits: { maxFiles: 5, maxFileBytes: 1 } });
      await create('class', 'c1');
      expect(el().querySelector('[data-use-rubric]')).toBeNull();
    });
    it('polls while a file is being read, until it is ready', fakeAsync(() => {
      api.config.and.resolveTo(ON);
      api.list.and.returnValues(
        Promise.resolve({ files: [view({ status: 'processing', scope: 'class' })], limits: { maxFiles: 5, maxFileBytes: 1 } }),
        Promise.resolve({ files: [view({ status: 'ready', scope: 'class' })], limits: { maxFiles: 5, maxFileBytes: 1 } }));
      fixture = TestBed.createComponent(ReferenceFilesField); component = fixture.componentInstance;
      fixture.componentRef.setInput('scope', 'class'); fixture.componentRef.setInput('targetId', 'c1');
      fixture.detectChanges(); flushMicrotasks();
      expect(api.list).toHaveBeenCalledTimes(1);
      tick(2000); flushMicrotasks(); fixture.detectChanges();
      expect(api.list).toHaveBeenCalledTimes(2);
      expect(component.files()[0].status).toBe('ready');
      tick(10000);
      expect(api.list).toHaveBeenCalledTimes(2);                               // nothing processing: polling stopped
      fixture.destroy();
    }));
  });

  describe('choosing files', () => {
    it('explains refused types (old .ppt, others), size and empty files; accepts PDF, Word and PowerPoint', async () => {
      await create('class', null);
      component.addFiles([file('deck.ppt'), file('notes.txt'), file('big.pdf', ON.maxFileBytes + 1), file('empty.docx', 0), file('a.pdf'), file('b.doc'), file('c.docx'), file('d.pptx')]);
      fixture.detectChanges();
      const error = el().querySelector('[data-choose-error]')?.textContent ?? '';
      expect(error).toContain('deck.ppt: Old PowerPoint files (.ppt) are not supported. Please save as .pptx.');
      expect(error).toContain('notes.txt: Please use PDF, Word (.doc or .docx) or PowerPoint (.pptx).');
      expect(error).toContain('big.pdf: Each file must be 10 MB or smaller.');
      expect(error).toContain('empty.docx: This file is empty.');
      expect(el().querySelector('[data-choose-error]')?.getAttribute('role')).toBe('alert');
      expect(component.staged().map(entry => entry.name)).toEqual(['a.pdf', 'b.doc', 'c.docx', 'd.pptx']);
      expect(el().querySelectorAll('[data-pending="staged"]').length).toBe(4);
    });
    it('stops at five files with a clear message and disables Add files', async () => {
      api.list.and.resolveTo({ files: [view({ scope: 'class' }), view({ id: 'f2', scope: 'class' })], limits: { maxFiles: 5, maxFileBytes: 1 } });
      await create('class', 'c1');
      component.addFiles([file('1.pdf'), file('2.pdf'), file('3.pdf'), file('4.pdf')]);
      fixture.detectChanges();
      expect(component.count()).toBe(5);
      expect(el().querySelector('[data-choose-error]')?.textContent).toContain('You can add up to 5 files to each class. Remove one to add another.');
      expect((el().querySelector('[data-add]') as HTMLButtonElement).disabled).toBeTrue();
      expect(el().querySelector('[data-limit]')).not.toBeNull();
    });
    it('"This file is a rubric" only for assignment files', async () => {
      await create('class', null);
      component.addFiles([file('a.pdf')]); fixture.detectChanges();
      expect(el().querySelector('[data-rubric-tick]')).toBeNull();
      fixture.destroy();
      await create('assignment', null);
      component.addFiles([file('a.pdf')]); fixture.detectChanges();
      const tick = el().querySelector('[data-rubric-tick]') as HTMLInputElement;
      expect(tick.closest('label')?.textContent).toContain('This file is a rubric');
      tick.click(); fixture.detectChanges();
      expect(component.staged()[0].markedAsRubric).toBeTrue();
    });
    it('registers unsaved work while files wait, and clears it when they are removed or uploaded', async () => {
      await create('class', null);
      component.addFiles([file('a.pdf')]);
      expect(unsaved.hasWork()).toBeTrue();
      component.discardPending(component.staged()[0].key);
      expect(unsaved.hasWork()).toBeFalse();
      component.addFiles([file('a.pdf')]);
      fixture.destroy();
      expect(unsaved.hasWork()).toBeFalse();
    });
  });

  describe('uploading', () => {
    it('uploads waiting files after the save, one at a time, with progress, then shows them as being read', async () => {
      await create('assignment', null);
      component.addFiles([file('a.pdf'), file('b.docx')]);
      component.setRubricTick(component.staged()[1].key, true);
      const streams = [new Subject<ReferenceUploadEvent>(), new Subject<ReferenceUploadEvent>()];
      let call = 0;
      api.upload.and.callFake(() => streams[call++]);
      api.list.and.resolveTo({ files: [view({ id: 'u1', name: 'a.pdf', status: 'processing' }), view({ id: 'u2', name: 'b.docx', status: 'processing', markedAsRubric: true })], classFiles: [], limits: { maxFiles: 5, maxFileBytes: 1 } });
      const done = component.uploadStaged('a1');
      streams[0].next({ type: 'progress', loaded: 50, total: 100 }); fixture.detectChanges();
      expect(el().querySelector('progress')?.getAttribute('aria-label')).toBe('Uploading a.pdf');
      expect(text()).toContain('Uploading 50%');
      streams[0].next({ type: 'done', duplicate: false, file: view({ id: 'u1', name: 'a.pdf', status: 'processing' }) });
      await Promise.resolve();
      expect(api.upload.calls.count()).toBe(2);
      expect(api.upload.calls.argsFor(1)).toEqual(['assignment', 'a1', jasmine.objectContaining({ markedAsRubric: true })]);
      streams[1].next({ type: 'done', duplicate: false, file: view({ id: 'u2', name: 'b.docx', status: 'processing' }) });
      const summary = await done;
      expect(summary.uploaded.map(f => f.id)).toEqual(['u1', 'u2']);
      expect(summary.failed).toEqual([]);
      fixture.detectChanges();
      expect(Array.from(el().querySelectorAll('[data-file] .reference-files__status')).map(s => s.textContent?.trim())).toEqual(['Reading…', 'Reading…']);
      expect(unsaved.hasWork()).toBeFalse();
    });
    it('a refused upload stays listed with the server\'s reason and is reported', async () => {
      await create('class', 'c1');
      component.addFiles([file('plan.docx')]);
      api.upload.and.returnValue(throwError(() => httpError(400, { code: 'REFERENCE_FILE_MACRO',
        message: 'Files with macros are not accepted. Please save it as a normal .docx or .pptx file without macros.' })));
      const summary = await component.uploadStaged('c1');
      fixture.detectChanges();
      expect(summary.failed).toEqual([{ name: 'plan.docx', message: 'Files with macros are not accepted. Please save it as a normal .docx or .pptx file without macros.' }]);
      expect(el().querySelector('[data-pending="failed"] [data-failure]')?.textContent).toContain('Files with macros are not accepted.');
      expect(el().querySelector('[data-pending="failed"] .reference-files__status')?.textContent?.trim()).toBe('Not added');
      expect(unsaved.hasWork()).toBeFalse();                                  // nothing left to upload
    });
    it('"Upload now" appears in edit mode only', async () => {
      await create('class', null);
      component.addFiles([file('a.pdf')]); fixture.detectChanges();
      expect(el().querySelector('[data-upload-now]')).toBeNull();
      fixture.destroy();
      await create('class', 'c1');
      component.addFiles([file('a.pdf')]); fixture.detectChanges();
      api.upload.and.returnValue(of({ type: 'done', duplicate: false, file: view({ scope: 'class', status: 'processing' }) } as ReferenceUploadEvent));
      (el().querySelector('[data-upload-now]') as HTMLButtonElement).click();
      await settle();
      expect(api.upload).toHaveBeenCalledOnceWith('class', 'c1', jasmine.objectContaining({ markedAsRubric: false }));
    });
  });

  describe('remove', () => {
    it('asks first, then removes; Cancel keeps the file', async () => {
      api.list.and.resolveTo({ files: [view({ scope: 'class' })], limits: { maxFiles: 5, maxFileBytes: 1 } });
      await create('class', 'c1');
      alert.showConfirm.and.resolveTo(false);
      await component.removeFile(component.files()[0]);
      expect(api.remove).not.toHaveBeenCalled();
      expect(alert.showConfirm).toHaveBeenCalledWith('Remove this file?', '"Unit plan.docx" will no longer be used for marking.', 'Remove', 'Cancel');
      alert.showConfirm.and.resolveTo(true);
      api.remove.and.resolveTo(view({ status: 'removed' }));
      await component.removeFile(component.files()[0]);
      expect(api.remove).toHaveBeenCalledOnceWith('f1');
      expect(component.files()).toEqual([]);
    });
  });

  describe('rubric', () => {
    async function readNow(patch: Partial<ReferenceFileView>) {
      api.list.and.resolveTo({ files: [view({ status: 'processing', ...patch })], classFiles: [], limits: { maxFiles: 5, maxFileBytes: 1 } });
      await create('assignment', 'a1');
      api.list.and.resolveTo({ files: [view({ status: 'ready', ...patch })], classFiles: [], limits: { maxFiles: 5, maxFileBytes: 1 } });
      await component.reload();
      fixture.detectChanges();
    }
    const modal = () => fixture.debugElement.query(sel => sel.componentInstance instanceof RubricDesignerModal)?.componentInstance as RubricDesignerModal;

    it('a file read here that looks like a rubric asks the question; "No" is remembered and nothing is drafted', async () => {
      alert.showConfirm.and.resolveTo(false);
      await readNow({ rubricSuggestion: { looksLikeRubric: true, confidence: 'high' } });
      expect(alert.showConfirm).toHaveBeenCalledWith('This file looks like a rubric. Use it as the main rubric?',
        '"Unit plan.docx" looks like a rubric. If you choose Yes, you can review and edit it before it is used.', 'Yes', 'No');
      expect(api.draftRubric).not.toHaveBeenCalled();
      await component.reload();
      expect(alert.showConfirm).toHaveBeenCalledTimes(1);
    });

    it('a file that was already there when the form opened does not ask on its own', async () => {
      api.list.and.resolveTo({ files: [view({ rubricSuggestion: { looksLikeRubric: true, confidence: 'high' } })], classFiles: [], limits: { maxFiles: 5, maxFileBytes: 1 } });
      await create('assignment', 'a1');
      expect(alert.showConfirm).not.toHaveBeenCalled();
    });

    it('"Yes" drafts the rubric and opens the rubric editor for review only; applying with no rubric yet does not ask to replace', async () => {
      alert.showConfirm.and.resolveTo(true);
      api.draftRubric.and.resolveTo({ rubricDesigner: DESIGNER, notes: ['WEIGHTS_SET_EQUALLY'], hasExistingRubric: false });
      api.applyRubric.and.resolveTo({ applied: true, replaced: false });
      await readNow({ rubricSuggestion: { looksLikeRubric: true, confidence: 'medium' } });
      const applied = jasmine.createSpy('applied');
      component.rubricApplied.subscribe(applied);
      await settle(); fixture.detectChanges();
      expect(api.draftRubric).toHaveBeenCalledOnceWith('f1');
      expect(modal().open).toBeTrue();
      expect(modal().showTools).toBeFalse();
      expect(el().ownerDocument.body.textContent).not.toContain('Generate with AI');
      expect(component.announcement()).toContain('The criteria weights were set equally.');
      alert.showConfirm.calls.reset();
      await component.applyReviewed(DESIGNER);
      expect(alert.showConfirm).not.toHaveBeenCalled();
      expect(api.applyRubric).toHaveBeenCalledOnceWith('f1', DESIGNER, false);
      expect(applied).toHaveBeenCalledTimes(1);
      expect(alert.showToast).toHaveBeenCalledWith('Rubric applied', 'success');
      expect(component.review()).toBeNull();
    });

    it('the save flow waits for a review the background refresh already opened (the form must not close under it)', async () => {
      api.draftRubric.and.resolveTo({ rubricDesigner: DESIGNER, notes: [], hasExistingRubric: false });
      await readNow({ markedAsRubric: true });                 // the refresh found it ready and opened the review by itself
      await settle();
      expect(component.review()).not.toBeNull();
      let finished = false;
      const step = component.runRubricStep().then(() => { finished = true; });
      await settle();
      expect(finished).toBeFalse();
      component.closeReview();
      await step;
      expect(finished).toBeTrue();
      expect(api.draftRubric).toHaveBeenCalledTimes(1);
    });

    it('the review editor is rendered at the end of <body> (above any dialog) and removed with the field, leaving <body> in place', async () => {
      api.list.and.resolveTo({ files: [view()], classFiles: [], limits: { maxFiles: 5, maxFileBytes: 1 } });
      await create('assignment', 'a1');
      const host = document.body.lastElementChild as HTMLElement;
      expect(host.classList).toContain('reference-files-review-host');
      expect(el().contains(host)).toBeFalse();
      api.draftRubric.and.resolveTo({ rubricDesigner: DESIGNER, notes: [], hasExistingRubric: false });
      void component.startReview(component.files()[0]);
      await settle(); fixture.detectChanges();
      expect(host.querySelector('.rubric-editor__review-note')).not.toBeNull();
      fixture.destroy();
      expect(document.body).not.toBeNull();
      expect(document.querySelector('.reference-files-review-host')).toBeNull();
    });

    it('ticked "This file is a rubric": straight to review, no question', async () => {
      api.draftRubric.and.resolveTo({ rubricDesigner: DESIGNER, notes: [], hasExistingRubric: false });
      await readNow({ markedAsRubric: true });
      await settle();
      expect(alert.showConfirm).not.toHaveBeenCalled();
      expect(api.draftRubric).toHaveBeenCalledOnceWith('f1');
    });

    it('an existing rubric is replaced only after confirming; Cancel keeps the editor open and applies nothing', async () => {
      api.list.and.resolveTo({ files: [view()], classFiles: [], limits: { maxFiles: 5, maxFileBytes: 1 } });
      await create('assignment', 'a1');
      api.draftRubric.and.resolveTo({ rubricDesigner: DESIGNER, notes: [], hasExistingRubric: true });
      void component.startReview(component.files()[0]);
      await settle();
      alert.showConfirm.and.resolveTo(false);
      await component.applyReviewed(DESIGNER);
      expect(alert.showConfirm).toHaveBeenCalledWith('Replace the current rubric?',
        'This assignment already has a rubric. Replace it with the rubric from "Unit plan.docx"?', 'Replace', 'Cancel');
      expect(api.applyRubric).not.toHaveBeenCalled();
      expect(component.review()).not.toBeNull();
      alert.showConfirm.and.resolveTo(true);
      api.applyRubric.and.resolveTo({ applied: true, replaced: true });
      await component.applyReviewed(DESIGNER);
      expect(api.applyRubric).toHaveBeenCalledOnceWith('f1', DESIGNER, true);
      expect(alert.showToast).toHaveBeenCalledWith('Rubric replaced', 'success');
    });

    it('a rubric added meanwhile (409) asks before replacing it', async () => {
      api.list.and.resolveTo({ files: [view()], classFiles: [], limits: { maxFiles: 5, maxFileBytes: 1 } });
      await create('assignment', 'a1');
      api.draftRubric.and.resolveTo({ rubricDesigner: DESIGNER, notes: [], hasExistingRubric: false });
      void component.startReview(component.files()[0]);
      await settle();
      api.applyRubric.and.returnValues(Promise.reject(httpError(409, { code: 'REFERENCE_RUBRIC_EXISTS', message: 'This assignment already has a rubric.' })),
        Promise.resolve({ applied: true, replaced: true }));
      alert.showConfirm.and.resolveTo(true);
      await component.applyReviewed(DESIGNER);
      expect(api.applyRubric.calls.allArgs()).toEqual([['f1', DESIGNER, false], ['f1', DESIGNER, true]]);
    });

    it('a file that cannot become a rubric says so (it stays background material)', async () => {
      api.list.and.resolveTo({ files: [view()], classFiles: [], limits: { maxFiles: 5, maxFileBytes: 1 } });
      await create('assignment', 'a1');
      api.draftRubric.and.rejectWith(httpError(422, { code: 'REFERENCE_RUBRIC_CONVERSION_FAILED',
        message: 'This file could not be turned into a rubric. It is still used as background material for marking.' }));
      await component.startReview(component.files()[0]);
      expect(alert.showError).toHaveBeenCalledWith('This file could not be used as a rubric',
        'This file could not be turned into a rubric. It is still used as background material for marking.');
      expect(component.review()).toBeNull();
    });
  });

  describe('waiting after a save', () => {
    it('resolves when the files are read, or when the teacher continues', async () => {
      api.list.and.resolveTo({ files: [view({ status: 'processing' })], classFiles: [], limits: { maxFiles: 5, maxFileBytes: 1 } });
      await create('assignment', 'a1');
      const waited = component.waitUntilRead(60000);
      fixture.detectChanges();
      expect(el().querySelector('[data-waiting]')?.getAttribute('role')).toBe('status');
      (el().querySelector('[data-waiting] button') as HTMLButtonElement).click();
      await waited;
      expect(component.waiting()).toBeFalse();
      api.list.and.resolveTo({ files: [view({ status: 'ready' })], classFiles: [], limits: { maxFiles: 5, maxFileBytes: 1 } });
      await component.reload();
      await expectAsync(component.waitUntilRead(60000)).toBeResolved();
    });
  });
});
