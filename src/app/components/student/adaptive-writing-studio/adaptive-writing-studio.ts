import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Subscription } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AdaptivePracticeApiService, type AdaptivePracticeLifecycleCode } from '../../../api/adaptive-practice-api.service';
import { DEVELOPMENT_ADAPTIVE_PRACTICE_FIXTURE, DEVELOPMENT_GENERATION_DELAY_MS } from './adaptive-writing-studio.fixture';
import {
  ADAPTIVE_PRACTICE_THRESHOLD,
  type AdaptivePracticeAction,
  type AdaptivePracticeActivity,
  type AdaptivePracticeQuestion,
  type AdaptivePracticeAttempt,
  type AdaptivePracticeProgress,
  type AdaptiveCanonicalQuestionType,
  type AdaptivePracticeSessionResponse,
  type AdaptiveSourceEvaluation,
  type AdaptiveLearningSkill,
  type AdaptiveEligibilityReason,
  type AdaptiveSkillScore,
  type AdaptiveSkillStatus,
  type AdaptiveStudioState,
  type NormalizedAdaptiveSkill
} from './adaptive-writing-studio.types';
import type { CanonicalResultViewState } from '../../../utils/canonical-result-state.util';

@Component({
  selector: 'app-adaptive-writing-studio',
  imports: [CommonModule],
  templateUrl: './adaptive-writing-studio.html',
  styleUrl: './adaptive-writing-studio.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdaptiveWritingStudio {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly api = inject(AdaptivePracticeApiService);
  private requestSubscription: Subscription | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private requestVersion = 0;
  private submissionIdValue = '';
  private pollAttempts = 0;
  private sessionId = '';
  private readonly checkSubscriptions = new Map<string, Subscription>();
  private readonly checkPollTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly checkPollCounts = new Map<string, number>();
  private readonly checkRequestVersions = new Map<string, number>();
  private analysisRecoveryPending = false;
  private canonicalUsableKey = '';
  private hasAuthoritativeAdaptiveSkills = false;

  @Input({ required: true }) set submissionId(value: string | null | undefined) {
    const next = typeof value === 'string' ? value.trim() : '';
    if (next === this.submissionIdValue) return;
    this.submissionIdValue = next;
    this.resetForSubmission();
    if (next) this.loadExistingSession();
  }
  get submissionId(): string { return this.submissionIdValue; }

  @Input() previewEnabled = environment.adaptivePracticeFixtureEnabled;
  @Input() allowResubmission = false;

  @Input() set skills(value: readonly AdaptiveSkillScore[] | null | undefined) {
    const list = Array.isArray(value) ? value : [];
    const normalized = list.map((skill) => this.normalizeSkill(skill));
    if (this.hasAuthoritativeAdaptiveSkills) {
      const comparable = normalized.length === this.normalizedSkills.length
        && normalized.length > 0 && normalized.every((skill) => skill.percentage !== null);
      const changed = comparable && normalized.some((skill, index) =>
        skill.id !== this.normalizedSkills[index]?.id || skill.percentage !== this.normalizedSkills[index]?.percentage);
      if (!changed) return;
      const identity = this.canonicalUsableKey;
      this.resetForCanonicalEvaluation();
      this.canonicalUsableKey = identity;
      this.normalizedSkills = normalized;
      this.weakSkills = normalized.filter((skill) => skill.percentage !== null
        && skill.percentage < ADAPTIVE_PRACTICE_THRESHOLD);
      this.state = this.skillSummaryState();
      queueMicrotask(() => {
        if (identity === this.canonicalUsableKey && !this.hasAuthoritativeAdaptiveSkills
          && this.submissionId && this.isCanonicalUsable(this.canonicalResultState)) this.loadExistingSession();
      });
      this.cdr.markForCheck();
      return;
    }
    this.normalizedSkills = normalized;
    this.weakSkills = this.normalizedSkills.filter((skill) => skill.percentage !== null && skill.percentage < ADAPTIVE_PRACTICE_THRESHOLD);
    if ((this.state === 'idle' || this.state === 'unassessed') && !this.activities.length) this.state = this.skillSummaryState();
    this.cdr.markForCheck();
  }

  @Input() set canonicalResultState(value: CanonicalResultViewState | null) {
    this._canonicalResultState = value;
    const usableKey = this.getCanonicalUsableKey(value);
    const previousKey = this.canonicalUsableKey;
    const identityChanged = Boolean(previousKey && usableKey !== previousKey);
    const becameUsable = Boolean(usableKey && usableKey !== previousKey);
    if (identityChanged) {
      const wasPermanentFailure = this.state === 'error' && !this.retryableFailure && !this.analysisRecoveryPending;
      this.resetForCanonicalEvaluation();
      this.canonicalUsableKey = usableKey;
      if (usableKey && this.submissionId) this.loadExistingSession();
      else if (value && (value.processingActive || ['pending', 'processing'].includes(value.evaluationStatus))) {
        this.state = 'waiting_for_analysis';
        this.analysisRecoveryPending = !wasPermanentFailure;
      }
      this.cdr.markForCheck();
      return;
    }
    this.canonicalUsableKey = usableKey;
    if (becameUsable && this.analysisRecoveryPending
      && (this.state === 'waiting_for_analysis' || this.state === 'error')) {
      this.analysisRecoveryPending = false;
      this.loadExistingSession();
    }
    this.cdr.markForCheck();
  }
  get canonicalResultState(): CanonicalResultViewState | null { return this._canonicalResultState; }
  private _canonicalResultState: CanonicalResultViewState | null = null;

  @Output() readonly generatePractice = new EventEmitter<string>();
  @Output() readonly checkPractice = new EventEmitter<AdaptivePracticeAction>();
  @Output() readonly retryPractice = new EventEmitter<string>();
  @Output() readonly showModelAnswer = new EventEmitter<AdaptivePracticeAction>();
  @Output() readonly submitNewDraft = new EventEmitter<void>();

  normalizedSkills: readonly NormalizedAdaptiveSkill[] = [];
  weakSkills: readonly NormalizedAdaptiveSkill[] = [];
  activities: readonly AdaptivePracticeActivity[] = [];
  state: AdaptiveStudioState = 'idle';
  errorMessage = '';
  private retryableFailure = false;
  responses: Readonly<Record<string, string>> = {};
  expandedModels: ReadonlySet<string> = new Set<string>();
  pendingMessages: Readonly<Record<string, string>> = {};
  checkStates: Readonly<Record<string, 'idle' | 'checking' | 'ready' | 'error'>> = {};
  attempts: Readonly<Record<string, AdaptivePracticeAttempt>> = {};
  checkErrors: Readonly<Record<string, string>> = {};
  progress: AdaptivePracticeProgress = { improvedActivities: 0, totalActivities: 0, percentage: 0, activities: [] };

  constructor() {
    this.destroyRef.onDestroy(() => this.cancelAsyncWork());
  }

  get progressPercentage(): number {
    return this.progress.percentage;
  }

  get practiceCompleted(): boolean {
    return this.progress.completed === true
      || (this.progress.totalActivities > 0 && this.progress.improvedActivities >= this.progress.totalActivities);
  }

  get assessedSkillCount(): number { return this.normalizedSkills.filter((skill) => skill.percentage !== null).length; }
  get lowestAssessedSkill(): NormalizedAdaptiveSkill | null {
    return this.normalizedSkills.filter((skill) => skill.percentage !== null)
      .reduce<NormalizedAdaptiveSkill | null>((lowest, skill) =>
        !lowest || Number(skill.percentage) < Number(lowest.percentage) ? skill : lowest, null);
  }
  get noWeaknessMessage(): string {
    const rawScore = this.canonicalResultState?.score;
    const score = typeof rawScore === 'number' && Number.isFinite(rawScore) ? rawScore : null;
    if (score !== null && score < 60) {
      return 'Your individual writing skills are above the practice threshold, but the overall essay still needs improvement.';
    }
    if (score !== null && score < 80) {
      return 'Your individual writing skills are above the practice threshold, but the overall essay still needs revision.';
    }
    return 'Great work — all assessed writing skills are currently on track.';
  }
  get noWeaknessIsSuccess(): boolean {
    const score = this.canonicalResultState?.score;
    return typeof score !== 'number' || !Number.isFinite(score) || score >= 80;
  }
  get eligibilityReason(): AdaptiveEligibilityReason {
    const canonical = this.canonicalResultState;
    if (!this.submissionId) return 'NO_SUBMISSION';
    if (this.state === 'generating') return 'GENERATING';
    if (this.state === 'generated') return 'ALREADY_GENERATED';
    if (this.state === 'error') return this.retryableFailure ? 'RETRYABLE_FAILURE' : 'NON_RETRYABLE_FAILURE';
    if (this.state === 'no-weaknesses') return 'NO_WEAK_SKILLS';
    if (!canonical || canonical.processingActive || ['pending', 'processing'].includes(canonical.evaluationStatus)
      || ['pending', 'processing', 'retry_wait'].includes(canonical.semanticStatus)) return 'ANALYSIS_PROCESSING';
    if (canonical.semanticStatus === 'failed' || ['failed', 'blocked'].includes(canonical.evaluationStatus)) return 'SEMANTIC_FAILED';
    if (!canonical.correctionSourceHash || canonical.evaluationStatus !== 'completed'
      || canonical.evaluationSourceHash !== canonical.correctionSourceHash) return 'STALE_EVALUATION';
    if (!this.weakSkills.length) return 'NO_WEAK_SKILLS';
    return 'READY';
  }

  get eligibilityMessage(): string {
    return ({
      NO_SUBMISSION: 'A submission is required before practice can be generated.',
      ANALYSIS_PROCESSING: 'Practice will be available after writing analysis completes.',
      SEMANTIC_FAILED: 'Practice is unavailable because semantic writing analysis failed.',
      STALE_EVALUATION: 'Practice is unavailable until the evaluation matches the latest corrections.',
      NO_WEAK_SKILLS: this.assessedSkillCount
        ? (this.noWeaknessIsSuccess ? 'No weak skills currently require adaptive practice.'
          : 'Individual skill practice is not required at the current threshold; see the overall essay guidance below.')
        : 'No assessed skills are available yet.',
      READY: 'Your current writing analysis is ready for personalized practice.',
      GENERATING: 'A single practice generation job is in progress.',
      ALREADY_GENERATED: 'Your generated practice is ready below.',
      RETRYABLE_FAILURE: this.errorMessage || 'Generation failed temporarily. You can try again.',
      NON_RETRYABLE_FAILURE: this.errorMessage || 'Practice cannot be generated for this submission.'
    } satisfies Record<AdaptiveEligibilityReason, string>)[this.eligibilityReason];
  }

  get canGenerate(): boolean {
    return this.eligibilityReason === 'READY';
  }

  get generateLabel(): string {
    if (this.state === 'generating') return 'Generating Your Practice…';
    if (this.state === 'generated') return 'Continue Practice';
    return 'Generate Adaptive Practice';
  }

  get generationStatusMessage(): string {
    if (this.pollAttempts === 0) return 'Preparing your practice…';
    if (this.pollAttempts < 4) return 'Creating personalized activities…';
    return 'Finalizing your practice…';
  }

  startGeneration(): void {
    if (!this.canGenerate) return;
    this.generatePractice.emit(this.submissionId);
    if (this.previewEnabled) {
      this.runExplicitFixturePreview();
      return;
    }
    this.state = 'generating';
    this.retryableFailure = false;
    this.errorMessage = '';
    const version = ++this.requestVersion;
    this.requestSubscription?.unsubscribe();
    this.requestSubscription = this.api.generateSession(this.submissionId).subscribe({
      next: (response) => this.acceptResponse(version, response),
      error: (error: unknown) => this.acceptError(version, error)
    });
  }

  retry(): void {
    if (this.eligibilityReason !== 'RETRYABLE_FAILURE') return;
    this.retryPractice.emit(this.submissionId);
    this.state = 'generating';
    this.retryableFailure = false;
    const version = ++this.requestVersion;
    this.requestSubscription?.unsubscribe();
    this.requestSubscription = this.api.retryGeneration(this.submissionId).subscribe({
      next: (response) => this.acceptResponse(version, response),
      error: (error: unknown) => this.acceptError(version, error)
    });
  }

  questionKey(activity: AdaptivePracticeActivity, question: AdaptivePracticeQuestion): string {
    return this.stateKey(activity.id, question.id, question.id === 'legacy-q1');
  }
  activityQuestions(activity: AdaptivePracticeActivity): readonly AdaptivePracticeQuestion[] {
    return activity.questions?.length ? activity.questions : [{ id: 'legacy-q1', questionType: activity.questionType,
      task: activity.task || '', tip: activity.tip || '', checklist: activity.checklist || [],
      modelAnswer: activity.modelAnswer, options: activity.options }];
  }
  updateResponse(key: string, value: string): void { this.responses = { ...this.responses, [key]: value }; }
  questionType(question: AdaptivePracticeQuestion | AdaptivePracticeActivity): AdaptiveCanonicalQuestionType {
    const aliases: Record<string, AdaptiveCanonicalQuestionType> = {
      mcq: 'mcq', multiple_choice: 'mcq', multipleChoice: 'mcq',
      fill_blank: 'fill_blank', fillInBlank: 'fill_blank', fill_in_blank: 'fill_blank',
      open_response: 'open_response', written_response: 'open_response', writtenResponse: 'open_response', rewrite: 'open_response'
    };
    return aliases[String(question.questionType || '')] || 'open_response';
  }
  canCheck(activity: AdaptivePracticeActivity, question: AdaptivePracticeQuestion = this.activityQuestions(activity)[0]): boolean {
    const key = this.questionKey(activity, question); const response = (this.responses[key] || '').trim();
    return response.length >= (this.questionType(question) === 'open_response' ? 10 : 1)
      && this.checkStates[key] !== 'checking';
  }
  check(activity: AdaptivePracticeActivity, question: AdaptivePracticeQuestion = this.activityQuestions(activity)[0]): void {
    const key = this.questionKey(activity, question);
    this.checkPractice.emit({ submissionId: this.submissionId, activityId: activity.id, questionId: question.id, response: this.responses[key] || '' });
    this.runCheck(activity, question, false);
  }
  retryCheck(activity: AdaptivePracticeActivity, question: AdaptivePracticeQuestion = this.activityQuestions(activity)[0]): void { this.runCheck(activity, question, true); }
  bestPracticeScore(skillId: string): number | null {
    const rubricId = ({ task: 'CONTENT', coherence: 'ORGANIZATION', lexical: 'VOCABULARY', grammar: 'GRAMMAR', mechanics: 'MECHANICS' } as Record<string, string>)[skillId];
    const activity = this.activities.find((item) => item.skillId === rubricId);
    return activity ? this.progress.activities.find((item) => item.activityId === activity.id)?.bestScore ?? null : null;
  }
  toggleModel(activity: AdaptivePracticeActivity, question: AdaptivePracticeQuestion): void {
    const key = this.questionKey(activity, question);
    const next = new Set(this.expandedModels);
    if (next.has(key)) next.delete(key); else next.add(key);
    this.expandedModels = next;
    this.showModelAnswer.emit({ submissionId: this.submissionId, activityId: activity.id, questionId: question.id });
  }
  requestNewDraft(): void {
    if (this.practiceCompleted && this.allowResubmission) this.submitNewDraft.emit();
  }

  private loadExistingSession(): void {
    const version = ++this.requestVersion;
    if (!this.canonicalResultState) {
      this.state = 'waiting_for_analysis';
      this.analysisRecoveryPending = true;
      this.errorMessage = '';
      this.cdr.markForCheck();
      return;
    }

    // Check if canonical analysis is complete before calling adaptive API
    if (this.canonicalResultState) {
      const isProcessing = this.canonicalResultState.processingActive;
      const evaluationStatus = this.canonicalResultState.evaluationStatus;
      const semanticStatus = this.canonicalResultState.semanticStatus;
      
      // If analysis is still processing, show waiting state instead of calling API
      if (isProcessing || evaluationStatus === 'processing' || evaluationStatus === 'pending'
        || semanticStatus === 'processing' || semanticStatus === 'pending' || semanticStatus === 'retry_wait') {
        this.state = 'waiting_for_analysis';
        this.analysisRecoveryPending = true;
        this.errorMessage = '';
        this.cdr.markForCheck();
        return;
      }
      
      // If semantic analysis failed, show error state
      if (semanticStatus === 'failed' || ['failed', 'blocked', 'stale'].includes(evaluationStatus)) {
        this.state = 'error';
        this.errorMessage = 'Adaptive practice is unavailable because writing analysis failed. Please retry the analysis.';
        this.cdr.markForCheck();
        return;
      }
    }
    
    this.requestSubscription?.unsubscribe();
    this.requestSubscription = this.api.getSession(this.submissionId).subscribe({
      next: (response) => this.acceptResponse(version, response),
      error: (error: unknown) => this.acceptError(version, error)
    });
  }

  private acceptResponse(version: number, response: AdaptivePracticeSessionResponse): void {
    if (version !== this.requestVersion) return;
    if (response.sourceEvaluation && !this.responseMatchesCanonical(response.sourceEvaluation)) {
      this.state = 'waiting_for_analysis';
      this.analysisRecoveryPending = true;
      this.errorMessage = '';
      this.cdr.markForCheck();
      return;
    }
    this.applyAdaptiveSkills(response.adaptiveSkills);
    if (response.state === 'ready' && response.session) {
      this.sessionId = response.session._id;
      this.activities = response.session.activities.map((activity) => {
        const questions = activity.questions?.length ? activity.questions.map((question) => ({ ...question,
          id: question.questionId })) : undefined;
        return { ...activity, id: activity.activityId, questions, isDevelopmentPreview: false };
      });
      this.applyProgress(response.progress);
      this.state = 'generated';
      this.retryableFailure = false;
    } else if (response.state === 'generating') {
      this.state = 'generating';
      this.schedulePoll(version);
    } else if (response.state === 'failed') {
      this.state = 'error';
      this.retryableFailure = true;
      this.errorMessage = response.session?.generation?.errorMessage || 'Adaptive practice could not be generated. Please try again.';
    } else if (response.state === 'no-weaknesses') {
      this.state = 'no-weaknesses';
    } else {
      this.state = this.skillSummaryState();
    }
    this.cdr.markForCheck();
  }

  private schedulePoll(version: number): void {
    this.clearTimer();
    if (++this.pollAttempts > 24) {
      this.state = 'error';
      this.errorMessage = 'Practice generation is taking longer than expected. Please try again.';
      return;
    }
    this.timer = setTimeout(() => {
      if (version !== this.requestVersion) return;
      this.requestSubscription = this.api.getSession(this.submissionId).subscribe({
        next: (response) => this.acceptResponse(version, response),
        error: (error: unknown) => this.acceptError(version, error)
      });
    }, 2500);
  }

  private acceptError(version: number, error: unknown): void {
    if (version !== this.requestVersion) return;
    const value = error as { status?: number; code?: string; error?: { code?: string; message?: string } };
    const code = value?.code || value?.error?.code;
    if (value?.status === 202 && this.isAnalysisLifecycleCode(code)) {
      this.state = 'waiting_for_analysis';
      this.analysisRecoveryPending = true;
      this.errorMessage = '';
    } else {
      this.state = 'error';
      this.errorMessage = value?.error?.message || 'Adaptive practice is temporarily unavailable.';
      this.retryableFailure = value?.status === 429 || !value?.status || value.status >= 500;
      this.analysisRecoveryPending = this.retryableFailure && !this.isCanonicalUsable(this.canonicalResultState);
    }
    this.cdr.markForCheck();
  }

  private runExplicitFixturePreview(): void {
    this.state = 'generating';
    this.clearTimer();
    this.timer = setTimeout(() => {
      const weakIds = new Set(this.weakSkills.map((skill) => ({ coherence: 'ORGANIZATION', lexical: 'VOCABULARY', task: 'CONTENT', grammar: 'GRAMMAR', mechanics: 'MECHANICS' }[skill.id])));
      this.activities = DEVELOPMENT_ADAPTIVE_PRACTICE_FIXTURE.filter((activity) => weakIds.has(activity.skillId));
      this.state = this.activities.length ? 'generated' : 'error';
      if (!this.activities.length) this.errorMessage = 'Fixture preview has no activity for these skills.';
      this.cdr.markForCheck();
    }, DEVELOPMENT_GENERATION_DELAY_MS);
  }

  private resetForSubmission(): void {
    this.cancelAsyncWork();
    this.requestVersion++;
    this.pollAttempts = 0;
    this.activities = [];
    this.hasAuthoritativeAdaptiveSkills = false;
    this.normalizedSkills = [];
    this.weakSkills = [];
    this.sessionId = '';
    this.responses = {};
    this.expandedModels = new Set<string>();
    this.pendingMessages = {};
    this.checkStates = {};
    this.attempts = {};
    this.checkErrors = {};
    this.progress = { improvedActivities: 0, totalActivities: 0, completed: false, percentage: 0, activities: [] };
    this.errorMessage = '';
    this.retryableFailure = false;
    this.analysisRecoveryPending = false;
    this.canonicalUsableKey = this.getCanonicalUsableKey(this.canonicalResultState);
    this.state = this.skillSummaryState();
  }

  private resetForCanonicalEvaluation(): void {
    this.cancelAsyncWork();
    this.requestVersion++;
    this.pollAttempts = 0;
    this.activities = [];
    this.hasAuthoritativeAdaptiveSkills = false;
    this.normalizedSkills = [];
    this.weakSkills = [];
    this.sessionId = '';
    this.responses = {};
    this.expandedModels = new Set<string>();
    this.pendingMessages = {};
    this.checkStates = {};
    this.attempts = {};
    this.checkErrors = {};
    this.progress = { improvedActivities: 0, totalActivities: 0, completed: false, percentage: 0, activities: [] };
    this.errorMessage = '';
    this.retryableFailure = false;
    this.analysisRecoveryPending = false;
    this.state = 'unassessed';
  }
  private cancelAsyncWork(): void { this.requestSubscription?.unsubscribe(); this.requestSubscription = null; this.checkSubscriptions.forEach((subscription) => subscription.unsubscribe()); this.checkSubscriptions.clear(); this.checkPollTimers.forEach((timer) => clearTimeout(timer)); this.checkPollTimers.clear(); this.checkPollCounts.clear(); this.checkRequestVersions.clear(); this.clearTimer(); }
  private clearTimer(): void { if (this.timer !== null) clearTimeout(this.timer); this.timer = null; }

  private isCanonicalUsable(value: CanonicalResultViewState | null): boolean {
    return Boolean(this.getCanonicalUsableKey(value));
  }

  private getCanonicalUsableKey(value: CanonicalResultViewState | null): string {
    return value && !value.processingActive && value.semanticStatus === 'completed'
      && value.evaluationStatus === 'completed' && value.correctionSourceHash
      && value.evaluationSourceHash === value.correctionSourceHash
      ? JSON.stringify([
        value.submissionId || this.submissionId, value.correctionSourceHash, value.evaluationSourceHash,
        value.evaluationPolicyHash || '', value.evaluationRubricSourceHash || '',
        value.assessmentVersion || '', value.evaluationVersion || '', value.teacherOverride === true
      ]) : '';
  }

  private responseMatchesCanonical(source: AdaptiveSourceEvaluation): boolean {
    const canonical = this.canonicalResultState;
    if (!canonical) return false;
    const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
    return text(source.correctionSourceHash) === text(canonical.correctionSourceHash)
      && text(source.evaluationSourceHash) === text(canonical.evaluationSourceHash)
      && text(source.evaluationPolicyHash) === text(canonical.evaluationPolicyHash)
      && text(source.evaluationRubricSourceHash) === text(canonical.evaluationRubricSourceHash)
      && text(source.assessmentVersion) === text(canonical.assessmentVersion)
      && text(source.evaluationVersion) === text(canonical.evaluationVersion)
      && source.teacherOverride === (canonical.teacherOverride === true);
  }

  private isAnalysisLifecycleCode(code: unknown): code is AdaptivePracticeLifecycleCode {
    return code === 'ANALYSIS_INCOMPLETE' || code === 'RUBRIC_NOT_AVAILABLE' || code === 'ANALYSIS_PROCESSING';
  }

  private normalizeSkill(skill: AdaptiveSkillScore): NormalizedAdaptiveSkill {
    const earned = Number(skill.earnedPoints);
    const maximum = Number(skill.maximumPoints);
    const valid = skill.earnedPoints !== null && skill.maximumPoints !== null && Number.isFinite(earned) && earned >= 0 && Number.isFinite(maximum) && maximum > 0;
    const percentage = valid ? Math.round(Math.min(100, Math.max(0, earned / maximum * 100))) : null;
    const status: AdaptiveSkillStatus = percentage === null ? 'not-assessed' : percentage < 50 ? 'priority' : percentage < ADAPTIVE_PRACTICE_THRESHOLD ? 'needs-practice' : 'on-track';
    const labels: Record<AdaptiveSkillStatus, string> = { priority: 'Priority practice', 'needs-practice': 'Needs practice', 'on-track': 'On track', 'not-assessed': 'Not assessed' };
    return { ...skill, percentage, status, statusLabel: labels[status] };
  }

  private applyAdaptiveSkills(skills: readonly AdaptiveLearningSkill[] | undefined): void {
    if (!Array.isArray(skills)) return;
    const safeSkills = skills as readonly AdaptiveLearningSkill[];
    const ids: Record<string, AdaptiveSkillScore['id']> = {
      CONTENT: 'task', ORGANIZATION: 'coherence', VOCABULARY: 'lexical', GRAMMAR: 'grammar', MECHANICS: 'mechanics'
    };
    const labels: Record<AdaptiveSkillStatus, string> = { priority: 'Priority practice', 'needs-practice': 'Needs practice', 'on-track': 'On track', 'not-assessed': 'Not assessed' };
    const normalizedSkills = safeSkills.flatMap((skill) => {
      const id = ids[skill.skillId];
      const percentage = Number(skill.adaptivePercentage);
      if (!id || !Number.isFinite(percentage) || percentage < 0 || percentage > 100
        || !['priority', 'needs-practice', 'on-track'].includes(skill.status)) return [];
      return [{ id, label: skill.skillLabel, earnedPoints: null, maximumPoints: null, percentage,
        status: skill.status, statusLabel: labels[skill.status] }];
    });
    if (normalizedSkills.length !== safeSkills.length) return;
    this.hasAuthoritativeAdaptiveSkills = true;
    this.normalizedSkills = normalizedSkills;
    this.weakSkills = normalizedSkills.filter((skill) => skill.percentage !== null
      && skill.percentage < ADAPTIVE_PRACTICE_THRESHOLD);
  }

  private skillSummaryState(): 'idle' | 'no-weaknesses' | 'unassessed' {
    if (this.weakSkills.length) return 'idle';
    return this.assessedSkillCount > 0 ? 'no-weaknesses' : 'unassessed';
  }

  private runCheck(activity: AdaptivePracticeActivity, question: AdaptivePracticeQuestion, retry: boolean): void {
    const key = this.questionKey(activity, question); const response = (this.responses[key] || '').trim();
    if (!this.sessionId || !this.canCheck(activity, question)) return;
    const requestVersion = (this.checkRequestVersions.get(key) || 0) + 1;
    this.checkRequestVersions.set(key, requestVersion);
    this.checkStates = { ...this.checkStates, [key]: 'checking' };
    this.checkErrors = { ...this.checkErrors, [key]: '' };
    this.checkSubscriptions.get(key)?.unsubscribe();
    const subscription = this.api.checkResponse(this.sessionId, activity.id, question.id, response, retry).subscribe({
      next: (result) => {
        if (this.checkRequestVersions.get(key) !== requestVersion || (this.responses[key] || '').trim() !== response) {
          this.checkStates = { ...this.checkStates, [key]: 'idle' };
          this.cdr.markForCheck();
          return;
        }
        this.attempts = { ...this.attempts, [key]: result.attempt };
        this.checkStates = { ...this.checkStates, [key]: result.state === 'ready' ? 'ready' : result.state === 'failed' ? 'error' : 'checking' };
        this.applyProgress(result.progress);
        if (result.state === 'checking') this.scheduleCheckPoll(activity.id, question.id, question.id === 'legacy-q1');
        this.cdr.markForCheck();
      },
      error: (error: unknown) => {
        if (this.checkRequestVersions.get(key) !== requestVersion) return;
        const value = error as { error?: { message?: string } };
        this.checkStates = { ...this.checkStates, [key]: 'error' };
        this.checkErrors = { ...this.checkErrors, [key]: value?.error?.message || 'Your response could not be checked. Please try again.' };
        this.cdr.markForCheck();
      }
    });
    this.checkSubscriptions.set(key, subscription);
  }

  private applyProgress(progress?: AdaptivePracticeProgress): void {
    if (!progress) return;
    this.progress = progress;
    const responses = { ...this.responses };
    const attempts = { ...this.attempts };
    const states = { ...this.checkStates };
    progress.activities.forEach((item) => {
      const questionProgress = item.questions?.length ? item.questions : [{ questionId: 'legacy-q1', latestResponse: item.latestResponse, latestAttempt: item.latestAttempt }];
      questionProgress.forEach((question) => { const activity = this.activities.find((candidate) => candidate.id === item.activityId);
        const key = activity ? this.questionKey(activity, this.activityQuestions(activity)
          .find((candidate) => candidate.id === question.questionId) || this.activityQuestions(activity)[0]) : `${item.activityId}:${question.questionId}`;
        if (question.latestResponse) responses[key] = question.latestResponse;
        if (question.latestAttempt) { attempts[key] = question.latestAttempt; states[key] = 'ready'; }
      });
    });
    this.responses = responses;
    this.attempts = attempts;
    this.checkStates = states;
  }

  private stateKey(activityId: string, questionId: string, isLegacy: boolean): string {
    return isLegacy ? activityId : `${activityId}:${questionId}`;
  }

  private scheduleCheckPoll(activityId: string, questionId: string, isLegacy: boolean): void {
    const key = this.stateKey(activityId, questionId, isLegacy); const count = (this.checkPollCounts.get(key) || 0) + 1;
    this.checkPollCounts.set(key, count);
    if (count > 20) {
      this.checkStates = { ...this.checkStates, [key]: 'error' };
      this.checkErrors = { ...this.checkErrors, [key]: 'Checking is taking longer than expected. Please try again.' };
      return;
    }
    const timer = setTimeout(() => {
      const subscription = this.api.getAttempts(this.sessionId, activityId, questionId).subscribe({
        next: (result) => {
          const latest = result.attempts.at(-1);
          this.applyProgress(result.progress);
          if (latest?.status === 'ready') { this.attempts = { ...this.attempts, [key]: latest }; this.checkStates = { ...this.checkStates, [key]: 'ready' }; this.checkPollCounts.delete(key); }
          else if (latest?.status === 'failed') { this.checkStates = { ...this.checkStates, [key]: 'error' }; this.checkErrors = { ...this.checkErrors, [key]: latest.checking?.errorMessage || 'Your response could not be checked. Please try again.' }; }
          else this.scheduleCheckPoll(activityId, questionId, isLegacy);
          this.cdr.markForCheck();
        },
        error: () => { this.checkStates = { ...this.checkStates, [key]: 'error' }; this.checkErrors = { ...this.checkErrors, [key]: 'Checking status could not be loaded. Please try again.' }; this.cdr.markForCheck(); }
      });
      this.checkSubscriptions.set(key, subscription);
    }, 1500);
    this.checkPollTimers.set(key, timer);
  }
}
