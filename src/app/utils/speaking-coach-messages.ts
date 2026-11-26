import { HttpErrorResponse } from '@angular/common/http';
import { speakingErrorMessage } from './speaking-messages';
import type { CoachFluencyChange, CoachNextStep, CoachNotAssessableReason, CoachTaskType } from '../api/speaking-coach-api.service';

// Speaking Coach: every text the student reads that does not come from the task or the feedback. Simple, short, encouraging; never a score,
// a level or a pass word (the coach only says what comes next).

export const COACH_TASK_TYPE_LABEL: Readonly<Record<CoachTaskType, string>> = {
  repeat_improve: 'Repeat and improve',
  follow_up: 'Follow-up question',
  fluency_drill: 'Fluency drill',
  vocab_swap: 'Vocabulary swap'
};

/** For a signed-in student (a guest reads the server's versioned practice notice instead). */
export const COACH_STUDENT_NOTICE = 'Your practice recordings are turned into text by a speech-to-text service and checked with AI to give you feedback. '
  + 'The audio is deleted as soon as it has been turned into text. Practice never changes your mark.';

/** Why the coach card has no practice to start (overview.reason), as the card says it. */
export const COACH_OVERVIEW_MESSAGE: Readonly<Record<'no_weak_areas' | 'result_not_ready' | 'no_rubric_scores', string>> = {
  no_weak_areas: 'Great work! Every area is strong, so no practice is needed right now.',
  result_not_ready: 'Practice opens when your result is ready.',
  no_rubric_scores: 'Practice is not available for this result.'
};

const REASON: Readonly<Record<CoachNotAssessableReason, string>> = {
  not_enough_speech: 'We could not hear enough words to check this answer. Try again and speak for a little longer.',
  not_english: 'This answer was mostly not in English. Try again in English.',
  unintelligible: 'We could not understand enough of this answer. Try again somewhere quiet and speak clearly.',
  off_topic: 'This answer did not answer the task. Read the task again and try once more.',
  too_long: 'This answer was too long to check. Try a shorter answer.'
};
export const coachReasonMessage = (reason: CoachNotAssessableReason | undefined) => REASON[reason || 'not_enough_speech'];

export function coachFailureMessage(failure: 'transcription' | 'check' | undefined, canRetry: boolean | undefined): string {
  if (failure === 'transcription') return 'We could not turn your recording into text. Please record your answer again.';
  return canRetry ? 'We could not check this answer. You can try checking it again.' : 'We could not check this answer. Please record it again.';
}

const NEXT: Readonly<Record<Exclude<CoachNextStep, null>, string>> = {
  next_task: 'Well done! The next task is open.',
  try_again: 'Have another go at this task, using the tip.',
  finished: 'Well done! You finished every practice task.',
  practice_ended: 'You have used all your practice recordings for this assignment.'
};
export const coachNextStepMessage = (step: CoachNextStep) => (step ? NEXT[step] : '');

/** The fluency change, in words (no figures). */
export function coachFluencyLines(change: CoachFluencyChange | undefined): string[] {
  if (!change) return [];
  return [change.fewerLongPauses ? 'You made fewer long pauses.' : '', change.fewerFillers ? 'You used fewer filler words like um.' : '',
    change.shorterLongestPause ? 'Your longest pause was shorter.' : ''].filter(Boolean);
}

const CODES: Readonly<Record<string, string>> = {
  COACH_RESULT_NOT_READY: 'Practice opens once your result is ready.',
  COACH_ATTEMPT_IN_PROGRESS: 'Your last answer is still being checked. Please wait a moment.',
  COACH_TASK_NOT_ACTIVE: 'This task is not open yet. Reload the page to see your current task.',
  COACH_SESSION_NOT_OPEN: 'This practice has ended.',
  COACH_MINUTES_UNAVAILABLE: 'Practice recordings are not available right now. Please try again later.',
  COACH_NOTICE_REQUIRED: 'Read the practice notice and tick the box to agree before you practise.',
  COACH_RETRY_NOT_ALLOWED: 'This answer cannot be checked again. Record a new answer instead.',
  COACH_REQUEST_ID_REQUIRED: 'Something went wrong with this upload. Please try again.',
  SPEAKING_COACH_UNAVAILABLE: 'Speaking practice is not available right now. Please try again in a few minutes.'
};

/** A refusal or failure as fixed text: the coach codes, then the speaking upload messages (file type, size, length, connection). */
export function coachErrorMessage(error: unknown, limits: { maxFileBytes?: number; maxRecordingSeconds?: number } = {}): string {
  const code = error instanceof HttpErrorResponse && typeof error.error?.code === 'string' ? error.error.code : '';
  if (code && CODES[code]) return CODES[code];
  if (error instanceof HttpErrorResponse && error.status === 404) return 'This practice is not available.';
  return speakingErrorMessage(error, limits);
}
