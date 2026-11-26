import { CommonModule } from '@angular/common';
import { Component, Input, type OnChanges, type OnDestroy, type OnInit, type SimpleChanges, ViewChild, inject } from '@angular/core';
import { HttpEventType } from '@angular/common/http';
import { SpeakingRecorder, type PracticeRecording } from '../speaking-recorder/speaking-recorder';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import { newPracticeRequestId, type CoachAttempt, type CoachAttemptView, type CoachClient, type CoachOverviewArea, type CoachSession, type CoachTask,
  type CoachTaskStatus, type CoachView } from '../../../api/speaking-coach-api.service';
import { COACH_OVERVIEW_MESSAGE, COACH_STUDENT_NOTICE, COACH_TASK_TYPE_LABEL, coachErrorMessage, coachFailureMessage, coachFluencyLines, coachNextStepMessage,
  coachReasonMessage } from '../../../utils/speaking-coach-messages';

const UNSAVED_KEY = 'speaking-coach-upload';
/** Result states where the page shows the coach card: being marked (the card says practice opens when the result is ready) and ready. */
const COACH_RESULT_STATES: ReadonlySet<string> = new Set(['transcribing', 'assessing', 'awaiting_teacher', 'ready']);
/** Whether a speaking page shows the coach for this result state (never for a recording that could not be marked). */
export const coachShownFor = (state: string | null | undefined): boolean => !!state && COACH_RESULT_STATES.has(state);
const UNSAVED_MESSAGE = 'Your practice answer is still uploading. Leave and cancel it?';
const STATUS_LABEL: Readonly<Record<CoachTaskStatus, string>> = { current: 'Current', done: 'Done', locked: 'Locked' };
const STATUS_ICON: Readonly<Record<CoachTaskStatus, string>> = { current: '●', done: '✓', locked: '○' };

/**
 * Speaking Coach (students and guests): two or three short speaking tasks after a speaking result. The student records an answer for the
 * current task; it is checked against that task's area and compared with the previous try; short feedback and the next tip come back.
 * Never a score, a level or a pass word: the coach says what got better, what to keep working on, and what comes next.
 * The client decides whose practice it is (the signed-in student's, or a guest's through their link). Shown whenever the server has a coach for
 * this submission (hidden on a 404): before practice it lists each area of the graded result with the level title the result shows and "Needs
 * practice" or "Strong" (the server's overview; client decision 2026-11-26), and when there is nothing to start (every area strong, the result
 * not ready, no rubric scores) Start practice stays visible but disabled, with the reason read out. Reloads when resultState changes. A guest accepts the practice notice before starting; read only (a recovery-portal session)
 * shows the practice without recording. Polls while tasks are being prepared or an answer is being checked.
 */
@Component({
  selector: 'app-speaking-coach',
  imports: [CommonModule, SpeakingRecorder],
  templateUrl: './speaking-coach.html',
  styleUrl: './speaking-coach.css'
})
export class SpeakingCoach implements OnInit, OnChanges, OnDestroy {
  private readonly unsaved = inject(UnsavedWorkRegistry);

  @Input({ required: true }) client!: CoachClient;
  @Input() guest = false;
  @Input() readOnly = false;
  /** The page's graded result state: a change (for example to ready) reads the coach again. */
  @Input() resultState: string | null = null;
  @Input() pollMs = 4000;
  /** The practice upload limit shown to the student (the server checks again). */
  @Input() maxFileBytes = 20 * 1024 * 1024;
  @ViewChild(SpeakingRecorder) recorder?: SpeakingRecorder;

  readonly typeLabel = COACH_TASK_TYPE_LABEL;
  readonly studentNotice = COACH_STUDENT_NOTICE;
  loading = true;
  view: CoachView | null = null;
  error: string | null = null;
  starting = false;
  agreed = false;
  pending: PracticeRecording | null = null;
  uploading = false;
  uploadPercent: number | null = null;
  retrying = false;
  private requestId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  get state() { return this.view?.state ?? null; }
  get session(): CoachSession | null { return this.view?.session ?? null; }
  /** Hidden on a 404 (null), and for an unavailable coach from a server without an overview. */
  get visible(): boolean { return !this.loading && !!this.view && (this.view.state !== 'unavailable' || !!this.view.overview); }
  get areas(): CoachOverviewArea[] { return this.view?.overview?.areas ?? []; }
  /** Nothing to start: why, as the card says it (null when practice can start). */
  get blockedMessage(): string | null {
    if (this.state === 'no_practice_needed') return COACH_OVERVIEW_MESSAGE.no_weak_areas;
    if (this.state !== 'unavailable') return null;
    const reason = this.view?.overview?.reason;
    return reason === 'no_rubric_scores' ? COACH_OVERVIEW_MESSAGE.no_rubric_scores : COACH_OVERVIEW_MESSAGE.result_not_ready;
  }
  get tasks(): CoachTask[] { return [...(this.session?.tasks ?? [])].sort((a, b) => a.order - b.order); }
  get currentTask(): CoachTask | null { return this.tasks.find(task => task.status === 'current') ?? null; }
  get currentIndex(): number { const task = this.currentTask; return task ? this.tasks.indexOf(task) + 1 : 0; }
  get checking(): boolean { return this.session?.activeAttempt?.state === 'processing'; }
  get last(): CoachAttempt | null { const attempt = this.session?.lastAttempt; return attempt && attempt.state !== 'processing' ? attempt : null; }
  /** A guest whose accepted practice notice is out of date (or never accepted) must accept the current one before recording. */
  get needsNotice(): boolean { return this.guest && !!this.view?.notice && !this.view.notice.accepted; }
  get canStart(): boolean { return !this.readOnly && !this.starting && !this.blockedMessage && (!this.needsNotice || this.agreed); }
  get canRecord(): boolean { return !this.readOnly && this.state === 'ready' && !!this.currentTask && !this.checking && !this.needsNotice; }

