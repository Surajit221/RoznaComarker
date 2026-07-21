export const ADAPTIVE_PRACTICE_THRESHOLD = 70;

export type AdaptiveSkillId = 'task' | 'coherence' | 'lexical' | 'grammar' | 'mechanics';
export type AdaptiveRubricSkillId = 'CONTENT' | 'ORGANIZATION' | 'VOCABULARY' | 'GRAMMAR' | 'MECHANICS';
export type AdaptiveSkillStatus = 'priority' | 'needs-practice' | 'on-track' | 'not-assessed';
export type AdaptiveStudioState = 'idle' | 'generating' | 'generated' | 'error' | 'no-weaknesses' | 'waiting_for_analysis';

export interface AdaptiveSkillScore {
  id: AdaptiveSkillId;
  label: string;
  earnedPoints: number | null;
  maximumPoints: number | null;
}

export interface NormalizedAdaptiveSkill extends AdaptiveSkillScore {
  percentage: number | null;
  status: AdaptiveSkillStatus;
  statusLabel: string;
}

export interface AdaptivePracticeActivity {
  id: string;
  skillId: AdaptiveRubricSkillId;
  category: string;
  title: string;
  description: string;
  evidence: string;
  task: string;
  tip: string;
  checklist: readonly string[];
  modelAnswer: string;
  difficulty: 'foundational' | 'developing' | 'proficient';
  isDevelopmentPreview: boolean;
}

export interface AdaptivePracticeSession {
  _id: string;
  submissionId: string;
  status: 'generating' | 'ready' | 'failed';
  activities: readonly {
    activityId: string;
    skillId: AdaptiveRubricSkillId;
    category: string;
    title: string;
    description: string;
    evidence: string;
    task: string;
    tip: string;
    checklist: readonly string[];
    modelAnswer: string;
    difficulty: 'foundational' | 'developing' | 'proficient';
  }[];
  generation?: { errorMessage?: string };
}

export interface AdaptivePracticeSessionResponse {
  state: 'idle' | 'generating' | 'ready' | 'failed' | 'no-weaknesses';
  session: AdaptivePracticeSession | null;
  progress?: AdaptivePracticeProgress;
}

export interface AdaptivePracticeAttemptResult {
  score: number; passed: boolean; summary: string; strength: string; nextImprovement: string;
  checklist: readonly { item: string; met: boolean; feedback: string }[];
  suggestedRevision: string;
  scoring: { taskFulfillment: number; targetSkillApplication: number; checklistCompletion: number };
}

export interface AdaptivePracticeAttempt {
  _id: string; activityId: string; attemptNumber: number; status: 'checking' | 'ready' | 'failed';
  response: string; result?: AdaptivePracticeAttemptResult;
  checking?: { errorMessage?: string };
}

export interface AdaptiveActivityProgress {
  activityId: string; attemptCount: number; improved: boolean; bestScore: number | null;
  latestScore: number | null; latestResponse: string; latestAttempt: AdaptivePracticeAttempt | null;
}

export interface AdaptivePracticeProgress {
  improvedActivities: number; totalActivities: number; percentage: number;
  activities: readonly AdaptiveActivityProgress[];
}

export interface AdaptivePracticeCheckResponse {
  state: 'checking' | 'ready' | 'failed'; attempt: AdaptivePracticeAttempt;
  progress: AdaptivePracticeProgress; reused: boolean;
}

export interface AdaptivePracticeAction {
  submissionId: string;
  activityId: string;
  response?: string;
}
