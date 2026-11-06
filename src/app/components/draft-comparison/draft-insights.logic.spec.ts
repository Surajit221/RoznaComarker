import type { DraftComparison, DraftIssueItem } from '../../api/submission-api.service';
import { draftInsights } from './draft-insights.logic';

const cat = (name: string, delta: number | null, maxScore = 20, available = true) => ({ categoryId: name.toUpperCase(), name, previousScore: 10, currentScore: 10 + (delta ?? 0), delta, maxScore, available });
const item = (status: DraftIssueItem['status'], category: string): DraftIssueItem => ({ status, category, symbol: 'X', originalText: 'x', previousSuggestion: null, revisedText: null, explanation: '' });
const list = (items: DraftIssueItem[]) => ({ items, total: items.length, omitted: 0 });
function v2(patch: Partial<DraftComparison> = {}): DraftComparison {
  return { available: true, comparisonVersion: 2, rubricChanged: false, issuesAvailable: true,
    overall: { previousScore: 70, currentScore: 74, delta: 4, status: 'IMPROVED' },
    rubricCategories: [cat('Grammar', 3, 25), cat('Vocabulary', -1), cat('Content', 0)],
    issueDetails: { fixed: list([item('fixed', 'GRAMMAR'), item('fixed', 'GRAMMAR')]), remaining: list([item('remaining', 'MECHANICS'), item('remaining', 'MECHANICS')]),
      new: list([item('new', 'VOCABULARY')]), unclear: list([item('unclear', 'GRAMMAR')]) }, ...patch };
}

describe('draft insights', () => {
  it('strongest, weakest, fixed, still open (unclear never counted), and a focus sentence', () => {
    expect(draftInsights(v2())).toEqual({ claims: true, note: null, strongest: { name: 'Grammar', delta: 3 }, weakest: { name: 'Vocabulary', delta: -1 }, fixedCount: 2,
      openAreas: [{ category: 'MECHANICS', count: 2 }, { category: 'VOCABULARY', count: 1 }],
      focus: 'Focus for the next draft: Mechanics (2 issues still open), and the Vocabulary part of the rubric.' });
  });
  it('nothing went up: no "strongest progress"', () => {
    const result = draftInsights(v2({ rubricCategories: [cat('Grammar', 0), cat('Vocabulary', -2)] }))!;
    expect(result.strongest).toBeNull();
    expect(result.weakest).toEqual({ name: 'Vocabulary', delta: -2 });
  });
  it('different texts: no insights at all', () => {
    expect(draftInsights(v2({ textsUnrelated: true }))).toBeNull();
  });
  it('rubric changed: only a neutral note, no claim', () => {
    const result = draftInsights(v2({ rubricChanged: true, overall: { previousScore: 70, currentScore: 74, delta: null, status: 'RUBRIC_CHANGED' } }))!;
    expect(result).toEqual(jasmine.objectContaining({ claims: false, strongest: null, weakest: null, fixedCount: 0, openAreas: [], focus: null }));
    expect(result.note).toContain('no progress is claimed');
  });
  it('not enough comparable data: only a note', () => {
    const result = draftInsights(v2({ rubricCategories: [cat('Grammar', null, 25, false)], issuesAvailable: false, issueDetails: undefined }))!;
    expect(result.claims).toBeFalse();
    expect(result.note).toContain('not enough comparable information');
  });
  it('issues not comparable: rubric only, with a note; v1 payloads and unavailable comparisons: nothing', () => {
    const result = draftInsights(v2({ issuesAvailable: false, issueDetails: undefined }))!;
    expect(result.claims).toBeTrue();
    expect(result.fixedCount).toBe(0);
    expect(result.openAreas).toEqual([]);
    expect(result.note).toContain('only the rubric');
    expect(draftInsights({ ...v2(), comparisonVersion: undefined })).toBeNull();
    expect(draftInsights({ available: false, code: 'FIRST_DRAFT' })).toBeNull();
  });
});
