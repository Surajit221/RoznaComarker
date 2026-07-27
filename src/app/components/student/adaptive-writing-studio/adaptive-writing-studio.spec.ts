import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { AdaptivePracticeApiService } from '../../../api/adaptive-practice-api.service';
import { AdaptiveWritingStudio } from './adaptive-writing-studio';
import type { AdaptivePracticeCheckResponse, AdaptivePracticeSessionResponse, AdaptiveSkillScore } from './adaptive-writing-studio.types';
import type { CanonicalResultViewState } from '../../../utils/canonical-result-state.util';

describe('AdaptiveWritingStudio', () => {
  let fixture: ComponentFixture<AdaptiveWritingStudio>;
  let component: AdaptiveWritingStudio;
  let api: jasmine.SpyObj<AdaptivePracticeApiService>;

  const skills: readonly AdaptiveSkillScore[] = [
    { id: 'task', label: 'Task Achievement', earnedPoints: 15, maximumPoints: 20 },
    { id: 'coherence', label: 'Coherence & Flow', earnedPoints: 11, maximumPoints: 20 },
    { id: 'lexical', label: 'Lexical Resource', earnedPoints: 13.8, maximumPoints: 20 },
    { id: 'grammar', label: 'Grammar', earnedPoints: 17.5, maximumPoints: 25 },
    { id: 'mechanics', label: 'Mechanics', earnedPoints: null, maximumPoints: null }
  ];
  const idle = { state: 'idle', session: null } as AdaptivePracticeSessionResponse;
  const ready: AdaptivePracticeSessionResponse = { state: 'ready', session: {
    _id: 'session-1', submissionId: 'submission-1', status: 'ready', activities: [{ activityId: 'activity-1', skillId: 'ORGANIZATION', category: 'Coherence & Flow', title: 'Improve flow', description: 'Practice flow.', evidence: 'Student text.', task: 'Revise it.', tip: 'Use transitions.', checklist: ['Clear links', 'Smooth flow'], modelAnswer: 'Improved text.', difficulty: 'developing' }]
  }, progress: { improvedActivities: 0, totalActivities: 1, percentage: 0, activities: [{ activityId: 'activity-1', attemptCount: 0, improved: false, bestScore: null, latestScore: null, latestResponse: '', latestAttempt: null }] } };
  const currentCanonical = { submissionId: 'submission-1', correctionStatus: 'completed', evaluationStatus: 'completed',
    detailedFeedbackStatus: 'completed', semanticStatus: 'completed', processingActive: false,
    correctionSourceHash: 'current-hash', evaluationSourceHash: 'current-hash' } as CanonicalResultViewState;

  beforeEach(async () => {
    api = jasmine.createSpyObj<AdaptivePracticeApiService>('AdaptivePracticeApiService', ['getSession', 'generateSession', 'retryGeneration', 'checkResponse', 'getAttempts']);
    api.getSession.and.returnValue(of(idle));
    api.generateSession.and.returnValue(of(ready));
    api.retryGeneration.and.returnValue(of(ready));
    api.checkResponse.and.returnValue(of({ state: 'ready', reused: false, attempt: { _id: 'attempt-1', activityId: 'activity-1', attemptNumber: 1, status: 'ready', response: 'However, the ideas connect.', result: { score: 78, passed: true, summary: 'Clear improvement.', strength: 'Ideas connect.', nextImprovement: 'Use a more precise verb.', checklist: [{ item: 'Clear links', met: true, feedback: 'Present.' }, { item: 'Smooth flow', met: true, feedback: 'Present.' }], suggestedRevision: 'However, the ideas connect smoothly.', scoring: { taskFulfillment: 24, targetSkillApplication: 38, checklistCompletion: 16 } } }, progress: { improvedActivities: 1, totalActivities: 1, percentage: 100, activities: [{ activityId: 'activity-1', attemptCount: 1, improved: true, bestScore: 78, latestScore: 78, latestResponse: 'However, the ideas connect.', latestAttempt: null }] } } as AdaptivePracticeCheckResponse));
    await TestBed.configureTestingModule({ imports: [AdaptiveWritingStudio], providers: [{ provide: AdaptivePracticeApiService, useValue: api }] }).compileComponents();
    fixture = TestBed.createComponent(AdaptiveWritingStudio);
    component = fixture.componentInstance;
    component.skills = skills;
    component.canonicalResultState = currentCanonical;
    component.submissionId = 'submission-1';
    fixture.detectChanges();
  });

  it('loads an existing session and remains idle when none exists', () => {
    expect(api.getSession).toHaveBeenCalledOnceWith('submission-1');
    expect(component.state).toBe('idle');
    expect(fixture.nativeElement.querySelectorAll('.skill-card').length).toBe(5);
    expect(fixture.nativeElement.textContent).not.toContain('Recommended Practice');
  });

  it('calls generation once, blocks duplicates and reveals a ready session', () => {
    component.startGeneration();
    component.startGeneration();
    fixture.detectChanges();
    expect(api.generateSession).toHaveBeenCalledTimes(1);
    expect(component.state).toBe('generated');
    expect(fixture.nativeElement.textContent).toContain('Recommended Practice');
  });

  it('keeps skill cards visible on API error and never falls back to fixtures', () => {
    api.generateSession.and.returnValue(throwError(() => ({ error: { message: 'Unavailable' } })));
    component.startGeneration();
    fixture.detectChanges();
    expect(component.state).toBe('error');
    expect(component.activities.length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('.skill-card').length).toBe(5);
  });

  it('ignores a stale response after submission id changes', () => {
    const oldRequest = new Subject<AdaptivePracticeSessionResponse>();
    api.getSession.and.returnValues(oldRequest.asObservable(), of(idle));
    component.submissionId = 'submission-a';
    component.submissionId = 'submission-b';
    oldRequest.next(ready);
    expect(component.submissionId).toBe('submission-b');
    expect(component.activities.length).toBe(0);
  });

  it('does not treat zero assessed skills as all skills on track', () => {
    component.skills = skills.map((skill) => ({ ...skill, earnedPoints: null, maximumPoints: null }));
    fixture.detectChanges();
    expect(component.state).toBe('unassessed');
    expect(component.canGenerate).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('No assessed skills available');
    expect(fixture.nativeElement.textContent).not.toContain('Great work');
  });

  it('shows no weaknesses only when at least one assessed skill is on track', () => {
    component.skills = [{ id: 'grammar', label: 'Grammar', earnedPoints: 24, maximumPoints: 25 }];
    fixture.detectChanges();
    expect(component.state).toBe('no-weaknesses');
    expect(fixture.nativeElement.textContent).toContain('Great work');
  });

  it('blocks generation while canonical analysis is pending or failed', () => {
    component.canonicalResultState = { ...currentCanonical, evaluationStatus: 'pending', semanticStatus: 'pending', processingActive: true };
    expect(component.canGenerate).toBeFalse();
    component.canonicalResultState = { ...currentCanonical, evaluationStatus: 'blocked', semanticStatus: 'failed' };
    expect(component.canGenerate).toBeFalse();
  });

  it('becomes eligible when the canonical input reconciles from evaluation processing to completed', () => {
    component.canonicalResultState = { ...currentCanonical, evaluationStatus: 'processing',
      detailedFeedbackStatus: 'processing', processingActive: true, automaticPollingAllowed: true, terminal: false };
    fixture.detectChanges();
    expect(component.canGenerate).toBeFalse();

    component.canonicalResultState = { ...currentCanonical, evaluationStatus: 'completed',
      detailedFeedbackStatus: 'completed', processingActive: false, automaticPollingAllowed: false, terminal: true };
    fixture.detectChanges();
    expect(component.canGenerate).toBeTrue();
  });

  it('does not mutate score inputs and marks missing scores not assessed', () => {
    const snapshot = JSON.stringify(skills);
    component.startGeneration();
    expect(JSON.stringify(skills)).toBe(snapshot);
    expect(component.normalizedSkills.find((skill) => skill.id === 'mechanics')?.statusLabel).toBe('Not assessed');
  });

  it('uses staged text-only generation messages', () => {
    expect(component.generationStatusMessage).toBe('Preparing your practice…');
    (component as unknown as { pollAttempts: number }).pollAttempts = 1;
    expect(component.generationStatusMessage).toBe('Creating personalized activities…');
    (component as unknown as { pollAttempts: number }).pollAttempts = 4;
    expect(component.generationStatusMessage).toBe('Finalizing your practice…');
  });

  it('uses the real checking API and derives progress from persisted improvement', () => {
    component.startGeneration();
    component.updateResponse('activity-1', 'However, the ideas connect.');
    component.check(component.activities[0]);
    fixture.detectChanges();
    expect(api.checkResponse).toHaveBeenCalledWith('session-1', 'activity-1', 'However, the ideas connect.', false);
    expect(component.progressPercentage).toBe(100);
    expect(fixture.nativeElement.textContent).toContain('78%');
    expect(fixture.nativeElement.textContent).toContain('Improved');
  });

  it('blocks a duplicate while checking and ignores a stale result after the answer changes', () => {
    const pending = new Subject<AdaptivePracticeCheckResponse>();
    api.checkResponse.and.returnValue(pending.asObservable());
    component.startGeneration();
    component.updateResponse('activity-1', 'However, the first answer connects.');
    component.check(component.activities[0]);
    component.check(component.activities[0]);
    expect(api.checkResponse).toHaveBeenCalledTimes(1);

    component.updateResponse('activity-1', 'However, a newer answer now connects.');
    pending.next({
      state: 'ready', reused: false,
      attempt: { _id: 'old', activityId: 'activity-1', attemptNumber: 1, status: 'ready', response: 'However, the first answer connects.' },
      progress: { improvedActivities: 1, totalActivities: 1, percentage: 100, activities: [] }
    });
    expect(component.responses['activity-1']).toBe('However, a newer answer now connects.');
    expect(component.progressPercentage).toBe(0);
    expect(component.checkStates['activity-1']).toBe('idle');
  });

  it('preserves the typed answer on failure and deliberate retry creates one request', () => {
    api.checkResponse.and.returnValue(throwError(() => ({ error: { message: 'Try again.' } })));
    component.startGeneration();
    component.updateResponse('activity-1', 'However, my answer remains visible.');
    component.check(component.activities[0]);
    expect(component.responses['activity-1']).toBe('However, my answer remains visible.');
    expect(api.checkResponse).toHaveBeenCalledTimes(1);
    component.retryCheck(component.activities[0]);
    expect(api.checkResponse).toHaveBeenCalledTimes(2);
  });
});
