export const ADAPTIVE_PRACTICE_THRESHOLD = 70;

export type AdaptiveSkillId = 'task' | 'coherence' | 'lexical' | 'grammar' | 'mechanics';
export type AdaptiveRubricSkillId = 'CONTENT' | 'ORGANIZATION' | 'VOCABULARY' | 'GRAMMAR' | 'MECHANICS';
export type AdaptiveSkillStatus = 'priority' | 'needs-practice' | 'on-track' | 'not-assessed';
export type AdaptiveStudioState = 'idle' | 'generating' | 'generated' | 'error' | 'no-weaknesses' | 'unassessed' | 'waiting_for_analysis';
export type AdaptiveEligibilityReason =
  | 'NO_SUBMISSION'
  | 'ANALYSIS_PROCESSING'
  | 'SEMANTIC_FAILED'
  | 'STALE_EVALUATION'
  | 'NO_WEAK_SKILLS'
  | 'READY'
  | 'GENERATING'
  | 'ALREADY_GENERATED'
  | 'RETRYABLE_FAILURE'
  | 'NON_RETRYABLE_FAILURE';
export type AdaptiveCanonicalQuestionType = 'open_response' | 'mcq' | 'fill_blank';
export type AdaptivePracticeQuestionType = AdaptiveCanonicalQuestionType
  | 'written_response' | 'writtenResponse' | 'rewrite'
  | 'multiple_choice' | 'multipleChoice'
  | 'fillInBlank' | 'fill_in_blank';

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

export interface AdaptiveLearningSkill {
  skillId: AdaptiveRubricSkillId;
  skillLabel: string;
  adaptivePercentage: number;
  status: Exclude<AdaptiveSkillStatus, 'not-assessed'>;
}

export interface AdaptivePracticeQuestion {
  id: string;
  questionType?: AdaptivePracticeQuestionType;
  task: string;
  tip: string;
  checklist: readonly string[];
  modelAnswer?: string;
  options?: readonly { id: string; text: string }[];
  caseSensitive?: boolean;
  explanation?: string;
}

export interface AdaptivePracticeActivity {
  id: string;
  skillId: AdaptiveRubricSkillId;
  category: string;
  title: string;
  description: string;
  evidence: string;
  difficulty: 'foundational' | 'developing' | 'proficient';
  questions?: readonly AdaptivePracticeQuestion[];
  questionType?: AdaptivePracticeQuestionType; task?: string; tip?: string; checklist?: readonly string[];
  modelAnswer?: string; options?: readonly { id: string; text: string }[];
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
    questions?: readonly (Omit<AdaptivePracticeQuestion, 'id'> & { questionId: string })[];
    // Legacy response-only fields during the coordinated rollout.
    task?: string; tip?: string; checklist?: readonly string[]; modelAnswer?: string;
    options?: readonly { id: string; text: string }[]; questionType?: AdaptivePracticeQuestionType;
    difficulty: 'foundational' | 'developing' | 'proficient';
  }[];
  generation?: { errorMessage?: string };
}

export interface AdaptivePracticeSessionResponse {
  state: 'idle' | 'generating' | 'ready' | 'failed' | 'no-weaknesses';
  session: AdaptivePracticeSession | null;
  progress?: AdaptivePracticeProgress;
  adaptiveSkills?: readonly AdaptiveLearningSkill[];
}

export interface AdaptivePracticeAttemptResult {
  score: number; passed: boolean; summary: string; strength: string; nextImprovement: string;
  checklist: readonly { item: string; met: boolean; feedback: string }[];
  suggestedRevision: string;
  modelAnswer?: string;
  scoring: { taskFulfillment: number; targetSkillApplication: number; checklistCompletion: number };
}

export interface AdaptivePracticeAttempt {
  _id: string; activityId: string; questionId?: string; attemptNumber: number; status: 'checking' | 'ready' | 'failed';
  response: string; result?: AdaptivePracticeAttemptResult;
  checking?: { errorMessage?: string };
}

export interface AdaptiveActivityProgress {
  activityId: string; attemptCount: number; improved: boolean; bestScore: number | null;
  latestScore: number | null; latestResponse: string; latestAttempt: AdaptivePracticeAttempt | null;
  questions?: readonly AdaptiveQuestionProgress[];
}

export interface AdaptiveQuestionProgress {
  questionId: string; attemptActivityId: string; attemptCount: number; improved: boolean; bestScore: number | null;
  latestScore: number | null; latestResponse: string; latestAttempt: AdaptivePracticeAttempt | null;
}

export interface AdaptivePracticeProgress {
  improvedActivities: number; totalActivities: number; percentage: number;
  totalQuestions?: number; completedQuestions?: number;
  completedActivities?: number; requiredActivityCount?: number; completed?: boolean;
  activities: readonly AdaptiveActivityProgress[];
}

export interface AdaptivePracticeCheckResponse {
  state: 'checking' | 'ready' | 'failed'; attempt: AdaptivePracticeAttempt;
  progress: AdaptivePracticeProgress; reused: boolean;
}

export interface AdaptivePracticeAction {
  submissionId: string;
  activityId: string;
  questionId?: string;
  response?: string;
}
