import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DraftComparison, DraftIssueItem, SubmissionApiService } from '../../api/submission-api.service';
import { DraftComparisonComponent } from './draft-comparison';

const V1: DraftComparison = { available: true, previousDraftNumber: 1, currentDraftNumber: 2,
  overall: { previousScore: 70, currentScore: 76, delta: 6, status: 'IMPROVED' },
  rubricCategories: [{ categoryId: 'GRAMMAR', name: 'Grammar', previousScore: 15, currentScore: 18, delta: 3, maxScore: 25, available: true }],
  rubricChanged: false, rubricMessage: null, issuesAvailable: true, issuesMessage: null,
  issues: { previousCount: 3, currentCount: 2, correctedCount: 1, remainingCount: 1, newIssueCount: 1 },
  previousText: 'I goes home.', currentText: 'I go home.' };
const item = (status: DraftIssueItem['status'], extra: Partial<DraftIssueItem> = {}): DraftIssueItem => ({ status, category: 'GRAMMAR', symbol: 'AGR',
  originalText: 'goes', previousSuggestion: status === 'new' ? null : 'go', revisedText: status === 'fixed' ? 'I go home.' : null, explanation: `Explained ${status}.`, ...extra });
const list = (items: DraftIssueItem[], omitted = 0) => ({ items, total: items.length + omitted, omitted });
const V2: DraftComparison = { ...V1, comparisonVersion: 2,
  issues: { previousCount: 3, currentCount: 2, correctedCount: 1, remainingCount: 1, newIssueCount: 1, unclearCount: 1 },
  issueDetails: { fixed: list([item('fixed')]), remaining: list([item('remaining')]), new: list([item('new', { originalText: 'him goes', suggestion: 'he goes' })], 7), unclear: list([item('unclear')]) } };

describe('DraftComparisonComponent v2', () => {
  let fixture: ComponentFixture<DraftComparisonComponent>, api: jasmine.SpyObj<SubmissionApiService>;
  const dom = () => fixture.nativeElement as HTMLElement;
  async function render(result: DraftComparison) {
    api = jasmine.createSpyObj<SubmissionApiService>('SubmissionApiService', ['getDraftComparison', 'retryCanonicalEvaluation']);
    api.getDraftComparison.and.resolveTo(result);
    await TestBed.configureTestingModule({ imports: [DraftComparisonComponent], providers: [{ provide: SubmissionApiService, useValue: api }] }).compileComponents();
    fixture = TestBed.createComponent(DraftComparisonComponent);
    fixture.componentInstance.submissionId = 'submission-2';
    fixture.componentInstance.ngOnChanges({ submissionId: {} as never });
    await fixture.whenStable(); fixture.detectChanges();
  }

  it('a v1 payload (flag off) renders no v2 element at all', async () => {
    await render(V1);
    for (const selector of ['[data-issue-tabs]', '[data-issue-panel]', '[data-unclear-metric]', '[data-rubric-limited]', '[data-issues-note]', '[data-rubric-limited-note]']) {
      expect(dom().querySelector(selector)).withContext(selector).toBeNull();
    }
    expect(dom().textContent).toContain('+6 · Improved');
  });
  it('v2: the per-error tabs with counts; the first non-empty tab is shown; items show their text; the rest is counted', async () => {
    await render(V2);
    const tabs = [...dom().querySelectorAll<HTMLButtonElement>('[data-issue-tab]')];
    expect(tabs.map(t => t.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['✓ Fixed (1)', '● Still to fix (1)', '+ New (8)', '? Unclear (1)']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    const fixed = dom().querySelector('[data-issue-item]')!.textContent!;
    expect(fixed).toContain('Grammar'); expect(fixed).toContain('goes'); expect(fixed).toContain('Previous suggestion: go'); expect(fixed).toContain('Revised text:');
    expect(fixed).toContain('Explained fixed.');
    expect(dom().querySelector('[data-unclear-metric]')!.textContent).toContain('1');
    tabs[2].click(); fixture.detectChanges();
    expect(dom().querySelector('[data-issue-item]')!.textContent).toContain('Suggestion: he goes');
    expect(dom().querySelector('[data-issue-omitted]')!.textContent).toContain('7 more not shown');
    // Status is never only a colour: each tab has an icon and a word.
    for (const tab of tabs) expect(tab.querySelector('[aria-hidden="true"]')!.textContent!.trim().length).toBeGreaterThan(0);
  });
  it('v2: arrow keys move between tabs', async () => {
    await render(V2);
    const first = dom().querySelector<HTMLButtonElement>('[data-issue-tab="fixed"]')!;
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); fixture.detectChanges();
    expect(fixture.componentInstance.issueTab).toBe('remaining');
    expect(document.activeElement).toBe(dom().querySelector('[data-issue-tab="remaining"]'));
  });
  it('v2, rubric changed: the scores stay, the neutral label replaces improved/declined, the rubric message is shown', async () => {
    await render({ ...V2, rubricChanged: true, rubricMessage: 'Rubric changed between drafts; category-level comparison is partially unavailable.',
      overall: { previousScore: 70, currentScore: 76, delta: null, status: 'RUBRIC_CHANGED' }, summary: { improved: false, unchanged: false, declined: false, limited: true } });
    expect(dom().querySelector('[data-rubric-limited]')!.textContent).toContain('Rubric changed - comparison limited');
    expect(dom().textContent).toContain('70 → 76');
    expect(dom().textContent).not.toMatch(/Improved|Declined|Rubric_changed/i);
    expect(dom().querySelector('[data-rubric-limited-note]')!.textContent).toContain('partially unavailable');
  });
  it('v2 "Show changes": prepared after the click, then underline/strikethrough with words for screen readers; essay text never becomes HTML', async () => {
    await render({ ...V2, previousText: 'I goes to <b>the</b> park.', currentText: 'I go to <b>the</b> big park.' });
    expect(dom().querySelector('[data-diff-view]')).toBeNull();
    dom().querySelector<HTMLButtonElement>('[data-diff-toggle]')!.click(); fixture.detectChanges();
    expect(dom().querySelector('[data-diff-preparing]')).not.toBeNull();
    await new Promise(resolve => setTimeout(resolve, 0)); fixture.detectChanges();
    const view = dom().querySelector('[data-diff-view]')!;
    expect(view.querySelector('[data-diff="modified"] del')!.textContent).toContain('goes');
    expect(view.querySelector('[data-diff="modified"] ins')!.textContent).toContain('go');
    expect(view.querySelector('[data-diff="added"]')!.textContent).toContain('Added: big');
    expect(view.querySelector('b')).toBeNull();
    expect(view.textContent).toContain('<b>the</b>');
    expect(dom().querySelector('[data-diff-legend]')).not.toBeNull();
    dom().querySelector<HTMLButtonElement>('[data-diff-toggle]')!.click(); fixture.detectChanges();
    expect(dom().querySelector('[data-diff-view]')).toBeNull();
    expect(dom().querySelector('.text-grid')).not.toBeNull();
  });
  it('v1 payload: no "Show changes" toggle, the two text panes as before', async () => {
    await render(V1);
    expect(dom().querySelector('[data-diff-toggle]')).toBeNull();
    expect(dom().querySelector('.text-grid')).not.toBeNull();
  });
  it('v2: a note about the earlier draft is shown even though the list is available', async () => {
    await render({ ...V2, issuesMessage: 'The earlier draft was saved before your teacher\'s changes to its corrections were kept with it, so this list may include corrections your teacher hid.' });
    expect(dom().querySelector('[data-issues-note]')!.textContent).toContain('may include corrections your teacher hid');
  });
});
