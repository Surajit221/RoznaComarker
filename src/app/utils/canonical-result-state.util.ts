export type Availability = 'pending' | 'available' | 'failed';
export type ResultStatus = 'pending' | 'processing' | 'completed' | 'partial' | 'failed' | 'stale' | 'blocked';
export type CanonicalCategory = 'content' | 'grammar' | 'organization' | 'vocabulary' | 'mechanics';

export interface CanonicalResultViewState {
  submissionId: string | null;
  correctionStatus: ResultStatus;
  statisticsStatus: 'processing' | 'partial' | 'complete' | 'failed';
  statisticsCompleteness: 'none' | 'language_only' | 'semantic_only' | 'canonical';
  categoryAvailability: Record<CanonicalCategory, Availability>;
  statistics: Record<CanonicalCategory, number | null>;
  evaluationStatus: ResultStatus;
  evaluationSource: 'ai' | 'deterministic_fallback' | 'provisional' | null;
  evaluationVersion: string | null;
  assessmentVersion: string | null;
  evaluationErrorCode: string | null;
  score: number | null;
  grade: string | null;
  scoreMessage: string;
  detailedFeedbackStatus: ResultStatus;
  detailedFeedback: any | null;
  correctionSourceHash: string | null;
  evaluationSourceHash: string | null;
  detailedFeedbackSourceHash: string | null;
  teacherOverride: boolean;
  processingActive: boolean;
  automaticPollingAllowed: boolean;
  manualRetryAllowed: boolean;
  terminal: boolean;
  correctionStage: string;
  evaluationBlockedReason: string | null;
  detailedFeedbackBlockedReason: string | null;
  retryable: boolean;
  semanticStatus: 'pending' | 'processing' | 'retry_wait' | 'completed' | 'failed';
  semanticProgressMessage: string | null;
}

const categories: CanonicalCategory[] = ['content', 'grammar', 'organization', 'vocabulary', 'mechanics'];
const status = (value: any, fallback: ResultStatus): ResultStatus =>
  ['pending', 'processing', 'completed', 'partial', 'failed', 'stale', 'blocked'].includes(String(value)) ? value : fallback;

