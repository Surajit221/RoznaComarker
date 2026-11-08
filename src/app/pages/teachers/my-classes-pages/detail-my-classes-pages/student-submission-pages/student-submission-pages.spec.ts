import { TeacherAnnotationApiService } from '../../../../../api/teacher-annotation-api.service';
import type { AnnotationSnapshot } from '../../../../../components/teacher/annotation-controls/annotation-editor.logic';
import { HttpErrorResponse } from '@angular/common/http';
import { UnsavedWorkRegistry } from '../../../../../core/app-update/unsaved-work';
import type { TeacherEvaluationSnapshot } from '../../../../../components/teacher/evaluation-editor/teacher-evaluation.logic';
import { rubricScoresToFeedbackItems } from '../../../../../utils/dynamic-ai-feedback.util';
import { TeacherRecoveryLinkService } from '../../../../../components/teacher/guest-recovery-link/teacher-recovery-link.service';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';

import { FeedbackApiService } from '../../../../../api/feedback-api.service';
import { AlertService } from '../../../../../services/alert.service';
import { StudentSubmissionPages } from './student-submission-pages';
import { SubmissionPageReview } from '../../../../../components/submission-page-review/submission-page-review';
import { authenticatedUserProviders, httpTestingProviders, routedComponentProviders, verifyHttpRequestsAfterEach } from '../../../../../../testing/standalone-test-providers';
import { normalizeCanonicalResult } from '../../../../../utils/canonical-result-state.util';
import type { FeedbackAnnotation } from '../../../../../models/feedback-annotation.model';
import { CorrectionOverlay } from '../../../../../components/correction-overlay/correction-overlay';
import { TeacherEvaluationApiService } from '../../../../../api/teacher-evaluation-api.service';
import { buildAnnotationVisuals } from '../../../../../components/correction-overlay/annotation-geometry';
import { WritingModelApiService } from '../../../../../api/writing-model-api.service';
import { AdaptivePracticeApiService } from '../../../../../api/adaptive-practice-api.service';
import { of } from 'rxjs';

function evaluationSnapshot(score = 18, comment = 'Original grammar.'): TeacherEvaluationSnapshot {
  return { enabled: true, editable: true, blockedReason: null, revision: score === 18 ? 3 : 4,
    criteria: ['GRAMMAR', 'VOCABULARY', 'ORGANIZATION', 'CONTENT', 'MECHANICS', 'PRESENTATION'].map((key, i) => ({ key,
      maxScore: [25, 20, 20, 20, 10, 5][i], ai: { score: [18, 16, 16, 16, 8, 4][i], comment: i === 0 ? 'Original grammar.' : '' },
      teacher: { score: i === 0 && score !== 18 ? score : null, comment: i === 0 && score !== 18 ? comment : null },
      final: { score: i === 0 ? score : [18, 16, 16, 16, 8, 4][i], comment: i === 0 ? comment : '' } })),
    overall: { ai: 82, final: score + 64, max: 100 }, grade: { ai: 'B', final: 'B' }, edited: score !== 18, history: [] };
}

