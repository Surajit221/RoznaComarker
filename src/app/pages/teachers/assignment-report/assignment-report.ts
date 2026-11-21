import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import {
  AssignmentReportApiService, browserTimeZone, reportErrorState, summaryErrorMessage,
  type AssignmentReport, type AssignmentReportStudent, type CommonMistakeExample, type ReportErrorState,
} from '../../../api/assignment-report-api.service';
import { ReportColumnChart } from '../../../components/teacher/assignment-report-charts/report-column-chart';
import { ReportBarList, type ReportBarItem } from '../../../components/teacher/assignment-report-charts/report-bar-list';
import { CATEGORY_TONES, type CorrectionCategoryKey } from '../../../constants/category-palette';
import { PdfApiService } from '../../../api/pdf-api.service';
import { assignmentReportPdfFilename, reportPdfErrorMessage } from '../../../utils/assignment-report-pdf.util';
import { triggerBlobDownload } from '../../../utils/file-download.util';

type PageState = 'loading' | 'ready' | ReportErrorState;
type SortKey = 'name' | 'status' | 'score' | 'late' | 'reviewed';
interface StudentRow extends AssignmentReportStudent { statusLabel: string; statusDetail: string | null; statusTone: string; statusIcon: string; sourceLabel: string }
type TableEntry = { kind: 'group'; label: string } | { kind: 'row'; row: StudentRow };
type StatusFilter = 'all' | 'attention' | 'not_reviewed' | 'late';
/** A piece of a sentence as shown: plain text, a marked mistake (or correction), or the gap of a shortened sentence. */
type Segment = { kind: 'text'; text: string } | { kind: 'mark'; text: string } | { kind: 'gap' };
interface SentenceView { original: Segment[]; corrected: Segment[] | null; cutStart: boolean; cutEnd: boolean; marks: number }
interface ExampleView { original: string; corrected: string; explanation: string; sentence: SentenceView | null }
/** One row of the "Common errors" card: a correction type with its students chip (null for AI-analysis counts), total and examples. */
interface ErrorRow { key: string; title: string; studentText: string | null; totalText: string; examples: ExampleView[]; examplesId: string; noExamples: boolean }

const PAGE_SIZE = 10;
// The card shows this many examples of a type; the rest (up to 5 from the API) open with "Show N more".
const SHOWN_EXAMPLES = 3;
const times = (n: number) => (n === 1 ? '1 time' : `${n} times`);
const asText = (value: unknown) => (typeof value === 'string' ? value : '');

/** The sentence as two lines of segments (as written, then corrected), or null when the data is not a usable sentence. Never throws. */
function sentenceView(sentence: CommonMistakeExample['sentence'] | unknown): SentenceView | null {
  const parts = (sentence as { parts?: unknown } | null | undefined)?.parts;
  if (!Array.isArray(parts)) return null;
  const original: Segment[] = [], corrected: Segment[] = [];
  let marks = 0, anyCorrection = false;
  for (const part of parts as (Record<string, unknown> | null)[]) {
    if (!part || typeof part !== 'object') return null;
    if (part['gap'] === true) { original.push({ kind: 'gap' }); corrected.push({ kind: 'gap' }); continue; }
    const text = asText(part['text']);
    if (part['error'] === true) {
      marks += 1;
      original.push({ kind: 'mark', text });
      const fix = asText(part['corrected']);
      if (fix) { anyCorrection = true; corrected.push({ kind: 'mark', text: fix }); }
    } else { original.push({ kind: 'text', text }); corrected.push({ kind: 'text', text }); }
  }
  if (!marks) return null;
  const s = sentence as { cutStart?: unknown; cutEnd?: unknown };
  return { original, corrected: anyCorrection ? corrected : null, cutStart: s.cutStart === true, cutEnd: s.cutEnd === true, marks };
}
function exampleView(example: CommonMistakeExample | unknown): ExampleView | null {
  if (!example || typeof example !== 'object') return null;
  const e = example as Partial<CommonMistakeExample>;
  return { original: asText(e.original), corrected: asText(e.corrected), explanation: asText(e.explanation), sentence: sentenceView(e.sentence) };
}
export const ERROR_MESSAGES: Readonly<Record<ReportErrorState, string>> = Object.freeze({
  not_found: 'Report not found',
  unsupported: 'Reports are only available for essay assignments',
  busy: 'Too many requests, try again in a minute',
  error: 'The report could not be loaded. Please try again.',
});
const SOURCE_LABELS: Record<string, string> = { class: 'Class', guest: 'Guest', teacher_upload: 'Teacher upload' };
const NOT_SCORED_DETAIL: Record<string, string> = { FAILED: 'Assessment failed', BLOCKED: 'Blocked', STALE: 'Out of date', PARTIAL: 'Incomplete' };
const STATUS_RANK: Record<string, number> = { not_scored: 0, needs_attention: 1, needs_revision: 2, in_progress: 3, on_track: 4 };