function finite(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeCanonicalResult(payload: any, previous?: CanonicalResultViewState | null): CanonicalResultViewState {
  const value = payload?.data ?? payload ?? {};
  const submissionId = typeof value.submissionId === 'string' && value.submissionId.trim()
    ? value.submissionId.trim() : previous?.submissionId || null;
  const correctionStatus = status(value.correctionStatus, previous?.correctionStatus || 'pending');
  const completeness = value.statisticsCompleteness === 'canonical' || value.statisticsCompleteness === 'language_only' || value.statisticsCompleteness === 'semantic_only'
    ? value.statisticsCompleteness : correctionStatus === 'completed' ? 'canonical' : ['processing', 'partial'].includes(correctionStatus) ? 'language_only' : 'none';
  const rawAvailability = value.categoryAvailability || {};
  const availability = {} as Record<CanonicalCategory, Availability>;
  const rawStats = value.statistics || value.correctionStatistics || value.correctionStats || {};
  const statistics = {} as Record<CanonicalCategory, number | null>;
  for (const category of categories) {
    const languageCategory = category === 'grammar' || category === 'mechanics';
    const inferred: Availability = completeness === 'canonical' || (completeness === 'language_only' && languageCategory)
      ? 'available' : ['failed', 'partial', 'stale'].includes(correctionStatus) ? 'failed' : 'pending';
    availability[category] = ['pending', 'available', 'failed'].includes(rawAvailability[category]) ? rawAvailability[category] : inferred;
    statistics[category] = availability[category] === 'available' ? finite(rawStats[category]) : null;
  }
  const prerequisiteFailed = ['partial', 'failed', 'stale'].includes(correctionStatus);
  const evaluationStatus = prerequisiteFailed ? 'blocked' : status(value.evaluationStatus, previous?.evaluationStatus || 'pending');
  const rawSource = value.evaluationSource ?? value.evaluation?.evaluationSource ?? previous?.evaluationSource ?? null;
  const evaluationSource = ['ai', 'deterministic_fallback', 'provisional'].includes(String(rawSource)) ? rawSource as any : null;
  const score = evaluationStatus === 'completed' ? finite(value.score ?? value.overallScore ?? value.evaluation?.overallScore) : null;
  const grade = evaluationStatus === 'completed' && typeof (value.grade ?? value.evaluation?.grade) === 'string'
    ? String(value.grade ?? value.evaluation?.grade) : null;
  const scoreMessage = evaluationStatus === 'processing' ? 'Calculating score…'
    : evaluationStatus === 'stale' ? 'Score updating…'
      : evaluationStatus === 'failed' || evaluationStatus === 'blocked' ? 'Score unavailable'
        : evaluationStatus === 'completed' ? '' : 'Score pending';
  const detailedFeedbackStatus = prerequisiteFailed ? 'blocked' : status(value.detailedFeedbackStatus, previous?.detailedFeedbackStatus || 'pending');
  const currentHash = value.correctionSourceHash ?? previous?.correctionSourceHash ?? null;
  const evaluationHash = value.evaluationSourceHash ?? previous?.evaluationSourceHash ?? null;
  const embeddedDetailed = value.detailedFeedback ?? (value.evaluation && (
    value.evaluation.detailedFeedback ?? (value.evaluation.areasForImprovement || value.evaluation.strengths || value.evaluation.actionSteps
      ? { status: detailedFeedbackStatus, sourceHash: value.detailedFeedbackSourceHash, evaluationVersion: value.evaluationVersion,
          areasForImprovement: value.evaluation.areasForImprovement || [], strengths: value.evaluation.strengths || [],
          actionSteps: value.evaluation.actionSteps || [] }
      : undefined)
  ));
  const feedbackHash = value.detailedFeedbackSourceHash ?? embeddedDetailed?.sourceHash
    ?? (embeddedDetailed && evaluationHash && currentHash && evaluationHash === currentHash ? evaluationHash : null)
    ?? previous?.detailedFeedbackSourceHash ?? null;
  const teacherOverride = value.overriddenByTeacher === undefined ? Boolean(previous?.teacherOverride) : Boolean(value.overriddenByTeacher);
  const suppliedCurrentFeedback = ['completed', 'partial'].includes(detailedFeedbackStatus) && (teacherOverride || (currentHash && feedbackHash === currentHash))
    ? embeddedDetailed : null;
  const previousStillCurrent = ['completed', 'partial'].includes(detailedFeedbackStatus)
    && (teacherOverride || (currentHash && previous?.detailedFeedbackSourceHash === currentHash));
  const detailedFeedback = suppliedCurrentFeedback ?? (embeddedDetailed === undefined && previousStillCurrent ? previous?.detailedFeedback : null);
  const processingActive = value.processingActive === undefined ? Boolean(previous?.processingActive) : Boolean(value.processingActive);
  const automaticPollingAllowed = (value.automaticPollingAllowed === undefined
    ? Boolean(previous?.automaticPollingAllowed) : Boolean(value.automaticPollingAllowed)) && processingActive;
  const terminal = value.terminal === undefined ? Boolean(previous?.terminal || (prerequisiteFailed && !processingActive))
    : value.terminal === true;
  const next: CanonicalResultViewState = {
    submissionId,
    correctionStatus,
    statisticsStatus: value.statisticsStatus || (completeness === 'canonical' ? 'complete' : completeness === 'language_only' ? 'partial' : 'processing'),
    statisticsCompleteness: completeness,
    categoryAvailability: availability,
    statistics,
    evaluationStatus,
    evaluationSource,
    evaluationVersion: typeof (value.evaluationVersion ?? value.evaluation?.evaluationVersion) === 'string'
      ? String(value.evaluationVersion ?? value.evaluation?.evaluationVersion) : previous?.evaluationVersion || null,
    assessmentVersion: typeof (value.assessmentVersion ?? value.evaluation?.assessmentVersion) === 'string'
      ? String(value.assessmentVersion ?? value.evaluation?.assessmentVersion) : previous?.assessmentVersion || null,
    evaluationErrorCode: typeof value.evaluationErrorCode === 'string' ? value.evaluationErrorCode : previous?.evaluationErrorCode || null,
    score,
    grade,
    scoreMessage,
    detailedFeedbackStatus,
    detailedFeedback,
    correctionSourceHash: currentHash,
    evaluationSourceHash: evaluationHash,
    detailedFeedbackSourceHash: feedbackHash,
    teacherOverride,
    processingActive,
    automaticPollingAllowed,
    manualRetryAllowed: Boolean(value.manualRetryAllowed ?? value.retryable),
    terminal,
    correctionStage: String(value.correctionStage || (prerequisiteFailed ? 'semantic_failed' : correctionStatus)),
    evaluationBlockedReason: value.evaluationBlockedReason || (prerequisiteFailed ? 'corrections_incomplete' : null),
    detailedFeedbackBlockedReason: value.detailedFeedbackBlockedReason || (prerequisiteFailed ? 'evaluation_unavailable' : null),
    retryable: Boolean(value.retryable),
    semanticStatus: ['pending', 'processing', 'retry_wait', 'completed', 'failed'].includes(String(value.semanticStatus))
      ? value.semanticStatus : correctionStatus === 'completed' ? 'completed' : prerequisiteFailed ? 'failed' : 'pending',
    semanticProgressMessage: value.semanticStatus === 'retry_wait'
      ? 'Retrying content, organization, and vocabulary analysis…'
      : correctionStatus === 'processing'
        ? 'Content, organization, and vocabulary are still being analyzed.' : null
  };
  if (value.__temporaryError && previous) return previous;
  return next;
}

export function categoryDisplay(state: CanonicalResultViewState | null, category: CanonicalCategory): number | string {
  if (!state) return 'Analyzing…';
  const availability = state.categoryAvailability[category];
  if (availability === 'pending') return 'Analyzing…';
  if (availability === 'failed') return 'Unavailable';
  return state.statistics[category] ?? 'Unavailable';
}

export function applySubmissionLifecycleFallback(
  canonical: CanonicalResultViewState | null,
  submission: { ocrStatus?: unknown; correctionStatus?: unknown; evaluationStatus?: unknown },
  canonicalFeedbackLoaded: boolean
): CanonicalResultViewState {
  if (canonicalFeedbackLoaded && canonical) return canonical;
  return normalizeCanonicalResult({ ...(canonical || {}), ocrStatus: submission.ocrStatus,
    correctionStatus: submission.correctionStatus, evaluationStatus: submission.evaluationStatus }, canonical);
}
