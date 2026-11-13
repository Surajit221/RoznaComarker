import type { TeacherUploadItem, TeacherUploadStatus } from '../../../api/teacher-upload-api.service';

/** One wording for a teacher upload's status, used by View Submissions and the submission page. */
export const UPLOAD_STATUS_LABELS: Record<TeacherUploadStatus, string> = {
  uploaded: 'Uploaded', reading: 'Reading', processing: 'Marking', waiting_credits: 'Waiting for credits', marked: 'Marked', failed: 'Marking failed'
};

const DESCRIPTIONS: Record<TeacherUploadStatus, string> = {
  uploaded: 'Saved. Marking will start in a moment.',
  reading: 'Reading the handwriting.',
  processing: 'The handwriting is read. Corrections and marking are running.',
  waiting_credits: 'Marking stopped because there are no assessment credits left. Add credits, then press Retry marking.',
  marked: 'Marking is finished.',
  failed: 'Marking stopped.'
};

export function uploadStatusLabel(item: Pick<TeacherUploadItem, 'status'>): string { return UPLOAD_STATUS_LABELS[item.status] ?? 'Marking'; }

/** A plain reason for a stopped upload, from its safe code (never provider text). */
export function uploadFailureReason(code: string | undefined | null): string {
  const value = String(code || '').toUpperCase();
  if (!value) return 'Marking stopped because of a problem on our side.';
  if (value === 'INSUFFICIENT_ASSESSMENT_CREDITS' || value === 'INSUFFICIENT_CREDITS') return 'There were no assessment credits left.';
  if (value === 'ASSESSMENT_STALLED' || value === 'ASSESSMENT_RECOVERY_EXHAUSTED') return 'Marking stopped and did not restart on its own.';
  if (value.includes('TIMEOUT')) return 'The marking service took too long to answer.';
  if (value.includes('UNREADABLE') || value.includes('IMAGE') || value.includes('ILLEGIBLE')) return 'The pages could not be read. Check that the photos are clear and upright.';
  if (value.includes('REVIEW_REQUIRED') || value.includes('PREFLIGHT')) return 'The handwriting reading needs a check before marking.';
  if (value.startsWith('OCR')) return 'The handwriting could not be read.';
  return 'Marking stopped because of a problem on our side.';
}

/** What the teacher reads under the status chip. */
export function uploadStatusDescription(item: Pick<TeacherUploadItem, 'status' | 'failureCode'>): string {
  if (item.status === 'failed') return `${uploadFailureReason(item.failureCode)} Press Retry marking to try again.`;
  return DESCRIPTIONS[item.status] ?? DESCRIPTIONS.processing;
}

/** Retry marking is offered for every state that is not finished (the server ignores it while a run is live). */
export function uploadCanRetry(item: Pick<TeacherUploadItem, 'status'>): boolean { return item.status !== 'marked'; }
export function uploadIsStopped(item: Pick<TeacherUploadItem, 'status'>): boolean { return item.status === 'failed' || item.status === 'waiting_credits'; }
