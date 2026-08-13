import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { AdaptivePracticeApiService } from '../../../api/adaptive-practice-api.service';
import { AdaptiveWritingStudio } from './adaptive-writing-studio';
import type { AdaptivePracticeActivity, AdaptivePracticeCheckResponse, AdaptivePracticeSessionResponse, AdaptiveSkillScore } from './adaptive-writing-studio.types';
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
  const adaptiveAnalysis = [
    { skillId: 'CONTENT' as const, skillLabel: 'Task Achievement', adaptivePercentage: 18, status: 'priority' as const },
    { skillId: 'ORGANIZATION' as const, skillLabel: 'Coherence & Flow', adaptivePercentage: 13, status: 'priority' as const },
    { skillId: 'VOCABULARY' as const, skillLabel: 'Lexical Resource', adaptivePercentage: 5, status: 'priority' as const },
    { skillId: 'GRAMMAR' as const, skillLabel: 'Grammar', adaptivePercentage: 100, status: 'on-track' as const },
    { skillId: 'MECHANICS' as const, skillLabel: 'Mechanics', adaptivePercentage: 100, status: 'on-track' as const }
  ];
  const idle = { state: 'idle', session: null, adaptiveSkills: adaptiveAnalysis } as AdaptivePracticeSessionResponse;
  const ready: AdaptivePracticeSessionResponse = { state: 'ready', session: {
    _id: 'session-1', submissionId: 'submission-1', status: 'ready', activities: [{ activityId: 'activity-1', skillId: 'ORGANIZATION', category: 'Coherence & Flow', title: 'Improve flow', description: 'Practice flow.', evidence: 'Student text.', task: 'Revise it.', tip: 'Use transitions.', checklist: ['Clear links', 'Smooth flow'], modelAnswer: 'Improved text.', difficulty: 'developing' }]
  }, progress: { improvedActivities: 0, totalActivities: 1, percentage: 0, activities: [{ activityId: 'activity-1', attemptCount: 0, improved: false, bestScore: null, latestScore: null, latestResponse: '', latestAttempt: null }] }, adaptiveSkills: adaptiveAnalysis };
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

  it('uses the approved adaptive projection when redacted rubric points are unavailable', () => {
    api.getSession.and.returnValue(of(idle));
    component.skills = skills.map((skill) => ({ ...skill, earnedPoints: null, maximumPoints: null }));
    component.submissionId = 'submission-redacted';
    fixture.detectChanges();
    expect(component.normalizedSkills.map((skill) => skill.percentage)).toEqual([18, 13, 5, 100, 100]);
    expect(fixture.nativeElement.textContent).not.toContain('Not assessed');
  });

  it('shows adaptive learning percentages when official assignment marks are hidden', () => {
    api.getSession.and.returnValue(of(ready));
    component.skills = skills.map((skill) => ({ ...skill, earnedPoints: null, maximumPoints: null }));
    component.submissionId = 'submission-hidden';
    fixture.detectChanges();

    expect(component.eligibilityReason).toBe('ALREADY_GENERATED');
    expect(component.normalizedSkills.map((skill) => skill.percentage)).toEqual([18, 13, 5, 100, 100]);
    expect(fixture.nativeElement.textContent).toContain('13%');
    expect(fixture.nativeElement.textContent).toContain('Priority practice');
    expect(fixture.nativeElement.textContent).not.toContain('Marks hidden by teacher');
    expect(fixture.nativeElement.textContent).not.toContain('Hidden');
    expect(fixture.nativeElement.textContent).not.toContain('Not assessed');
    expect(fixture.nativeElement.querySelectorAll('.skill-card').length).toBe(5);
  });

  it('does not let a later all-null parent input overwrite authoritative adaptive percentages', () => {
    const request = new Subject<AdaptivePracticeSessionResponse>();
    const redactedSkills = skills.map((skill) => ({ ...skill, earnedPoints: null, maximumPoints: null }));
    api.getSession.and.returnValue(request.asObservable());
    component.submissionId = 'submission-race';
    component.skills = redactedSkills;
    fixture.detectChanges();
    expect(component.normalizedSkills.every((skill) => skill.percentage === null)).toBeTrue();

    request.next({ state: 'idle', session: null, adaptiveSkills: adaptiveAnalysis });
    component.skills = redactedSkills;
    fixture.detectChanges();

    expect(component.normalizedSkills.map((skill) => skill.percentage)).toEqual([18, 13, 5, 100, 100]);
    expect(fixture.nativeElement.textContent).not.toContain('Not assessed');
  });

  it('keeps the same adaptive meaning when official rubric points are present', () => {
    api.getSession.and.returnValue(of(ready));
    component.skills = skills;
    component.submissionId = 'submission-visible';
    fixture.detectChanges();
    expect(component.normalizedSkills.map((skill) => skill.percentage)).toEqual([18, 13, 5, 100, 100]);
    expect(fixture.nativeElement.textContent).not.toContain('75%');
    expect(fixture.nativeElement.textContent).toContain('13%');
  });

  it('clears Draft 1 authority and accepts only Draft 2 adaptive percentages', () => {
    const draft1 = new Subject<AdaptivePracticeSessionResponse>();
    const draft2 = new Subject<AdaptivePracticeSessionResponse>();
    const draft2Analysis = [
      { skillId: 'CONTENT' as const, skillLabel: 'Task Achievement', adaptivePercentage: 40, status: 'priority' as const },
      { skillId: 'ORGANIZATION' as const, skillLabel: 'Coherence & Flow', adaptivePercentage: 35, status: 'priority' as const },
      { skillId: 'VOCABULARY' as const, skillLabel: 'Lexical Resource', adaptivePercentage: 25, status: 'priority' as const },
      { skillId: 'GRAMMAR' as const, skillLabel: 'Grammar', adaptivePercentage: 80, status: 'on-track' as const },
      { skillId: 'MECHANICS' as const, skillLabel: 'Mechanics', adaptivePercentage: 90, status: 'on-track' as const }
    ];
    const redactedSkills = skills.map((skill) => ({ ...skill, earnedPoints: null, maximumPoints: null }));
    api.getSession.and.returnValues(draft1.asObservable(), draft2.asObservable());

    component.submissionId = 'draft-1';
    component.skills = redactedSkills;
    draft1.next({ state: 'idle', session: null, adaptiveSkills: adaptiveAnalysis });
    expect(component.normalizedSkills.map((skill) => skill.percentage)).toEqual([18, 13, 5, 100, 100]);

    component.submissionId = 'draft-2';
    expect(component.normalizedSkills).toEqual([]);
    component.skills = redactedSkills;
    draft2.next({ state: 'idle', session: null, adaptiveSkills: draft2Analysis });
    component.skills = redactedSkills;
    draft1.next({ state: 'idle', session: null, adaptiveSkills: adaptiveAnalysis });

    expect(component.normalizedSkills.map((skill) => skill.percentage)).toEqual([40, 35, 25, 80, 90]);
  });

  it('keeps adaptive analysis percentages readable across supported widths', () => {
    component.startGeneration();
    fixture.detectChanges();
    const studio = fixture.nativeElement.querySelector('.studio') as HTMLElement;
    for (const width of [1440, 1280, 1024, 768, 430, 390, 375, 360, 320]) {
      studio.style.width = `${width}px`;
      expect(Array.from(studio.querySelectorAll('.skill-card__score')).map((node: any) => node.textContent.trim()))
        .withContext(`${width}px analysis`).toEqual(['18%', '13%', '5%', '100%', '100%']);
    }
  });

  it('honors the backend no-weaknesses eligibility without reading rubric percentages', () => {
    api.getSession.and.returnValue(of({ state: 'no-weaknesses', session: null }));
    component.submissionId = 'submission-no-weaknesses';
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

  it('treats semantic retry_wait as analysis processing', () => {
    component.canonicalResultState = { ...currentCanonical, semanticStatus: 'retry_wait', processingActive: false };
    expect(component.eligibilityReason).toBe('ANALYSIS_PROCESSING');
    expect(component.canGenerate).toBeFalse();
  });

  it('reloads once when waiting analysis becomes completed and current', () => {
    api.getSession.calls.reset();
    component.canonicalResultState = { ...currentCanonical, semanticStatus: 'processing',
      evaluationStatus: 'processing', processingActive: true };
    component.submissionId = 'submission-2';
    expect(component.state).toBe('waiting_for_analysis');
    expect(api.getSession).not.toHaveBeenCalled();

    component.canonicalResultState = { ...currentCanonical, submissionId: 'submission-2' };
    component.canonicalResultState = { ...currentCanonical, submissionId: 'submission-2' };
    expect(api.getSession).toHaveBeenCalledOnceWith('submission-2');
  });

  for (const code of ['ANALYSIS_INCOMPLETE', 'RUBRIC_NOT_AVAILABLE'] as const) {
    it(`handles ${code} as a recoverable analysis wait`, () => {
      api.getSession.calls.reset();
      api.getSession.and.returnValues(
        throwError(() => ({ status: 202, code, error: { code, message: 'Analysis is not ready.' } })),
        of(idle)
      );
      component.canonicalResultState = { ...currentCanonical, semanticStatus: 'processing',
        evaluationStatus: 'processing', processingActive: true };
      component.submissionId = `submission-${code}`;
      component.canonicalResultState = { ...currentCanonical, submissionId: `submission-${code}` };
      expect(component.state).toBe('waiting_for_analysis');

      component.canonicalResultState = { ...currentCanonical, submissionId: `submission-${code}`,
        semanticStatus: 'processing', evaluationStatus: 'processing', processingActive: true };
      component.canonicalResultState = { ...currentCanonical, submissionId: `submission-${code}` };
      expect(api.getSession).toHaveBeenCalledTimes(2);
      expect(component.state).toBe('idle');
    });
  }

  it('recovers a temporary analysis-synchronization error when canonical analysis becomes current', () => {
    api.getSession.calls.reset();
    api.getSession.and.returnValues(
      throwError(() => ({ status: 503, error: { message: 'Analysis synchronization unavailable.' } })),
      of(idle)
    );
    component.canonicalResultState = { ...currentCanonical, evaluationSourceHash: 'older-hash' };
    component.submissionId = 'submission-temporary';
    expect(component.state).toBe('error');

    component.canonicalResultState = { ...currentCanonical, submissionId: 'submission-temporary' };
    component.canonicalResultState = { ...currentCanonical, submissionId: 'submission-temporary' };
    expect(api.getSession).toHaveBeenCalledTimes(2);
    expect(component.state).toBe('idle');
  });

  for (const status of [400, 403, 404]) {
    it(`does not automatically retry a permanent ${status} error`, () => {
      api.getSession.calls.reset();
      api.getSession.and.returnValue(throwError(() => ({ status, error: { message: 'Permanent failure.' } })));
      component.canonicalResultState = { ...currentCanonical, semanticStatus: 'processing',
        evaluationStatus: 'processing', processingActive: true };
      component.submissionId = `submission-${status}`;
      component.canonicalResultState = { ...currentCanonical, submissionId: `submission-${status}` };
      expect(component.state).toBe('error');

      component.canonicalResultState = { ...currentCanonical, submissionId: `submission-${status}`,
        semanticStatus: 'processing', evaluationStatus: 'processing', processingActive: true };
      component.canonicalResultState = { ...currentCanonical, submissionId: `submission-${status}` };
      expect(api.getSession).toHaveBeenCalledTimes(1);
    });
  }

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

  it('does not mutate score inputs and retains the adaptive analysis projection', () => {
    const snapshot = JSON.stringify(skills);
    component.startGeneration();
    expect(JSON.stringify(skills)).toBe(snapshot);
    expect(component.normalizedSkills.find((skill) => skill.id === 'mechanics')?.statusLabel).toBe('On track');
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
    expect(component.normalizedSkills.find((skill) => skill.id === 'coherence')).toEqual(jasmine.objectContaining({
      percentage: 13, statusLabel: 'Priority practice'
    }));
    expect(component.bestPracticeScore('coherence')).toBe(78);
    expect(fixture.nativeElement.textContent).toContain('Best practice: 78%');
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

  it('renders accessible single-select MCQ options and submits the selected option id', () => {
    component.activities = [{ id: 'mcq-1', questionType: 'mcq', skillId: 'GRAMMAR', category: 'Grammar',
      title: 'Agreement', description: 'Choose the correct form.', evidence: 'The students is preparing.',
      task: 'Which verb is correct?', tip: 'Match the plural subject.', checklist: ['Plural subject', 'Correct verb'],
      options: [{ id: 'A', text: 'is' }, { id: 'B', text: 'are' }], difficulty: 'foundational', isDevelopmentPreview: false }];
    component.state = 'generated';
    (component as unknown as { sessionId: string }).sessionId = 'session-1';
    (component as any).cdr.markForCheck();
    fixture.detectChanges();
    const radios = fixture.nativeElement.querySelectorAll('input[type="radio"]');
    expect(radios.length).toBe(2);
    radios[1].click();
    fixture.detectChanges();
    expect(component.responses['mcq-1']).toBe('B');
    expect(fixture.nativeElement.querySelector('.mcq-option--selected')).toBeTruthy();
  });

  it('renders a full-width fill-blank input and keeps historical activities open response', () => {
    component.activities = [{ id: 'blank-1', questionType: 'fill_blank', skillId: 'GRAMMAR', category: 'Grammar',
      title: 'Complete the sentence', description: 'Enter the missing form.', evidence: 'The students is preparing.',
      task: 'The students ___ preparing.', tip: 'Match the plural subject.', checklist: ['Correct form', 'One answer'],
      difficulty: 'foundational', isDevelopmentPreview: false },
    { id: 'legacy-1', skillId: 'ORGANIZATION', category: 'Coherence & Flow', title: 'Legacy response',
      description: 'Revise the text.', evidence: 'Ideas.', task: 'Connect the ideas.', tip: 'Use a transition.',
      checklist: ['Clear', 'Connected'], difficulty: 'developing', isDevelopmentPreview: false }];
    component.state = 'generated';
    (component as any).cdr.markForCheck();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input.fill-blank-input')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('textarea')).toBeTruthy();
  });

  it('normalizes legacy question-type aliases by interaction type rather than skill', () => {
    const legacyActivities: AdaptivePracticeActivity[] = [
      { id: 'legacy-mcq', questionType: 'multiple_choice', skillId: 'GRAMMAR', category: 'Grammar',
        title: 'Choose', description: 'Choose.', evidence: 'Text.', task: 'Choose.', tip: 'Review.',
        checklist: ['One', 'Two'], options: [{ id: 'A', text: 'One' }, { id: 'B', text: 'Two' }],
        difficulty: 'foundational', isDevelopmentPreview: false },
      { id: 'legacy-blank', questionType: 'fillInBlank', skillId: 'ORGANIZATION', category: 'Coherence & Flow',
        title: 'Complete', description: 'Complete.', evidence: 'Text.', task: '___, continue.', tip: 'Connect.',
        checklist: ['One', 'Two'], difficulty: 'developing', isDevelopmentPreview: false },
      { id: 'legacy-rewrite', questionType: 'rewrite', skillId: 'VOCABULARY', category: 'Lexical Resource',
        title: 'Rewrite', description: 'Rewrite.', evidence: 'Text.', task: 'Rewrite.', tip: 'Be precise.',
        checklist: ['One', 'Two'], difficulty: 'proficient', isDevelopmentPreview: false }
    ];
    expect(legacyActivities.map(activity => component.questionType(activity)))
      .toEqual(['mcq', 'fill_blank', 'open_response']);
  });

  it('shows the existing-draft CTA only when practice is complete and teacher permission is enabled', () => {
    component.startGeneration();
    component.progress = { improvedActivities: 1, completedActivities: 1, totalActivities: 1,
      requiredActivityCount: 1, completed: true, percentage: 100, activities: [] };
    component.allowResubmission = false;
    (component as any).cdr.markForCheck();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Adaptive Practice Completed');
    expect(fixture.nativeElement.textContent).toContain('teacher has not enabled another draft yet');
    expect(fixture.nativeElement.querySelector('.completion-panel__cta')).toBeFalsy();

    const emitted = jasmine.createSpy('submitNewDraft');
    component.submitNewDraft.subscribe(emitted);
    component.allowResubmission = true;
    (component as any).cdr.markForCheck();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.completion-panel__cta').click();
    expect(emitted).toHaveBeenCalledTimes(1);
  });
});