function statusOf(s: AssignmentReportStudent): Pick<StudentRow, 'statusLabel' | 'statusDetail' | 'statusTone' | 'statusIcon'> {
  if (s.assessment === 'in_progress') return { statusLabel: 'In progress', statusDetail: null, statusTone: 'progress', statusIcon: 'bx-time-five' };
  if (s.assessment === 'not_scored' || s.score === null) {
    return { statusLabel: 'Not scored', statusDetail: NOT_SCORED_DETAIL[String(s.notScoredReason)] || null, statusTone: 'unscored', statusIcon: 'bx-error-circle' };
  }
  if (s.band === 'on_track') return { statusLabel: 'On track', statusDetail: null, statusTone: 'good', statusIcon: 'bx-check-circle' };
  if (s.band === 'needs_revision') return { statusLabel: 'Needs revision', statusDetail: null, statusTone: 'warning', statusIcon: 'bx-edit' };
  return { statusLabel: 'Needs attention', statusDetail: null, statusTone: 'critical', statusIcon: 'bx-error' };
}
const rankOf = (r: StudentRow) => STATUS_RANK[r.assessment === 'scored' ? String(r.band) : r.assessment] ?? 5;

/** Teacher-only report for one essay assignment: KPI cards, charts, rubric, errors, students and insights. */
@Component({
  selector: 'app-assignment-report-page',
  imports: [ReportColumnChart, ReportBarList],
  templateUrl: './assignment-report.html',
  styleUrl: './assignment-report.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssignmentReportPage implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly api = inject(AssignmentReportApiService);
  private readonly pdfApi = inject(PdfApiService);

  /** AI summary card: only when the feature is on for this report. Generated only on the teacher's click. */
  readonly summaryRunning = signal(false);
  readonly summaryNotice = signal<{ kind: 'fallback' | 'error'; message: string } | null>(null);
  private readonly summaryLimitHit = signal(false);
  readonly summary = computed(() => {
    const block = this.report()?.summary;
    return block && block.enabled ? block : null;
  });
  readonly summaryLimitReached = computed(() => this.summaryLimitHit() || this.summary()?.remainingToday === 0);
  readonly summaryButtonLabel = computed(() => {
    const block = this.summary();
    if (!block || (block.state !== 'none' && block.state !== 'stale')) return null;
    if (this.summaryRunning()) return 'Writing summary…';
    if (this.summaryLimitReached()) return 'Daily limit reached';
    return block.state === 'stale' ? 'Regenerate' : 'Generate summary';
  });

  /** Export PDF: idle -> generating -> idle (downloaded) or error. */
  readonly pdfState = signal<'idle' | 'generating' | 'error'>('idle');
  readonly pdfMessage = signal<string | null>(null);

  readonly errorMessage = computed(() => {
    const state = this.state();
    return state === 'loading' || state === 'ready' ? '' : ERROR_MESSAGES[state];
  });
  readonly errorsNote = 'Counts are from the AI analysis and may include items you removed.';

  /**
   * "Common errors": one card. Category chips come from the AI analysis (errorsNote); the rows from the corrections students can see:
   * each type with the students affected, the total, and examples (only for a type 2 or more students made). An older backend, or too
   * few students, falls back to the AI-analysis type counts (no students chip, no examples).
   */
  readonly commonMistakesNote = 'Based on the corrections students can see. Corrections you removed are not counted.';
  readonly commonMistakesPartialNote = 'Some edited essays were left out of this section.';
  readonly commonMistakes = computed(() => this.report()?.commonMistakes ?? null);
  readonly errorCategories = computed(() => (this.report()?.errors.categories || []).filter((c) => c.count > 0)
    .map((c) => ({ key: c.key, label: c.label, count: c.count, color: CATEGORY_TONES[c.key as CorrectionCategoryKey]?.edge ?? null })));
  readonly errorRows = computed<ErrorRow[]>(() => {
    const block = this.commonMistakes();
    const idOf = (code: string) => `common-error-examples-${code.replace(/[^A-Za-z0-9_-]/g, '')}`;
    const types = block?.state === 'ok' && Array.isArray(block.types) ? block.types : [];
    if (types.length) return types.map((t) => {
      const examples = t.isCommon && Array.isArray(t.examples) ? t.examples.map(exampleView).filter((e): e is ExampleView => e !== null) : [];
      return { key: t.typeCode, title: `${t.typeCode} · ${t.label}`, totalText: times(t.occurrenceCount), examples, examplesId: idOf(t.typeCode),
        studentText: t.studentCount === 1 ? '1 student' : `${t.studentCount} of ${t.totalStudents} students`, noExamples: !examples.length };
    });
    return (this.report()?.errors.symbols || []).map((s) => ({ key: s.symbol, title: `${s.symbol} · ${s.label}`, studentText: null,
      totalText: times(s.count), examples: [], examplesId: idOf(s.symbol), noExamples: false }));
  });
  readonly commonEmptyText = computed(() => {
    const block = this.commonMistakes();
    if (!block) return null;
    if (block.state === 'not_enough_students') return 'Not enough submissions yet to find common mistakes';
    return block.state === 'ok' && block.types?.length ? null : 'No mistake was shared by 2 or more students.';
  });
  private readonly openExamples = signal<ReadonlySet<string>>(new Set());
  private readonly moreExamples = signal<ReadonlySet<string>>(new Set());
  readonly shownExamples = SHOWN_EXAMPLES;
  examplesOpen(typeCode: string): boolean { return this.openExamples().has(typeCode); }
  toggleExamples(typeCode: string): void { this.openExamples.set(this.flip(this.openExamples(), typeCode)); }
  /** "Show 2 more examples": the rest of a type's examples (each row on its own). */
  moreOpen(typeCode: string): boolean { return this.moreExamples().has(typeCode); }
  toggleMore(typeCode: string): void { this.moreExamples.set(this.flip(this.moreExamples(), typeCode)); }
  private flip(set: ReadonlySet<string>, key: string): ReadonlySet<string> {
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  }
  readonly state = signal<PageState>('loading');
  readonly report = signal<AssignmentReport | null>(null);
  readonly search = signal('');
  readonly sortKey = signal<SortKey | null>(null);
  readonly sortDir = signal<'asc' | 'desc'>('asc');
  readonly page = signal(1);

  private assignmentId = '';
  private sequence = 0;
  private destroyed = false;

  readonly dueDate = computed(() => {
    const r = this.report();
    if (!r?.assignment.deadline) return 'Not set';
    const date = new Date(r.assignment.deadline);
    if (!Number.isFinite(date.getTime())) return 'Not set';
    try { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: r.timeZone || 'UTC' }).format(date); }
    catch { return date.toDateString(); }
  });

  readonly sourceSummary = computed(() => {
    const c = this.report()?.counts;
    if (!c) return '';
    const parts = [`${c.bySource.class} class`, `${c.bySource.guest} guest`, `${c.bySource.teacherUpload} teacher upload`];
    return `${c.total} ${c.total === 1 ? 'submission' : 'submissions'}: ${parts.join(', ')} · ${c.reviewed} reviewed`;
  });

  readonly kpis = computed(() => {
    const r = this.report();
    if (!r) return [];
    const pctText = (n: number | null) => (n === null ? '—' : `${n}%`);
    return [
      { key: 'total', label: 'Total submissions', value: String(r.counts.total), icon: 'bx-file' },
      { key: 'scored', label: 'Scored', value: String(r.counts.scored), icon: 'bx-check-square' },
      { key: 'average', label: 'Average', value: pctText(r.scores.average), icon: 'bx-bar-chart-alt-2' },
      { key: 'median', label: 'Median', value: pctText(r.scores.median), icon: 'bx-git-commit' },
      { key: 'highest', label: 'Highest', value: pctText(r.scores.highest), icon: 'bx-up-arrow-alt' },
      { key: 'lowest', label: 'Lowest', value: pctText(r.scores.lowest), icon: 'bx-down-arrow-alt' },
      { key: 'revision', label: 'Needs revision', value: pctText(r.scores.needsRevisionPct), icon: 'bx-edit', hint: 'Scored under 80%' },
      { key: 'late', label: 'Late', value: String(r.counts.late), icon: 'bx-time' },
      { key: 'notScored', label: 'Not scored', value: String(r.counts.notScored), icon: 'bx-error-circle' },
    ];
  });

  readonly distribution = computed(() => (this.report()?.scores.bands || []).map((b) => ({ label: b.label, value: b.count })));
  readonly timeline = computed(() => {
    const r = this.report();
    if (!r) return [];
    const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    return r.timeline.points.map((p) => ({ label: fmt.format(new Date(`${p.date}T00:00:00Z`)), value: p.count }));
  });
  readonly weekly = computed(() => this.report()?.timeline.granularity === 'week');
  /** The line above the timeline: the busiest day (or week) and how many were late. Not shown when the timeline is hidden or empty. */
  readonly timelineSummary = computed(() => {
    const r = this.report();
    const points = r?.timeline.points || [];
    if (!r || r.smallData.timelineHidden || !points.length) return null;
    const top = points.reduce((best, p) => (p.count > best.count ? p : best), points[0]);
    if (!top.count) return null;
    const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${top.date}T00:00:00Z`));
    const busiest = this.weekly() ? `${top.count} of ${r.counts.total} in the week of ${day} (busiest week)` : `${top.count} of ${r.counts.total} on ${day} (busiest day)`;
    return { busiest, late: `${r.counts.late} late` };
  });

  readonly rubricItems = computed<ReportBarItem[]>(() => {
    const rubric = this.report()?.rubric;
    if (!rubric) return [];
    return rubric.criteria.map((c) => ({ key: c.key, label: c.label, percent: c.averagePct, valueText: `${c.averagePct}%`,
      marker: c.key === rubric.strongestKey ? 'strongest' : c.key === rubric.weakestKey ? 'weakest' : null }));
  });

  private readonly rows = computed<StudentRow[]>(() => (this.report()?.students || []).map((s) => ({
    ...s, ...statusOf(s), sourceLabel: SOURCE_LABELS[s.source] || 'Class' })));

  /** Students status filter (with counts), combined with the search. */
  readonly statusFilter = signal<StatusFilter>('all');
  private readonly statusTests: Readonly<Record<StatusFilter, (r: StudentRow) => boolean>> = {
    all: () => true, attention: (r) => r.needsAttention, not_reviewed: (r) => !r.reviewed, late: (r) => r.isLate };
  readonly statusFilters = computed(() => ([['all', 'All'], ['attention', 'Needs attention'], ['not_reviewed', 'Not reviewed'], ['late', 'Late']] as const)
    .map(([key, label]) => ({ key, label, count: this.rows().filter(this.statusTests[key]).length })));
  setStatusFilter(key: StatusFilter): void { this.statusFilter.set(key); this.page.set(1); }

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.statusTests[this.statusFilter()];
    const list = this.rows().filter((r) => status(r) && (!term || r.name.toLowerCase().includes(term)));
    const key = this.sortKey(), dir = this.sortDir() === 'asc' ? 1 : -1;
    const compare = (a: StudentRow, b: StudentRow): number => {
      if (key === 'score') {
        if (a.score === null || b.score === null) return a.score === b.score ? 0 : a.score === null ? 1 : -1;   // no score: always last
        return (a.score - b.score) * dir;
      }
      if (key === 'name') return a.name.localeCompare(b.name) * dir;
      if (key === 'status') return (rankOf(a) - rankOf(b)) * dir;
      if (key === 'late') return (Number(b.isLate) - Number(a.isLate)) * dir;
      if (key === 'reviewed') return (Number(b.reviewed) - Number(a.reviewed)) * dir;
      return 0;
    };
    const attention = list.filter((r) => r.needsAttention), others = list.filter((r) => !r.needsAttention);
    if (key) { attention.sort(compare); others.sort(compare); }
    return [...attention, ...others];
  });
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / PAGE_SIZE)));
  readonly currentPage = computed(() => Math.min(this.page(), this.pageCount()));
  readonly tableEntries = computed<TableEntry[]>(() => {
    const start = (this.currentPage() - 1) * PAGE_SIZE;
    const slice = this.filtered().slice(start, start + PAGE_SIZE);
    const hasAttention = this.filtered().some((r) => r.needsAttention);
    const out: TableEntry[] = [];
    let group: boolean | null = null;
    for (const row of slice) {
      if (hasAttention && row.needsAttention !== group) {
        group = row.needsAttention;
        out.push({ kind: 'group', label: row.needsAttention ? 'Needs attention' : 'Other students' });
      }
      out.push({ kind: 'row', row });
    }
    return out;
  });
  readonly resultText = computed(() => {
    const shown = this.filtered().length, total = this.rows().length;
    return shown === total ? `${total} ${total === 1 ? 'student' : 'students'}` : `Showing ${shown} of ${total} students`;
  });

  ngOnInit(): void {
    this.assignmentId = this.route.snapshot.paramMap.get('assignmentId') || '';
    void this.load();
  }

  ngOnDestroy(): void { this.destroyed = true; }

  async load(): Promise<void> {
    const sequence = ++this.sequence;
    this.state.set('loading');
    try {
      const report = await this.api.getReport(this.assignmentId, browserTimeZone());
      if (this.destroyed || sequence !== this.sequence) return;
      this.report.set(report);
      this.page.set(1);
      this.state.set('ready');
    } catch (error) {
      if (this.destroyed || sequence !== this.sequence) return;
      this.report.set(null);
      this.state.set(reportErrorState(error));
    }
  }

  canRetry(state: PageState): boolean { return state === 'busy' || state === 'error'; }

  sortBy(key: SortKey): void {
    if (this.sortKey() === key) this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    else { this.sortKey.set(key); this.sortDir.set('asc'); }
    this.page.set(1);
  }
  ariaSort(key: SortKey): 'ascending' | 'descending' | null {
    return this.sortKey() === key ? (this.sortDir() === 'asc' ? 'ascending' : 'descending') : null;
  }
  onSearch(value: string): void { this.search.set(value); this.page.set(1); }
  goToPage(page: number): void { this.page.set(Math.max(1, Math.min(this.pageCount(), page))); }

  async generateSummary(): Promise<void> {
    const block = this.summary();
    if (!block || this.summaryRunning() || this.summaryLimitReached()) return;   // one request at a time
    this.summaryRunning.set(true);
    this.summaryNotice.set(null);
    try {
      const result = await this.api.generateSummary(this.assignmentId);
      if (this.destroyed) return;
      this.report.update((r) => (r && r.summary?.enabled
        ? { ...r, summary: { ...r.summary, state: result.state, current: result.current, remainingToday: result.remainingToday } } : r));
      if (result.source === 'fallback') {
        this.summaryNotice.set({ kind: 'fallback', message: 'The AI summary is not available right now. The insights below are built directly from your data.' });
      }
    } catch (error) {
      if (this.destroyed) return;
      const mapped = summaryErrorMessage(error);
      if (mapped.limitReached) this.summaryLimitHit.set(true);
      if (mapped.notEnoughData) this.report.update((r) => (r && r.summary?.enabled ? { ...r, summary: { ...r.summary, state: 'not_enough_data', current: null } } : r));
      this.summaryNotice.set({ kind: 'error', message: mapped.message });
    } finally {
      if (!this.destroyed) this.summaryRunning.set(false);
    }
  }

  formatSummaryDate(iso: string): string {
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return '';
    try { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date); }
    catch { return date.toISOString().slice(0, 10); }
  }

  async exportPdf(): Promise<void> {
    const report = this.report();
    if (!report || this.pdfState() === 'generating') return;   // one request at a time
    this.pdfState.set('generating');
    this.pdfMessage.set(null);
    try {
      const timeZone = browserTimeZone();
      const { blob, filename } = await this.pdfApi.downloadAssignmentReportPdf(this.assignmentId, timeZone);
      if (this.destroyed) return;
      this.saveFile(blob, filename || assignmentReportPdfFilename(report.assignment.title, new Date(), timeZone));
      this.pdfState.set('idle');
      this.pdfMessage.set('PDF downloaded.');
    } catch (error) {
      if (this.destroyed) return;
      this.pdfState.set('error');
      this.pdfMessage.set(reportPdfErrorMessage(error));
    }
  }

  /** Hands the file to the browser (separate so tests do not start real downloads). */
  saveFile(blob: Blob, filename: string): void {
    triggerBlobDownload(blob, { filename, mimeType: 'application/pdf' });
  }

  back(): void {
    if (typeof window !== 'undefined' && window.history.length > 1) this.location.back();
    else void this.router.navigate(['/teacher/my-classes']);
  }
}
