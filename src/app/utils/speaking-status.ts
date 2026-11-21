import type { SpeakingNotAssessableReason, SpeakingResultState } from '../api/speaking-api.service';

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
  ({ tone, message, final, canRetryTranscription: false, invitesNewRecording: false, ...extra });

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