  statusLabel(status: CoachTaskStatus): string { return STATUS_LABEL[status]; }
  statusIcon(status: CoachTaskStatus): string { return STATUS_ICON[status]; }
  reasonText(attempt: CoachAttempt): string { return coachReasonMessage(attempt.reason); }
  failureText(attempt: CoachAttempt): string { return coachFailureMessage(attempt.failure, attempt.canRetry && !this.readOnly); }
  nextText(attempt: CoachAttempt): string { return coachNextStepMessage(attempt.nextStep); }
  fluencyLines(attempt: CoachAttempt): string[] { return coachFluencyLines(attempt.fluencyChange); }

  async ngOnInit(): Promise<void> { await this.load(); }

  ngOnChanges(changes: SimpleChanges): void {
    const change = changes['resultState'];
    if (!change || change.firstChange || this.uploading || this.loading) return;
    void this.load();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearTimer();
    this.unsaved.clear(UNSAVED_KEY);
  }

  private async load(): Promise<void> {
    try {
      this.view = await this.client.getSession();
      this.error = null;
    } catch (error) {
      this.view = null;
      this.error = coachErrorMessage(error);
    } finally {
      this.loading = false;
    }
    this.followUp();
  }

  /** Starts practice (a guest sends the practice notice version they agreed to). Also accepts a new notice version on an open session. */
  async start(): Promise<void> {
    if (!this.canStart) return;
    this.starting = true;
    this.error = null;
    try {
      this.view = await this.client.start(this.guest ? this.view?.notice?.version : undefined);
      this.agreed = false;
    } catch (error) {
      this.error = coachErrorMessage(error);
    } finally {
      this.starting = false;
    }
    this.followUp();
  }

  onRecording(recording: PracticeRecording | null): void {
    this.pending = recording;
    this.requestId = recording ? newPracticeRequestId() : null;
    if (recording) this.error = null;
  }

  send(): void {
    const session = this.session, task = this.currentTask, recording = this.pending;
    if (!session || !task || !recording || this.uploading || !this.canRecord) return;
    this.requestId ??= newPracticeRequestId();
    this.uploading = true;
    this.uploadPercent = 0;
    this.error = null;
    this.unsaved.register(UNSAVED_KEY, UNSAVED_MESSAGE);
    const done = () => { this.uploading = false; this.uploadPercent = null; this.unsaved.clear(UNSAVED_KEY); };
    this.client.uploadAttempt(session.id, task.taskId, recording.blob, recording.filename, this.requestId).subscribe({
      next: event => {
        if (event.type === HttpEventType.UploadProgress && event.total) this.uploadPercent = Math.round(event.loaded / event.total * 100);
        if (event.type === HttpEventType.Response && event.body?.data) {
          done();
          this.pending = null;
          this.requestId = null;
          this.recorder?.reset();
          this.apply(event.body.data);
        }
      },
      error: error => { done(); this.error = coachErrorMessage(error, { maxFileBytes: this.maxFileBytes, maxRecordingSeconds: task.maxSeconds }); },
      complete: () => { if (this.uploading) done(); }
    });
  }

  async retryCheck(): Promise<void> {
    const session = this.session, attempt = this.last;
    if (!session || !attempt || this.retrying || this.readOnly) return;
    this.retrying = true;
    this.error = null;
    try { this.apply(await this.client.retry(session.id, attempt.id)); }
    catch (error) { this.error = coachErrorMessage(error); }
    finally { this.retrying = false; }
  }

  /** A fresh session and attempt from the server. */
  private apply(data: CoachAttemptView): void {
    if (this.destroyed || !this.view) return;
    const ended = data.session.endedReason;
    this.view = { ...this.view, session: data.session, state: ended === 'completed' ? 'completed' : ended === 'capped' ? 'capped' : 'ready' };
    this.followUp();
  }

  /** Polls while tasks are being prepared or an answer is being checked. */
  private followUp(): void {
    this.clearTimer();
    if (this.destroyed || !this.view) return;
    if (this.state === 'generating') this.schedule(() => this.reloadSession());
    else if (this.checking) this.schedule(() => this.pollAttempt());
  }

  private async reloadSession(): Promise<void> {
    try { const view = await this.client.getSession(); if (!this.destroyed && view) this.view = view; } catch { /* the next poll tries again */ }
    this.followUp();
  }

  private async pollAttempt(): Promise<void> {
    const session = this.session, attempt = session?.activeAttempt;
    if (!session || !attempt) return;
    try { this.apply(await this.client.getAttempt(session.id, attempt.id)); }
    catch { this.followUp(); }
  }

  private schedule(run: () => Promise<void>): void {
    this.timer = setTimeout(() => { this.timer = null; void run(); }, this.pollMs);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