describe('StudentSubmissionPages', () => {
  it('renders the same raster review for teacher PDF review', () => {
    spyOn(component, 'isProbablyPdfUrl').and.returnValue(true);
    component.isUploadedFile = true;
    const imageUrl = '/files/submissions/00000000-0000-0000-0000-000000000001.jpg';
    component.transcriptPageViews = [{ key: 'pdf:1', fileId: 'pdf', pageNumber: 1, displayNumber: 1,
      imageUrl, words: [], annotations: [], text: 'Page one', status: 'ready' }];
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.directive(SubmissionPageReview))).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Open Original PDF');
    TestBed.inject(HttpTestingController).expectOne(req => req.url.endsWith(imageUrl)).flush(new Blob(['page']));
  });
  afterEach(verifyHttpRequestsAfterEach);
  let component: StudentSubmissionPages;
  let fixture: ComponentFixture<StudentSubmissionPages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StudentSubmissionPages], providers: [
        ...routedComponentProviders({ classId: 'class-1', assignmentId: 'assignment-1', submissionId: 'submission-1' }),
        ...httpTestingProviders, ...authenticatedUserProviders('teacher'),
        // Phase B3: the score editor is off here (as with the flag off): no request of its own for these page specs to account for.
        { provide: TeacherEvaluationApiService, useValue: { snapshot: async () => null, save: async () => { throw new Error('not used'); } } }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StudentSubmissionPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('puts recovery and student preview in the wrapping page header, leaving guest details in navigation', async () => {
    const status = spyOn(TestBed.inject(TeacherRecoveryLinkService), 'status').and.resolveTo({ available: true, reason: null, emailMasked: 'g***@example.com', lastSentAt: null });
    component.currentSubmission = { _id: 'submission-1', submissionMode: 'guest', guest: { normalizedEmail: 'guest@example.com' } } as NonNullable<typeof component.currentSubmission>;
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const dom = fixture.nativeElement as HTMLElement, header = dom.querySelector('.submission-page-header')!;
    expect(header.querySelector('[data-action="open"]')?.textContent).toContain('Send recovery link');
    expect(header.querySelector('[data-preview-open]')?.textContent).toContain('Student preview');
    const actions = header.querySelector('.submission-page-actions')!;
    expect(Array.from(actions.children).map(child => child.tagName.toLowerCase())).toEqual(['app-guest-recovery-link-action', 'app-student-preview', 'button', 'button']);
    const navigation = Array.from(actions.children).filter(child => child.tagName === 'BUTTON') as HTMLButtonElement[];
    expect(navigation[0].textContent?.trim()).toBe('View All Submission');
    const back = spyOn(component, 'toBack'); navigation[1].click(); expect(back).toHaveBeenCalledTimes(1);
    navigation[0].click(); expect(component.openSheetSubmission).toBeTrue(); component.openSheetSubmission = false;
    expect(dom.querySelector('.submission-navigation')?.textContent).toContain('guest@example.com');
    expect(dom.querySelector('.submission-navigation app-guest-recovery-link-action, app-annotation-controls app-student-preview')).toBeNull();
    expect(dom.querySelectorAll('app-student-preview').length).toBe(1);
    for (const width of [320, 360, 768, 1024, 1440]) {
      const frame = document.createElement('iframe'); frame.style.cssText = 'position:fixed;top:0;left:0;height:900px;border:0;width:' + width + 'px'; document.body.appendChild(frame);
      try {
        const doc = frame.contentDocument!, win = frame.contentWindow!;
        const css = doc.createElement('style');
        css.textContent = Array.from(document.styleSheets).flatMap(sheet => { try { return Array.from(sheet.cssRules).filter(rule => rule.type !== CSSRule.IMPORT_RULE).map(rule => rule.cssText); } catch { return []; } }).join('\n');
        doc.head.appendChild(css);
        doc.body.style.margin = '0'; doc.body.appendChild(header.cloneNode(true));
        doc.documentElement.setAttribute('data-button-labels-qa', 'header');
        const actions = doc.querySelector('.submission-page-actions')!;
        expect(win.getComputedStyle(actions).flexWrap).toBe('wrap');
        expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(width);
        const title = doc.querySelector('h1')!.getBoundingClientRect(), group = actions.getBoundingClientRect();
        expect(title.bottom <= group.top || title.right <= group.left).toBeTrue();
        for (const button of Array.from(actions.querySelectorAll('button')).filter(button => !button.closest('dialog'))) expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(40);
        if (width >= 1024) {
          const buttons = Array.from(actions.querySelectorAll<HTMLButtonElement>('button')).filter(button => !button.closest('dialog')).slice(0, 3).map(button => button.getBoundingClientRect());
          expect(buttons[0].left).toBeLessThan(buttons[1].left); expect(buttons[1].left).toBeLessThan(buttons[2].left);
          expect(Math.abs(buttons[0].top - buttons[2].top)).toBeLessThan(1);
        }
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      } finally { frame.remove(); }
    }
    expect(status).toHaveBeenCalledOnceWith('submission-1');
    component.currentSubmission = { _id: 'submission-1', submissionMode: 'registered' } as NonNullable<typeof component.currentSubmission>;
    fixture.detectChanges();
    expect(dom.querySelector('.submission-page-header app-guest-recovery-link-action')).toBeNull();
    expect(dom.querySelector('.submission-page-header app-student-preview')).not.toBeNull();
    TestBed.inject(HttpTestingController).match(req => req.url.endsWith('/adaptive-practice/teacher/submissions/submission-1/progress')).forEach(req => req.flush({ data: null }));
  });
  it('keeps recovery hidden for registered or missing-mode submissions without requesting eligibility', () => {
    const status = spyOn(TestBed.inject(TeacherRecoveryLinkService), 'status');
    const dom = fixture.nativeElement as HTMLElement;
    for (const submissionMode of ['registered', undefined] as const) {
      component.currentSubmission = { _id: 'submission-1', submissionMode } as NonNullable<typeof component.currentSubmission>;
      fixture.detectChanges();
      const header = dom.querySelector('.submission-page-header')!;
      expect(header.querySelector('app-guest-recovery-link-action')).toBeNull();
      expect(header.querySelector('app-student-preview')).not.toBeNull();
      expect(header.textContent).toContain('Back To Student Profile');
    }
    expect(status).not.toHaveBeenCalled();
    TestBed.inject(HttpTestingController).match(req => req.url.endsWith('/adaptive-practice/teacher/submissions/submission-1/progress')).forEach(req => req.flush({ data: null }));
  });
  it('places Edit scores, totals and history in the evaluation header without the old bottom card', async () => {
    const snapshot = evaluationSnapshot(20, 'Updated grammar.');
    snapshot.history = [{ at: '2026-11-07T10:00:00Z', actorName: 'Teacher', reason: 'Re-read', reset: false, previousRevision: 3, newRevision: 4,
      before: { criteria: {}, overallScore: 82, grade: 'B' }, after: { criteria: {}, overallScore: 84, grade: 'B' } }];
    spyOn(TestBed.inject(TeacherEvaluationApiService), 'snapshot').and.resolveTo(snapshot);
    component.currentSubmission = { _id: 'submission-1' } as NonNullable<typeof component.currentSubmission>;
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    TestBed.inject(HttpTestingController).match(req => req.url.endsWith('/adaptive-practice/teacher/submissions/submission-1/progress')).forEach(req => req.flush({ data: null }));
    const dom = fixture.nativeElement as HTMLElement, header = dom.querySelector('[data-evaluation-header]')!;
    expect(header.querySelector('[data-te-edit]')).not.toBeNull();
    const edit = header.querySelector<HTMLButtonElement>('[data-te-edit]')!;
    expect(edit.classList.contains('btn-primary')).toBeTrue();
    const download = [...header.querySelectorAll<HTMLButtonElement>('.evaluation-action')].find(b => b.textContent?.includes('Download PDF'))!;
    const editStyle = getComputedStyle(edit), actionStyle = getComputedStyle(download);
    for (const property of ['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'borderRadius', 'fontFamily', 'fontSize', 'fontWeight', 'boxShadow', 'borderTopWidth'] as const) expect(editStyle[property]).withContext(property).toBe(actionStyle[property]);

    expect(header.textContent).toContain('Generate AI Feedback');
    expect(header.textContent).toContain('Download PDF');
    expect(header.textContent).toContain('Create Rubric');
    expect(header.querySelector('[data-te-overall]')?.textContent).toBe('84');
    expect(header.textContent).toContain('AI suggested: 82');
    expect(header.querySelector('[data-te-history]')).not.toBeNull();
    expect(dom.textContent).not.toContain('The AI suggested values stay visible here.');
    expect(dom.querySelectorAll('[data-teacher-evaluation]').length).toBe(1);
    expect(dom.querySelector('.te__sub')).toBeNull();
    expect(getComputedStyle(header.querySelector('.te__head-actions')!).flexWrap).toBe('wrap');
    for (const width of [360, 768, 1024, 1440]) {
      const frame = document.createElement('iframe'); frame.style.cssText = 'position:fixed;top:0;left:0;height:900px;border:0;width:' + width + 'px'; document.body.appendChild(frame);
      try {
        const doc = frame.contentDocument!;
        for (const style of Array.from(document.querySelectorAll('style'))) doc.head.appendChild(style.cloneNode(true));
        doc.body.style.margin = '0'; doc.body.appendChild(header.cloneNode(true));
        expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(width);
        doc.querySelector<HTMLDetailsElement>('details')!.open = true;
        expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(width);
      } finally { frame.remove(); }
    }

  });
  describe('evaluation edit layout', () => {
    const dom = () => fixture.nativeElement as HTMLElement;
    async function settle() { for (let i = 0; i < 4; i++) { await fixture.whenStable(); fixture.detectChanges(); await Promise.resolve(); } }
    async function prepare() {
      const snapshot = evaluationSnapshot();
      spyOn(TestBed.inject(TeacherEvaluationApiService), 'snapshot').and.resolveTo(snapshot);
      spyOn(component, 'onAnnotationsSaved').and.resolveTo();
      component.currentSubmission = { _id: 'submission-1' } as NonNullable<typeof component.currentSubmission>;
      component.aiFeedbackState = 'loaded'; component.isLoading = false;
      component.canonicalResultState = normalizeCanonicalResult({ evaluationStatus: 'completed', detailedFeedbackStatus: 'completed', processingActive: false });
      component.rubricFeedbackItems = rubricScoresToFeedbackItems(Object.fromEntries(snapshot.criteria.map(c => [c.key, { ...c.final, maxScore: c.maxScore }])));
      fixture.detectChanges(); await settle();
      TestBed.inject(HttpTestingController).match(req => req.url.endsWith('/adaptive-practice/teacher/submissions/submission-1/progress')).forEach(req => req.flush({ data: null }));
    }
    async function click(selector: string) { dom().querySelector<HTMLElement>(selector)!.click(); await settle(); }
    function type(selector: string, value: string) { const field = dom().querySelector<HTMLInputElement>(selector)!; field.value = value; field.dispatchEvent(new Event('input')); }
    it('swaps categories for the form, focuses its heading and disables AI generation; Cancel restores the original', async () => {
      await prepare();
      const generate = () => dom().querySelector<HTMLButtonElement>('[data-generate-evaluation]')!;
      expect(dom().querySelector('[data-evaluation-categories]')?.textContent).toContain('Original grammar.');
      expect(generate().disabled).toBeFalse();
      await click('[data-te-edit]');
      expect(dom().querySelector('[data-evaluation-categories]')).toBeNull();
      expect(dom().querySelector('.te__form')).not.toBeNull();
      expect(document.activeElement).toBe(dom().querySelector('[data-te-heading]'));
      expect(generate().disabled).toBeTrue();
      expect(dom().querySelector('[data-evaluation-header]')?.textContent).toContain('Download PDF');
      type('#te-score-GRAMMAR', '20'); type('#te-comment-GRAMMAR', 'Unsaved change'); await settle();
      expect(TestBed.inject(UnsavedWorkRegistry).has('teacher-evaluation-editor')).toBeTrue();
      await click('[data-te-cancel]');
      expect(dom().querySelector('.te__form')).toBeNull();
      expect(dom().querySelector('[data-evaluation-categories]')?.textContent).toContain('Original grammar.');
      expect(dom().querySelector('[data-evaluation-categories]')?.textContent).not.toContain('Unsaved change');
      expect(dom().querySelector('[data-te-overall]')?.textContent).toBe('82');
      expect(generate().disabled).toBeFalse();
      expect(TestBed.inject(UnsavedWorkRegistry).has('teacher-evaluation-editor')).toBeFalse();
    });
    it('Save shows the returned teacher scores and comments in the category list and header', async () => {
      await prepare();
      const save = spyOn(TestBed.inject(TeacherEvaluationApiService), 'save').and.resolveTo({ revision: 4, snapshot: evaluationSnapshot(20, 'Updated teacher comment.') });
      await click('[data-te-edit]'); type('#te-score-GRAMMAR', '20'); type('#te-comment-GRAMMAR', 'Updated teacher comment.'); await settle();
      await click('[data-te-save]');
      expect(save.calls.mostRecent().args).toEqual(['submission-1', jasmine.objectContaining({ revision: 3, criteria: { GRAMMAR: { score: 20, comment: 'Updated teacher comment.' } } })]);
      expect(dom().querySelector('.te__form')).toBeNull();
      const categories = dom().querySelector('[data-evaluation-categories]')!;
      expect(categories.textContent).toContain('Updated teacher comment.');
      expect(categories.querySelector('.score-earned')?.textContent?.trim()).toBe('20.0');
      expect(dom().querySelector('[data-te-overall]')?.textContent).toBe('84');
      expect(dom().querySelector('[data-te-grade]')?.textContent).toBe('B');
      expect(dom().querySelector('[data-evaluation-header]')?.textContent).toContain('AI suggested: 82');
      expect(TestBed.inject(UnsavedWorkRegistry).has('teacher-evaluation-editor')).toBeFalse();
    });
    it('a rate-limited save leaves the form, typed values and unsaved protection intact', async () => {
      await prepare();
      spyOn(TestBed.inject(TeacherEvaluationApiService), 'save').and.rejectWith(new HttpErrorResponse({ status: 429 }));
      await click('[data-te-edit]'); type('#te-score-GRAMMAR', '20'); type('#te-comment-GRAMMAR', 'Keep this draft.'); await settle();
      await click('[data-te-save]');
      expect(dom().querySelector('[data-evaluation-categories]')).toBeNull();
      expect(dom().querySelector<HTMLInputElement>('#te-score-GRAMMAR')?.value).toBe('20');
      expect(dom().querySelector<HTMLTextAreaElement>('#te-comment-GRAMMAR')?.value).toBe('Keep this draft.');
      expect(dom().querySelector('[data-te-error]')?.textContent?.trim()).toBeTruthy();
      expect(TestBed.inject(UnsavedWorkRegistry).has('teacher-evaluation-editor')).toBeTrue();
      await click('[data-te-cancel]');
    });
  });
  describe('relocated correction review', () => {
    const dom = () => fixture.nativeElement as HTMLElement;
    async function settle() { for (let i = 0; i < 4; i++) { await fixture.whenStable(); fixture.detectChanges(); await Promise.resolve(); } }
    function snapshot(): AnnotationSnapshot {
      return { revision: 1, sourceHash: 'source', scoringReviewRequired: false, scorePolicy: 'Unchanged',
        pages: [{ fileId: 'f1', pageNumber: 1, startChar: 0, endChar: 19, text: 'The student writes.', words: [{ id: 'w1', text: 'The', bbox: { x: 4, y: 10, w: 8, h: 4 } }, { id: 'w2', text: 'student', bbox: { x: 14, y: 10, w: 20, h: 4 } }, { id: 'w3', text: 'writes.', bbox: { x: 36, y: 10, w: 20, h: 4 } }] }],
        corrections: [{ id: 'c1', fileId: 'f1', page: 1, moderationStatus: 'visible', source: 'AI', startChar: 4, endChar: 11, quotedText: 'student', wordIds: ['w2'], symbol: 'SP', message: 'Check spelling.', suggestedText: 'student' }],
        orphans: [], effective: [{ id: 'c1', wordIds: ['w2'], renderTarget: { version: 1, source: 'wordIds', wordIds: ['w2'], boxes: [{ x: 14, y: 10, w: 20, h: 4 }] } }],
        transitions: { hide: { from: ['visible'], to: 'hidden' }, restore: { from: ['hidden', 'archived'], to: 'visible' }, archive: { from: ['visible', 'hidden'], to: 'archived' }, edit: { from: ['visible', 'hidden'], to: null }, add: { from: [], to: 'visible' } },
        legend: { groups: [{ key: 'MECHANICS', label: 'Mechanics', symbols: [{ symbol: 'SP', label: 'Spelling' }] }] } };
    }
    async function prepare() {
      const load = spyOn(TestBed.inject(TeacherAnnotationApiService), 'snapshot').and.resolveTo(snapshot());
      spyOn(TestBed.inject(TeacherEvaluationApiService), 'snapshot').and.resolveTo(evaluationSnapshot());
      component.currentSubmission = { _id: 'submission-1' } as NonNullable<typeof component.currentSubmission>;
      component.isUploadedFile = true;
      const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="white"/><text x="24" y="105" font-size="28">The student writes.</text></svg>');
      component.essayImageUrl = image; component.submissionFileIds = ['f1']; component.submissionFileUrls = [image];
      const words = snapshot().pages[0].words.map(({ id, text, bbox }) => ({ id, text, bbox: bbox ?? null }));
      component.annotations = [{ _id: 'c1', submissionId: 'submission-1', fileId: 'f1', page: 1, wordIds: ['w2'], symbol: 'SP', message: 'Check spelling.', color: '#c00', source: 'AI', editable: false }];
      component.transcriptPageViews = [{ key: 'f1:1', fileId: 'f1', pageNumber: 1, displayNumber: 1, words, annotations: component.annotations, text: 'The student writes.', status: 'ready' }];
      fixture.detectChanges(); await settle();
      TestBed.inject(HttpTestingController).match(req => req.url.endsWith('/adaptive-practice/teacher/submissions/submission-1/progress')).forEach(req => req.flush({ data: null }));
      return load;
    }
    const toggle = () => dom().querySelector<HTMLButtonElement>('[data-review-corrections]')!;
    it('places a single trigger before the unchanged transcript switch and keeps the original editor state across collapse and view changes', async () => {
      const load = await prepare(), editor = component.annotationControls!, toggleHandler = spyOn(editor, 'toggle').and.callThrough();
      expect(dom().querySelectorAll('[data-review-corrections]').length).toBe(1);
      expect(toggle().querySelector('span:not([aria-hidden])')?.textContent?.trim()).toBe('Review corrections');
      expect(toggle().nextElementSibling?.textContent).toContain('View Student Transcribed Text');
      expect(dom().querySelector('app-annotation-controls .editor__head')).toBeNull();
      expect(dom().querySelector('app-annotation-controls')!.getBoundingClientRect().height).toBe(0);
      const overlay = fixture.debugElement.query(By.directive(CorrectionOverlay)).componentInstance;
      const original = dom().querySelector<HTMLElement>('[data-standalone-viewer]')!;
      expect(original.hidden).toBeFalse();
      expect(original.getBoundingClientRect().height).toBeGreaterThan(0);
      const buttonWidth = toggle().getBoundingClientRect().width;
      toggle().click(); await settle();
      expect(toggleHandler).toHaveBeenCalledTimes(1);
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
      expect(toggle().querySelector('span:not([aria-hidden])')?.textContent).toBe('Close');
      expect(toggle().getBoundingClientRect().width).toBe(buttonWidth);
      expect(original.hidden).toBeTrue();
      expect(original.getBoundingClientRect().height).toBe(0);
      expect(dom().querySelector('#annotation-editor-body')).not.toBeNull();
      expect(dom().querySelector('[data-bulk]')).not.toBeNull();
      expect(dom().querySelector('app-review-workspace [data-sync-image]')).not.toBeNull();
      expect(dom().querySelector('app-review-workspace [data-sync-transcript]')).not.toBeNull();
      expect(dom().querySelector('[data-row-edit]')).not.toBeNull();
      expect(dom().textContent).toContain('Change history');
      expect(load).toHaveBeenCalledTimes(1);
      const add = [...dom().querySelectorAll<HTMLButtonElement>('app-annotation-controls button')].find(b => b.textContent?.trim() === 'Add correction')!;
      add.click(); await settle();
      const source = dom().querySelector<HTMLElement>('[data-source-content]')!;
      const word = source.querySelector<HTMLElement>('[data-word-id]')!;
      const range = document.createRange(); range.selectNodeContents(word);
      document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range);
      source.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); await settle();
      const message = dom().querySelector<HTMLTextAreaElement>('#annotation-message')!;
      message.value = 'Keep this unsaved explanation'; message.dispatchEvent(new Event('input')); await settle();
      editor.selection.pin('c1', 'list'); await settle();
      toggle().click(); await settle();
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
      expect(toggle().querySelector('span:not([aria-hidden])')?.textContent).toBe('Review corrections');
      expect(toggle().getBoundingClientRect().width).toBe(buttonWidth);
      expect(original.hidden).toBeFalse();
      expect(original.getBoundingClientRect().height).toBeGreaterThan(0);
      expect(dom().querySelector('#annotation-editor-body')).toBeNull();
      expect(component.annotationControls).toBe(editor);
      expect(TestBed.inject(UnsavedWorkRegistry).has('teacher-annotation-editor')).toBeTrue();
      toggle().click(); await settle();
      expect(dom().querySelector<HTMLTextAreaElement>('#annotation-message')?.value).toBe('Keep this unsaved explanation');
      expect(editor.selection.pinnedId()).toBe('c1');
      expect(load).toHaveBeenCalledTimes(1);
      expect(fixture.debugElement.query(By.directive(CorrectionOverlay)).componentInstance).toBe(overlay);
      toggle().nextElementSibling!.dispatchEvent(new MouseEvent('click', { bubbles: true })); await settle();
      expect(component.isUploadedFile).toBeFalse();
      expect(dom().querySelector('.submission-media-header')?.textContent).toContain("Student's Transcribed Text");
      expect(dom().querySelectorAll('[data-review-corrections]').length).toBe(1);
      expect(component.annotationControls).toBe(editor);
      expect(editor.form()?.value.message).toBe('Keep this unsaved explanation');
      toggle().click(); await settle();
      expect(editor.open()).toBeFalse();
      editor.cancelForm(); await settle();
    });
    it('repeats open/close rapidly without remounting the source or fetching another snapshot', async () => {
      const load = await prepare(), editor = component.annotationControls!;
      const original = dom().querySelector<HTMLElement>('[data-standalone-viewer]')!;
      const image = original.querySelector('img');
      const overlay = fixture.debugElement.query(By.directive(CorrectionOverlay)).componentInstance as CorrectionOverlay;
      const source = overlay.imageUrl, annotations = overlay.annotations, fileId = component.activeFileId;
      for (let i = 0; i < 3; i++) {
        toggle().click(); await settle();
        expect(original.hidden).toBeTrue();
        expect(dom().querySelector('app-review-workspace [data-sync-image]')).not.toBeNull();
        expect(dom().querySelectorAll('app-annotation-controls').length).toBe(1);
        toggle().click(); await settle();
        expect(original.hidden).toBeFalse();
        expect(dom().querySelector('app-review-workspace')).toBeNull();
        expect(component.annotationControls).toBe(editor);
        expect(original.querySelector('img')).toBe(image);
        expect(fixture.debugElement.query(By.directive(CorrectionOverlay)).componentInstance).toBe(overlay);
        expect(overlay.imageUrl).toBe(source); expect(overlay.annotations).toBe(annotations);
        expect(component.activeFileId).toBe(fileId);
      }
      toggle().click(); toggle().click(); await settle();
      expect(editor.open()).toBeFalse(); expect(original.hidden).toBeFalse();
      expect(load).toHaveBeenCalledTimes(1);
    });
    it('reuses the in-flight initial snapshot across rapid open, close and reopen', async () => {
      const load = await prepare();
      let finish!: (data: AnnotationSnapshot) => void;
      load.and.returnValue(new Promise<AnnotationSnapshot>(resolve => { finish = resolve; }));
      toggle().click(); fixture.detectChanges();
      expect(component.annotationControls?.loading()).toBeTrue();
      toggle().click(); toggle().click(); fixture.detectChanges();
      expect(component.annotationControls?.open()).toBeTrue();
      expect(load).toHaveBeenCalledTimes(1);
      expect(dom().querySelector<HTMLElement>('[data-standalone-viewer]')?.hidden).toBeTrue();
      finish(snapshot()); await settle();
      expect(component.annotationControls?.loading()).toBeFalse();
      expect(dom().querySelector('[data-row-edit]')).not.toBeNull();
      expect(load).toHaveBeenCalledTimes(1);
      toggle().click(); await settle();
      expect(dom().querySelector<HTMLElement>('[data-standalone-viewer]')?.hidden).toBeFalse();
    });
    it('omits Grade check only on this page without changing its score-review data or correction controls', async () => {
      const load = await prepare();
      const scoreReview = { status: 'needed' as const, fingerprint: 'a'.repeat(64), decision: null, countsScored: { grammar: 3 }, countsVisible: { grammar: 2 },
        scores: { overallScore: 82, grade: 'B', categories: { GRAMMAR: { score: 18, maxScore: 25 } }, customRubricOverallScore: null } };
      load.and.resolveTo({ ...snapshot(), scoreReview });
      const keep = spyOn(TestBed.inject(TeacherAnnotationApiService), 'scoreReview');
      toggle().click(); await settle();
      expect(component.annotationControls?.snapshot()?.scoreReview).toBe(scoreReview);
      expect(dom().querySelector('app-grade-check, [data-grade-check]')).toBeNull();
      expect(dom().querySelector('[data-bulk]')).not.toBeNull();
      expect(dom().querySelector('[data-row-edit]')).not.toBeNull();
      expect(dom().querySelector('app-review-workspace')).not.toBeNull();
      expect(keep).not.toHaveBeenCalled();
    });
    it('keeps the existing loading and failure states behind the relocated toggle', async () => {
      await prepare();
      TestBed.inject(TeacherAnnotationApiService).snapshot = jasmine.createSpy('snapshot').and.rejectWith(new HttpErrorResponse({ status: 0 }));
      toggle().click(); fixture.detectChanges();
      expect(component.annotationControls?.loading()).toBeTrue();
      await settle();
      expect(dom().querySelector('[data-form-error]')?.textContent?.trim()).toBeTruthy();
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
      toggle().click(); await settle();
      expect(component.annotationControls?.open()).toBeFalse();
    });
    it('contains review and Evaluation live regions within the teacher page scroll root', async () => {
      await prepare(); toggle().click(); await settle();
      for (const width of [1440, 1280, 1024, 768, 375, 320]) {
        const frame = document.createElement('iframe'); frame.style.cssText = 'position:fixed;inset:0;height:760px;border:0;width:' + width + 'px'; document.body.appendChild(frame);
        try {
          const doc = frame.contentDocument!;
          const css = doc.createElement('style');
          css.textContent = Array.from(document.styleSheets).flatMap(sheet => { try { return Array.from(sheet.cssRules).filter(rule => rule.type !== CSSRule.IMPORT_RULE).map(rule => rule.cssText); } catch { return []; } }).join('\n');
          doc.head.appendChild(css); doc.body.style.cssText = 'margin:0;display:flex;flex-direction:column;height:760px';
          const header = doc.createElement('header'); header.style.cssText = 'height:73px;flex-shrink:0'; doc.body.appendChild(header);
          const main = doc.createElement('main'); main.style.cssText = 'flex:1;overflow:auto;min-height:0'; doc.body.appendChild(main);
          const page = dom().querySelector('.submission-review-page')!.cloneNode(false) as HTMLElement; main.appendChild(page);
          const top = doc.createElement('div'); top.style.height = '600px'; page.appendChild(top);
          page.appendChild(dom().querySelector('app-annotation-controls')!.cloneNode(true));
          page.appendChild(dom().querySelector('app-teacher-evaluation-editor')!.cloneNode(true));
          const bottom = doc.createElement('div'); bottom.style.height = '1100px'; page.appendChild(bottom);
          doc.documentElement.setAttribute('data-four-review-qa', 'teacher-contained');
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          expect(doc.querySelector<HTMLElement>('.te__header > .sr-only')!.offsetParent).toBe(page);
          expect(doc.documentElement.scrollHeight).withContext('outer document at ' + width).toBeLessThanOrEqual(760);
          expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(width);
          expect(main.scrollHeight).toBeGreaterThan(main.clientHeight);
          main.scrollTop = main.scrollHeight;
          expect(doc.documentElement.scrollHeight).toBeLessThanOrEqual(760);
        } finally { frame.remove(); }
      }
    });
    it('keeps the complete mobile workflow compact, readable and reachable without changing handlers', async () => {
      spyOn(TestBed.inject(WritingModelApiService), 'snapshot').and.resolveTo({ enabled: true, text: 'A synthetic learning reference.', status: 'draft', source: 'teacher', releaseRule: 'afterRevision', released: false, releasedAt: null, revision: 2, updatedAt: null, readOnly: false, aiAvailable: true, generationsToday: 0, generationsPerDay: 3, textMax: 4000 });
      const progress = spyOn(TestBed.inject(AdaptivePracticeApiService), 'getTeacherProgress').and.returnValue(of({ state: 'in-progress', sourceStatus: 'current', submissionId: 'submission-1', sessionId: 'session-1', summary: { totalActivities: 2, improvedActivities: 1, progressPercentage: 50, totalAttempts: 3, lastPracticedAt: null }, skills: [] }));
      component.assignmentId = 'mobile-assignment';
      await prepare();
      TestBed.inject(HttpTestingController).match(req => req.url.includes('/mobile-assignment')).forEach(req => req.flush({ success: true, data: [] }));
      component.currentSubmission = { ...component.currentSubmission!, student: { _id: 'student-synthetic-01', displayName: 'Sample Student', email: 'student@example.test', role: 'student' } };
      component.isLoading = false; component.aiFeedbackState = 'loaded';
      component.canonicalResultState = normalizeCanonicalResult({ evaluationStatus: 'completed', detailedFeedbackStatus: 'completed', processingActive: false });
      component.feedbackForm.enable();
      await settle();
      const editor = component.annotationControls!;
      const capture = async (state: string) => {
        for (const width of [1440, 1280, 1024, 768, 430, 390, 375, 320]) {
          const frame = document.createElement('iframe'); frame.style.cssText = 'position:fixed;inset:0;height:900px;border:0;width:' + width + 'px'; document.body.appendChild(frame);
          try {
            const doc = frame.contentDocument!, win = frame.contentWindow!, css = doc.createElement('style');
            css.textContent = Array.from(document.styleSheets).flatMap(sheet => { try { return Array.from(sheet.cssRules).filter(rule => rule.type !== CSSRule.IMPORT_RULE).map(rule => rule.cssText); } catch { return []; } }).join('\n');
            doc.head.appendChild(css); doc.body.style.margin = '0';
            const clone = dom().cloneNode(true) as HTMLElement;
            const originals = dom().querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input,textarea,select');
            clone.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input,textarea,select').forEach((field, index) => {
              if (field instanceof HTMLTextAreaElement) field.textContent = originals[index].value;
              else if (field instanceof HTMLInputElement) field.setAttribute('value', originals[index].value);
              else for (const option of Array.from(field.options)) option.toggleAttribute('selected', option.value === originals[index].value);
            });
            doc.body.appendChild(clone);
            expect(doc.documentElement.scrollWidth).withContext(state + ' at ' + width).toBeLessThanOrEqual(width);
            expect(doc.querySelector('[data-writing-model-editor]')).not.toBeNull();
            expect(doc.querySelector('.teacher-comments-editor textarea')?.getAttribute('aria-label')).toBe('Teacher comments to the student');
            expect(doc.querySelector('app-adaptive-practice-progress')?.textContent).toContain('50%');
            if (width < 768) {
              const header = doc.querySelector('.submission-page-header')!.getBoundingClientRect();
              expect(header.height).withContext('compact page header').toBeLessThan(260);
              const identity = doc.querySelector('.submission-student-identity')!.getBoundingClientRect();
              const previous = doc.querySelector('.submission-navigation button')!.getBoundingClientRect();
              expect(identity.bottom).toBeLessThanOrEqual(previous.top);
              expect(win.getComputedStyle(doc.querySelector('.submission-page-actions')!).display).toBe('grid');
              const form = doc.querySelector<HTMLElement>('.workspace__editor');
              if (form) expect(win.getComputedStyle(form).maxHeight).toBe('none');
            }
            if (state === 'expanded' || state === 'selecting') {
              expect(doc.querySelectorAll('.workspace__corrections-panel ul.rows').length).toBe(1);
              expect(doc.querySelector('#annotation-text-panel ul.rows')).toBeNull();
            }
            if (state === 'add' || state === 'edit') {
              expect(doc.querySelector('ul.rows')).toBeNull();
              expect(doc.querySelectorAll('.workspace__editor [data-edit-save]').length).toBe(1);
            }
            for (const button of Array.from(doc.querySelectorAll<HTMLButtonElement>('.submission-page-actions button, .submission-navigation button, .submission-media-actions button, .teacher-comments-editor button, .wm__actions button'))) {
              if (button.closest('dialog')) continue;
              expect(button.getBoundingClientRect().height).withContext(button.textContent ?? '').toBeGreaterThanOrEqual(44);
              expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth + 1);
            }
            doc.documentElement.setAttribute('data-pdf-mobile-qa', state);
            await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          } finally { frame.remove(); }
        }
      };
      await capture('collapsed'); toggle().click(); await settle(); await capture('expanded');
      const add = [...dom().querySelectorAll<HTMLButtonElement>('app-annotation-controls button')].find(button => button.textContent?.trim() === 'Add correction')!;
      add.click(); await settle(); await capture('selecting');
      const word = dom().querySelector('[data-source-content] [data-word-id]')!, range = document.createRange(); range.selectNodeContents(word);
      document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range);
      dom().querySelector('[data-source-content]')!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); await settle(); await capture('add');
      editor.cancelForm(); await settle();
      dom().querySelector<HTMLButtonElement>('[data-row-edit]')!.click(); await settle(); await capture('edit');
      editor.cancelForm(); await settle();
      toggle().nextElementSibling!.dispatchEvent(new MouseEvent('click', { bubbles: true })); await settle(); await capture('text');
      spyOn(TestBed.inject(TeacherAnnotationApiService), 'history').and.resolveTo({ items: [], nextOffset: null });
      editor.openHistory(); await settle(); await capture('history'); editor.closeHistory(); await settle();
      expect(progress).toHaveBeenCalledTimes(1);
    });
    it('renders both button rows without collisions or horizontal overflow at the requested widths', async () => {
      await prepare();
      for (const expanded of [false, true]) {
        if (expanded) { toggle().click(); await settle(); }
        for (const width of [1440, 1024, 768, 375, 320]) {
        const frame = document.createElement('iframe'); frame.style.cssText = 'position:fixed;top:0;left:0;height:900px;border:0;width:' + width + 'px'; document.body.appendChild(frame);
        try {
          const doc = frame.contentDocument!, win = frame.contentWindow!;
          const css = doc.createElement('style');
          css.textContent = Array.from(document.styleSheets).flatMap(sheet => { try { return Array.from(sheet.cssRules).filter(rule => rule.type !== CSSRule.IMPORT_RULE).map(rule => rule.cssText); } catch { return []; } }).join('\n');
          doc.head.appendChild(css); doc.body.style.margin = '0';
          const card = dom().querySelector('.submission-media-header')!.parentElement!.cloneNode(true); doc.body.appendChild(card);
          doc.body.appendChild(dom().querySelector('app-annotation-controls')!.cloneNode(true));
          doc.body.appendChild(dom().querySelector('[data-evaluation-header]')!.cloneNode(true));
          if (expanded) {
            const workspace = doc.querySelector('app-review-workspace')!.getBoundingClientRect(), evaluation = doc.querySelector('[data-evaluation-header]')!.getBoundingClientRect();
            expect(evaluation.top).toBeGreaterThanOrEqual(workspace.bottom);
            expect(evaluation.top - workspace.bottom).withContext(width + ' evaluation gap').toBeLessThan(80);
          }
          const title = doc.querySelector('.submission-media-header > p')!.getBoundingClientRect(), actions = doc.querySelector('.submission-media-actions')!.getBoundingClientRect();
          expect(title.bottom <= actions.top || title.right <= actions.left).withContext(width + ' title collision').toBeTrue();
          const buttons = [...doc.querySelectorAll<HTMLButtonElement>('.submission-media-actions button')];
          const review = buttons[0].getBoundingClientRect(), transcript = buttons[1].getBoundingClientRect();
          expect(review.right <= transcript.left || review.bottom <= transcript.top).withContext(width + ' button collision').toBeTrue();
          for (const button of buttons) expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
          expect(win.getComputedStyle(doc.querySelector('.submission-media-actions')!).flexWrap).toBe('wrap');
          expect(doc.documentElement.scrollWidth).withContext(width + ' horizontal overflow').toBeLessThanOrEqual(width);
          const standalone = doc.querySelector<HTMLElement>('[data-standalone-viewer]')!;
          expect(standalone.getBoundingClientRect().height === 0).toBe(expanded);
          expect(doc.querySelector('#annotation-editor-body') !== null).toBe(expanded);
          expect(doc.querySelector('[data-review-corrections] span:not([aria-hidden])')?.textContent?.trim()).toBe(expanded ? 'Close' : 'Review corrections');
          expect(doc.querySelectorAll('app-annotation-controls').length).toBe(1);

          // Allow a browser render in both states, including stylesheet-driven wrapping.
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        } finally { frame.remove(); }
        }
      }
    });
  });
  it('should create', () => {
    expect(component).toBeTruthy();
  });
  it('uses the same server progress and never animates a persisted completed result',()=>{
    component.canonicalResultState=normalizeCanonicalResult({processingActive:true,terminal:false,
      processingProgress:{status:'processing',stage:'corrections',percent:50,message:'Analyzing writing corrections',active:true,failed:false,completed:false}});
    fixture.detectChanges();expect(fixture.nativeElement.querySelector('app-analysis-progress [role="progressbar"]').getAttribute('aria-valuenow')).toBe('50');
    component.canonicalResultState=normalizeCanonicalResult({processingActive:false,terminal:true,semanticStatus:'completed',evaluationStatus:'completed',
      detailedFeedbackStatus:'completed',processingProgress:{status:'completed',stage:'completed',percent:100,message:'Result ready',active:false,failed:false,completed:true}});
    fixture.detectChanges();expect(fixture.nativeElement.querySelector('app-analysis-progress section')).toBeNull();
  });
  it('keeps uncertain exact source visible to the teacher without showing final scores', () => {
    component.currentSubmission={_id:'submission-1',sourceFidelity:{mode:'astra_verified',status:'OCR_UNCERTAIN',
      assessmentAllowed:false,transcriptExact:'sence\nSocial',pages:[]}} as unknown as NonNullable<typeof component.currentSubmission>;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.source-text').textContent).toBe('sence\nSocial');
    expect(fixture.nativeElement.querySelector('.submission-review-page')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Back');
  });
  it('preserves authoritative renderTarget and the already-correct visualTarget fallback', async () => {
    component.currentSubmission = { _id: 'submission-1' } as NonNullable<typeof component.currentSubmission>;
    const internals = component as unknown as { ensureWritingCorrectionsLegendLoaded(): Promise<void>;
      getOcrCorrectionsPayload(id: string): Promise<unknown>; loadOcrCorrections(id: string): Promise<unknown> };
    spyOn(internals, 'ensureWritingCorrectionsLegendLoaded').and.resolveTo();
    const words = [{ id: 'w1', text: 'time', bbox: { x: 10, y: 40, w: 10, h: 5 } },
      { id: 'w2', text: 'time', bbox: { x: 70, y: 40, w: 10, h: 5 } }];
    const correction = { id: 'c1', fileId: 'file-a', page: 1, symbol: 'SP', category: 'MECHANICS',
      wordIds: ['w1', 'w2'], evidenceWordIds: ['w1', 'w2'], message: 'Frozen message', suggestedText: 'Frozen suggestion',
      bboxList: [words[0].bbox], visualTarget: { version: 1 as const, wordIds: ['w2'], anchors: [] },
      renderTarget: { version: 1 as const, source: 'visualTarget' as const, wordIds: ['w2'], anchors: [], boxes: [words[1].bbox] } };
    const payload = { success: true, data: { ocrStatus: 'completed', correctionStatus: 'completed',
      ocr: [{ fileId: 'file-a', pageNumber: 1, words }], corrections: [correction], score: 72 } };
    const before = JSON.stringify(payload);
    spyOn(internals, 'getOcrCorrectionsPayload').and.resolveTo(payload);
    await internals.loadOcrCorrections('submission-1');
    expect(component.annotations).toHaveSize(1);
    expect(component.annotations[0].renderTarget).toBe(correction.renderTarget);
    expect(component.annotations[0].wordIds).toEqual(correction.wordIds);
    const [visual] = buildAnnotationVisuals(component.annotations, words, 1, 600, 800);
    expect(visual.segments).toHaveSize(1);
    expect(visual.segments[0].left).toBeGreaterThan(69);
    expect(JSON.stringify(payload)).toBe(before);
  });

  describe('AI teacher comment drafts', () => {
    beforeEach(() => {
      component.currentSubmission = { _id: 'submission-1' } as NonNullable<typeof component.currentSubmission>;
      component.feedbackForm.enable();
      component.teacherCommentState = 'loaded';
      component.feedbackForm.patchValue({ message: '' });
    });
    it('renders the action, prevents duplicate clicks and fills an editable unsaved draft', async () => {
      let resolve!: (value: { comment: string }) => void;
      const call = spyOn(TestBed.inject(FeedbackApiService), 'generateTeacherCommentDraft').and.returnValue(new Promise(r => resolve = r));
      const submit = spyOn(component, 'submitFeedback');
      fixture.detectChanges();
      const button: HTMLButtonElement = fixture.nativeElement.querySelector('.teacher-comment-ai-draft');
      expect(button.textContent).toContain('Generate AI Comments');
      for (const width of [320, 360, 768, 1024, 1440]) {
        const frame = document.createElement('iframe'); frame.style.cssText = 'position:fixed;inset:0;height:700px;border:0;width:' + width + 'px'; document.body.appendChild(frame);
        try {
          const doc = frame.contentDocument!;
          const css = doc.createElement('style');
          css.textContent = Array.from(document.styleSheets).flatMap(sheet => { try { return Array.from(sheet.cssRules).filter(rule => rule.type !== CSSRule.IMPORT_RULE).map(rule => rule.cssText); } catch { return []; } }).join('\n');
          doc.head.appendChild(css);
          doc.body.style.margin = '0'; doc.body.appendChild(fixture.nativeElement.querySelector('.teacher-comments-editor').cloneNode(true));
          doc.documentElement.setAttribute('data-button-labels-qa', 'comments');
          expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(width);
          const actions = doc.querySelector('.teacher-comments-editor__actions')!.getBoundingClientRect();
          for (const action of Array.from(doc.querySelectorAll('button'))) {
            const rect = action.getBoundingClientRect();
            expect(rect.right).toBeLessThanOrEqual(actions.right + 1); expect(rect.left).toBeGreaterThanOrEqual(actions.left - 1);
            expect(action.scrollWidth).toBeLessThanOrEqual(action.clientWidth + 1);
          }
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        } finally { frame.remove(); }
      }
      button.click();
      await component.generateTeacherCommentDraft();
      fixture.detectChanges();
      expect(button.disabled).toBeTrue(); expect(button.textContent).toContain('Generating...');
      expect(call).toHaveBeenCalledOnceWith('submission-1');
      resolve({ comment: 'A useful draft.' });
      await fixture.whenStable();
      TestBed.inject(HttpTestingController).match(req => req.url.endsWith('/progress'))
        .forEach(req => req.flush({ success: true, data: {} }));
      expect(component.feedbackForm.value.message).toBe('A useful draft.');
      expect(component.feedbackForm.controls['message'].enabled).toBeTrue();
      component.feedbackForm.controls['message'].setValue('My edited draft.');
      expect(component.feedbackForm.value.message).toBe('My edited draft.');
      expect(submit).not.toHaveBeenCalled();
      expect(component.isTeacherCommentGenerating).toBeFalse();
    });
    it('protects existing saved/manual text unless replacement is confirmed', async () => {
      component.feedbackForm.patchValue({ message: 'My saved comment.' });
      spyOn(TestBed.inject(FeedbackApiService), 'generateTeacherCommentDraft').and.resolveTo({ comment: 'New draft.' });
      const confirm = spyOn(TestBed.inject(AlertService), 'showConfirm').and.resolveTo(false);
      await component.generateTeacherCommentDraft();
      expect(component.feedbackForm.value.message).toBe('My saved comment.');
      expect(confirm).toHaveBeenCalled();
      confirm.and.resolveTo(true);
      await component.generateTeacherCommentDraft();
      expect(component.feedbackForm.value.message).toBe('New draft.');
    });
    it('protects text entered during generation and during confirmation', async () => {
      let resolve!: (value: { comment: string }) => void;
      spyOn(TestBed.inject(FeedbackApiService), 'generateTeacherCommentDraft').and.returnValue(new Promise(r => resolve = r));
      spyOn(TestBed.inject(AlertService), 'showConfirm').and.callFake(async () => {
        component.feedbackForm.patchValue({ message: 'Latest edit.' }); return true;
      });
      const pending = component.generateTeacherCommentDraft();
      component.feedbackForm.patchValue({ message: 'Typed while waiting.' });
      resolve({ comment: 'New draft.' }); await pending;
      expect(component.feedbackForm.value.message).toBe('Latest edit.');
    });
    it('preserves text on network/provider failure', async () => {
      component.feedbackForm.patchValue({ message: 'Keep this.' });
      spyOn(TestBed.inject(FeedbackApiService), 'generateTeacherCommentDraft').and.rejectWith({ status: 503 });
      const alert = spyOn(TestBed.inject(AlertService), 'showError');
      await component.generateTeacherCommentDraft();
      expect(component.feedbackForm.value.message).toBe('Keep this.');
      expect(alert).toHaveBeenCalled(); expect(component.isTeacherCommentGenerating).toBeFalse();
    });
    it('requires confirmation when existing text is deleted during generation', async () => {
      component.feedbackForm.patchValue({ message: 'Original draft.' });
      let resolve!: (value: { comment: string }) => void;
      spyOn(TestBed.inject(FeedbackApiService), 'generateTeacherCommentDraft').and.returnValue(new Promise(r => resolve = r));
      const confirm = spyOn(TestBed.inject(AlertService), 'showConfirm').and.resolveTo(false);
      const pending = component.generateTeacherCommentDraft();
      component.feedbackForm.patchValue({ message: '' });
      resolve({ comment: 'New draft.' }); await pending;
      expect(confirm).toHaveBeenCalled(); expect(component.feedbackForm.value.message).toBe('');
    });
    it('ignores a late draft after switching submissions', async () => {
      let resolve!: (value: { comment: string }) => void;
      spyOn(TestBed.inject(FeedbackApiService), 'generateTeacherCommentDraft').and.returnValue(new Promise(r => resolve = r));
      const pending = component.generateTeacherCommentDraft();
      component.currentSubmission = { _id: 'submission-2' } as NonNullable<typeof component.currentSubmission>;
      component.feedbackForm.patchValue({ message: 'Other submission.' });
      resolve({ comment: 'Old draft.' }); await pending;
      expect(component.feedbackForm.value.message).toBe('Other submission.');
    });
    it('saves an edited draft only through the existing Submit flow', async () => {
      spyOn(TestBed.inject(FeedbackApiService), 'generateTeacherCommentDraft').and.resolveTo({ comment: 'New draft.' });
      const save = spyOn(TestBed.inject(FeedbackApiService), 'updateTeacherComments').and.resolveTo({ submissionId: 'submission-1', teacherComments: 'Edited draft.', teacherCommentsUpdatedAt: '', teacherCommentsUpdatedBy: 'teacher-1' });
      spyOn(TestBed.inject(AlertService), 'showToast');
      await component.generateTeacherCommentDraft();
      expect(save).not.toHaveBeenCalled();
      component.feedbackForm.patchValue({ message: 'Edited draft.' });
      const submit = spyOn(component, 'submitFeedback').and.callThrough(); fixture.detectChanges();
      const action = fixture.nativeElement.querySelector('.teacher-comments-editor button') as HTMLButtonElement;
      expect(action.textContent?.trim()).toBe('Submit Comment to Student'); action.click();
      await submit.calls.mostRecent().returnValue;
      TestBed.inject(HttpTestingController).match(req => req.url.endsWith('/progress')).forEach(req => req.flush({ success: true, data: {} }));
      expect(save).toHaveBeenCalledOnceWith('submission-1', 'Edited draft.');
    });
  });

  it('preserves weights and totalPoints through assignment save and reload without a score override', async () => {
    component.currentSubmission = { _id: 'submission-1', assignment: 'assignment-1' } as any;
    const designer = { title: 'Essay', totalPoints: 100, levels: [{ title: 'Strong', maxPoints: 4 }, { title: 'Developing', maxPoints: 1 }],
      criteria: [{ title: 'Content', weight: 70, cells: ['Strong ideas', 'Develop ideas'] },
        { title: 'Organization', weight: 30, cells: ['Clear order', 'Improve order'] }] };
    const save = spyOn((component as any).assignmentApi, 'updateAssignmentRubrics').and.resolveTo({ _id: 'assignment-1' });
    const override = spyOn((component as any).feedbackApi, 'upsertSubmissionFeedback');
    spyOn<any>(component, 'hydrateRubricDesignerFromAssignmentThenFeedback').and.resolveTo();
    spyOn<any>(component, 'refreshRetriedAnalysis').and.resolveTo();
    await component.onRubricDesignerSave(designer);
    const payload = save.calls.mostRecent().args[1] as any;
    expect(payload.rubrics.totalPoints).toBe(100);
    expect(payload.rubrics.criteria.map((row: any) => row.weight)).toEqual([70, 30]);
    const loaded = (component as any).parseRubricDesignerFromRubricsField(payload.rubrics);
    expect(loaded.totalPoints).toBe(100);
    expect(loaded.criteria.map((row: any) => row.weight)).toEqual([70, 30]);
    expect(override).not.toHaveBeenCalled();
  });

  it('does not cache a processing OCR response or a 202 response', async () => {
    component.currentSubmission = { _id: 'submission-1', correctionSourceHash: 'hash' } as any;
    const http = TestBed.inject(HttpTestingController);
    for (const status of [202, 200]) {
      const result = (component as any).getOcrCorrectionsPayload('submission-1');
      http.expectOne(req => req.url.endsWith('/submission-1/ocr-corrections'))
        .flush({ data: { ocrStatus: 'completed', correctionStatus: 'processing' } }, { status, statusText: 'OK' });
      await result;
      expect((component as any).ocrCorrectionsPayloadCache.size).toBe(0);
    }
  });

  it('rejects a stale poll before changing feedback or score state', async () => {
    component.currentSubmission = { _id: 'submission-1' } as any;
    const prior = component.canonicalResultState;
    spyOn((component as any).feedbackApi, 'getSubmissionFeedback').and.resolveTo({ evaluationStatus: 'completed', overallScore: 95 });
    spyOn((component as any).resultCoordinator, 'isCurrentRequest').and.returnValue(false);
    await expectAsync((component as any).refreshRetriedAnalysis('submission-1', 1)).toBeRejected();
    expect(component.canonicalResultState).toBe(prior);
    expect(component.currentSubmission?.evaluationStatus).toBeUndefined();
  });

  it('keeps a partial evaluation out of final score presentation', async () => {
    component.currentSubmission = { _id: 'submission-1' } as any;
    spyOn((component as any).feedbackApi, 'getSubmissionFeedback').and.resolveTo({ evaluationStatus: 'partial', overallScore: 95 });
    await (component as any).refreshRetriedAnalysis('submission-1');
    expect(component.scoreState).toBe('processing');
  });

  it('does not pass the protected raw submission URL to the teacher image overlay', () => {
    component.currentSubmission = { fileUrl: '/files/submissions/private.jpg' } as any;
    component.submissionFileUrls = ['/files/submissions/private.jpg'];
    component.essayImageUrl = null;
    component.imageMediaState = 'fetching';
    fixture.detectChanges();

    const overlay = fixture.debugElement.query(By.directive(CorrectionOverlay)).componentInstance as CorrectionOverlay;
    expect(overlay.imageUrl).toBeNull();
    expect(overlay.sourceLoading).toBeTrue();
    expect(overlay.displayImageUrl).toBeNull();
  });

  it('resets every asynchronous section to loading for a newly selected submission', () => {
    (component as any).resetSectionLoadStates(true);

    expect(component.transcriptState).toBe('loading');
    expect(component.correctionsState).toBe('loading');
    expect(component.feedbackState).toBe('loading');
    expect(component.aiFeedbackState).toBe('loading');
    expect(component.teacherCommentState).toBe('loading');
    expect(component.scoreState).toBe('loading');
  });

  it('stops previous polling and rebuilds submission-specific state on navigation', async () => {
    component.currentSubmission = { _id: 'submission-1' } as any;
    component.currentFeedback = { submissionId: 'submission-1', overallScore: 42 } as any;
    component.canonicalResultState = normalizeCanonicalResult({
      submissionId: 'submission-1', evaluationStatus: 'stale',
      evaluationStaleReason: 'rubric', requiresCanonicalReevaluation: true
    });
    const stop = spyOn((component as any).resultCoordinator, 'stop');
    spyOn<any>(component, 'loadAssignmentRubricPresence').and.resolveTo();
    spyOn<any>(component, 'ensureClassSettingsLoadedFromSubmission').and.resolveTo();
    spyOn<any>(component, 'loadOcrCorrections').and.resolveTo(true);
    spyOn<any>(component, 'loadCompleteTranscript').and.resolveTo();
    spyOn<any>(component, 'refreshWritingCorrections').and.resolveTo();
    spyOn<any>(component, 'loadFeedback').and.callFake(async () => {
      expect(component.currentFeedback).toBeNull();
      expect(component.canonicalResultState).toBeNull();
      component.currentFeedback = { submissionId: 'submission-2', overallScore: 84 } as any;
      component.canonicalResultState = normalizeCanonicalResult({
        submissionId: 'submission-2', evaluationStatus: 'completed',
        detailedFeedbackStatus: 'completed', overallScore: 84
      });
      return true;
    });
    const markReviewed = spyOn((component as any).feedbackApi, 'markSubmissionReviewed').and.resolveTo({
      teacherReviewedAt: '2026-08-22T00:00:00.000Z', teacherReviewedBy: 'teacher-1'
    });
    const syncDashboard = spyOn((component as any).teacherDashboardState, 'markReviewed');

    await (component as any).applyCurrentSubmission({ _id: 'submission-2' } as any, false);

    expect(stop).toHaveBeenCalled();
    expect(component.currentFeedback?.submissionId).toBe('submission-2');
    expect(component.canonicalResultState?.submissionId).toBe('submission-2');
    expect(component.canonicalResultState?.evaluationStatus).toBe('completed');
    expect(markReviewed).toHaveBeenCalledOnceWith('submission-2');
    expect(syncDashboard).toHaveBeenCalledOnceWith('submission-2');
  });

  it('rejects an older feedback response after the active submission changes', async () => {
    let resolveFeedback!: (value: any) => void;
    const response = new Promise<any>((resolve) => { resolveFeedback = resolve; });
    component.currentSubmission = { _id: 'submission-1' } as any;
    (component as any).applyCurrentSubmissionSeq = 10;
    spyOn((component as any).feedbackApi, 'getSubmissionFeedback').and.returnValue(response);

    const loading = (component as any).loadFeedback(10);
    component.currentSubmission = { _id: 'submission-2' } as any;
    component.canonicalResultState = normalizeCanonicalResult({
      submissionId: 'submission-2', evaluationStatus: 'completed', overallScore: 84
    });
    (component as any).applyCurrentSubmissionSeq = 11;
    resolveFeedback({
      submissionId: 'submission-1', evaluationStatus: 'stale',
      evaluationStaleReason: 'rubric', requiresCanonicalReevaluation: true
    });

    await expectAsync(loading).toBeResolvedTo(false);
    expect(component.canonicalResultState?.submissionId).toBe('submission-2');
    expect(component.canonicalResultState?.evaluationStatus).toBe('completed');
  });

  it('renders saved feedback without waiting for a slow PDF preview', async () => {
    let releasePreview!: (value: string) => void;
    const preview = new Promise<string>((resolve) => { releasePreview = resolve; });
    spyOn<any>(component, 'loadAssignmentRubricPresence').and.resolveTo();
    spyOn<any>(component, 'ensureClassSettingsLoadedFromSubmission').and.resolveTo();
    spyOn<any>(component, 'fetchAsObjectUrl').and.returnValue(preview);
    spyOn<any>(component, 'loadOcrCorrections').and.resolveTo(true);
    spyOn<any>(component, 'loadCompleteTranscript').and.resolveTo();
    spyOn<any>(component, 'refreshWritingCorrections').and.resolveTo();
    spyOn<any>(component, 'markCurrentSubmissionReviewed').and.resolveTo();
    spyOn<any>(component, 'loadFeedback').and.callFake(async () => {
      component.currentFeedback = { submissionId: 'submission-2', overallScore: 91 } as any;
      component.canonicalResultState = normalizeCanonicalResult({ submissionId: 'submission-2',
        evaluationStatus: 'completed', detailedFeedbackStatus: 'completed', processingActive: false,
        automaticPollingAllowed: false, terminal: true });
      return true;
    });

    const applying = (component as any).applyCurrentSubmission({
      _id: 'submission-2', fileUrl: '/private/submission.pdf'
    } as any, false);
    await Promise.resolve();
    await Promise.resolve();

    expect(component.currentFeedback?.overallScore).toBe(91);
    expect(component.scoreState).toBe('loaded');
    TestBed.inject(HttpTestingController).match((request) => request.url === '/private/submission.pdf')
      .forEach((request) => request.flush(new Blob(['preview'], { type: 'application/pdf' })));
    releasePreview('blob:preview');
    await applying;
  });

  it('renders saved feedback without waiting for a slow transcript request', async () => {
    let releaseTranscript!: () => void;
    const transcript = new Promise<void>((resolve) => { releaseTranscript = resolve; });
    spyOn<any>(component, 'loadAssignmentRubricPresence').and.resolveTo();
    spyOn<any>(component, 'ensureClassSettingsLoadedFromSubmission').and.resolveTo();
    spyOn<any>(component, 'loadOcrCorrections').and.resolveTo(true);
    spyOn<any>(component, 'loadCompleteTranscript').and.returnValue(transcript);
    spyOn<any>(component, 'refreshWritingCorrections').and.resolveTo();
    spyOn<any>(component, 'markCurrentSubmissionReviewed').and.resolveTo();
    spyOn<any>(component, 'loadFeedback').and.callFake(async () => {
      component.currentFeedback = { submissionId: 'submission-2', overallScore: 88 } as any;
      component.canonicalResultState = normalizeCanonicalResult({ submissionId: 'submission-2',
        evaluationStatus: 'completed', detailedFeedbackStatus: 'completed', processingActive: false,
        automaticPollingAllowed: false, terminal: true });
      return true;
    });

    const applying = (component as any).applyCurrentSubmission({ _id: 'submission-2' } as any, false);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(component.currentFeedback?.overallScore).toBe(88);
    expect(component.scoreState).toBe('loaded');
    releaseTranscript();
    await applying;
  });

  it('keeps intermediate polling scoped to feedback until completion', async () => {
    component.currentSubmission = { _id: 'submission-1', ocrStatus: 'completed' } as any;
    const ocr = spyOn<any>(component, 'loadOcrCorrections');
    const transcript = spyOn<any>(component, 'loadCompleteTranscript');
    const writing = spyOn<any>(component, 'refreshWritingCorrections');
    spyOn((component as any).feedbackApi, 'getSubmissionFeedback').and.resolveTo({
      submissionId: 'submission-1', evaluationStatus: 'processing', detailedFeedbackStatus: 'processing',
      processingActive: true, automaticPollingAllowed: true, terminal: false
    } as any);

    const snapshot = await (component as any).refreshRetriedAnalysis('submission-1');

    expect(snapshot.canonical.evaluationStatus).toBe('processing');
    expect(ocr).not.toHaveBeenCalled();
    expect(transcript).not.toHaveBeenCalled();
    expect(writing).not.toHaveBeenCalled();
  });

  it('shares one initial OCR corrections request across correction and transcript consumers', async () => {
    component.currentSubmission = { _id: 'submission-1', correctionSourceHash: 'source-1' } as any;
    const first = (component as any).getOcrCorrectionsPayload('submission-1');
    const second = (component as any).getOcrCorrectionsPayload('submission-1');
    const http = TestBed.inject(HttpTestingController);
    const requests = http.match((request) => request.url.includes('/submissions/submission-1/ocr-corrections'));
    expect(requests.length).toBe(1);
    expect(requests[0].request.urlWithParams).not.toContain('fileId=');
    requests[0].flush({ success: true, data: { ocr: [], corrections: [], ocrStatus: 'completed', correctionStatus: 'completed' } });
    await Promise.all([first, second]);

    await (component as any).getOcrCorrectionsPayload('submission-1');
    expect(http.match((request) => request.url.includes('/ocr-corrections')).length).toBe(0);
  });

  it('starts polling only for an active lifecycle, not failed, blocked, or stale results', async () => {
    component.currentSubmission = { _id: 'submission-1' } as any;
    (component as any).applyCurrentSubmissionSeq = 4;
    const start = spyOn((component as any).resultCoordinator, 'start');
    const feedbackApi = (component as any).feedbackApi;
    spyOn(feedbackApi, 'getSubmissionFeedback').and.resolveTo({
      submissionId: 'submission-1', evaluationStatus: 'failed', detailedFeedbackStatus: 'blocked',
      processingActive: false, automaticPollingAllowed: false, terminal: true
    });
    await (component as any).loadFeedback(4);
    expect(start).not.toHaveBeenCalled();

    feedbackApi.getSubmissionFeedback.and.resolveTo({
      submissionId: 'submission-1', evaluationStatus: 'processing', detailedFeedbackStatus: 'processing',
      processingActive: true, automaticPollingAllowed: true, terminal: false
    });
    await (component as any).loadFeedback(4);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('keeps section loading states independent', () => {
    component.transcriptState = 'loaded';
    component.correctionsState = 'loaded';
    component.feedbackState = 'loading';
    component.aiFeedbackState = 'loading';

    expect(component.transcriptState).toBe('loaded');
    expect(component.correctionsState).toBe('loaded');
    expect(component.feedbackState).toBe('loading');
    expect(component.aiFeedbackState).toBe('loading');
  });

  it('preserves a valid zero correction count after loading', () => {
    component.correctionsState = 'loaded';
    component.currentFeedback = {
      correctionStatistics: { content: 0, grammar: 0, organization: 0, vocabulary: 0, mechanics: 0 }
    } as any;

    expect(component.contentIssuesCount).toBe(0);
    expect(component.grammarIssuesCount).toBe(0);
  });

  it('uses an explicit error state instead of leaving a section loading', () => {
    component.correctionsState = 'error';
    component.feedbackState = 'loaded';

    expect(component.correctionsState).toBe('error');
    expect(component.feedbackState).toBe('loaded');
  });

  it('renders exactly one shared editable Teacher Comments section', () => {
    window.dispatchEvent(new Event('resize'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.teacher-comments-editor').length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('.teacher-comments-editor textarea[formControlName="message"]').length).toBe(1);
    expect(fixture.nativeElement.querySelector('.teacher-comments-editor button')?.textContent?.trim()).toBe('Submit Comment to Student');
  });

  it('keeps the shared Teacher Comments editor available when evaluation fails', () => {
    window.dispatchEvent(new Event('orientationchange'));
    component.aiFeedbackState = 'error';
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.section-load-error')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.teacher-comments-editor textarea')).toBeTruthy();
  });

  it('uses one canonical state and one functional teacher review tree', () => {
    component.canonicalResultState = normalizeCanonicalResult({
      submissionId: 'submission-1', correctionStatus: 'completed', semanticStatus: 'completed',
      evaluationStatus: 'completed', detailedFeedbackStatus: 'completed', statisticsCompleteness: 'canonical',
      correctionStatistics: { content: 0, grammar: 4, organization: 0, vocabulary: 0, mechanics: 2 },
      overallScore: 36.5, grade: 'F', processingActive: false, automaticPollingAllowed: false, terminal: true
    });
    component.scoreState = 'loaded';
    component.statisticsState = 'loaded';
    component.correctionsState = 'loaded';
    component.feedbackForm.patchValue({ message: 'Canonical teacher comment' });
    component.hasAssignmentRubric = true;
    const state = component.canonicalResultState;

    fixture.detectChanges();
    expect(component.canonicalResultState).toBe(state);
    window.dispatchEvent(new Event('resize'));
    fixture.detectChanges();

    expect(component.canonicalResultState).toBe(state);
    expect([component.contentIssuesDisplay, component.grammarIssuesDisplay,
      component.organizationIssuesDisplay, component.vocabularyIssuesDisplay,
      component.mechanicsIssuesDisplay]).toEqual([0, 4, 0, 0, 2]);
    expect(component.overallScoreText).toBe('36.5 / 100');
    expect(component.gradeLabel).toBe('F');
    expect(fixture.nativeElement.querySelector('.teacher-comments-editor textarea')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Download PDF');
    expect(fixture.nativeElement.textContent).toContain('View / Edit Rubric');
    expect(fixture.nativeElement.querySelectorAll('.submission-review-page').length).toBe(1);
  });

  it('shows the same evaluation-only failure and retry label at desktop and mobile widths', () => {
    component.canonicalResultState = normalizeCanonicalResult({ correctionStatus: 'completed', semanticStatus: 'completed',
      correctionSourceHash: 'fresh-hash', statisticsCompleteness: 'canonical',
      correctionStatistics: { content: 0, grammar: 5, organization: 0, vocabulary: 0, mechanics: 3 },
      evaluationStatus: 'failed', detailedFeedbackStatus: 'blocked', manualRetryAllowed: true, terminal: true });
    component.scoreState = 'error'; component.feedbackState = 'error'; component.aiFeedbackState = 'error';
    component.isUploadedFile = false;
    for (const width of [1440, 390]) {
      window.dispatchEvent(new Event(width > 1024 ? 'resize' : 'orientationchange'));
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Scoring and detailed feedback could not be completed. Your transcription and corrections are still available.');
      expect(fixture.nativeElement.textContent).toContain('Retry scoring');
    }
  });

  it('keeps active annotations stable for the selected teacher image', () => {
    component.submissionFileIds = ['file-1', 'file-2'];
    component.submissionFileUrls = ['image-1.jpg', 'image-2.jpg'];
    component.annotations = [
      { _id: 'a-1', fileId: 'file-1' },
      { _id: 'a-2', fileId: 'file-2' }
    ] as FeedbackAnnotation[];

    const firstRead = component.activeAnnotations;
    fixture.detectChanges();
    const secondRead = component.activeAnnotations;

    expect(firstRead.map((annotation) => annotation._id)).toEqual(['a-1']);
    expect(secondRead).toBe(firstRead);
  });

  it('updates active annotations when the selected teacher image changes', () => {
    component.submissionFileIds = ['file-1', 'file-2'];
    component.submissionFileUrls = ['image-1.jpg', 'image-2.jpg'];
    component.annotations = [
      { _id: 'a-1', fileId: 'file-1' },
      { _id: 'a-2', fileId: 'file-2' }
    ] as FeedbackAnnotation[];

    expect(component.activeAnnotations.map((annotation) => annotation._id)).toEqual(['a-1']);
    component.activeFileIndex = 1;

    expect(component.activeAnnotations.map((annotation) => annotation._id)).toEqual(['a-2']);
  });

  it('changes only viewer resources when another teacher submission image is selected', async () => {
    const savedFeedback = { submissionId: 'submission-1', overallScore: 88 } as any;
    const savedCanonical = normalizeCanonicalResult({
      submissionId: 'submission-1', evaluationStatus: 'completed',
      detailedFeedbackStatus: 'completed', overallScore: 88
    });
    component.currentSubmission = { _id: 'submission-1', fileUrl: 'image-1.jpg' } as any;
    component.submissionFileUrls = ['image-1.jpg', 'image-2.jpg'];
    component.currentFeedback = savedFeedback;
    component.canonicalResultState = savedCanonical;

    const applySubmission = spyOn<any>(component, 'applyCurrentSubmission').and.resolveTo();
    const loadImage = spyOn<any>(component, 'loadUploadedImage').and.resolveTo();
    const loadCorrections = spyOn<any>(component, 'loadOcrCorrections').and.resolveTo(true);
    const refreshCorrections = spyOn<any>(component, 'refreshWritingCorrections').and.resolveTo();
    const reEvaluate = spyOn(component, 'reEvaluateCurrentSubmission').and.resolveTo();
    const loadFeedback = spyOn((component as any).feedbackApi, 'getSubmissionFeedback');
    const markReviewed = spyOn((component as any).feedbackApi, 'markSubmissionReviewed');

    component.onSelectSubmissionImage(1);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(component.activeFileIndex).toBe(1);
    expect(loadImage).toHaveBeenCalledOnceWith('image-2.jpg');
    expect(loadCorrections).not.toHaveBeenCalled();
    expect(refreshCorrections).not.toHaveBeenCalled();
    expect(component.currentFeedback).toBe(savedFeedback);
    expect(component.canonicalResultState).toBe(savedCanonical);
    expect(applySubmission).not.toHaveBeenCalled();
    expect(reEvaluate).not.toHaveBeenCalled();
    expect(loadFeedback).not.toHaveBeenCalled();
    expect(markReviewed).not.toHaveBeenCalled();

    component.onSelectSubmissionImage(0);
    await Promise.resolve();
    expect(component.activeFileIndex).toBe(0);
    expect(loadCorrections).not.toHaveBeenCalled();
    expect(refreshCorrections).not.toHaveBeenCalled();
    expect(reEvaluate).not.toHaveBeenCalled();
    expect(loadFeedback).not.toHaveBeenCalled();
  });

  it('keeps the last selected workspace image when earlier image loads resolve later', async () => {
    component.currentSubmission = { _id: 'submission-1', fileUrl: 'image-1.jpg' } as NonNullable<typeof component.currentSubmission>;
    component.submissionFileUrls = ['image-1.jpg', 'image-2.jpg'];
    component.submissionFileIds = ['f1', 'f2']; component.activeFileIndex = 0;
    const pending = new Map<string, (url: string) => void>();
    const resources = component as unknown as { fetchAsObjectUrl: (url: string) => Promise<string> };
    spyOn(resources, 'fetchAsObjectUrl').and.callFake(url => new Promise(resolve => pending.set(url, resolve)));
    const revoke = spyOn(URL, 'revokeObjectURL');
    component.onWorkspaceFileRequested('f2'); component.onWorkspaceFileRequested('f1');
    pending.get('image-1.jpg')!('blob:latest'); await Promise.resolve(); await Promise.resolve();
    expect(component.essayImageUrl).toBe('blob:latest'); expect(component.activeFileId).toBe('f1');
    pending.get('image-2.jpg')!('blob:stale'); await Promise.resolve(); await Promise.resolve();
    expect(component.essayImageUrl).toBe('blob:latest'); expect(component.activeFileId).toBe('f1');
    expect(revoke).toHaveBeenCalledWith('blob:stale');
  });

  it('preserves submission and evaluation state without requests across breakpoints', () => {
    const savedSubmission = { _id: 'submission-1' } as any;
    const savedFeedback = { submissionId: 'submission-1', overallScore: 88 } as any;
    const savedCanonical = normalizeCanonicalResult({
      submissionId: 'submission-1', evaluationStatus: 'completed',
      detailedFeedbackStatus: 'completed', overallScore: 88
    });
    component.currentSubmission = savedSubmission;
    component.currentFeedback = savedFeedback;
    component.canonicalResultState = savedCanonical;
    fixture.detectChanges();
    TestBed.inject(HttpTestingController)
      .expectOne((request) => request.url.includes('/adaptive-practice/teacher/submissions/submission-1/progress'))
      .flush({ success: true, data: { submissionId: 'submission-1', skills: [] } });
    const evaluate = spyOn(component, 'reEvaluateCurrentSubmission').and.resolveTo();
    const feedback = spyOn((component as any).feedbackApi, 'getSubmissionFeedback');
    const reviewed = spyOn((component as any).feedbackApi, 'markSubmissionReviewed');

    for (const width of [1440, 390, 1024, 430]) {
      window.dispatchEvent(new Event(width > 768 ? 'resize' : 'orientationchange'));
      fixture.detectChanges();
    }

    expect(component.currentSubmission).toBe(savedSubmission);
    expect(component.currentFeedback).toBe(savedFeedback);
    expect(component.canonicalResultState).toBe(savedCanonical);
    expect(evaluate).not.toHaveBeenCalled();
    expect(feedback).not.toHaveBeenCalled();
    expect(reviewed).not.toHaveBeenCalled();
  });

  it('Generate AI Feedback triggers canonical evaluation and never assigns a legacy preview', async () => {
    component.currentSubmission = { _id: 'submission-1' } as any;
    component.currentFeedback = { submissionId: 'submission-1', overallScore: 77 } as any;
    component.canonicalResultState = normalizeCanonicalResult({
      correctionStatus: 'completed', semanticStatus: 'completed',
      evaluationStatus: 'completed', detailedFeedbackStatus: 'completed'
    });
    const retry = spyOn((component as any).submissionApi, 'retryCanonicalEvaluation')
      .and.resolveTo(undefined);
    const legacy = spyOn((component as any).feedbackApi, 'generateAiSubmissionFeedback');
    const start = spyOn((component as any).resultCoordinator, 'start');

    await component.reEvaluateCurrentSubmission();

    expect(retry).toHaveBeenCalledOnceWith('submission-1');
    expect(start).toHaveBeenCalled();
    expect(legacy).not.toHaveBeenCalled();
    expect(component.currentFeedback?.previousEvaluation?.overallScore).toBe(77);
    expect(component.canonicalResultState?.evaluationStatus).toBe('processing');
    TestBed.inject(HttpTestingController).match(() => true)
      .forEach((request) => request.flush({ success: true, data: {} }));
  });

  it('does not create fake fixed-category zeros while canonical evaluation is processing', () => {
    component.canonicalResultState = normalizeCanonicalResult({
      evaluationStatus: 'processing', detailedFeedbackStatus: 'processing',
      processingActive: true, automaticPollingAllowed: true, terminal: false
    });
    component.currentFeedback = { submissionId: 'submission-1', rubricScores: null } as any;
    component.aiFeedbackState = 'processing';
    (component as any).recomputeRubricFeedbackItems();
    fixture.detectChanges();

    expect(component.rubricFeedbackItems).toEqual([]);
    expect(fixture.nativeElement.textContent).not.toContain('0.0 /');
  });

  it('renders custom criteria through the original fixed-category row layout', () => {
    component.hasAssignmentRubric = true;
    component.canonicalResultState = normalizeCanonicalResult({
      evaluationStatus: 'completed', detailedFeedbackStatus: 'completed',
      overallScore: 60, processingActive: false, automaticPollingAllowed: false, terminal: true
    });
    component.currentFeedback = {
      submissionId: 'submission-1',
      scoringAudit: { overallMethod: 'custom_rubric_weighted_total' },
      customRubricScores: { overallScore: 60, criteria: [{
        criterionId: 'criterion-1', title: 'Content Accuracy', normalizedWeight: 30,
        selectedLevel: 'Satisfactory', configuredLevelPercentage: 60,
        weightedPoints: 18, comment: 'Meets the criterion at a satisfactory level.', evidenceIds: []
      }] }
    } as any;
    component.aiFeedbackState = 'loaded';
    (component as any).recomputeRubricFeedbackItems();
    fixture.detectChanges();

    expect(component.isCustomRubricResult).toBeTrue();
    expect(component.rubricFeedbackItems).toEqual([
      jasmine.objectContaining({
        category: 'Content Accuracy',
        score: 18,
        maxScore: 30,
        description: 'Meets the criterion at a satisfactory level.',
        selectedLevel: 'Satisfactory'
      })
    ]);
    expect(fixture.nativeElement.textContent).toContain('This overall score is calculated from the assignment’s custom rubric.');
    expect(fixture.nativeElement.textContent).toContain('Content Accuracy');
    expect(fixture.nativeElement.textContent).toContain('Selected level: Satisfactory');
    expect(fixture.nativeElement.textContent).toContain('18.0 / 30');
    expect(fixture.nativeElement.textContent).not.toContain('Normalized weight:');
    expect(fixture.nativeElement.querySelector('.score-badge')).toBeTruthy();
  });

  it('reconciles transcript artifacts after terminal scoring failure, independently of OCR', async () => {
    component.currentSubmission = { _id: 'submission-1', ocrStatus: 'processing' } as any;
    const reconcile = spyOn<any>(component, 'refreshAssessmentResult').and.resolveTo();
    spyOn((component as any).feedbackApi, 'getSubmissionFeedback').and.resolveTo({
      submissionId: 'submission-1', ocrStatus: 'completed', correctionStatus: 'completed',
      semanticStatus: 'completed', evaluationStatus: 'failed', detailedFeedbackStatus: 'stale',
      terminal: true, processingActive: false, automaticPollingAllowed: false
    });
    const snapshot = await (component as any).refreshRetriedAnalysis('submission-1');
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(snapshot.ocrStatus).toBe('completed');
    expect(component.scoreState).toBe('error');
    expect(component.detailedFeedbackDisplay.message).toContain('Your transcription and corrections are still available');
    expect(component.detailedFeedbackDisplay.message).not.toContain('out of date');
  });

  it('applies completed feedback and rebuilds custom rows in the same polling tick', async () => {
    component.hasAssignmentRubric = true;
    component.assignmentId = 'assignment-1';
    component.currentSubmission = { _id: 'submission-1', ocrStatus: 'completed' } as any;
    component.currentFeedback = {
      submissionId: 'submission-1',
      previousEvaluation: { overallScore: 72 }
    } as any;
    spyOn<any>(component, 'loadOcrCorrections').and.resolveTo(true);
    spyOn<any>(component, 'loadCompleteTranscript').and.resolveTo();
    spyOn<any>(component, 'refreshWritingCorrections').and.resolveTo();
    spyOn((component as any).feedbackApi, 'getSubmissionFeedback').and.resolveTo({
      submissionId: 'submission-1',
      evaluationStatus: 'completed',
      detailedFeedbackStatus: 'completed',
      overallScore: 60,
      scoringAudit: { overallMethod: 'custom_rubric_weighted_total' },
      customRubricScores: { overallScore: 60, criteria: [{
        criterionId: 'criterion-1', title: 'Content Accuracy', normalizedWeight: 30,
        selectedLevel: 'Satisfactory', configuredLevelPercentage: 60,
        weightedPoints: 18, comment: 'Current rubric explanation.'
      }] }
    } as any);
    spyOn((component as any).submissionApi, 'getSubmissionsByAssignment')
      .and.resolveTo([{ _id: 'submission-1', evaluationStatus: 'completed' } as any]);
    const invalidate = spyOn((component as any).teacherDashboardState, 'invalidateEvaluationFreshness');

    await (component as any).refreshRetriedAnalysis('submission-1');

    expect(component.currentFeedback?.overallScore).toBe(60);
    expect(component.rubricFeedbackItems).toEqual([
      jasmine.objectContaining({ category: 'Content Accuracy', score: 18, maxScore: 30 })
    ]);
    expect(component.aiFeedbackState).toBe('loaded');
    expect(invalidate).toHaveBeenCalledOnceWith('assignment-1');
    expect((component as any).submissionApi.getSubmissionsByAssignment).toHaveBeenCalledOnceWith('assignment-1', jasmine.any(Number));
  });

  it('shows completed score rows while detailed feedback is still processing', async () => {
    component.assignmentId = 'assignment-1';
    component.currentSubmission = { _id: 'submission-1', ocrStatus: 'completed' } as any;
    spyOn<any>(component, 'loadOcrCorrections').and.resolveTo(true);
    spyOn<any>(component, 'loadCompleteTranscript').and.resolveTo();
    spyOn<any>(component, 'refreshWritingCorrections').and.resolveTo();
    spyOn((component as any).feedbackApi, 'getSubmissionFeedback').and.resolveTo({
      submissionId: 'submission-1',
      evaluationStatus: 'completed',
      detailedFeedbackStatus: 'processing',
      overallScore: 75,
      scoringAudit: { overallMethod: 'fixed_six_category_sum' },
      rubricScores: {
        CONTENT: { score: 15, maxScore: 20 }, ORGANIZATION: { score: 15, maxScore: 20 },
        GRAMMAR: { score: 20, maxScore: 25 }, VOCABULARY: { score: 15, maxScore: 20 },
        MECHANICS: { score: 7, maxScore: 10 }, PRESENTATION: { score: 3, maxScore: 5 }
      }
    } as any);
    spyOn((component as any).submissionApi, 'getSubmissionsByAssignment')
      .and.resolveTo([{ _id: 'submission-1', evaluationStatus: 'completed' } as any]);

    const snapshot = await (component as any).refreshRetriedAnalysis('submission-1');

    expect(snapshot.canonical.detailedFeedbackStatus).toBe('processing');
    expect(component.aiFeedbackState).toBe('loaded');
    expect(component.feedbackState).toBe('processing');
    expect(component.rubricFeedbackItems.length).toBe(6);
    expect(component.detailedFeedbackDisplay.message).toContain('Preparing detailed feedback');
  });

  it('does not offer re-evaluation for a teacher-overridden result', () => {
    component.currentFeedback = { submissionId: 'submission-1', overriddenByTeacher: true } as any;
    component.canonicalResultState = normalizeCanonicalResult({
      evaluationStatus: 'stale', detailedFeedbackStatus: 'stale',
      manualRetryAllowed: true, overriddenByTeacher: true
    });
    expect(component.canGenerateAiFeedback).toBeFalse();
    expect(component.evaluationStatusPresentation.showAction).toBeFalse();
  });

  it('keeps the fixed six-category cards for completed no-rubric results', () => {
    component.canonicalResultState = normalizeCanonicalResult({
      evaluationStatus: 'completed', detailedFeedbackStatus: 'completed',
      overallScore: 75, processingActive: false, automaticPollingAllowed: false, terminal: true
    });
    component.currentFeedback = {
      submissionId: 'submission-1',
      scoringAudit: { overallMethod: 'fixed_six_category_sum' },
      rubricScores: {
        CONTENT: { score: 15, maxScore: 20, comment: '' },
        ORGANIZATION: { score: 15, maxScore: 20, comment: '' },
        GRAMMAR: { score: 20, maxScore: 25, comment: '' },
        VOCABULARY: { score: 15, maxScore: 20, comment: '' },
        MECHANICS: { score: 7, maxScore: 10, comment: '' },
        PRESENTATION: { score: 3, maxScore: 5, comment: '' }
      }
    } as any;
    component.aiFeedbackState = 'loaded';
    (component as any).recomputeRubricFeedbackItems();

    expect(component.isCustomRubricResult).toBeFalse();
    expect(component.rubricFeedbackItems.length).toBe(6);
  });

  it('uses the existing rubric control as Create Rubric until a saved assignment rubric exists', async () => {
    component.hasAssignmentRubric = false;
    for (const width of [1440, 390]) {
      window.dispatchEvent(new Event(width > 1024 ? 'resize' : 'orientationchange'));
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Create Rubric');
      expect(fixture.nativeElement.textContent).not.toContain('View / Edit Rubric');
    }

    const hydrate = spyOn<any>(component, 'hydrateRubricDesignerFromAssignmentThenFeedback');
    await component.onEditRubric();
    expect(component.showDialog).toBeTrue();
    expect(component.rubricDesignerForModal).toBeNull();
    expect(hydrate).not.toHaveBeenCalled();

    component.closeRubricDesignerDialog();
    component.hasAssignmentRubric = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('View / Edit Rubric');
    expect(fixture.nativeElement.textContent).not.toContain('Create Rubric');
  });

  it('prevents duplicate Generate AI Feedback calls while evaluation is pending', async () => {
    component.currentSubmission = { _id: 'submission-1' } as any;
    component.canonicalResultState = normalizeCanonicalResult({
      evaluationStatus: 'processing', detailedFeedbackStatus: 'processing',
      processingActive: true, automaticPollingAllowed: true, terminal: false
    });
    const retry = spyOn((component as any).submissionApi, 'retryCanonicalEvaluation');

    await component.reEvaluateCurrentSubmission();

    expect(component.canGenerateAiFeedback).toBeFalse();
    expect(retry).not.toHaveBeenCalled();
    TestBed.inject(HttpTestingController).match(() => true)
      .forEach((request) => request.flush({ success: true, data: {} }));
  });

  it('shows a stale previous result and routes the contextual action through canonical generation', () => {
    component.currentSubmission = { _id: 'submission-1' } as any;
    component.currentFeedback = {
      submissionId: 'submission-1',
      previousEvaluation: { overallScore: 72 }
    } as any;
    component.canonicalResultState = normalizeCanonicalResult({
      correctionStatus: 'completed',
      semanticStatus: 'completed',
      evaluationStatus: 'stale',
      detailedFeedbackStatus: 'stale',
      manualRetryAllowed: true,
      evaluationStaleReason: 'rubric',
      terminal: true
    });
    component.scoreState = 'loaded';
    component.isUploadedFile = false;
    const reEvaluate = spyOn(component, 'reEvaluateCurrentSubmission').and.resolveTo();

    window.dispatchEvent(new Event('orientationchange'));
    fixture.detectChanges();

    expect(component.evaluationStatusPresentation.state).toBe('stale');
    expect(component.evaluationStatusPresentation.showPreviousScore).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Re-evaluation required');
    expect(fixture.nativeElement.textContent).toContain('Previous score: 72 / 100 (outdated)');
    const action = fixture.nativeElement.querySelector(
      'button[aria-label="Re-evaluate with current rubric"]'
    ) as HTMLButtonElement;
    expect(action).toBeTruthy();
    action.click();
    expect(reEvaluate).toHaveBeenCalled();
    TestBed.inject(HttpTestingController).match(() => true)
      .forEach((request) => request.flush({ success: true, data: {} }));
  });

  it('uses the same explicit rubric-stale condition on desktop and mobile', () => {
    component.canonicalResultState = normalizeCanonicalResult({
      correctionStatus: 'completed',
      semanticStatus: 'completed',
      evaluationStatus: 'stale',
      detailedFeedbackStatus: 'stale',
      evaluationStaleReason: 'rubric',
      manualRetryAllowed: true
    });
    for (const width of [1440, 390]) {
      window.dispatchEvent(new Event(width > 1024 ? 'resize' : 'orientationchange'));
      expect(component.evaluationStatusPresentation.actionLabel)
        .toBe('Re-evaluate with current rubric');
      expect(component.evaluationStatusPresentation.showAction).toBeTrue();
    }
  });

  it('shows re-evaluation progress without fake zeros or duplicate actions', () => {
    component.currentFeedback = {
      submissionId: 'submission-1',
      previousEvaluation: { overallScore: 72 },
      rubricScores: null
    } as any;
    component.canonicalResultState = normalizeCanonicalResult({
      correctionStatus: 'completed',
      semanticStatus: 'completed',
      evaluationStatus: 'processing',
      detailedFeedbackStatus: 'processing',
      processingActive: true,
      automaticPollingAllowed: true
    });
    component.scoreState = 'loaded';
    component.aiFeedbackState = 'processing';
    component.isUploadedFile = false;
    (component as any).recomputeRubricFeedbackItems();
    window.dispatchEvent(new Event('orientationchange'));
    fixture.detectChanges();

    expect(component.evaluationStatusPresentation.showPreviousScore).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Re-evaluating…');
    expect(fixture.nativeElement.textContent).toContain('Previous score: 72 / 100 (outdated)');
    expect(fixture.nativeElement.textContent).not.toContain('0.0 /');
    expect(fixture.nativeElement.querySelector(
      'button[aria-label="Re-evaluate with current rubric"]'
    )).toBeNull();
  });

  it('preserves the previous score after evaluation failure and protects teacher overrides', () => {
    component.currentFeedback = {
      submissionId: 'submission-1',
      previousEvaluation: { overallScore: 72 }
    } as any;
    component.canonicalResultState = normalizeCanonicalResult({
      correctionStatus: 'completed',
      semanticStatus: 'completed',
      evaluationStatus: 'failed',
      detailedFeedbackStatus: 'blocked',
      manualRetryAllowed: true
    });
    component.scoreState = 'loaded';
    component.isUploadedFile = false;
    window.dispatchEvent(new Event('orientationchange'));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Re-evaluation could not be completed.');
    expect(fixture.nativeElement.textContent).toContain('Previous score: 72 / 100 (outdated)');
    expect(fixture.nativeElement.querySelector(
      'button[aria-label="Try re-evaluation again"]'
    )).toBeTruthy();

    component.canonicalResultState = normalizeCanonicalResult({
      correctionStatus: 'completed',
      semanticStatus: 'completed',
      evaluationStatus: 'stale',
      detailedFeedbackStatus: 'stale',
      manualRetryAllowed: true,
      overriddenByTeacher: true
    });
    fixture.detectChanges();
    expect(component.evaluationStatusPresentation.showAction).toBeFalse();
    expect(fixture.nativeElement.querySelector(
      'button[aria-label="Re-evaluate with current rubric"]'
    )).toBeNull();
  });

  it('saving a submission rubric does not invoke legacy rubric score generation', async () => {
    component.currentSubmission = { _id: 'submission-1' } as any;
    component.currentFeedback = { submissionId: 'submission-1', overriddenByTeacher: true } as any;
    spyOn<any>(component, 'isRubricDesignerStateEmpty').and.returnValue(false);
    spyOn((component as any).feedbackApi, 'upsertSubmissionFeedback')
      .and.resolveTo(component.currentFeedback);
    const legacy = spyOn((component as any).feedbackApi, 'generateRubricDesignerAi');

    await component.saveRubricAndRegenerate();

    expect(legacy).not.toHaveBeenCalled();
    expect(component.currentFeedback?.overriddenByTeacher).toBeTrue();
    TestBed.inject(HttpTestingController).match(() => true)
      .forEach((request) => request.flush({ success: true, data: {} }));
  });

  it('does not signal draft comparison refresh for evaluation-only completion', () => {
    (component as any).signalDraftComparisonCompletion({
      _id: 'submission-1', evaluationStatus: 'completed', evaluationSourceHash: 'source-1'
    });

    expect(component.draftComparisonRefreshKey).toBe(0);
  });

  it('signals draft comparison once per stable finalized assessment identity', () => {
    const finalized = {
      _id: 'submission-1', evaluationStatus: 'completed', assessmentStatus: 'complete',
      assessmentCompletedAt: '2026-09-13T10:00:00.000Z', evaluationSourceHash: 'source-1'
    };

    (component as any).signalDraftComparisonCompletion(finalized);
    (component as any).signalDraftComparisonCompletion({ ...finalized });
    expect(component.draftComparisonRefreshKey).toBe(1);

    (component as any).signalDraftComparisonCompletion({
      ...finalized, assessmentCompletedAt: '2026-09-13T10:01:00.000Z'
    });
    expect(component.draftComparisonRefreshKey).toBe(2);
  });
});
