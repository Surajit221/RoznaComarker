// "Common mistakes" card on the assignment report page (Stage C): one row per mistake type that 2 or more students made, with
// "4 of 6 students" and a bar, and a "Show examples" button (aria-expanded) that reveals up to 3 anonymous examples (the original struck
// through, then the correction, then the explanation). The two empty states, the partial note, no student name anywhere in the card, and the
// existing "Most common errors" card unchanged. Synthetic data only.
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AssignmentReportPage } from './assignment-report';
import { AssignmentReportApiService, type AssignmentReport, type CommonMistakes } from '../../../api/assignment-report-api.service';
import { routedComponentProviders } from '../../../../testing/standalone-test-providers';
import { PdfApiService } from '../../../api/pdf-api.service';

const commonOk = (over: Partial<CommonMistakes> = {}): CommonMistakes => ({ basis: 'visible_corrections', totalStudents: 6, minStudents: 2, state: 'ok', partial: false, types: [
  { typeCode: 'VF', label: 'Verb Form', category: 'GRAMMAR', studentCount: 4, totalStudents: 6, occurrenceCount: 7, isCommon: true, examples: [
    { original: 'He go', corrected: 'He goes', explanation: 'Third person singular.' }, { original: 'builded', corrected: 'built', explanation: '' },
    { original: 'a apple', corrected: '', explanation: 'Use "an" before a vowel sound.' }] },
  { typeCode: 'SP', label: 'Spelling', category: 'MECHANICS', studentCount: 2, totalStudents: 6, occurrenceCount: 2, isCommon: true, examples: [
    { original: 'teh', corrected: 'the', explanation: 'Spelling.' }] },
  { typeCode: 'WC', label: 'Word Choice', category: 'VOCABULARY', studentCount: 1, totalStudents: 6, occurrenceCount: 1, isCommon: false, examples: [] }], ...over });

function report(commonMistakes: CommonMistakes | undefined): AssignmentReport {
  return {
    version: 'assignment-report-v1', generatedAt: '2026-11-14T10:00:00.000Z', timeZone: 'UTC',
    assignment: { id: 'assignment-1', title: 'Persuasive essay', className: 'Writing 7B', deadline: null, writingType: null },
    counts: { total: 6, bySource: { class: 5, guest: 1, teacherUpload: 0 }, scored: 6, inProgress: 0, notScored: 0, reviewed: 0, late: 0, skippedRows: 0, capped: false },
    scores: { average: 70, median: 70, highest: 80, lowest: 60, onTrack: 1, needsRevision: 5, needsAttention: 0, needsRevisionPct: 83, needsAttentionPct: 0, reviewedPct: 0, bands: [] },
    rubric: { kind: 'builtin', strongestKey: null, weakestKey: null, criteria: [] },
    errors: { basis: 'ai_analysis', total: 3, symbolTotal: 3, submissionsWithCorrections: 2, categories: [{ key: 'GRAMMAR', label: 'Grammar', color: null, count: 3, pct: 100 }],
      symbols: [{ symbol: 'VF', label: 'Verb Form', category: 'GRAMMAR', count: 3, pct: 100 }] },
    ...(commonMistakes ? { commonMistakes } : {}),
    timeline: { granularity: 'day', points: [] },
    students: ['Ana Ray', 'Gus Guest'].map((name, i) => ({ submissionId: `s${i}`, name, source: 'class', score: 70, band: 'needs_revision', assessment: 'scored',
      notScoredReason: null, reviewed: false, topIssue: null, submittedAt: null, isLate: false, draftNumber: 1, needsAttention: false, attentionReasons: [] })),
    insights: [], smallData: { distributionHidden: true, timelineHidden: true }
  };
}

