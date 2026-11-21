// Stage 7d: speaking assignments on the student's class page: their own status source, pill, buttons and upload dialog. Essays unchanged.
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { DetailMyClassStudentPages } from './detail-my-class-student-pages';
import { routedHttpTestProviders } from '../../../../testing/routed-http-test.providers';
import { AuthService } from '../../../../auth/auth.service';
import { DeviceService } from '../../../../services/device.service';
import { SpeakingUploadDialog } from '../../../../components/student/speaking-upload-dialog/speaking-upload-dialog';
import type { BackendAssignment } from '../../../../api/assignment-api.service';

const API = 'http://localhost:5000/api';
const LIMITS = { maxRecordingSeconds: 180, minDurationSeconds: 5, maxFileBytes: 41943040 };
type Card = DetailMyClassStudentPages['assignments'][number];
const card = (over: Partial<Card>): Card => ({ id: 'a1', title: 'Describe your town', dueDate: 'Nov 30, 2026', submitted: 0, total: 1, status: 'waiting',
  resourceType: 'speaking', showMarksToStudent: true, allowResubmission: false, speakingLimits: LIMITS, ...over } as Card);
const desktop = { isDesktop: () => true, isMobile: () => false, isTablet: () => false };

describe('DetailMyClassStudentPages: speaking assignments (stage 7d)', () => {
  let fixture: ComponentFixture<DetailMyClassStudentPages>;
  let component: DetailMyClassStudentPages;
  let http: HttpTestingController;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DetailMyClassStudentPages],
      providers: [...routedHttpTestProviders({ classId: 'class-1' }), { provide: AuthService, useValue: { getBackendJwt: () => null } },
        { provide: DeviceService, useValue: desktop }] }).compileComponents();
    fixture = TestBed.createComponent(DetailMyClassStudentPages);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });
  const render = (cards: Card[]): HTMLElement => { component.assignments = cards; fixture.detectChanges(); return fixture.nativeElement as HTMLElement; };
  const labels = (root: HTMLElement) => [...root.querySelectorAll('button')].map(b => b.textContent!.trim()).filter(Boolean);

  it('status comes from GET /speaking/:id/my (never the essay submission endpoint); a submission marks it done', async () => {
    const mapped = (component as unknown as { mapAssignment(a: BackendAssignment): Promise<Card> }).mapAssignment({ _id: 'a1', title: 'Talk', resourceType: 'speaking', deadline: null } as unknown as BackendAssignment);
    http.expectOne(`${API}/speaking/a1/my`).flush({ success: true, data: { submission: { id: 's1', recording: { state: 'processing' } }, limits: LIMITS } });
    const item = await mapped;
    expect(item).toEqual(jasmine.objectContaining({ id: 'a1', status: 'completed', submitted: 1, resourceType: 'speaking', speakingLimits: LIMITS }));
    http.expectNone(req => req.url.includes('/submissions/assignment/'));
  });

  it('no recording yet: the navy Speaking pill, the description and "Upload Recording" (not "Upload Essay")', () => {
    const root = render([card({ instructions: 'Speak about your town.' })]);
    const pill = root.querySelector('[data-speaking-pill]')!;
    expect(pill.textContent!.trim()).toBe('Speaking');
    expect(pill.className).toContain('bg-[#203864]');
    expect(root.textContent).toContain('Speak about your town.');
    expect(labels(root)).toContain('Upload Recording');
    expect(labels(root)).not.toContain('Upload Essay');
  });

  it('Upload Recording opens the speaking dialog (not the essay uploader) for that assignment', () => {
    const root = render([card({})]);
    [...root.querySelectorAll('button')].find(b => b.textContent!.trim() === 'Upload Recording')!.click();
    fixture.detectChanges();
    expect(component.showDialog).toBeFalse();
    const dialog = fixture.debugElement.query(el => el.componentInstance instanceof SpeakingUploadDialog).componentInstance as SpeakingUploadDialog;
    expect(dialog.open).toBeTrue();
    expect(dialog.assignment?.id).toBe('a1');
    expect(dialog.limits).toEqual(LIMITS);
  });

  it('with a recording: "View Recording" goes to the student speaking page; after an upload the page opens', () => {
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const root = render([card({ submitted: 1, status: 'completed' })]);
    expect(labels(root)).not.toContain('Upload Recording');
    [...root.querySelectorAll('button')].find(b => b.textContent!.trim() === 'View Recording')!.click();
    expect(navigate).toHaveBeenCalledWith(['/student/my-classes/detail/my-speaking', 'a1'], { queryParams: { classId: 'class-1' } });
    navigate.calls.reset();
    component.openSpeakingUpload('a1');
    component.onSpeakingUploaded();
    expect(navigate).toHaveBeenCalledWith(['/student/my-classes/detail/my-speaking', 'a1'], { queryParams: { classId: 'class-1' } });
    expect(component.assignments[0].status).toBe('completed');
  });

  it('an essay card is unchanged apart from its "Writing" pill: Upload Essay, no Speaking pill', () => {
    const root = render([card({ resourceType: 'essay' })]);
    expect(labels(root)).toContain('Upload Essay');
    expect(root.querySelector('[data-speaking-pill]')).toBeNull();
    expect(root.querySelector('[data-writing-pill]')?.textContent).toBe('Writing');
  });

  it('the teal "Writing" pill sits where the "Speaking" pill does, with the same markup apart from the colour; worksheets and flashcards get neither', () => {
    expectWritingPills(render([card({ id: 'e1', title: 'Essay one', resourceType: 'essay' }), card({ id: 'l1', title: 'Legacy essay', resourceType: undefined }),
      card({ id: 's1', title: 'Talk one' }), card({ id: 'w1', title: 'Sheet', resourceType: 'worksheet' as never }), card({ id: 'f1', title: 'Cards', resourceType: 'flashcard' as never })]));
  });
});

