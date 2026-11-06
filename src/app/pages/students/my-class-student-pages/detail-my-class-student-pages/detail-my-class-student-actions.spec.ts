// Task 22 Part A: the card actions of a student's assignment list. "View Submission" primary, "Submit Another Draft" an outlined secondary
// button in the same action group; every card state; accessible names; the existing logic (confirmation, adaptive requirement) unchanged.
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DetailMyClassStudentPages } from './detail-my-class-student-pages';
import { routedHttpTestProviders } from '../../../../testing/routed-http-test.providers';
import { AuthService } from '../../../../auth/auth.service';

type Card = DetailMyClassStudentPages['assignments'][number];
const card = (over: Partial<Card>): Card => ({ id: 'a1', title: 'Persuasive essay', dueDate: 'Nov 30, 2026', submitted: 1, total: 1, status: 'completed',
  showMarksToStudent: true, allowResubmission: true, ...over } as Card);

describe('DetailMyClassStudentPages: card actions (Task 22)', () => {
  let fixture: ComponentFixture<DetailMyClassStudentPages>;
  let component: DetailMyClassStudentPages;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DetailMyClassStudentPages],
      providers: [...routedHttpTestProviders({ classId: 'class-1' }), { provide: AuthService, useValue: { getBackendJwt: () => null } }] }).compileComponents();
    fixture = TestBed.createComponent(DetailMyClassStudentPages);
    component = fixture.componentInstance;
  });
  const render = (cards: Card[]): HTMLElement => { component.assignments = cards; fixture.detectChanges(); return fixture.nativeElement as HTMLElement; };
  const actions = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.student-assignment-actions')].filter(el => el.offsetParent !== null || true);
  const labels = (root: HTMLElement) => [...root.querySelectorAll('button')].map(b => b.textContent!.trim()).filter(Boolean);

  it('submitted with another draft allowed: one action group, primary then outlined secondary, both real buttons with accessible names', () => {
    const root = render([card({})]);
    const group = actions(root)[0];
    const [view, again] = [...group.querySelectorAll('button')];
    expect(view.textContent!.trim()).toBe('View Submission');
    expect(again.textContent!.trim()).toBe('Submit Another Draft');
    expect(view.classList).toContain('submission-action-button');
    expect(again.classList).toContain('submission-action-button');
    expect(again.classList).toContain('student-assignment-actions__resubmit');
    expect(again.getAttribute('type')).toBe('button');
    expect(again.getAttribute('aria-label')).toBe('Submit another draft: Persuasive essay');
    expect(view.getAttribute('aria-label')).toBe('View submission: Persuasive essay');
    // Same height and radius as the primary, outlined (white background), no underline.
    const style = getComputedStyle(again);
    expect(style.textDecorationLine).toBe('none');
    expect(style.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(style.borderTopWidth).toBe('2px');
    expect(Math.round(again.getBoundingClientRect().height)).toBe(Math.round(view.getBoundingClientRect().height));
  });

  it('keyboard: the secondary button is focusable and runs the existing flow (confirmation first)', async () => {
    const root = render([card({})]);
    const again = root.querySelector<HTMLButtonElement>('.student-assignment-actions__resubmit')!;
    const confirm = spyOn((component as unknown as { alert: { showConfirm(...a: unknown[]): Promise<boolean> } }).alert, 'showConfirm').and.resolveTo(false);
    again.focus();
    expect(document.activeElement).toBe(again);
    again.click();
    await fixture.whenStable();
    expect(confirm).toHaveBeenCalled();
  });

  it('not submitted: Upload Essay only', () => {
    expect(labels(render([card({ submitted: 0, status: 'waiting' })]))).toEqual(['Upload Essay']);
  });

  it('another draft not allowed (draft limit / teacher setting): View Submission only', () => {
    const root = render([card({ allowResubmission: false })]);
    expect(root.querySelector('.student-assignment-actions__resubmit')).toBeNull();
    expect(labels(root)).toContain('View Submission');
  });

  it('adaptive learning required first: the note instead of the button', () => {
    const root = render([card({ requireAdaptiveBeforeResubmission: true, adaptiveResubmissionSatisfied: false })]);
    expect(root.querySelector('.student-assignment-actions__resubmit')).toBeNull();
    expect(root.textContent).toContain('Complete Adaptive Learning before another draft.');
  });

  it('overdue and never submitted: no "Submit Another Draft" (there is no first draft)', () => {
    const root = render([card({ submitted: 0, status: 'pending' })]);
    expect(root.querySelector('.student-assignment-actions__resubmit')).toBeNull();
  });

  it('long titles stay inside the action group (the accessible name carries the full title)', () => {
    const long = 'A very long assignment title about how social media changes the way people see themselves and compare their lives';
    const root = render([card({ title: long })]);
    expect(root.querySelector('.student-assignment-actions__resubmit')!.getAttribute('aria-label')).toBe(`Submit another draft: ${long}`);
  });
});