describe('AssignmentReportPage: Common mistakes', () => {
  let fixture: ComponentFixture<AssignmentReportPage>;
  let host: HTMLElement;
  async function open(commonMistakes: CommonMistakes | undefined) {
    const api = jasmine.createSpyObj<AssignmentReportApiService>('AssignmentReportApiService', ['getReport']);
    api.getReport.and.resolveTo(report(commonMistakes));
    await TestBed.configureTestingModule({ imports: [AssignmentReportPage],
      providers: [...routedComponentProviders({ assignmentId: 'assignment-1' }), { provide: AssignmentReportApiService, useValue: api },
        { provide: PdfApiService, useValue: jasmine.createSpyObj<PdfApiService>('PdfApiService', ['downloadAssignmentReportPdf']) }] }).compileComponents();
    fixture = TestBed.createComponent(AssignmentReportPage);
    host = fixture.nativeElement;
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  }
  const card = () => host.querySelector<HTMLElement>('[data-section="common-mistakes"]');
  const text = (el: Element | null) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const rows = () => Array.from(card()!.querySelectorAll<HTMLElement>('[data-common-type]'));
  const toggle = (row: HTMLElement) => row.querySelector<HTMLButtonElement>('button[aria-controls]')!;

  it('a card after "Most common errors": its note, one row per type 2 or more students made, "4 of 6 students" and a bar', async () => {
    await open(commonOk());
    const errors = host.querySelector('[data-section="errors"]')!, common = card()!;
    expect(errors.compareDocumentPosition(common) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(text(common.querySelector('h2'))).toBe('Common mistakes');
    expect(text(common)).toContain('Based on the corrections students can see. Corrections you removed are not counted.');
    expect(rows().map(r => text(r.querySelector('[data-common-label]')))).toEqual(['VF · Verb Form', 'SP · Spelling']);
    expect(rows().map(r => text(r.querySelector('[data-common-count]')))).toEqual(['4 of 6 students', '2 of 6 students']);
    expect(text(common)).not.toContain('Word Choice');
    expect(rows()[0].querySelector<HTMLElement>('[data-common-fill]')!.style.width).toBe('67%');
    // The existing card and its note are unchanged.
    expect(text(errors)).toContain('Counts are from the AI analysis and may include items you removed.');
  });

  it('"Show examples": a real button with aria-expanded and aria-controls; the examples appear and hide again', async () => {
    await open(commonOk());
    const row = rows()[0], button = toggle(row);
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(text(button)).toContain('Show examples');
    const list = host.querySelector<HTMLElement>(`#${button.getAttribute('aria-controls')}`)!;
    expect(list.hidden).toBeTrue();
    button.click(); fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(text(button)).toContain('Hide examples');
    expect(list.hidden).toBeFalse();
    const items = Array.from(list.querySelectorAll('li'));
    expect(items.length).toBe(3);
    expect(items[0].querySelector('del')!.textContent).toBe('He go');
    expect(items[0].querySelector('ins')!.textContent).toBe('He goes');
    expect(text(items[0])).toContain('Third person singular.');
    // No replacement: the original and the explanation, no arrow.
    expect(items[2].querySelector('ins')).toBeNull();
    expect(text(items[2])).toContain('Use "an" before a vowel sound.');
    // Screen readers hear what each part is (struck-through text is not announced as such).
    expect(text(items[0])).toContain('Original:');
    expect(text(items[0])).toContain('Correction:');
    // Each row opens on its own.
    expect(toggle(rows()[1]).getAttribute('aria-expanded')).toBe('false');
    button.click(); fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(list.hidden).toBeTrue();
  });

  it('the button names its type for screen readers', async () => {
    await open(commonOk());
    expect(text(toggle(rows()[0]))).toContain('for VF · Verb Form');
  });

  it('empty states: fewer than 2 students; nothing shared by 2 or more students', async () => {
    await open(commonOk({ state: 'not_enough_students', totalStudents: 1, types: [] }));
    expect(text(card()!.querySelector('[data-common-empty]'))).toBe('Not enough submissions yet to find common mistakes');
    expect(rows().length).toBe(0);
    TestBed.resetTestingModule();
    await open(commonOk({ state: 'none_shared', types: [] }));
    expect(text(card()!.querySelector('[data-common-empty]'))).toBe('No mistake was shared by 2 or more students.');
  });

  it('partial: the note that some edited essays were left out; not shown otherwise', async () => {
    await open(commonOk({ partial: true }));
    expect(text(card()!.querySelector('[data-common-partial]'))).toBe('Some edited essays were left out of this section.');
    TestBed.resetTestingModule();
    await open(commonOk());
    expect(card()!.querySelector('[data-common-partial]')).toBeNull();
  });

  it('no student name anywhere in the card (the names in the report stay in the students table)', async () => {
    await open(commonOk());
    rows().forEach(r => toggle(r).click()); fixture.detectChanges();
    for (const name of ['Ana Ray', 'Gus Guest']) {
      expect(text(card())).not.toContain(name);
      expect(text(host)).toContain(name);
    }
  });

  it('an older backend without the section: no card, no error', async () => {
    await open(undefined);
    expect(card()).toBeNull();
    expect(text(host)).toContain('Most common errors');
  });
});