/** Two writing pills (the essay and the legacy card, after their titles), one speaking pill, and the same classes apart from the colour. */
function expectWritingPills(root: HTMLElement): void {
  const writing = [...root.querySelectorAll<HTMLElement>('[data-writing-pill]')];
  const speaking = [...root.querySelectorAll<HTMLElement>('[data-speaking-pill]')];
  expect(writing.length).toBe(2);
  expect(speaking.length).toBe(1);
  expect(writing.map(p => p.previousElementSibling?.textContent?.trim())).toEqual(['Essay one', 'Legacy essay']);
  const shape = (el: HTMLElement) => el.className.split(/\s+/).filter(c => c && !c.startsWith('bg-')).sort();
  for (const pill of writing) {
    expect(pill.textContent).toBe('Writing');
    expect(pill.className).toContain('bg-[#008081]');
    expect(pill.className).toContain('text-white');
    expect(pill.getAttribute('aria-label')).toBeNull();
    expect(pill.children.length).toBe(0);
    expect(shape(pill)).toEqual(shape(speaking[0]));
  }
}

describe('DetailMyClassStudentPages: the Writing pill on the mobile layout', () => {
  it('the same pills on the mobile cards', async () => {
    await TestBed.configureTestingModule({ imports: [DetailMyClassStudentPages],
      providers: [...routedHttpTestProviders({ classId: 'class-1' }), { provide: AuthService, useValue: { getBackendJwt: () => null } },
        { provide: DeviceService, useValue: { isDesktop: () => false, isMobile: () => true, isTablet: () => false } }] }).compileComponents();
    const fixture = TestBed.createComponent(DetailMyClassStudentPages);
    fixture.componentInstance.assignments = [card({ id: 'e1', title: 'Essay one', resourceType: 'essay' }), card({ id: 'l1', title: 'Legacy essay', resourceType: undefined }),
      card({ id: 's1', title: 'Talk one' }), card({ id: 'w1', title: 'Sheet', resourceType: 'worksheet' as never }), card({ id: 'f1', title: 'Cards', resourceType: 'flashcard' as never })];
    fixture.detectChanges();
    expectWritingPills(fixture.nativeElement as HTMLElement);
  });
});
