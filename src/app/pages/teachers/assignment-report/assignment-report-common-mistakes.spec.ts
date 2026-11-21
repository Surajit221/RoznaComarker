// One "Common errors" card on the assignment report page (it replaces "Most common errors" and "Common mistakes", which showed almost the
// same data twice): category chips from the AI analysis, then one row per correction type with the students affected as a count chip and
// the total, and expandable examples. An example shows the student's sentence with the mistake marked and the corrected sentence (or the
// word pair when there is no sentence), then the reason; 3 examples, "Show 2 more" for the rest. Every text is rendered as text (a
// student's words can never become markup). No student name in the card. Synthetic data only.
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AssignmentReportPage } from './assignment-report';
import { AssignmentReportApiService, type AssignmentReport, type CommonMistakeExample, type CommonMistakes } from '../../../api/assignment-report-api.service';
import { routedComponentProviders } from '../../../../testing/standalone-test-providers';
import { PdfApiService } from '../../../api/pdf-api.service';

const sentence = (before: string, error: string, corrected: string, after: string, over: Partial<NonNullable<CommonMistakeExample['sentence']>> = {}) =>
  ({ cutStart: false, cutEnd: false, parts: [{ text: before }, { text: error, error: true as const, corrected }, { text: after }], ...over });
const commonOk = (over: Partial<CommonMistakes> = {}): CommonMistakes => ({ basis: 'visible_corrections', totalStudents: 6, minStudents: 2, state: 'ok', partial: false, types: [
  { typeCode: 'VF', label: 'Verb Form', category: 'GRAMMAR', studentCount: 4, totalStudents: 6, occurrenceCount: 7, isCommon: true, examples: [
    { original: 'He go', corrected: 'He goes', explanation: 'Third person singular.', sentence: sentence('Every day ', 'He go', 'He goes', ' to school by bus.') },
    { original: 'builded', corrected: 'built', explanation: '', sentence: { cutStart: false, cutEnd: false, parts: [{ text: 'They ' },
      { text: 'builded', error: true, corrected: 'built' }, { text: ' a house and ' }, { text: 'maked', error: true, corrected: 'made' }, { text: ' a fire.' }] } },
    { original: 'a apple', corrected: '', explanation: 'Use "an" before a vowel sound.' },
    { original: 'she run', corrected: 'she runs', explanation: 'Agreement.', sentence: sentence('', 'she run', 'she runs', ' fast.', { cutStart: true }) },
    { original: 'we was', corrected: 'we were', explanation: 'Plural.', sentence: { cutStart: false, cutEnd: true,
      parts: [{ text: 'On Monday ' }, { text: 'we was', error: true, corrected: 'we were' }, { gap: true }, { text: 'and then we left' }] } }] },
  { typeCode: 'SP', label: 'Spelling', category: 'MECHANICS', studentCount: 2, totalStudents: 6, occurrenceCount: 2, isCommon: true, examples: [
    { original: 'teh', corrected: 'the', explanation: 'Spelling.' }] },
  { typeCode: 'WC', label: 'Word Choice', category: 'VOCABULARY', studentCount: 1, totalStudents: 6, occurrenceCount: 1, isCommon: false, examples: [] }], ...over });

