import { HttpErrorResponse } from '@angular/common/http';

/**
 * Fixed, friendly messages for every speaking/audio refusal. The server's own text is never shown: only its code and status are read.
 * Wording matches the backend's fixed messages where they exist.
 */
export const SPEAKING_GENERIC_MESSAGE = 'Something went wrong. Please try again.';
/**
 * Speech-to-text out of service on our side (provider credit, configuration): never shown as a problem with the recording. Same text as the
 * backend (services/audio/stt/errors.js STT_UNAVAILABLE_MESSAGE). No provider is named.
 */
export const SPEAKING_STT_UNAVAILABLE_MESSAGE = 'Speech-to-text is temporarily unavailable. Please try again later.';
const STT_UNAVAILABLE_CODES: ReadonlySet<string> = new Set(['AUDIO_STT_PROVIDER_CREDITS', 'AUDIO_STT_NOT_CONFIGURED']);
/** Whether a recording's error code is one of those operational ones. */
export function isSttUnavailableCode(code: string | null | undefined): boolean {
  return !!code && STT_UNAVAILABLE_CODES.has(code);
}
const CONNECTION = 'Upload failed. Check your connection and try again.';
const RETRY_NOT_NOW = "This can't be retried now. Refresh the page.";

const BY_CODE: Readonly<Record<string, string>> = Object.freeze({
  AUDIO_UPLOADS_UNAVAILABLE: 'Recording uploads are not available right now. Please try again later or ask your teacher.',
  SPEAKING_STORAGE_FULL: 'Your storage is full. Free up space and upload the recording again.',
  AUDIO_UNREADABLE: "We couldn't read the length of this recording. Save it as MP3 or M4A and upload it again.",
  AUDIO_TOO_SHORT: 'This recording is shorter than 5 seconds. Please record a longer answer and upload it again.',
  AUDIO_TYPE_UNSUPPORTED: 'Please upload an MP3, M4A, WebM, Ogg or WAV recording.',
  AUDIO_TYPE_MISMATCH: "This file's content does not match its type. Please upload the original recording.",
  AUDIO_HAS_VIDEO: 'Please upload an audio recording, not a video.',
  AUDIO_FILE_EMPTY: 'This file is empty. Please choose the recording again.',
  AUDIO_DURATION_UNAVAILABLE: 'Recordings cannot be checked right now. Please try again in a few minutes.',
  DEADLINE_PASSED: "The due date has passed, so the recording can't be replaced.",
  NOT_CLASS_MEMBER: "You're not a member of this class.",
  SUBMISSION_LIMIT: "You've reached your plan's submission limit.",
  SPEAKING_ALREADY_MARKED: 'Your teacher has already marked this recording, so it can no longer be replaced.',
  SPEAKING_UPLOAD_CONFLICT: 'Your recording is already being saved. Please wait a moment and refresh.',
  TRANSCRIPTION_NOT_FAILED: RETRY_NOT_NOW,
  ASSESSMENT_NOT_RETRYABLE: RETRY_NOT_NOW,
  NOT_FOUND: "This assignment isn't available.",
  ASSIGNMENT_NOT_FOUND: "This assignment isn't available.",
  SPEAKING_MAX_RECORDING_INVALID: 'Choose a maximum recording length from the list.',
  SPEAKING_RUBRIC_NOT_FOUND: "That rubric isn't available. Choose another rubric or use the default speaking rubric.",
  SPEAKING_SETTINGS_INVALID: SPEAKING_GENERIC_MESSAGE,
  // Stage 9: a teacher uploads a student's recording.
  INSUFFICIENT_CREDITS: 'You have no assessment credits left. Add credits to upload more recordings.',
  TEACHER_UPLOAD_EXISTS: 'A recording for this student is already uploaded. Choose whether to replace it.',
  TEACHER_UPLOAD_MODE_INVALID: 'A speaking submission has one recording. Choose to replace it instead.',
  STUDENT_ALREADY_SUBMITTED: 'This student already submitted their own recording for this assignment. Open it from the submissions list.',
  TEACHER_UPLOAD_KEY_REUSED: 'This upload reference was already used for a different recording. Please try again.',
  TEACHER_UPLOAD_DUPLICATE: 'This recording was already saved.',
  TEACHER_UPLOAD_CHANGED: "This student's recording changed while saving. Please try again.",
  TEACHER_UPLOAD_BUSY: 'Another upload is still being saved. Please try again.',
  TEACHER_UPLOAD_MARKING_FAILED: 'This recording has no feedback yet, so there is nothing to email. Retry it first, or upload a new recording.',
  TEACHER_UPLOAD_RESEND_COOLDOWN: 'The email was just sent. Wait a minute before sending it again.',
  TEACHER_UPLOAD_NOT_SPEAKING: 'Recordings can only be uploaded for speaking assignments.',
  TEACHER_UPLOAD_STUDENT_INVALID: "Check the student's name and email.",
  TEACHER_UPLOAD_FILE_UNAVAILABLE: 'This recording is no longer available. Upload it again.',
  SPEAKING_UPLOADED_BY_TEACHER: 'Your teacher uploaded this recording for you, so only your teacher can replace it.',
  // Guests (stage 10b): the guest speaking page.
  SPEAKING_CONSENT_REQUIRED: 'Read the notice and tick the box to agree before you upload.',
  INSUFFICIENT_ASSESSMENT_CREDITS: "Your teacher can't receive recordings right now. Please contact your teacher.",
  TEACHER_STORAGE_FULL: "Your teacher can't receive recordings right now. Please contact your teacher.",
  ASSIGNMENT_UNAVAILABLE: "This assignment isn't open for guest recordings. Ask your teacher for a new link.",
  GUEST_REQUEST_KEY_REQUIRED: 'Something went wrong with this upload. Choose your recording again and upload it.',
  GUEST_REQUEST_KEY_REUSED: 'Something went wrong with this upload. Choose your recording again and upload it.',
  GUEST_UPLOAD_IN_PROGRESS: 'Your recording is already being saved. Please wait a moment.',
  GUEST_SUBMISSION_UNAVAILABLE: 'Guest submission is temporarily unavailable. Please contact your teacher.',
  GUEST_LINK_INVALID: 'This link is invalid or has expired. Request a new link below.'
});

