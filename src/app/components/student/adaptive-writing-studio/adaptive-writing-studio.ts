import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Subscription } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AdaptivePracticeApiService } from '../../../api/adaptive-practice-api.service';
import { DEVELOPMENT_ADAPTIVE_PRACTICE_FIXTURE, DEVELOPMENT_GENERATION_DELAY_MS } from './adaptive-writing-studio.fixture';
import {
  ADAPTIVE_PRACTICE_THRESHOLD,
  type AdaptivePracticeAction,
  type AdaptivePracticeActivity,
  type AdaptivePracticeAttempt,
  type AdaptivePracticeProgress,
  type AdaptivePracticeSessionResponse,
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

  @Input({ required: true }) set submissionId(value: string | null | undefined) {
    const next = typeof value === 'string' ? value.trim() : '';
    if (next === this.submissionIdValue) return;
    this.submissionIdValue = next;
    this.resetForSubmission();
    if (next) this.loadExistingSession();
  }
  get submissionId(): string { return this.submissionIdValue; }

  @Input() previewEnabled = environment.adaptivePracticeFixtureEnabled;
  @Input() set skills(value: readonly AdaptiveSkillScore[] | null | undefined) {
    const list = Array.isArray(value) ? value : [];
    this.normalizedSkills = list.map((skill) => this.normalizeSkill(skill));
    this.weakSkills = this.normalizedSkills.filter((skill) => skill.percentage !== null && skill.percentage < ADAPTIVE_PRACTICE_THRESHOLD);
    if ((this.state === 'idle' || this.state === 'no-weaknesses') && !this.activities.length) {
      this.state = this.weakSkills.length ? 'idle' : 'no-weaknesses';
    }
  }

  @Input() set canonicalResultState(value: CanonicalResultViewState | null) {
    this._canonicalResultState = value;
    // If we were waiting for analysis and it just completed, reload the session
    if (this.state === 'waiting_for_analysis' && value && !value.processingActive && value.evaluationStatus === 'completed' && value.semanticStatus === 'completed') {
      this.loadExistingSession();
    }
  }
  get canonicalResultState(): CanonicalResultViewState | null { return this._canonicalResultState; }
  private _canonicalResultState: CanonicalResultViewState | null = null;

  @Output() readonly generatePractice = new EventEmitter<string>();
  @Output() readonly checkPractice = new EventEmitter<AdaptivePracticeAction>();
  @Output() readonly retryPractice = new EventEmitter<string>();
  @Output() readonly showModelAnswer = new EventEmitter<AdaptivePracticeAction>();

  normalizedSkills: readonly NormalizedAdaptiveSkill[] = [];
  weakSkills: readonly NormalizedAdaptiveSkill[] = [];
  activities: readonly AdaptivePracticeActivity[] = [];
  state: AdaptiveStudioState = 'idle';
  errorMessage = '';
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
    if (!this.submissionId || this.state === 'generating' || this.state === 'no-weaknesses' || this.state === 'generated') return;
    this.generatePractice.emit(this.submissionId);
    if (this.previewEnabled) {
      this.runExplicitFixturePreview();
      return;
    }
    this.state = 'generating';
    this.errorMessage = '';
    const version = ++this.requestVersion;
    this.requestSubscription?.unsubscribe();
    this.requestSubscription = this.api.generateSession(this.submissionId).subscribe({
      next: (response) => this.acceptResponse(version, response.data),
      error: (error: unknown) => this.acceptError(version, error)
    });
  }

  retry(): void {
    if (!this.submissionId || this.state === 'generating') return;
    this.retryPractice.emit(this.submissionId);
    this.state = 'generating';
    const version = ++this.requestVersion;
    this.requestSubscription?.unsubscribe();
    this.requestSubscription = this.api.retryGeneration(this.submissionId).subscribe({
      next: (response) => this.acceptResponse(version, response.data),
      error: (error: unknown) => this.acceptError(version, error)
    });
  }

  updateResponse(activityId: string, value: string): void { this.responses = { ...this.responses, [activityId]: value }; }
  check(activity: AdaptivePracticeActivity): void {
    this.checkPractice.emit({ submissionId: this.submissionId, activityId: activity.id, response: this.responses[activity.id] || '' });
    this.runCheck(activity, false);
  }
  retryCheck(activity: AdaptivePracticeActivity): void { this.runCheck(activity, true); }
  bestPracticeScore(skillId: string): number | null {
    const rubricId = ({ task: 'CONTENT', coherence: 'ORGANIZATION', lexical: 'VOCABULARY', grammar: 'GRAMMAR', mechanics: 'MECHANICS' } as Record<string, string>)[skillId];
    const activity = this.activities.find((item) => item.skillId === rubricId);
    return activity ? this.progress.activities.find((item) => item.activityId === activity.id)?.bestScore ?? null : null;
  }
  toggleModel(activity: AdaptivePracticeActivity): void {
    const next = new Set(this.expandedModels);
    if (next.has(activity.id)) next.delete(activity.id); else next.add(activity.id);
    this.expandedModels = next;
    this.showModelAnswer.emit({ submissionId: this.submissionId, activityId: activity.id });
  }

  private loadExistingSession(): void {
    const version = ++this.requestVersion;
    
    // Check if canonical analysis is complete before calling adaptive API
    if (this.canonicalResultState) {
      const isProcessing = this.canonicalResultState.processingActive;
      const evaluationStatus = this.canonicalResultState.evaluationStatus;
      const semanticStatus = this.canonicalResultState.semanticStatus;
      
      // If analysis is still processing, show waiting state instead of calling API
      if (isProcessing || evaluationStatus === 'processing' || evaluationStatus === 'pending' || semanticStatus === 'processing' || semanticStatus === 'pending') {
        this.state = 'waiting_for_analysis';
        this.errorMessage = '';
        this.cdr.markForCheck();
        return;
      }
      
      // If semantic analysis failed, show error state
      if (semanticStatus === 'failed' || evaluationStatus === 'failed') {
        this.state = 'error';
        this.errorMessage = 'Adaptive practice is unavailable because writing analysis failed. Please retry the analysis.';
        this.cdr.markForCheck();
        return;
      }
    }
    
    this.requestSubscription?.unsubscribe();
    this.requestSubscription = this.api.getSession(this.submissionId).subscribe({
      next: (response) => this.acceptResponse(version, response.data),
      error: (error: unknown) => this.acceptError(version, error)
    });
  }

  private acceptResponse(version: number, response: AdaptivePracticeSessionResponse): void {
    if (version !== this.requestVersion) return;
    if (response.state === 'ready' && response.session) {
      this.sessionId = response.session._id;
      this.activities = response.session.activities.map((activity) => ({ ...activity, id: activity.activityId, isDevelopmentPreview: false }));
      this.applyProgress(response.progress);
      this.state = 'generated';
    } else if (response.state === 'generating') {
      this.state = 'generating';
      this.schedulePoll(version);
    } else if (response.state === 'failed') {
      this.state = 'error';
      this.errorMessage = response.session?.generation?.errorMessage || 'Adaptive practice could not be generated. Please try again.';
    } else if (response.state === 'no-weaknesses') {
      this.state = 'no-weaknesses';
    } else {
      this.state = this.weakSkills.length ? 'idle' : 'no-weaknesses';
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
        next: (response) => this.acceptResponse(version, response.data),
        error: (error: unknown) => this.acceptError(version, error)
      });
    }, 2500);
  }

  private acceptError(version: number, error: unknown): void {
    if (version !== this.requestVersion) return;
    const value = error as { status?: number; error?: { message?: string } };
    if (value?.status === 202) {
      this.state = 'waiting_for_analysis';
      this.errorMessage = '';
    } else {
      this.state = 'error';
      this.errorMessage = value?.error?.message || 'Adaptive practice is temporarily unavailable.';
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
    this.sessionId = '';
    this.responses = {};
    this.expandedModels = new Set<string>();
    this.pendingMessages = {};
    this.checkStates = {};
    this.attempts = {};
    this.checkErrors = {};
    this.progress = { improvedActivities: 0, totalActivities: 0, percentage: 0, activities: [] };
    this.errorMessage = '';
    this.state = this.weakSkills.length ? 'idle' : 'no-weaknesses';
  }
  private cancelAsyncWork(): void { this.requestSubscription?.unsubscribe(); this.requestSubscription = null; this.checkSubscriptions.forEach((subscription) => subscription.unsubscribe()); this.checkSubscriptions.clear(); this.checkPollTimers.forEach((timer) => clearTimeout(timer)); this.checkPollTimers.clear(); this.checkPollCounts.clear(); this.clearTimer(); }
  private clearTimer(): void { if (this.timer !== null) clearTimeout(this.timer); this.timer = null; }

  private normalizeSkill(skill: AdaptiveSkillScore): NormalizedAdaptiveSkill {
    const earned = Number(skill.earnedPoints);
    const maximum = Number(skill.maximumPoints);
    const valid = skill.earnedPoints !== null && skill.maximumPoints !== null && Number.isFinite(earned) && earned >= 0 && Number.isFinite(maximum) && maximum > 0;
    const percentage = valid ? Math.round(Math.min(100, Math.max(0, earned / maximum * 100))) : null;
    const status: AdaptiveSkillStatus = percentage === null ? 'not-assessed' : percentage < 50 ? 'priority' : percentage < ADAPTIVE_PRACTICE_THRESHOLD ? 'needs-practice' : 'on-track';
    const labels: Record<AdaptiveSkillStatus, string> = { priority: 'Priority practice', 'needs-practice': 'Needs practice', 'on-track': 'On track', 'not-assessed': 'Not assessed' };
    return { ...skill, percentage, status, statusLabel: labels[status] };
  }

  private runCheck(activity: AdaptivePracticeActivity, retry: boolean): void {
    const response = (this.responses[activity.id] || '').trim();
    if (!this.sessionId || response.length < 10 || this.checkStates[activity.id] === 'checking') return;
    this.checkStates = { ...this.checkStates, [activity.id]: 'checking' };
    this.checkErrors = { ...this.checkErrors, [activity.id]: '' };
    this.checkSubscriptions.get(activity.id)?.unsubscribe();
    const subscription = this.api.checkResponse(this.sessionId, activity.id, response, retry).subscribe({
      next: (result) => {
        this.attempts = { ...this.attempts, [activity.id]: result.data.attempt };
        this.checkStates = { ...this.checkStates, [activity.id]: result.data.state === 'ready' ? 'ready' : result.data.state === 'failed' ? 'error' : 'checking' };
        this.applyProgress(result.data.progress);
        if (result.data.state === 'checking') this.scheduleCheckPoll(activity.id);
        this.cdr.markForCheck();
      },
      error: (error: unknown) => {
        const value = error as { error?: { message?: string } };
        this.checkStates = { ...this.checkStates, [activity.id]: 'error' };
        this.checkErrors = { ...this.checkErrors, [activity.id]: value?.error?.message || 'Your response could not be checked. Please try again.' };
        this.cdr.markForCheck();
      }
    });
    this.checkSubscriptions.set(activity.id, subscription);
  }

  private applyProgress(progress?: AdaptivePracticeProgress): void {
    if (!progress) return;
    this.progress = progress;
    const responses = { ...this.responses };
    const attempts = { ...this.attempts };
    const states = { ...this.checkStates };
    progress.activities.forEach((item) => {
      if (item.latestResponse) responses[item.activityId] = item.latestResponse;
      if (item.latestAttempt) { attempts[item.activityId] = item.latestAttempt; states[item.activityId] = 'ready'; }
    });
    this.responses = responses;
    this.attempts = attempts;
    this.checkStates = states;
  }

  private scheduleCheckPoll(activityId: string): void {
    const count = (this.checkPollCounts.get(activityId) || 0) + 1;
    this.checkPollCounts.set(activityId, count);
    if (count > 20) {
      this.checkStates = { ...this.checkStates, [activityId]: 'error' };
      this.checkErrors = { ...this.checkErrors, [activityId]: 'Checking is taking longer than expected. Please try again.' };
      return;
    }
    const timer = setTimeout(() => {
      const subscription = this.api.getAttempts(this.sessionId, activityId).subscribe({
        next: (result) => {
          const latest = result.data.attempts.at(-1);
          this.applyProgress(result.data.progress);
          if (latest?.status === 'ready') { this.attempts = { ...this.attempts, [activityId]: latest }; this.checkStates = { ...this.checkStates, [activityId]: 'ready' }; this.checkPollCounts.delete(activityId); }
          else if (latest?.status === 'failed') { this.checkStates = { ...this.checkStates, [activityId]: 'error' }; this.checkErrors = { ...this.checkErrors, [activityId]: latest.checking?.errorMessage || 'Your response could not be checked. Please try again.' }; }
          else this.scheduleCheckPoll(activityId);
          this.cdr.markForCheck();
        },
        error: () => { this.checkStates = { ...this.checkStates, [activityId]: 'error' }; this.checkErrors = { ...this.checkErrors, [activityId]: 'Checking status could not be loaded. Please try again.' }; this.cdr.markForCheck(); }
      });
      this.checkSubscriptions.set(activityId, subscription);
    }, 1500);
    this.checkPollTimers.set(activityId, timer);
  }
}
