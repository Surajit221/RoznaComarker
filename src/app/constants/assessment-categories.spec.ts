import { ASSESSMENT_CATEGORY_LABELS, ASSESSMENT_CATEGORY_ORDER, assessmentCategoryLabel, sortByAssessmentCategory } from './assessment-categories';
import { rubricScoresToFeedbackItems } from '../utils/dynamic-ai-feedback.util';
import { evaluationFeedbackComments } from '../utils/evaluation-feedback-comments.util';
import { criterionLabel, draftFromSnapshot, historySummary, type TeacherEvaluationSnapshot } from '../components/teacher/evaluation-editor/teacher-evaluation.logic';
import { ROWS as CORRECTION_ROWS } from '../components/correction-statistics/correction-statistics';
import { scoreLines, type ScoreReview } from '../components/teacher/annotation-controls/grade-check.logic';

// One canonical order (the AI-assisted Evaluation's) on every screen that lists the categories. This fails if any of them uses another.
const ORDER = ['GRAMMAR', 'VOCABULARY', 'ORGANIZATION', 'CONTENT', 'MECHANICS', 'PRESENTATION'];
const LABELS = ['Grammar', 'Vocabulary', 'Organization & Structure', 'Content & Task Achievement', 'Spelling & Punctuation', 'Presentation & Handwriting'];
const MAX: Record<string, number> = { GRAMMAR: 25, VOCABULARY: 20, ORGANIZATION: 20, CONTENT: 20, MECHANICS: 10, PRESENTATION: 5 };
// Stored in a different order on purpose (the server's CRITERIA order).
const STORED = ['CONTENT', 'ORGANIZATION', 'GRAMMAR', 'VOCABULARY', 'MECHANICS', 'PRESENTATION'];

describe('assessment category order', () => {
  it('is Grammar, Vocabulary, Organization & Structure, Content & Task Achievement, Spelling & Punctuation, Presentation & Handwriting', () => {
    expect([...ASSESSMENT_CATEGORY_ORDER] as string[]).toEqual(ORDER);
    expect(ASSESSMENT_CATEGORY_ORDER.map(key => ASSESSMENT_CATEGORY_LABELS[key])).toEqual(LABELS);
    expect(assessmentCategoryLabel('mechanics')).toBe('Spelling & Punctuation');
    expect(sortByAssessmentCategory(['X', 'content', 'GRAMMAR', 'Y'], k => k)).toEqual(['GRAMMAR', 'content', 'X', 'Y']);
  });

  it('AI-assisted Evaluation (teacher, student and guest pages) lists them in that order, with those labels and the same maxima', () => {
    const rubricScores = Object.fromEntries(STORED.map(key => [key, { score: 1, maxScore: MAX[key], comment: `${key} comment` }]));
    const items = rubricScoresToFeedbackItems(rubricScores as never);
    expect(items.map(item => item.category)).toEqual(LABELS);
    expect(items.map(item => item.maxScore)).toEqual(ORDER.map(key => MAX[key]));
    expect(evaluationFeedbackComments({ rubricScores }).map(item => item.category)).toEqual(LABELS);
  });

  it('Edit scores lists them in the same order, with the same labels ("Spelling & Punctuation", not "Mechanics"); keys and maxima unchanged', () => {
    const snapshot = { enabled: true, editable: true, blockedReason: null, revision: 1, history: [],
      criteria: STORED.map(key => ({ key, maxScore: MAX[key], ai: { score: 1, comment: '' }, teacher: { score: null, comment: null }, final: { score: 1, comment: '' } })) } as TeacherEvaluationSnapshot;
    const rows = draftFromSnapshot(snapshot);
    expect(rows.map(row => row.key)).toEqual(ORDER);
    expect(rows.map(row => criterionLabel(row.key))).toEqual(LABELS);
    expect(snapshot.criteria.map(c => c.key)).toEqual(STORED);                         // the server's data is not reordered
    const values = (score: number) => ({ criteria: Object.fromEntries(STORED.map(key => [key, { score, comment: '' }])), overallScore: 1, grade: 'F' });
    const summary = historySummary({ at: '', actorName: 'T', reason: null, reset: false, previousRevision: 1, newRevision: 2, before: values(1), after: values(2) });
    expect(LABELS.map(label => summary.indexOf(label))).toEqual([...LABELS.map(label => summary.indexOf(label))].sort((a, b) => a - b));
  });

  it('Grade check and the correction statistics card use the same order', () => {
    const review = { scores: { customRubricOverallScore: null, overallScore: 1, grade: 'F',
      categories: Object.fromEntries(STORED.map(key => [key, { score: 1, maxScore: MAX[key] }])) } } as unknown as ScoreReview;
    expect(scoreLines(review).map(line => line.split(' ')[0].toUpperCase())).toEqual(ORDER);
    expect(CORRECTION_ROWS.map(row => row.category.toUpperCase())).toEqual(ORDER.filter(key => key !== 'PRESENTATION'));
  });
});
