import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CanonicalDetailedFeedbackComponent } from './canonical-detailed-feedback';
import type { DetailedFeedbackDisplayModel } from '../../utils/detailed-feedback-display.util';

const model = (overrides: Partial<DetailedFeedbackDisplayModel> = {}): DetailedFeedbackDisplayModel => ({
  status: 'completed', message: null, sourceHash: 'h', evaluationVersion: 'v', legacyAreas: [], legacyStrengths: [], legacyActionSteps: [],
  areasForImprovement: [{ id: 'a', category: 'GRAMMAR', title: 'Grammar', issueCount: 2, score: 20, maxScore: 25,
    explanation: 'Agreement is repeated.', dominantSymbols: ['AGR'], examples: [{ correctionId: 'c', symbol: 'AGR', symbolLabel: 'Agreement', quotedText: '<students learns>', message: 'Agreement', suggestedText: 'students learn' }] }],
  strengths: [{ id: 's', category: 'PRESENTATION', title: 'Presentation', score: 5, maxScore: 5, explanation: 'Readable.', evidence: ['OCR evidence'], provisional: true }],
  actionSteps: [{ id: 'x', priority: 1, category: 'GRAMMAR', action: 'Review agreement.', reason: 'Two issues.', relatedSymbols: ['AGR'], relatedCorrectionIds: ['c'] }],
  ...overrides
});

describe('CanonicalDetailedFeedbackComponent', () => {
  let fixture: ComponentFixture<CanonicalDetailedFeedbackComponent>;
  beforeEach(async () => { await TestBed.configureTestingModule({ imports: [CanonicalDetailedFeedbackComponent] }).compileComponents(); fixture = TestBed.createComponent(CanonicalDetailedFeedbackComponent); });

  it('renders rich evidence, badges, strengths and action steps safely', () => {
    fixture.componentInstance.model = model(); fixture.detectChanges(); const content = fixture.nativeElement.textContent;
    expect(content).toContain('Detailed Feedback & Suggestions'); expect(content).toContain('2 issues'); expect(content).toContain('20/25');
    expect(content).toContain('<students learns>'); expect(content).toContain('students learn'); expect(content).toContain('Agreement');
    expect(content).toContain('Evidence-based Strengths'); expect(content).toContain('Prioritized Action Steps');
    expect(fixture.nativeElement.querySelector('script')).toBeNull();
    expect(fixture.nativeElement.querySelector('[innerHTML]')).toBeNull();
  });

  it('never renders a heading-only blank completed section', () => {
    fixture.componentInstance.model = model({ status: 'empty', message: 'No major improvement areas were identified.', areasForImprovement: [], actionSteps: [] });
    fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('No major improvement areas were identified.');
  });

  it('renders explicit processing and blocked states while preserving manual Retry', () => {
    fixture.componentInstance.model = model({ status: 'processing', message: 'Preparing detailed feedback…', areasForImprovement: [], strengths: [], actionSteps: [] });
    fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('Preparing detailed feedback');
    fixture.componentRef.setInput('model', model({ status: 'blocked', message: 'Detailed feedback is unavailable because the writing analysis did not complete.', areasForImprovement: [], strengths: [], actionSteps: [] }));
    fixture.componentRef.setInput('manualRetryAllowed', true); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Detailed feedback is unavailable');
    expect(fixture.nativeElement.querySelector('button')?.textContent).toContain('Retry analysis');
  });

  it('renders exactly one heading and only the loading state while pending', () => {
    fixture.componentInstance.model = model({ status: 'processing', message: 'Preparing detailed feedback…',
      areasForImprovement: [], strengths: [], actionSteps: [] });
    fixture.detectChanges(); const content = fixture.nativeElement.textContent;
    expect(fixture.nativeElement.querySelectorAll('#canonical-feedback-title').length).toBe(1);
    expect(content).toContain('Preparing detailed feedback');
    expect(content).not.toContain('Areas for Improvement'); expect(content).not.toContain('Action Steps');
    expect(content).not.toContain('unavailable'); expect(fixture.nativeElement.querySelector('.feedback-card')).toBeNull();
  });

  it('renders completed persisted cards without loading or unavailable states', () => {
    fixture.componentInstance.model = model(); fixture.detectChanges(); const content = fixture.nativeElement.textContent;
    expect(fixture.nativeElement.querySelectorAll('.feedback-card').length).toBeGreaterThan(0);
    expect(content).toContain('students learn'); expect(content).not.toContain('Preparing detailed feedback');
    expect(content).not.toContain('unavailable');
  });
});
