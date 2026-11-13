import { ChangeDetectionStrategy, Component, Input, OnChanges, OnDestroy, inject, signal } from '@angular/core';
import { TeacherUploadApiService, friendlyError, type TeacherUploadItem } from '../../../api/teacher-upload-api.service';
import { uploadCanRetry, uploadIsStopped, uploadStatusDescription, uploadStatusLabel } from './teacher-upload-status';

const POLL_MS = 15000;

/**
 * The status of work the teacher uploaded, on the submission page: Uploaded, Reading, Marking, Waiting for credits or Marking failed
 * (with the reason), and Retry marking. Shows nothing for work the student submitted, or once marking is finished.
 */
@Component({
  selector: 'app-teacher-upload-status',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (item(); as upload) {
      @if (upload.status !== 'marked') {
        <section class="tu-status" [class.tu-status--bad]="stopped(upload)" data-teacher-upload-status [attr.data-status]="upload.status" aria-labelledby="tu-status-title">
          <p class="tu-status__title" id="tu-status-title">
            <span class="tu-status__chip" [class.tu-status__chip--bad]="stopped(upload)">{{ label(upload) }}</span>
            <span>Work you uploaded for {{ upload.name }}</span>
          </p>
          <p class="tu-status__text" role="status" aria-live="polite">{{ description(upload) }}</p>
          @if (canRetry(upload)) {
            <button type="button" class="tu-status__retry" data-teacher-upload-retry [attr.aria-disabled]="busy()" [attr.aria-busy]="busy()"
              (click)="retry()">{{ busy() ? 'Restarting…' : 'Retry marking' }}</button>
          }
          @if (notice()) { <p class="tu-status__notice" role="status">{{ notice() }}</p> }
          @if (error()) { <p class="tu-status__error" role="alert">{{ error() }}</p> }
        </section>
      }
    }
  `,
  styles: [`
    .tu-status { margin: 0 0 16px; padding: 12px 16px; border: 1px solid #bfdbfe; border-left: 4px solid #2563eb; border-radius: 12px; background: #eff6ff; color: #1e293b; }
    .tu-status--bad { border-color: #fecaca; border-left-color: #b91c1c; background: #fef2f2; }
    .tu-status__title { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0; font-weight: 600; }
    .tu-status__chip { display: inline-flex; padding: 2px 10px; border-radius: 999px; border: 1px solid #93c5fd; background: #fff; font-size: .85rem; }
    .tu-status__chip--bad { border-color: #fca5a5; color: #991b1b; }
    .tu-status__text { margin: 6px 0 0; }
    .tu-status__retry { margin-top: 10px; min-height: 44px; padding: 8px 18px; border: 1px solid #1e3a8a; border-radius: 10px; background: #fff; color: #1e3a8a; font-weight: 600; cursor: pointer; }
    .tu-status__retry:hover { background: #eef2ff; }
    .tu-status__retry:focus-visible { outline: 3px solid #2563eb; outline-offset: 2px; }
    .tu-status__retry[aria-disabled="true"] { opacity: .6; cursor: progress; }
    .tu-status__notice { margin: 8px 0 0; color: #166534; }
    .tu-status__error { margin: 8px 0 0; color: #991b1b; }
  `]
})
export class TeacherUploadStatusBanner implements OnChanges, OnDestroy {
  @Input() assignmentId: string | null | undefined = null;
  @Input() submissionId: string | null | undefined = null;
  private api = inject(TeacherUploadApiService);
  readonly item = signal<TeacherUploadItem | null>(null);
  readonly busy = signal(false);
  readonly notice = signal('');
  readonly error = signal('');
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sequence = 0;

  readonly label = uploadStatusLabel;
  readonly description = uploadStatusDescription;
  readonly canRetry = uploadCanRetry;
  readonly stopped = uploadIsStopped;

  ngOnChanges(): void { this.item.set(null); this.notice.set(''); this.error.set(''); void this.load(); }
  ngOnDestroy(): void { this.sequence++; this.clearTimer(); }

  async load(): Promise<void> {
    this.clearTimer();
    const sequence = ++this.sequence, assignmentId = this.assignmentId, submissionId = this.submissionId;
    if (!assignmentId || !submissionId) return;
    try {
      const result = await this.api.list(assignmentId);
      if (sequence !== this.sequence) return;
      this.item.set(result.items.find(entry => entry.submissionId === submissionId) ?? null);
    } catch {
      if (sequence !== this.sequence) return;   // the page works without it; try again later
    }
    const current = this.item();
    if (current && current.status !== 'marked' && !uploadIsStopped(current)) this.timer = setTimeout(() => void this.load(), POLL_MS);
  }

  async retry(): Promise<void> {
    const current = this.item();
    if (!current || this.busy() || !this.assignmentId) return;
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try {
      const result = await this.api.retry(this.assignmentId, current.submissionId);
      this.item.set(result.item);
      this.notice.set(result.alreadyRequested ? 'Marking is already running.' : 'Marking restarted. This can take a few minutes.');
      void this.load();
    } catch (error) {
      this.error.set(friendlyError(error).message);
    } finally {
      this.busy.set(false);
    }
  }

  private clearTimer(): void { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }
}
