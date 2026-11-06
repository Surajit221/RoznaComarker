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
    for (const selector of ['[data-issue-tabs]', '[data-issue-panel]', '[data-unclear-metric]', '[data-rubric-limited]', '[data-issues-note]', '[data-rubric-limited-note]',
      '[data-insights]', '[data-diff-toggle]', '[data-diff-view]', '[data-draft-select]', '[data-texts-unrelated]', '[data-texts-limited]']) {
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
  it('v2 insights: shown with icons and words; the rubric-changed case shows only the note', async () => {
    await render(V2);
    const section = dom().querySelector('[data-insights]')!;
    expect(section.querySelector('[data-insight="strongest"]')!.textContent).toContain('Strongest progress: Grammar (+3)');
    expect(section.querySelector('[data-insight="fixed"]')!.textContent).toContain('1');
    expect(section.querySelector('[data-insight="focus"]')!.textContent).toContain('Focus for the next draft: Grammar');
    TestBed.resetTestingModule();
    await render({ ...V2, rubricChanged: true, overall: { previousScore: 70, currentScore: 76, delta: null, status: 'RUBRIC_CHANGED' } });
    expect(dom().querySelector('[data-insights-note]')!.textContent).toContain('no progress is claimed');
    expect(dom().querySelector('[data-insight]')).toBeNull();
  });
  it('v1 payload: no "Show changes" toggle, the two text panes as before', async () => {
    await render(V1);
    expect(dom().querySelector('[data-diff-toggle]')).toBeNull();
    expect(dom().querySelector('.text-grid')).not.toBeNull();
  });
  it('v2 "Compare with": shown with two or more earlier drafts; picking one asks for that comparison; the previous draft goes back to the default call', async () => {
    const choices = [{ draftNumber: 2, submittedAt: '2026-11-02T10:00:00.000Z', score: 74 }, { draftNumber: 1, submittedAt: '2026-11-01T10:00:00.000Z', score: 70 }];
    await render({ ...V2, currentDraftNumber: 3, previousDraftNumber: 2, earlierDrafts: choices });
    const select = dom().querySelector<HTMLSelectElement>('[data-draft-select] select')!;
    expect([...select.options].map(o => o.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['Draft 2 · Nov 2, 2026 · score 74 (previous)', 'Draft 1 · Nov 1, 2026 · score 70']);
    expect(select.value).toBe('2');
    expect(api.getDraftComparison.calls.mostRecent().args).toEqual(['submission-2', null]);
    api.getDraftComparison.and.resolveTo({ ...V2, currentDraftNumber: 3, previousDraftNumber: 1, earlierDrafts: choices });
    select.value = '1'; select.dispatchEvent(new Event('change'));
    await fixture.whenStable(); fixture.detectChanges();
    expect(api.getDraftComparison.calls.mostRecent().args).toEqual(['submission-2', null, 1]);
    expect(dom().querySelector('.draft-label')!.textContent).toContain('Draft 1 to 3');
    expect(dom().querySelector<HTMLSelectElement>('[data-draft-select] select')!.value).toBe('1');
    const again = dom().querySelector<HTMLSelectElement>('[data-draft-select] select')!;
    again.value = '2'; again.dispatchEvent(new Event('change'));
    await fixture.whenStable(); fixture.detectChanges();
    expect(api.getDraftComparison.calls.mostRecent().args).toEqual(['submission-2', null]);
  });
  it('v2 with a single earlier draft: no selector (nothing to choose)', async () => {
    await render({ ...V2, earlierDrafts: [{ draftNumber: 1, submittedAt: null, score: null }] });
    expect(dom().querySelector('[data-draft-select]')).toBeNull();
  });
  it('v2, different texts: the neutral notice and label; no improved/declined, no issue cards or tabs, no insights, the message not repeated', async () => {
    await render({ ...V2, textsUnrelated: true, overall: { previousScore: 70, currentScore: 76, delta: null, status: 'TEXTS_UNRELATED' },
      summary: { improved: false, unchanged: false, declined: false, limited: true }, issuesAvailable: false, issues: null, issueDetails: undefined,
      issuesMessage: 'These drafts look like different texts, so the comparison is limited.',
      rubricCategories: [{ categoryId: 'GRAMMAR', name: 'Grammar', previousScore: 15, currentScore: 18, delta: null, maxScore: null, available: false, reason: 'The drafts look like different texts.' }] });
    expect(dom().querySelector('[data-texts-unrelated]')!.textContent).toContain('These drafts look like different texts, so the comparison is limited.');
    expect(dom().querySelector('[data-texts-limited]')!.textContent).toContain('Different texts - comparison limited');
    expect(dom().textContent).toContain('70 → 76');
    expect(dom().textContent).not.toMatch(/Improved|Declined|Issues corrected|Focus for the next draft/);
    for (const selector of ['[data-issue-tabs]', '[data-insights]', '[data-unclear-metric]']) expect(dom().querySelector(selector)).withContext(selector).toBeNull();
    expect(dom().textContent!.split('These drafts look like different texts').length - 1).toBe(1);
    expect(dom().querySelector('.metric-grid')!.classList).not.toContain('metric-grid--five');
    expect(dom().textContent).toContain('Not comparable');
  });
  it('v2 summary cards: five cards in their own grid; a v1 payload keeps the old four-card grid', async () => {
    await render(V2);
    const grid = dom().querySelector('.metric-grid')!;
    expect(grid.classList).toContain('metric-grid--five');
    expect(grid.querySelectorAll('.metric').length).toBe(5);
    expect(getComputedStyle(grid).gridTemplateColumns.split(' ').length).toBe(window.innerWidth > 1100 ? 5 : window.innerWidth > 720 ? 3 : window.innerWidth > 420 ? 2 : 1);
    TestBed.resetTestingModule();
    await render(V1);
    expect(dom().querySelector('.metric-grid')!.classList).not.toContain('metric-grid--five');
    expect(dom().querySelectorAll('.metric-grid .metric').length).toBe(4);
  });
  it('v2: a note about the earlier draft is shown even though the list is available', async () => {
    await render({ ...V2, issuesMessage: 'The earlier draft was saved before your teacher\'s changes to its corrections were kept with it, so this list may include corrections your teacher hid.' });
    expect(dom().querySelector('[data-issues-note]')!.textContent).toContain('may include corrections your teacher hid');
  });
});
