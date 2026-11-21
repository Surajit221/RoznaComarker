import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import {
  AssignmentReportApiService, browserTimeZone, reportErrorState, summaryErrorMessage,
  type AssignmentReport, type AssignmentReportStudent, type CommonMistakeType, type ReportErrorState,
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
interface CommonMistakeRow extends CommonMistakeType { title: string; studentText: string; percent: number; color: string | null; examplesId: string }

const PAGE_SIZE = 10;
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

  /** Common mistakes: only types 2 or more students made; their examples open one row at a time (each row on its own). */
  readonly commonMistakesNote = 'Based on the corrections students can see. Corrections you removed are not counted.';
  readonly commonMistakesPartialNote = 'Some edited essays were left out of this section.';
  readonly commonMistakes = computed(() => this.report()?.commonMistakes ?? null);
  readonly commonRows = computed<CommonMistakeRow[]>(() => (this.commonMistakes()?.types || []).filter((t) => t.isCommon).map((t) => ({
    ...t, title: `${t.typeCode} · ${t.label}`, studentText: `${t.studentCount} of ${t.totalStudents} students`,
    percent: t.totalStudents > 0 ? Math.round((t.studentCount / t.totalStudents) * 100) : 0,
    color: CATEGORY_TONES[String(t.category) as CorrectionCategoryKey]?.edge ?? null,
    examplesId: `common-mistake-examples-${t.typeCode.replace(/[^A-Za-z0-9_-]/g, '')}` })));
  readonly commonEmptyText = computed(() => {
    const block = this.commonMistakes();
    if (!block) return null;
    if (block.state === 'not_enough_students') return 'Not enough submissions yet to find common mistakes';
    return this.commonRows().length ? null : 'No mistake was shared by 2 or more students.';
  });
  private readonly openExamples = signal<ReadonlySet<string>>(new Set());
  examplesOpen(typeCode: string): boolean { return this.openExamples().has(typeCode); }
  toggleExamples(typeCode: string): void {
    const next = new Set(this.openExamples());
    if (next.has(typeCode)) next.delete(typeCode); else next.add(typeCode);
    this.openExamples.set(next);
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

  readonly rubricItems = computed<ReportBarItem[]>(() => {
    const rubric = this.report()?.rubric;
    if (!rubric) return [];
    return rubric.criteria.map((c) => ({ key: c.key, label: c.label, percent: c.averagePct, valueText: `${c.averagePct}%`,
      marker: c.key === rubric.strongestKey ? 'strongest' : c.key === rubric.weakestKey ? 'weakest' : null }));
  });
  readonly categoryItems = computed<ReportBarItem[]>(() => (this.report()?.errors.categories || []).map((c) => ({
    key: c.key, label: c.label, percent: c.pct, valueText: `${c.count} (${c.pct}%)`,
    color: CATEGORY_TONES[c.key as CorrectionCategoryKey]?.edge ?? null })));
  readonly symbolItems = computed<ReportBarItem[]>(() => (this.report()?.errors.symbols || []).map((s) => ({
    key: s.symbol, label: `${s.symbol} · ${s.label}`, percent: s.pct, valueText: `${s.count} (${s.pct}%)`,
    color: CATEGORY_TONES[String(s.category) as CorrectionCategoryKey]?.edge ?? null })));

  private readonly rows = computed<StudentRow[]>(() => (this.report()?.students || []).map((s) => ({
    ...s, ...statusOf(s), sourceLabel: SOURCE_LABELS[s.source] || 'Class' })));

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const list = term ? this.rows().filter((r) => r.name.toLowerCase().includes(term)) : this.rows().slice();
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