function report(commonMistakes: CommonMistakes | undefined, symbols = [{ symbol: 'VF', label: 'Verb Form', category: 'GRAMMAR', count: 3, pct: 100 }]): AssignmentReport {
  return {
    version: 'assignment-report-v1', generatedAt: '2026-11-14T10:00:00.000Z', timeZone: 'UTC',
    assignment: { id: 'assignment-1', title: 'Persuasive essay', className: 'Writing 7B', deadline: null, writingType: null },
    counts: { total: 6, bySource: { class: 5, guest: 1, teacherUpload: 0 }, scored: 6, inProgress: 0, notScored: 0, reviewed: 0, late: 0, skippedRows: 0, capped: false },
    scores: { average: 70, median: 70, highest: 80, lowest: 60, onTrack: 1, needsRevision: 5, needsAttention: 0, needsRevisionPct: 83, needsAttentionPct: 0, reviewedPct: 0, bands: [] },
    rubric: { kind: 'builtin', strongestKey: null, weakestKey: null, criteria: [] },
    errors: { basis: 'ai_analysis', total: 3, symbolTotal: 3, submissionsWithCorrections: 2,
      categories: [{ key: 'GRAMMAR', label: 'Grammar', color: null, count: 3, pct: 100 }, { key: 'MECHANICS', label: 'Mechanics', color: null, count: 0, pct: 0 }], symbols },
    ...(commonMistakes ? { commonMistakes } : {}),
    timeline: { granularity: 'day', points: [] },
    students: ['Ana Ray', 'Gus Guest'].map((name, i) => ({ submissionId: `s${i}`, name, source: 'class', score: 70, band: 'needs_revision', assessment: 'scored',
      notScoredReason: null, reviewed: false, topIssue: null, submittedAt: null, isLate: false, draftNumber: 1, needsAttention: false, attentionReasons: [] })),
    insights: [], smallData: { distributionHidden: true, timelineHidden: true }
  } as AssignmentReport;
}

