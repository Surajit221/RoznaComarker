import type { SpeakingNotAssessableReason, SpeakingResultState } from '../api/speaking-api.service';
import type { ProcessingProgress } from '../components/analysis-progress/analysis-progress';

/**
 * What a speaking result's state means on screen: fixed text only (the server's own text is never shown), whether the page keeps polling, and
 * which action fits. A student never learns why marking is waiting (credits are the teacher's business).
 */
export interface SpeakingStatusView {
  tone: 'progress' | 'waiting' | 'problem' | 'done';
  message: string;
  /** No further change is expected without an action (upload, retry): polling stops. */
  final: boolean;
  canRetryTranscription: boolean;
  /** The owning teacher only: a failed or blocked marking can be queued again. */
  canRetryAssessment: boolean;
  /** A new recording is the way forward (shown only while the recording can still be replaced). */
  invitesNewRecording: boolean;
}

/** How often an open speaking page asks again while a recording is being turned into text or marked. */
export const SPEAKING_POLL_MS = 10000;

const NOT_ASSESSABLE: Readonly<Record<SpeakingNotAssessableReason, string>> = Object.freeze({
  not_english: "This recording couldn't be marked because it is mostly not in English. Record your answer in English and upload it again.",
  unintelligible: "This recording couldn't be marked because too little of it could be understood. Record again somewhere quiet, speak clearly, and upload it again.",
  too_long: 'This recording is too long to mark. Record a shorter answer and upload it again.'
});
const NOT_ASSESSABLE_OTHER = "This recording couldn't be marked. Record your answer again in English and upload it.";

const view = (tone: SpeakingStatusView['tone'], message: string, final: boolean, extra: Partial<SpeakingStatusView> = {}): SpeakingStatusView =>
  ({ tone, message, final, canRetryTranscription: false, canRetryAssessment: false, invitesNewRecording: false, ...extra });

export function studentSpeakingStatus(result: { state: SpeakingResultState; reason: SpeakingNotAssessableReason | null },
  recording: { canRetry?: boolean } = {}): SpeakingStatusView {
  switch (result.state) {
    case 'transcribing': return view('progress', 'Turning your recording into text…', false);
    case 'assessing': return view('progress', 'Marking your recording…', false);
    case 'ready': return view('done', 'Your recording has been marked.', true);
    case 'awaiting_teacher':
    case 'blocked':
    case 'failed': return view('waiting', 'Your teacher will check this recording.', true);
    case 'not_enough_speech':
      return view('problem', "There wasn't enough speech in this recording to mark it. Record a longer answer and upload it again.", true, { invitesNewRecording: true });
    case 'not_assessable':
      return view('problem', (result.reason && NOT_ASSESSABLE[result.reason]) || NOT_ASSESSABLE_OTHER, true, { invitesNewRecording: true });
    case 'transcription_failed':
      return view('problem', "We couldn't turn this recording into text.", true, { canRetryTranscription: recording.canRetry === true, invitesNewRecording: true });
    default: return view('progress', 'Checking your recording…', false);
  }
}

// ---- Teacher (stage 7e) ------------------------------------------------------------------------------------------------------------
const TEACHER_NOT_ASSESSABLE: Readonly<Record<SpeakingNotAssessableReason, string>> = Object.freeze({
  not_english: "This recording couldn't be marked because it is mostly not in English.",
  unintelligible: "This recording couldn't be marked because too little of it could be understood.",
  too_long: 'This recording is too long to mark.'
});
const MINUTES: Readonly<Record<string, string>> = Object.freeze({
  AUDIO_MONTHLY_MINUTES_EXCEEDED: " This month's speech-to-text minutes are used up.",
  AUDIO_DAILY_MINUTES_EXCEEDED: " Today's speech-to-text minutes are used up. Try again tomorrow."
});

/** The owning teacher's view: why marking is waiting (credits, a failed run, used-up minutes) and which retry applies. Codes map to fixed text. */
export function teacherSpeakingStatus(
  result: { state: SpeakingResultState; reason: SpeakingNotAssessableReason | null; errorCode?: string | null; canRetryAssessment?: boolean },
  recording: { status?: string; lastErrorCode?: string | null; audioAvailable?: boolean } | null): SpeakingStatusView {
  const retryMarking = result.canRetryAssessment === true;
  switch (result.state) {
    case 'transcribing': return view('progress', 'Turning the recording into text…', false);
    case 'assessing': return view('progress', 'Marking the recording…', false);
    case 'ready': return view('done', 'This recording has been marked.', true);
    case 'blocked':
      return view('problem', result.errorCode === 'INSUFFICIENT_ASSESSMENT_CREDITS' ? "You're out of assessment credits. Add credits, then retry marking."
        : "Marking is paused. Retry marking when you're ready.", true, { canRetryAssessment: retryMarking });
    case 'failed':
    case 'awaiting_teacher': return view('problem', "Marking didn't finish. Try marking again.", true, { canRetryAssessment: retryMarking });
    case 'not_enough_speech':
      return view('problem', "There wasn't enough speech in this recording to mark it. The student can upload a longer recording.", true);
    case 'not_assessable': return view('problem', (result.reason && TEACHER_NOT_ASSESSABLE[result.reason]) || "This recording couldn't be marked.", true);
    case 'transcription_failed':
      return view('problem', `We couldn't turn this recording into text.${MINUTES[recording?.lastErrorCode ?? ''] ?? ''}`, true,
        { canRetryTranscription: recording?.status === 'failed' && recording?.audioAvailable !== false });
    default: return view('progress', 'Checking the recording…', false);
  }
}

/** A status for app-analysis-progress (it announces changes politely): a moving bar while in progress, no bar while waiting, red for a problem. */
export function speakingProgress(status: Pick<SpeakingStatusView, 'tone' | 'message'>): ProcessingProgress {
  const base = { stage: 'speaking', percent: status.tone === 'done' ? 100 : 0, indeterminate: true, message: status.message };
  if (status.tone === 'progress') return { ...base, status: 'processing', completed: false, failed: false, active: true };
  if (status.tone === 'done') return { ...base, status: 'completed', completed: true, failed: false, active: false };
  if (status.tone === 'waiting') return { ...base, status: 'partial', completed: false, failed: false, active: false };
  return { ...base, status: 'failed', completed: false, failed: true, active: false };
}

/**
 * Asks `check` now and then every `intervalMs` until it answers true (final). A failed check does not stop it (the next one may work); a hidden
 * tab skips the request but keeps the timer. stop() ends it at once; start() restarts it.
 */
export class SpeakingPoller {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  running = false;

  constructor(private readonly check: () => Promise<boolean>, private readonly intervalMs = SPEAKING_POLL_MS) {}

  start(): void {
    this.stop();
    this.running = true;
    // The first check runs at once; the next ones every interval after the previous answer.
    void this.tick(++this.generation);
  }

  stop(): void {
    this.generation++;
    this.running = false;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(generation: number, delay: number): void {
    this.timer = setTimeout(() => void this.tick(generation), delay);
  }

  private async tick(generation: number): Promise<void> {
    if (generation !== this.generation) return;
    let final = false;
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    if (!hidden) {
      try { final = await this.check(); } catch { final = false; }
    }
    if (generation !== this.generation) return;
    if (final) { this.running = false; this.timer = null; return; }
    this.schedule(generation, this.intervalMs);
  }
}
