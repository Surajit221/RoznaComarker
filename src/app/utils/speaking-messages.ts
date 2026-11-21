import { HttpErrorResponse } from '@angular/common/http';

/**
 * Fixed, friendly messages for every speaking/audio refusal. The server's own text is never shown: only its code and status are read.
 * Wording matches the backend's fixed messages where they exist.
 */
export const SPEAKING_GENERIC_MESSAGE = 'Something went wrong. Please try again.';
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
  SPEAKING_SETTINGS_INVALID: SPEAKING_GENERIC_MESSAGE
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