export interface SpeakingMessageLimits { maxFileBytes?: number; maxRecordingSeconds?: number; }
const whole = (value: number) => (Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10));
/** The agreed "too large" text, built from the limits (defaults: 40 MB and 7 minutes). */
export function tooLargeMessage(limits: SpeakingMessageLimits = {}): string {
  const megabytes = (limits.maxFileBytes ?? 40 * 1024 * 1024) / (1024 * 1024);
  const minutes = (limits.maxRecordingSeconds ?? 420) / 60;
  return `This recording is too large (${whole(megabytes)} MB max) or longer than ${whole(minutes)} minute${minutes === 1 ? '' : 's'}. `
    + 'Save it as MP3 or M4A, or record in mono, and upload it again.';
}

/** The fixed message for a backend code (also used by the checks made before an upload); null for a code without one. */
export function messageForCode(code: string, limits: SpeakingMessageLimits = {}): string | null {
  if (code === 'AUDIO_TOO_LARGE' || code === 'AUDIO_TOO_LONG') return tooLargeMessage(limits);
  return BY_CODE[code] ?? null;
}

/** The message for a failed speaking request. */
export function speakingErrorMessage(error: unknown, limits: SpeakingMessageLimits = {}): string {
  if (!(error instanceof HttpErrorResponse)) return SPEAKING_GENERIC_MESSAGE;
  if (error.status === 0) return CONNECTION;
  const code = typeof error.error?.code === 'string' ? error.error.code : '';
  const known = code ? messageForCode(code, limits) : null;
  if (known) return known;
  if (error.status === 429) return 'Too many requests. Please wait a few minutes and try again.';
  return SPEAKING_GENERIC_MESSAGE;
}
