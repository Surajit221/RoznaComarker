import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { AdaptivePracticeApiService } from '../../../api/adaptive-practice-api.service';
import { AdaptiveWritingStudio } from './adaptive-writing-studio';
import type { AdaptivePracticeActivity, AdaptivePracticeAttempt, AdaptivePracticeCheckResponse, AdaptivePracticeSessionResponse, AdaptiveSkillScore } from './adaptive-writing-studio.types';
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
    correctionSourceHash: 'current-hash', evaluationSourceHash: 'current-hash',
    evaluationPolicyHash: 'policy-v1', evaluationRubricSourceHash: 'rubric-v1',
    assessmentVersion: 'assessment-v1', evaluationVersion: 'evaluation-v1',
    score: 85, hasValidCustomRubric: false } as CanonicalResultViewState;

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

  it('renders and restores three mixed questions with independent state', () => {
    const mixed: AdaptivePracticeSessionResponse = { ...ready, session: { ...ready.session!, activities: [{
      activityId: 'activity-mixed', skillId: 'GRAMMAR', category: 'Grammar', title: 'Agreement set',
      description: 'Recognize, complete, and produce.', evidence: 'The students is preparing.', difficulty: 'foundational',
      questions: [
        { questionId: 'q1', questionType: 'mcq', task: 'Choose the correct form.', tip: 'Match the subject.', checklist: ['Check subject', 'Check verb'], options: [{ id: 'A', text: 'is' }, { id: 'B', text: 'are' }] },
        { questionId: 'q2', questionType: 'fill_blank', task: 'The students ___ preparing.', tip: 'Use a plural verb.', checklist: ['Use one word', 'Match number'] },
        { questionId: 'q3', questionType: 'open_response', task: 'Rewrite the sentence correctly.', tip: 'Preserve meaning.', checklist: ['Correct agreement', 'Complete sentence'] }
      ]
    }] }, progress: { improvedActivities: 0, totalActivities: 1, totalQuestions: 3, completedQuestions: 1,
      percentage: 33, activities: [{ activityId: 'activity-mixed', attemptCount: 1, improved: false, bestScore: 33,
        latestScore: null, latestResponse: '', latestAttempt: null, questions: [
          { questionId: 'q1', attemptActivityId: 'activity-mixed::q1', attemptCount: 1, improved: true, bestScore: 100, latestScore: 100, latestResponse: 'B', latestAttempt: null },
          { questionId: 'q2', attemptActivityId: 'activity-mixed::q2', attemptCount: 0, improved: false, bestScore: null, latestScore: null, latestResponse: '', latestAttempt: null },
          { questionId: 'q3', attemptActivityId: 'activity-mixed::q3', attemptCount: 0, improved: false, bestScore: null, latestScore: null, latestResponse: '', latestAttempt: null }
        ] }] }, adaptiveSkills: adaptiveAnalysis };
    api.getSession.and.returnValue(of(mixed)); component.submissionId = 'submission-mixed'; fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.practice-question').length).toBe(3);
    expect(fixture.nativeElement.querySelectorAll('input[type="radio"]').length).toBe(2);
    expect(fixture.nativeElement.querySelectorAll('.fill-blank-input').length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('textarea').length).toBe(1);
    expect(component.responses['activity-mixed:q1']).toBe('B');
    component.updateResponse('activity-mixed:q2', 'are'); component.updateResponse('activity-mixed:q3', 'The students are preparing.');
    expect(component.responses).toEqual(jasmine.objectContaining({ 'activity-mixed:q1': 'B', 'activity-mixed:q2': 'are',
      'activity-mixed:q3': 'The students are preparing.' }));
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

  it('reloads once for a canonical evaluation identity change and ignores the older response', () => {
    const oldRequest = new Subject<AdaptivePracticeSessionResponse>();
    const currentRequest = new Subject<AdaptivePracticeSessionResponse>();
    api.getSession.calls.reset();
    api.getSession.and.returnValues(oldRequest.asObservable(), currentRequest.asObservable());

    component.canonicalResultState = { ...currentCanonical, evaluationPolicyHash: 'policy-v2' };
    component.canonicalResultState = { ...currentCanonical, evaluationPolicyHash: 'policy-v3' };
    oldRequest.next({ ...idle, sourceEvaluation: {
      correctionSourceHash: 'current-hash', evaluationSourceHash: 'current-hash',
      evaluationPolicyHash: 'policy-v2', evaluationRubricSourceHash: 'rubric-v1',
      assessmentVersion: 'assessment-v1', evaluationVersion: 'evaluation-v1', teacherOverride: false
    } });
    expect(component.normalizedSkills).toEqual([]);

    currentRequest.next({ ...idle, sourceEvaluation: {
      correctionSourceHash: 'current-hash', evaluationSourceHash: 'current-hash',
      evaluationPolicyHash: 'policy-v3', evaluationRubricSourceHash: 'rubric-v1',
      assessmentVersion: 'assessment-v1', evaluationVersion: 'evaluation-v1', teacherOverride: false
    } });
    expect(api.getSession).toHaveBeenCalledTimes(2);
    expect(component.normalizedSkills.map((skill) => skill.percentage)).toEqual([18, 13, 5, 100, 100]);
  });

  it('does not reload or change percentages when the same canonical identity is rendered again', () => {
    api.getSession.calls.reset();
    const before = component.normalizedSkills.map((skill) => skill.percentage);
    component.canonicalResultState = { ...currentCanonical, score: 84 };
    component.canonicalResultState = { ...currentCanonical, score: 83 };
    expect(api.getSession).not.toHaveBeenCalled();
    expect(component.normalizedSkills.map((skill) => skill.percentage)).toEqual(before);
  });

  it('reloads authoritative skills when teacher-edited rubric scores change under the same hashes', fakeAsync(() => {
    api.getSession.calls.reset();
    const teacherEdited: readonly AdaptiveSkillScore[] = [
      { id: 'task', label: 'Task Achievement', earnedPoints: 3.6, maximumPoints: 20 },
      { id: 'coherence', label: 'Coherence & Flow', earnedPoints: 4, maximumPoints: 20 },
      { id: 'lexical', label: 'Lexical Resource', earnedPoints: 1, maximumPoints: 20 },
      { id: 'grammar', label: 'Grammar', earnedPoints: 25, maximumPoints: 25 },
      { id: 'mechanics', label: 'Mechanics', earnedPoints: 10, maximumPoints: 10 }
    ];
    component.skills = teacherEdited;
    tick();
    expect(api.getSession).toHaveBeenCalledOnceWith('submission-1');
  }));

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
      expect(Array.from(studio.querySelectorAll('.skill-card__score')).map((node) => node.textContent?.trim()))
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

  for (const scenario of [
    { score: 85, expected: 'Great work', unexpected: 'still needs' },
    { score: 75, expected: 'overall essay still needs revision', unexpected: 'Great work' },
    { score: 55, expected: 'overall essay still needs improvement', unexpected: 'Great work' }
  ]) {
    it(`keeps no-weakness messaging consistent with an overall score of ${scenario.score}`, () => {
      const onTrack = adaptiveAnalysis.map((skill) => ({ ...skill, adaptivePercentage: 75,
        status: 'on-track' as const }));
      api.getSession.and.returnValue(of({ state: 'no-weaknesses', session: null, adaptiveSkills: onTrack }));
      component.canonicalResultState = { ...currentCanonical, score: scenario.score };
      component.submissionId = `submission-overall-${scenario.score}`;
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain(scenario.expected);
      expect(fixture.nativeElement.textContent).not.toContain(scenario.unexpected);
      expect(fixture.nativeElement.textContent).toContain('Lowest writing-skill diagnostic');
    });
  }

  it('explains the relationship between a custom overall rubric and writing skill scores', () => {
    const onTrack = adaptiveAnalysis.map((skill, index) => ({ ...skill,
      adaptivePercentage: [75, 80, 78, 82, 90][index], status: 'on-track' as const }));
    api.getSession.and.returnValue(of({ state: 'no-weaknesses', session: null, adaptiveSkills: onTrack }));
    component.canonicalResultState = { ...currentCanonical, score: 65, hasValidCustomRubric: true };
    component.submissionId = 'submission-custom-rubric';
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'Your overall grade follows the teacher’s rubric. Writing Skill Analysis uses the built-in writing-skill scores from the same evaluation.');
    expect(fixture.nativeElement.textContent).toContain('overall essay still needs revision');
    expect(component.normalizedSkills.map((skill) => skill.percentage)).toEqual([75, 80, 78, 82, 90]);
    expect(fixture.nativeElement.textContent).toContain('Writing Skill Analysis');
    expect(fixture.nativeElement.querySelectorAll('.skill-card__label').length).toBe(5);
  });

  it('keeps backend skill percentages stable when switching to a custom-rubric evaluation', () => {
    const expected = adaptiveAnalysis.map((skill, index) => ({ ...skill,
      adaptivePercentage: [75, 80, 85, 66, 95][index],
      status: ([75, 80, 85, 66, 95][index] < 70 ? 'needs-practice' : 'on-track') as 'needs-practice' | 'on-track'
    }));
    api.getSession.calls.reset();
    api.getSession.and.returnValues(
      of({ state: 'idle', session: null, adaptiveSkills: expected, sourceEvaluation: {
        correctionSourceHash: 'current-hash', evaluationSourceHash: 'current-hash',
        evaluationPolicyHash: 'policy-v1', evaluationRubricSourceHash: 'fixed-rubric',
        assessmentVersion: 'assessment-v1', evaluationVersion: 'evaluation-v1', teacherOverride: false
      } }),
      of({ state: 'idle', session: null, adaptiveSkills: expected, sourceEvaluation: {
        correctionSourceHash: 'current-hash', evaluationSourceHash: 'current-hash',
        evaluationPolicyHash: 'policy-v1', evaluationRubricSourceHash: 'custom-rubric',
        assessmentVersion: 'assessment-v1', evaluationVersion: 'evaluation-v1', teacherOverride: false
      } })
    );

    component.canonicalResultState = { ...currentCanonical, evaluationRubricSourceHash: 'fixed-rubric' };
    expect(component.normalizedSkills.map((skill) => skill.percentage)).toEqual([75, 80, 85, 66, 95]);
    component.canonicalResultState = { ...currentCanonical, evaluationRubricSourceHash: 'custom-rubric',
      hasValidCustomRubric: true, score: 65 };
    fixture.detectChanges();
    expect(api.getSession).toHaveBeenCalledTimes(2);
    expect(component.normalizedSkills.map((skill) => skill.percentage)).toEqual([75, 80, 85, 66, 95]);
    expect(component.normalizedSkills.find((skill) => skill.id === 'grammar')).toEqual(jasmine.objectContaining({
      percentage: 66, status: 'needs-practice', statusLabel: 'Needs practice'
    }));
  });

  it('restores the confirmed QA percentages after browser refresh and panel reopen', () => {
    const percentages = [75, 80, 85, 66, 95];
    const qaSkills = adaptiveAnalysis.map((skill, index) => ({ ...skill,
      adaptivePercentage: percentages[index],
      status: (percentages[index] < 70 ? 'needs-practice' : 'on-track') as 'needs-practice' | 'on-track'
    }));
    const customCanonical = { ...currentCanonical, evaluationRubricSourceHash: 'custom-rubric',
      hasValidCustomRubric: true, score: 58 };
    const response = { state: 'idle', session: null, adaptiveSkills: qaSkills, sourceEvaluation: {
      correctionSourceHash: 'current-hash', evaluationSourceHash: 'current-hash',
      evaluationPolicyHash: 'policy-v1', evaluationRubricSourceHash: 'custom-rubric',
      assessmentVersion: 'assessment-v1', evaluationVersion: 'evaluation-v1', teacherOverride: false
    } } as AdaptivePracticeSessionResponse;
    api.getSession.calls.reset();
    api.getSession.and.returnValue(of(response));

    fixture.destroy();
    fixture = TestBed.createComponent(AdaptiveWritingStudio);
    component = fixture.componentInstance;
    component.skills = skills;
    component.canonicalResultState = customCanonical;
    component.submissionId = 'submission-1';
    fixture.detectChanges();
    expect(component.normalizedSkills.map((skill) => skill.percentage)).toEqual(percentages);

    component.submissionId = '';
    component.submissionId = 'submission-1';
    fixture.detectChanges();
    expect(api.getSession).toHaveBeenCalledTimes(2);
    expect(component.normalizedSkills.map((skill) => skill.percentage)).toEqual(percentages);
    expect(component.normalizedSkills.find((skill) => skill.id === 'grammar')?.status).toBe('needs-practice');
  });

  it('preserves a below-threshold skill while the overall essay needs revision', () => {
    const oneWeakSkill = adaptiveAnalysis.map((skill) => skill.skillId === 'ORGANIZATION'
      ? { ...skill, adaptivePercentage: 62, status: 'needs-practice' as const }
      : { ...skill, adaptivePercentage: 75, status: 'on-track' as const });
    api.getSession.and.returnValue(of({ state: 'idle', session: null, adaptiveSkills: oneWeakSkill }));
    component.canonicalResultState = { ...currentCanonical, score: 75 };
    component.submissionId = 'submission-one-weak-skill';
    fixture.detectChanges();
    expect(component.normalizedSkills.find((skill) => skill.id === 'coherence')).toEqual(jasmine.objectContaining({
      percentage: 62, status: 'needs-practice'
    }));
    expect(component.canGenerate).toBeTrue();
    expect(fixture.nativeElement.textContent).not.toContain('Great work');
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
    expect(api.checkResponse).toHaveBeenCalledWith('session-1', 'activity-1', 'legacy-q1', 'However, the ideas connect.', false);
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

  it('uses the legacy activity key consistently from checking through polling', fakeAsync(() => {
    const response = 'However, the legacy ideas connect clearly.';
    const polledAttempt: AdaptivePracticeAttempt = { _id: 'legacy-ready', activityId: 'activity-1',
      attemptNumber: 1, status: 'ready', response, result: { score: 78, passed: true,
        summary: 'Clear improvement.', strength: 'Ideas connect.', nextImprovement: 'Keep the transition precise.',
        checklist: [{ item: 'Clear links', met: true, feedback: 'Present.' }, { item: 'Smooth flow', met: true, feedback: 'Present.' }],
        suggestedRevision: response, scoring: { taskFulfillment: 24, targetSkillApplication: 38, checklistCompletion: 16 } } };
    api.checkResponse.and.returnValue(of({ state: 'checking', reused: false,
      attempt: { _id: 'legacy-checking', activityId: 'activity-1', attemptNumber: 1, status: 'checking', response },
      progress: ready.progress! }));
    api.getAttempts.and.returnValue(of({ attempts: [polledAttempt], progress: {
      improvedActivities: 1, totalActivities: 1, completed: true, percentage: 100,
      activities: [{ activityId: 'activity-1', attemptCount: 1, improved: true, bestScore: 78,
        latestScore: 78, latestResponse: response, latestAttempt: polledAttempt }]
    } }));
    component.startGeneration(); component.updateResponse('activity-1', response); component.check(component.activities[0]);
    expect(component.checkStates['activity-1']).toBe('checking');
    tick(1500); fixture.detectChanges();
    expect(api.getAttempts).toHaveBeenCalledWith('session-1', 'activity-1', 'legacy-q1');
    expect(component.checkStates['activity-1']).toBe('ready');
    expect(component.attempts['activity-1']?.result?.score).toBe(78);
    expect(component.checkStates['activity-1:legacy-q1']).toBeUndefined();
    expect(component.attempts['activity-1:legacy-q1']).toBeUndefined();
    expect(fixture.nativeElement.textContent).toContain('Clear improvement.');
  }));

  it('keeps new multi-question polling state independent', fakeAsync(() => {
    const activity: AdaptivePracticeActivity = { id: 'abc', skillId: 'GRAMMAR', category: 'Grammar', title: 'Set',
      description: 'Three questions.', evidence: 'The students is preparing.', difficulty: 'foundational', isDevelopmentPreview: false,
      questions: [
        { id: 'q1', questionType: 'open_response', task: 'Rewrite it.', tip: 'Match agreement.', checklist: ['Subject', 'Verb'] },
        { id: 'q2', questionType: 'fill_blank', task: 'Students ___ ready.', tip: 'Use are.', checklist: ['Plural', 'Verb'] },
        { id: 'q3', questionType: 'mcq', task: 'Choose.', tip: 'Match.', checklist: ['Subject', 'Verb'], options: [{ id: 'A', text: 'is' }, { id: 'B', text: 'are' }] }
      ] };
    const response = 'The students are preparing.';
    const polledAttempt: AdaptivePracticeAttempt = { _id: 'q1-ready', activityId: 'abc::q1', questionId: 'q1',
      attemptNumber: 1, status: 'ready', response, result: { score: 80, passed: true, summary: 'Corrected.',
        strength: 'Agreement is correct.', nextImprovement: 'Continue.', checklist: [], suggestedRevision: response,
        scoring: { taskFulfillment: 24, targetSkillApplication: 40, checklistCompletion: 16 } } };
    component.activities = [activity]; component.state = 'generated';
    (component as unknown as { sessionId: string }).sessionId = 'session-1';
    component.updateResponse('abc:q1', response); component.updateResponse('abc:q2', 'are');
    api.checkResponse.and.returnValue(of({ state: 'checking', reused: false,
      attempt: { _id: 'q1-checking', activityId: 'abc::q1', questionId: 'q1', attemptNumber: 1, status: 'checking', response },
      progress: { improvedActivities: 0, totalActivities: 1, percentage: 0, activities: [] } }));
    api.getAttempts.and.returnValue(of({ attempts: [polledAttempt], progress: {
      improvedActivities: 0, totalActivities: 1, totalQuestions: 3, completedQuestions: 1, percentage: 33,
      activities: [{ activityId: 'abc', attemptCount: 1, improved: false, bestScore: 27, latestScore: null,
        latestResponse: '', latestAttempt: null, questions: [
          { questionId: 'q1', attemptActivityId: 'abc::q1', attemptCount: 1, improved: true, bestScore: 80, latestScore: 80, latestResponse: response, latestAttempt: polledAttempt },
          { questionId: 'q2', attemptActivityId: 'abc::q2', attemptCount: 0, improved: false, bestScore: null, latestScore: null, latestResponse: '', latestAttempt: null },
          { questionId: 'q3', attemptActivityId: 'abc::q3', attemptCount: 0, improved: false, bestScore: null, latestScore: null, latestResponse: '', latestAttempt: null }
        ] }]
    } }));
    component.check(activity, activity.questions![0]); tick(1500);
    expect(component.checkStates['abc:q1']).toBe('ready');
    expect(component.responses['abc:q2']).toBe('are');
    expect(component.attempts['abc:q2']).toBeUndefined();
    expect(component.checkStates['abc']).toBeUndefined();
    expect(api.getAttempts).toHaveBeenCalledWith('session-1', 'abc', 'q1');
  }));

  it('renders accessible single-select MCQ options and submits the selected option id', () => {
    component.activities = [{ id: 'mcq-1', questionType: 'mcq', skillId: 'GRAMMAR', category: 'Grammar',
      title: 'Agreement', description: 'Choose the correct form.', evidence: 'The students is preparing.',
      task: 'Which verb is correct?', tip: 'Match the plural subject.', checklist: ['Plural subject', 'Correct verb'],
      options: [{ id: 'A', text: 'is' }, { id: 'B', text: 'are' }], difficulty: 'foundational', isDevelopmentPreview: false }];
    component.state = 'generated';
    (component as unknown as { sessionId: string }).sessionId = 'session-1';
    (component as unknown as { cdr: { markForCheck(): void } }).cdr.markForCheck();
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
    (component as unknown as { cdr: { markForCheck(): void } }).cdr.markForCheck();
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
    (component as unknown as { cdr: { markForCheck(): void } }).cdr.markForCheck();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Adaptive Practice Completed');
    expect(fixture.nativeElement.textContent).toContain('teacher has not enabled another draft yet');
    expect(fixture.nativeElement.querySelector('.completion-panel__cta')).toBeFalsy();

    const emitted = jasmine.createSpy('submitNewDraft');
    component.submitNewDraft.subscribe(emitted);
    component.allowResubmission = true;
    (component as unknown as { cdr: { markForCheck(): void } }).cdr.markForCheck();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.completion-panel__cta').click();
    expect(emitted).toHaveBeenCalledTimes(1);
  });
});
