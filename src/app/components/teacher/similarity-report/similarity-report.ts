import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SimilarityApiService, isReport, newSimilarityRequestId, similarityErrorOf, type SimilarityReport as Report, type SimilaritySource,
  type SimilarityView } from '../../../api/similarity-api.service';
import { ERROR_TEXT, NOT_ELIGIBLE_TEXT, colorFor, externalNote, overallText, percentText } from '../../../utils/similarity-display';
import { SimilarityText } from './similarity-text';

const ACTIVE = ['queued', 'running', 'submitted'];
const POLL_MS = 4000;

/**
 * The teacher's similarity "Match Overview" for one essay: the overall percentage (computed by the server: words counted once), numbered
 * sources with their percentages, highlights in the essay, a source's matched passages, and exclude / restore (one, selected, or all) with
 * the percentages updated at once and announced. Hidden entirely while the feature is off or for anyone but the owning teacher (404).
 * Exclusions are saved immediately (no unsaved form state). Text by interpolation only.
 */
@Component({
  selector: 'app-similarity-report',
  imports: [SimilarityText],
  templateUrl: './similarity-report.html',
  styleUrl: './similarity-report.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SimilarityReportPanel implements OnDestroy {
  private readonly api = inject(SimilarityApiService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private id = '';
  private version = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  @Input({ required: true }) set submissionId(value: string | null | undefined) {
    const next = typeof value === 'string' ? value.trim() : '';
    if (next === this.id) return;
    this.id = next;
    this.reset();
    if (next) void this.load();
  }
  get submissionId(): string { return this.id; }

  loading = false;
  hidden = true;
  busy = false;
  error = '';
  announcement = '';
  view: SimilarityView | null = null;
  tab: 'overview' | 'all' = 'overview';
  selectedSourceId: string | null = null;
  checked = new Set<string>();
  showHighlights = true;

  readonly color = colorFor;
  readonly percentText = percentText;

  get report(): Report | null { return isReport(this.view) ? this.view : null; }
  /** A report to show: completed, expired, or submitted (the Rubrilo comparison is done; the internet check still runs). */
  get hasResult(): boolean { return Boolean(this.report && ['completed', 'expired', 'submitted'].includes(this.report.state)); }
  get active(): boolean { return Boolean(this.view && ACTIVE.includes(this.view.state)); }
  get counted(): SimilaritySource[] { return this.report?.sources.filter(s => s.number) ?? []; }
  get uncounted(): SimilaritySource[] { return this.report?.sources.filter(s => !s.number && !s.excluded && s.compared) ?? []; }
  get notCompared(): SimilaritySource[] { return this.report?.sources.filter(s => !s.excluded && !s.compared) ?? []; }
  get excluded(): SimilaritySource[] { return this.report?.sources.filter(s => s.excluded) ?? []; }
  get selected(): SimilaritySource | null { return this.report?.sources.find(s => s.sourceId === this.selectedSourceId) ?? null; }
  get overall(): string { return this.report ? overallText(this.report.overallPercent, this.report.matchedWords) : ''; }
  get notEligibleText(): string { return this.view?.reason ? NOT_ELIGIBLE_TEXT[this.view.reason] || 'This essay cannot be checked yet.' : ''; }
  get externalText(): string { return this.report ? externalNote(this.report.external.state, this.report.external.reason) : ''; }
  get canCheck(): boolean {
    const v = this.view;
    return Boolean(v && v.eligible && !this.active && v.checksLeftForSubmission > 0 && v.checksLeftToday > 0);
  }
  get canRetry(): boolean {
    const r = this.report;
    return Boolean(r && !this.active && (r.state === 'failed' || r.state === 'expired' || ['failed', 'expired'].includes(r.external.state)));
  }
  /** The matched passages of a source, cut from the essay text (at most five). */
  passages(source: SimilaritySource): string[] {
    const text = this.report?.text ?? '';
    return (source.spans ?? []).slice(0, 5).map(s => text.slice(s.start, s.end).replace(/\f/g, ' ').trim()).filter(Boolean);
  }

  ngOnDestroy(): void { this.version++; this.stopPolling(); }

  private reset(): void {
    this.version++;
    this.stopPolling();
    this.view = null; this.hidden = true; this.error = ''; this.announcement = ''; this.selectedSourceId = null; this.checked = new Set(); this.tab = 'overview';
  }

  private apply(view: SimilarityView | null): void {
    this.view = view;
    this.hidden = view === null;
    if (this.selectedSourceId && !this.report?.sources.some(s => s.sourceId === this.selectedSourceId)) this.selectedSourceId = null;
    this.checked = new Set([...this.checked].filter(id => this.report?.sources.some(s => s.sourceId === id && !s.excluded)));
    this.stopPolling();
    if (this.active) this.timer = setTimeout(() => void this.load(true), POLL_MS);
    this.cdr.markForCheck();
  }

  private stopPolling(): void { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }

  async load(quiet = false): Promise<void> {
    const version = this.version;
    if (!quiet) { this.loading = true; this.cdr.markForCheck(); }
    try {
      const view = await this.api.get(this.id);
      if (version !== this.version) return;
      const wasActive = this.active;
      this.apply(view);
      if (wasActive && !this.active && this.report) this.announce(`Similarity check finished: ${this.overall} of the essay matches other text.`);
    } catch {
      if (version !== this.version) return;
      this.error = 'The similarity report could not be loaded.';
      if (this.active) this.timer = setTimeout(() => void this.load(true), POLL_MS * 2);
    } finally {
      if (version === this.version) { this.loading = false; this.cdr.markForCheck(); }
    }
  }

  private announce(text: string): void { this.announcement = text; this.cdr.markForCheck(); }

  private failWith(error: unknown): void {
    const e = similarityErrorOf(error);
    if (e.report) this.apply(e.report);
    this.error = (e.code && ERROR_TEXT[e.code]) || 'Something went wrong. Please try again.';
    if (e.code === 'SIMILARITY_REVISION_CONFLICT') { this.announce(this.error); this.error = ''; }
    this.cdr.markForCheck();
  }

  private async run(action: () => Promise<SimilarityView>, done?: (view: SimilarityView) => string): Promise<void> {
    if (this.busy) return;
    const version = this.version;
    this.busy = true; this.error = ''; this.cdr.markForCheck();
    try {
      const view = await action();
      if (version !== this.version) return;
      this.apply(view);
      if (done) this.announce(done(view));
    } catch (error) {
      if (version === this.version) this.failWith(error);
    } finally {
      if (version === this.version) { this.busy = false; this.cdr.markForCheck(); }
    }
  }

  startCheck(): Promise<void> {
    if (!this.canCheck) return Promise.resolve();
    const requestId = newSimilarityRequestId();
    return this.run(() => this.api.startCheck(this.id, requestId), () => 'Similarity check started.');
  }

  retry(): Promise<void> {
    if (!this.canRetry) return Promise.resolve();
    const requestId = newSimilarityRequestId();
    return this.run(() => this.api.retry(this.id, requestId), () => 'Trying the internet check again.');
  }

  setExcluded(source: SimilaritySource, excluded: boolean): Promise<void> {
    const report = this.report;
    if (!report) return Promise.resolve();
    const requestId = newSimilarityRequestId();
    return this.run(() => this.api.setExcluded(this.id, source.sourceId, excluded, report.revision, requestId),
      view => `${excluded ? 'Source excluded' : 'Source restored'}. Similarity is now ${isReport(view) ? overallText(view.overallPercent, view.matchedWords) : ''}.`);
  }

  toggleChecked(sourceId: string, on: boolean): void {
    const next = new Set(this.checked);
    if (on) next.add(sourceId); else next.delete(sourceId);
    this.checked = next;
    this.cdr.markForCheck();
  }

  /** Excludes the ticked sources one after another (each with the revision the previous one returned). */
  async excludeChecked(): Promise<void> {
    const ids = [...this.checked];
    if (!ids.length || !this.report || this.busy) return;
    const version = this.version;
    this.busy = true; this.error = ''; this.cdr.markForCheck();
    try {
      let view: Report = this.report;
      for (const id of ids) {
        const requestId = newSimilarityRequestId();
        view = await this.api.setExcluded(this.id, id, true, view.revision, requestId);
        if (version !== this.version) return;
      }
      this.checked = new Set();
      this.apply(view);
      this.announce(`${ids.length} ${ids.length === 1 ? 'source' : 'sources'} excluded. Similarity is now ${overallText(view.overallPercent, view.matchedWords)}.`);
    } catch (error) {
      if (version === this.version) this.failWith(error);
    } finally {
      if (version === this.version) { this.busy = false; this.cdr.markForCheck(); }
    }
  }

  restoreAll(): Promise<void> {
    const report = this.report;
    if (!report || !this.excluded.length) return Promise.resolve();
    const requestId = newSimilarityRequestId();
    return this.run(() => this.api.restoreAll(this.id, report.revision, requestId),
      view => `All sources restored. Similarity is now ${isReport(view) ? overallText(view.overallPercent, view.matchedWords) : ''}.`);
  }

  select(sourceId: string | null): void {
    this.selectedSourceId = this.selectedSourceId === sourceId ? null : sourceId;
    this.cdr.markForCheck();
  }

  open(source: SimilaritySource): void {
    if (!source.open) return;
    const { studentId, classId, assignmentId, submissionId } = source.open;
    void this.router.navigate(['/teacher/my-classes/detail/student-submissions', studentId], { queryParams: { classId, assignmentId, submissionId } });
  }

  async downloadPdf(): Promise<void> {
    if (this.busy || !this.report) return;
    this.busy = true; this.error = ''; this.cdr.markForCheck();
    try {
      const blob = await this.api.pdf(this.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = 'similarity-report.pdf';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      this.error = 'The similarity PDF could not be created. Please try again.';
    } finally { this.busy = false; this.cdr.markForCheck(); }
  }
}