describe('AssignmentReportPage: Common errors', () => {
  let fixture: ComponentFixture<AssignmentReportPage>;
  let host: HTMLElement;
  async function open(commonMistakes: CommonMistakes | undefined, symbols?: Parameters<typeof report>[1]) {
    const api = jasmine.createSpyObj<AssignmentReportApiService>('AssignmentReportApiService', ['getReport']);
    api.getReport.and.resolveTo(report(commonMistakes, symbols));
    await TestBed.configureTestingModule({ imports: [AssignmentReportPage],
      providers: [...routedComponentProviders({ assignmentId: 'assignment-1' }), { provide: AssignmentReportApiService, useValue: api },
        { provide: PdfApiService, useValue: jasmine.createSpyObj<PdfApiService>('PdfApiService', ['downloadAssignmentReportPdf']) }] }).compileComponents();
    fixture = TestBed.createComponent(AssignmentReportPage);
    host = fixture.nativeElement;
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  }
  const card = () => host.querySelector<HTMLElement>('[data-section="common-errors"]');
  const text = (el: Element | null) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const rows = () => Array.from(card()!.querySelectorAll<HTMLElement>('[data-error-type]'));
  const toggle = (row: HTMLElement) => row.querySelector<HTMLButtonElement>('button[aria-controls]')!;
  const open0 = () => { toggle(rows()[0]).click(); fixture.detectChanges(); return Array.from(card()!.querySelectorAll<HTMLElement>(`#${toggle(rows()[0]).getAttribute('aria-controls')} [data-example]`)); };

  it('one card replaces the two: category chips from the AI analysis (with its note), then a row per type with a students chip and the total', async () => {
    await open(commonOk());
    expect(host.querySelector('[data-section="errors"]')).toBeNull();
    expect(host.querySelector('[data-section="common-mistakes"]')).toBeNull();
    expect(text(card()!.querySelector('h2'))).toBe('Common errors');
    expect(text(card())).toContain('Based on the corrections students can see. Corrections you removed are not counted.');
    expect(Array.from(card()!.querySelectorAll('[data-error-category]')).map(text)).toEqual(['Grammar 3']);
    expect(text(card())).toContain('Counts are from the AI analysis and may include items you removed.');
    expect(rows().map(r => text(r.querySelector('[data-error-label]')))).toEqual(['VF · Verb Form', 'SP · Spelling', 'WC · Word Choice']);
    expect(rows().map(r => text(r.querySelector('[data-error-students]')))).toEqual(['4 of 6 students', '2 of 6 students', '1 student']);
    expect(rows().map(r => text(r.querySelector('[data-error-total]')))).toEqual(['7 times', '2 times', '1 time']);
    // A type only one student made has no examples (anonymity); it says so instead of offering a button.
    expect(toggle(rows()[2] as HTMLElement)).toBeNull();
    expect(text(rows()[2])).toContain('No shared examples');
  });

  it('"Show examples": a real button with aria-expanded and aria-controls that names its type; examples appear and hide again; rows open on their own', async () => {
    await open(commonOk());
    const button = toggle(rows()[0]);
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(text(button)).toContain('Show examples');
    expect(text(button)).toContain('for VF · Verb Form');
    const list = host.querySelector<HTMLElement>(`#${button.getAttribute('aria-controls')}`)!;
    expect(list.hidden).toBeTrue();
    button.click(); fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(text(button)).toContain('Hide examples');
    expect(list.hidden).toBeFalse();
    expect(toggle(rows()[1]).getAttribute('aria-expanded')).toBe('false');
    button.click(); fixture.detectChanges();
    expect(list.hidden).toBeTrue();
  });

  it('an example shows the student\'s sentence with the mistake marked, the corrected sentence with the correction marked, then the reason', async () => {
    await open(commonOk());
    const [first] = open0();
    const original = first.querySelector('[data-sentence="original"]')!, corrected = first.querySelector('[data-sentence="corrected"]')!;
    expect(text(original)).toBe('Student wrote: Every day He go to school by bus.');
    expect(Array.from(original.querySelectorAll('mark')).map(text)).toEqual(['He go']);
    expect(text(corrected)).toBe('Corrected: Every day He goes to school by bus.');
    expect(Array.from(corrected.querySelectorAll('mark')).map(text)).toEqual(['He goes']);
    expect(original.querySelector('mark')!.className).not.toBe(corrected.querySelector('mark')!.className);
    expect(text(first)).toContain('Third person singular.');
  });

  it('several mistakes in one sentence: one sentence, every mistake marked, and a "2 in this sentence" chip', async () => {
    await open(commonOk());
    const grouped = open0()[1];
    expect(Array.from(grouped.querySelectorAll('[data-sentence="original"] mark')).map(text)).toEqual(['builded', 'maked']);
    expect(Array.from(grouped.querySelectorAll('[data-sentence="corrected"] mark')).map(text)).toEqual(['built', 'made']);
    expect(text(grouped.querySelector('[data-grouped]'))).toBe('2 in this sentence');
  });

  it('three examples first; "Show 2 more examples" (aria-expanded) shows the rest, including cut and gapped sentences with an ellipsis', async () => {
    await open(commonOk());
    let items = open0();
    expect(items.filter(i => !i.hidden).length).toBe(3);
    const more = card()!.querySelector<HTMLButtonElement>('[data-more-examples]')!;
    expect(text(more)).toBe('Show 2 more examples');
    expect(more.getAttribute('aria-expanded')).toBe('false');
    more.click(); fixture.detectChanges();
    items = Array.from(rows()[0].querySelectorAll<HTMLElement>('[data-example]')).filter(i => !i.hidden);
    expect(items.length).toBe(5);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(text(more)).toBe('Show fewer examples');
    expect(text(items[3].querySelector('[data-sentence="original"]'))).toBe('Student wrote: … she run fast.');
    expect(text(items[4].querySelector('[data-sentence="original"]'))).toBe('Student wrote: On Monday we was … and then we left…');
  });

  it('an example without a sentence shows the word pair (original struck through, then the correction) with labels for screen readers', async () => {
    await open(commonOk());
    const pair = open0()[2];
    expect(pair.querySelector('[data-sentence]')).toBeNull();
    expect(pair.querySelector('del')!.textContent).toBe('a apple');
    expect(pair.querySelector('ins')).toBeNull();
    expect(text(pair)).toContain('Original:');
    expect(text(pair)).toContain('Use "an" before a vowel sound.');
  });

  it('a student\'s text is always text: markup in a sentence, a correction or a reason never becomes an element', async () => {
    const evil = '<img src=x onerror="window.__xss=1">';
    await open(commonOk({ types: [{ typeCode: 'VF', label: '<b>Verb</b>', category: 'GRAMMAR', studentCount: 2, totalStudents: 6, occurrenceCount: 2, isCommon: true,
      examples: [{ original: evil, corrected: '<i>x</i>', explanation: '<script>window.__xss=2</script>', sentence: sentence('<u>a</u> ', evil, '<i>x</i>', ' <svg onload="window.__xss=3">') }] }] }));
    open0();
    const c = card()!;
    // Only the card's own markup: no element from the student's text (its icons are <i class="bx ...">, nothing else).
    expect(c.querySelector('img, script, svg, u, b')).toBeNull();
    expect(Array.from(c.querySelectorAll('i')).every(i => i.classList.contains('bx'))).toBeTrue();
    expect(text(c)).toContain(evil);
    expect(text(c)).toContain('<script>window.__xss=2</script>');
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });

  it('bad data never breaks the card: a sentence without a mistake part, parts that are not a list, examples that are not a list', async () => {
    await open(commonOk({ types: [{ typeCode: 'VF', label: 'Verb Form', category: 'GRAMMAR', studentCount: 3, totalStudents: 6, occurrenceCount: 3, isCommon: true, examples: [
      { original: 'He go', corrected: 'He goes', explanation: '', sentence: { cutStart: false, cutEnd: false, parts: [{ text: 'no mark here' }] } },
      { original: 'builded', corrected: 'built', explanation: '', sentence: { parts: 'oops' } as never },
      { original: 'teh', corrected: 'the', explanation: '', sentence: null as never }] },
      { typeCode: 'SP', label: 'Spelling', category: 'MECHANICS', studentCount: 2, totalStudents: 6, occurrenceCount: 2, isCommon: true, examples: 'oops' as never }] }));
    const items = open0();
    expect(items.length).toBe(3);
    for (const item of items) { expect(item.querySelector('[data-sentence]')).toBeNull(); expect(item.querySelector('del')).not.toBeNull(); }
    expect(toggle(rows()[1])).toBeNull();
  });

  it('empty and partial states: fewer than 2 students (the AI type counts still show); nothing shared; the partial note', async () => {
    await open(commonOk({ state: 'not_enough_students', totalStudents: 1, types: [] }));
    expect(text(card()!.querySelector('[data-common-empty]'))).toBe('Not enough submissions yet to find common mistakes');
    expect(rows().map(r => text(r.querySelector('[data-error-label]')))).toEqual(['VF · Verb Form']);
    expect(rows().map(r => text(r.querySelector('[data-error-total]')))).toEqual(['3 times']);
    expect(rows()[0].querySelector('[data-error-students]')).toBeNull();
    TestBed.resetTestingModule();
    await open(commonOk({ state: 'none_shared', types: [] }), []);
    expect(text(card()!.querySelector('[data-common-empty]'))).toBe('No mistake was shared by 2 or more students.');
    expect(rows().length).toBe(0);
    TestBed.resetTestingModule();
    await open(commonOk({ partial: true }));
    expect(text(card()!.querySelector('[data-common-partial]'))).toBe('Some edited essays were left out of this section.');
  });

  it('an older backend without the section: the AI type counts, no examples, no error', async () => {
    await open(undefined);
    expect(text(card()!.querySelector('h2'))).toBe('Common errors');
    expect(rows().map(r => text(r.querySelector('[data-error-total]')))).toEqual(['3 times']);
    expect(card()!.querySelector('button[aria-controls]')).toBeNull();
  });

  it('no student name anywhere in the card (names stay in the students table)', async () => {
    await open(commonOk());
    open0();
    for (const name of ['Ana Ray', 'Gus Guest']) {
      expect(text(card())).not.toContain(name);
      expect(text(host)).toContain(name);
    }
  });
});
