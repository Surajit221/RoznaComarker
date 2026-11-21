import type { TeacherUploadItem, TeacherUploadStatus } from '../../../api/teacher-upload-api.service';

/** One wording for a teacher upload's status, used by View Submissions and the submission page. */
export const UPLOAD_STATUS_LABELS: Record<TeacherUploadStatus, string> = {
  uploaded: 'Uploaded', reading: 'Reading', processing: 'Marking', waiting_credits: 'Waiting for credits', marked: 'Marked', failed: 'Marking failed',
  not_marked: 'Not marked'
};

const DESCRIPTIONS: Record<TeacherUploadStatus, string> = {
  uploaded: 'Saved. Marking will start in a moment.',
  reading: 'Reading the handwriting.',
  processing: 'The handwriting is read. Corrections and marking are running.',
  waiting_credits: 'Marking stopped because there are no assessment credits left. Add credits, then press Retry marking.',
  marked: 'Marking is finished.',
  failed: 'Marking stopped.',
  not_marked: 'This recording could not be marked.'
};
/** A recording the teacher uploaded (stage 9): the same statuses, in words about a recording. */
const SPEAKING_DESCRIPTIONS: Partial<Record<TeacherUploadStatus, string>> = {
  uploaded: 'Saved. The recording will be turned into text in a moment.',
  reading: 'Turning the recording into text.',
  processing: 'The recording is in text. Marking is running.'
};
const SPEAKING_REASONS: Readonly<Record<string, string>> = Object.freeze({
  AUDIO_MONTHLY_MINUTES_EXCEEDED: "This month's speech-to-text minutes are used up.",
  AUDIO_DAILY_MINUTES_EXCEEDED: "Today's speech-to-text minutes are used up.",
  SPEAKING_NOT_ENOUGH_SPEECH: "There wasn't enough speech in the recording to mark it.",
  SPEAKING_NOT_ENGLISH: 'The recording is mostly not in English.',
  SPEAKING_UNINTELLIGIBLE: 'Too little of the recording could be understood.',
  SPEAKING_TRANSCRIPT_TOO_LONG: 'The recording is too long to mark.'
});

export function uploadStatusLabel(item: Pick<TeacherUploadItem, 'status' | 'kind'>): string {
  if (item.kind === 'speaking' && item.status === 'reading') return 'Transcribing';
  return UPLOAD_STATUS_LABELS[item.status] ?? 'Marking';
}

/** A plain reason for a stopped upload, from its safe code (never provider text). */
export function uploadFailureReason(code: string | undefined | null): string {
  const value = String(code || '').toUpperCase();
  if (!value) return 'Marking stopped because of a problem on our side.';
  if (value === 'INSUFFICIENT_ASSESSMENT_CREDITS' || value === 'INSUFFICIENT_CREDITS') return 'There were no assessment credits left.';
  // Recordings (stage 9): checked before the general rules below (an AUDIO_ timeout is speech-to-text, not the marking service).
  if (SPEAKING_REASONS[value]) return SPEAKING_REASONS[value];
  if (value.startsWith('AUDIO_')) return 'The recording could not be turned into text.';
  if (value === 'ASSESSMENT_STALLED' || value === 'ASSESSMENT_RECOVERY_EXHAUSTED') return 'Marking stopped and did not restart on its own.';
  if (value.includes('TIMEOUT')) return 'The marking service took too long to answer.';
  if (value.includes('UNREADABLE') || value.includes('IMAGE') || value.includes('ILLEGIBLE')) return 'The pages could not be read. Check that the photos are clear and upright.';
  if (value.includes('REVIEW_REQUIRED') || value.includes('PREFLIGHT')) return 'The handwriting reading needs a check before marking.';
  if (value.startsWith('OCR')) return 'The handwriting could not be read.';
  return 'Marking stopped because of a problem on our side.';
}

/** What the teacher reads under the status chip. */
export function uploadStatusDescription(item: Pick<TeacherUploadItem, 'status' | 'failureCode' | 'kind'>): string {
  if (item.status === 'failed') return `${uploadFailureReason(item.failureCode)} Press Retry marking to try again.`;
  if (item.status === 'not_marked') return `${uploadFailureReason(item.failureCode)} Upload a new recording to have it marked.`;
  if (item.kind === 'speaking' && SPEAKING_DESCRIPTIONS[item.status]) return SPEAKING_DESCRIPTIONS[item.status]!;
  return DESCRIPTIONS[item.status] ?? DESCRIPTIONS.processing;
}

/** Retry marking is offered for every state that is not finished (the server ignores it while a run is live). */
/** Not for a recording that could not be marked: a new recording is the way forward (stage 9). */
export function uploadCanRetry(item: Pick<TeacherUploadItem, 'status'>): boolean { return item.status !== 'marked' && item.status !== 'not_marked'; }
export function uploadIsStopped(item: Pick<TeacherUploadItem, 'status'>): boolean {
  return item.status === 'failed' || item.status === 'waiting_credits' || item.status === 'not_marked';
}
