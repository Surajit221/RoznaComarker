export type TeacherAdaptiveState = 'not-started' | 'generating' | 'in-progress' | 'completed' | 'failed';
export type TeacherAdaptiveSourceStatus = 'current' | 'outdated';

export interface TeacherAdaptiveSummary {
  totalActivities: number; improvedActivities: number; progressPercentage: number;
  totalAttempts: number; lastPracticedAt: string | null;
}
export interface TeacherAdaptiveSkill {
  skillId: string; label: string; originalEarnedPoints: number | null; originalMaximumPoints: number | null;
  originalPercentage: number | null; activityId: string; attemptCount: number; latestScore: number | null;
  bestScore: number | null; improved: boolean; lastAttemptAt: string | null;
}
export interface TeacherAdaptiveProgressResponse {
  state: TeacherAdaptiveState; sourceStatus: TeacherAdaptiveSourceStatus; submissionId: string; sessionId: string | null;
  summary: TeacherAdaptiveSummary; skills: readonly TeacherAdaptiveSkill[];
}
export interface TeacherAdaptiveAttempt {
  id: string; attemptNumber: number; status: 'checking' | 'ready' | 'failed'; response: string;
  practiceScore: number | null; improved: boolean; summary: string; strength: string; nextImprovement: string;
  checklist: readonly { item: string; met: boolean; feedback: string }[]; suggestedRevision: string; attemptedAt: string;
}
export interface TeacherAdaptiveAttemptsResponse {
  sessionId: string; activityId: string; attempts: readonly TeacherAdaptiveAttempt[];
  pagination: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean };
}
