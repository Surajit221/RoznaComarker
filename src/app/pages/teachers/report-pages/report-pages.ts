import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { AssignmentApiService } from '../../../api/assignment-api.service';
import { ClassApiService } from '../../../api/class-api.service';
import { FeedbackApiService } from '../../../api/feedback-api.service';
import { SubmissionApiService, type BackendSubmission } from '../../../api/submission-api.service';

@Component({
  selector: 'app-report-pages',
  imports: [CommonModule],
  templateUrl: './report-pages.html',
  styleUrl: './report-pages.css',
})
export class ReportPages {
  private route = inject(ActivatedRoute);
  private classApi = inject(ClassApiService);
  private assignmentApi = inject(AssignmentApiService);
  private submissionApi = inject(SubmissionApiService);
  private feedbackApi = inject(FeedbackApiService);

  isLoading = false;
  classId: string | null = null;

  totalEssays = 0;
  completedCount = 0;
  needRevisionCount = 0;
  needsImprovementCount = 0;

  completedPctText = '0%';
  needRevisionPctText = '0%';
  needsImprovementPctText = '0%';

  totalResults = 0;
  visibleFrom = 0;
  visibleTo = 0;

  searchTerm = '';
  private readonly pageSize = 5;
  currentPage = 1;
  totalPages = 1;
  pageNumbers: number[] = [1];

  commonIssues: Array<{ label: string; pctText: string }> = [
    { label: 'Grammar and punctuation errors', pctText: '0%' },
    { label: 'Weak thesis statements', pctText: '0%' },
    { label: 'Insufficient supporting evidence', pctText: '0%' },
    { label: 'Poor paragraph structure', pctText: '0%' },
    { label: 'Vocabulary repetition', pctText: '0%' }
  ];

  performanceTrends: Array<string> = [
    'Average score improved by 0% this month',
    'Revision rate decreased by 0%',
    'Most common essay type: (N/A)',
    'Longest essay: 0 words',
    'Shortest essay: 0 words'
  ];

  private allRows: Array<{
    title: string;
    subtitle: string;
    iconBgClass: string;
    iconTextClass: string;
    authorName: string;
    authorMeta: string;
    dateLabel: string;
    scorePct: number;
    scorePctText: string;
    scoreBarColorClass: string;
    scoreLabel: string;
    statusLabel: string;
    statusPillClass: string;
    statusIconClass: string;
  }> = [];

  filteredRows: Array<{
    title: string;
    subtitle: string;
    iconBgClass: string;
    iconTextClass: string;
    authorName: string;
    authorMeta: string;
    dateLabel: string;
    scorePct: number;
    scorePctText: string;
    scoreBarColorClass: string;
    scoreLabel: string;
    statusLabel: string;
    statusPillClass: string;
    statusIconClass: string;
  }> = [];

  pagedRows: Array<{
    title: string;
    subtitle: string;
    iconBgClass: string;
    iconTextClass: string;
    authorName: string;
    authorMeta: string;
    dateLabel: string;
    scorePct: number;
    scorePctText: string;
    scoreBarColorClass: string;
    scoreLabel: string;
    statusLabel: string;
    statusPillClass: string;
    statusIconClass: string;
  }> = [];

  async ngOnInit() {
    this.classId = this.route.snapshot.queryParamMap.get('classId');
    await this.load();
  }

  private scoreLabelFromPct(pct: number): string {
    if (pct >= 90) return 'Excellent';
    if (pct >= 75) return 'Good';
    if (pct >= 60) return 'Satisfactory';
    return 'Needs Work';
  }

  private statusBucketFromScore(pct: number): 'completed' | 'need_revision' | 'needs_improvement' {
    if (pct >= 85) return 'completed';
    if (pct >= 70) return 'need_revision';
    return 'needs_improvement';
  }

  private safePctText(n: number): string {
    const v = Number(n);
    if (!Number.isFinite(v)) return '0%';
    return `${Math.max(0, Math.min(100, Math.round(v)))}%`;
  }

  private async load(): Promise<void> {
    this.isLoading = true;
    try {
      const classes = await this.classApi.getMyTeacherClasses();
      const classIdsAll = (classes || []).map((c: any) => c?._id).filter(Boolean);
      const classIds = this.classId ? classIdsAll.filter((id: string) => id === this.classId) : classIdsAll;

      const assignmentsByClass = await Promise.all(
        classIds.map(async (classId: string) => {
          try {
            const list = await this.assignmentApi.getClassAssignments(classId);
            return { classId, assignments: list || [] };
          } catch {
            return { classId, assignments: [] };
          }
        })
      );

      const submissions: BackendSubmission[] = (
        await Promise.all(
          assignmentsByClass.flatMap((bucket) =>
            (bucket.assignments || []).map(async (a: any) => {
              const assignmentId = a?._id;
              if (!assignmentId) return [] as BackendSubmission[];
              try {
                return await this.submissionApi.getSubmissionsByAssignment(assignmentId);
              } catch {
                return [] as BackendSubmission[];
              }
            })
          )
        )
      ).flat();

      const submissionRows = submissions
        .map((s) => {
          const submissionId = (s as any)?._id;
          const student = (s as any)?.student;
          const studentName =
            (student && typeof student === 'object' ? (student.displayName || student.email) : '') || 'Student';

          const assignment = (s as any)?.assignment;
          const assignmentTitle =
            (assignment && typeof assignment === 'object' ? (assignment.title || assignment.name) : '') || 'Essay';

          const rawDate = (s as any)?.submittedAt || (s as any)?.createdAt;
          const d = rawDate ? new Date(rawDate) : null;
          const dateTs = d && Number.isFinite(d.getTime()) ? d.getTime() : 0;
          const dateLabel = d && Number.isFinite(d.getTime()) ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }) : '';

          return {
            submissionId,
            studentName,
            assignmentTitle,
            dateLabel,
            dateTs,
            raw: s
          };
        })
        .filter((x) => typeof x.submissionId === 'string' && x.submissionId);

      const feedbackBySubmissionId = new Map<string, any>();
      await Promise.all(
        submissionRows.map(async (r) => {
          try {
            const fb = await this.feedbackApi.getSubmissionFeedback(r.submissionId);
            feedbackBySubmissionId.set(r.submissionId, fb);
          } catch {
            feedbackBySubmissionId.set(r.submissionId, null);
          }
        })
      );

      const computed = submissionRows
        .map((r, idx) => {
          const fb = feedbackBySubmissionId.get(r.submissionId);
          const scoreRaw = Number(fb && (fb as any).overallScore);
          const scorePct = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : 0;
          const bucket = this.statusBucketFromScore(scorePct);

          const iconSet = idx % 5;
          const iconTheme =
            iconSet === 0
              ? { iconBgClass: 'bg-blue-100', iconTextClass: 'text-blue-600' }
              : iconSet === 1
                ? { iconBgClass: 'bg-purple-100', iconTextClass: 'text-purple-600' }
                : iconSet === 2
                  ? { iconBgClass: 'bg-red-100', iconTextClass: 'text-red-600' }
                  : iconSet === 3
                    ? { iconBgClass: 'bg-green-100', iconTextClass: 'text-green-600' }
                    : { iconBgClass: 'bg-indigo-100', iconTextClass: 'text-indigo-600' };

          const statusConfig =
            bucket === 'completed'
              ? {
                  statusLabel: 'Completed',
                  statusPillClass: 'bg-green-100 text-green-800',
                  statusIconClass: 'fas fa-check-circle mr-1',
                  scoreBarColorClass: 'bg-green-500'
                }
              : bucket === 'need_revision'
                ? {
                    statusLabel: 'Needs Revision',
                    statusPillClass: 'bg-yellow-100 text-yellow-800',
                    statusIconClass: 'fas fa-edit mr-1',
                    scoreBarColorClass: 'bg-yellow-500'
                  }
                : {
                    statusLabel: 'Needs Improvement',
                    statusPillClass: 'bg-red-100 text-red-800',
                    statusIconClass: 'fas fa-exclamation-triangle mr-1',
                    scoreBarColorClass: 'bg-red-500'
                  };

          return {
            ...iconTheme,
            title: r.assignmentTitle,
            subtitle: '—',
            authorName: r.studentName,
            authorMeta: '',
            dateLabel: r.dateLabel,
            dateTs: Number(r.dateTs) || 0,
            scorePct,
            scorePctText: `${scorePct}%`,
            scoreLabel: this.scoreLabelFromPct(scorePct),
            ...statusConfig,
            correctionStats: fb && (fb as any).correctionStats ? (fb as any).correctionStats : null
          };
        })
        .sort((a, b) => {
          // Keep newest first
          const ad = Number((a as any).dateTs) || 0;
          const bd = Number((b as any).dateTs) || 0;
          return bd - ad;
        });

      this.totalEssays = computed.length;
      const completed = computed.filter((x) => x.statusLabel === 'Completed').length;
      const needRevision = computed.filter((x) => x.statusLabel === 'Needs Revision').length;
      const needsImprovement = computed.filter((x) => x.statusLabel === 'Needs Improvement').length;

      this.completedCount = completed;
      this.needRevisionCount = needRevision;
      this.needsImprovementCount = needsImprovement;

      const total = this.totalEssays || 0;
      this.completedPctText = this.safePctText(total ? (completed / total) * 100 : 0);
      this.needRevisionPctText = this.safePctText(total ? (needRevision / total) * 100 : 0);
      this.needsImprovementPctText = this.safePctText(total ? (needsImprovement / total) * 100 : 0);

      this.allRows = computed.map((x) => ({
        title: x.title,
        subtitle: x.subtitle,
        iconBgClass: x.iconBgClass,
        iconTextClass: x.iconTextClass,
        authorName: x.authorName,
        authorMeta: x.authorMeta,
        dateLabel: x.dateLabel,
        scorePct: x.scorePct,
        scorePctText: x.scorePctText,
        scoreBarColorClass: x.scoreBarColorClass,
        scoreLabel: x.scoreLabel,
        statusLabel: x.statusLabel,
        statusPillClass: x.statusPillClass,
        statusIconClass: x.statusIconClass
      }));

      this.currentPage = 1;
      this.applyFilterAndPagination();

      // Common issues: aggregate correctionStats percentages (best-effort)
      const statsAgg = { grammar: 0, mechanics: 0, organization: 0, content: 0, vocabulary: 0 };
      for (const x of computed) {
        const cs = (x as any).correctionStats;
        if (!cs || typeof cs !== 'object') continue;
        statsAgg.grammar += Number(cs.grammar) || 0;
        statsAgg.mechanics += Number(cs.mechanics) || 0;
        statsAgg.organization += Number(cs.organization) || 0;
        statsAgg.content += Number(cs.content) || 0;
        statsAgg.vocabulary += Number(cs.vocabulary) || 0;
      }

      const totalIssues =
        (Number(statsAgg.grammar) || 0) +
        (Number(statsAgg.mechanics) || 0) +
        (Number(statsAgg.organization) || 0) +
        (Number(statsAgg.content) || 0) +
        (Number(statsAgg.vocabulary) || 0);

      const pct = (n: number) => (totalIssues ? (n / totalIssues) * 100 : 0);
      // Map to the existing labels (heuristic mapping)
      const grammarPct = pct(statsAgg.grammar + statsAgg.mechanics);
      const thesisPct = pct(statsAgg.organization);
      const evidencePct = pct(statsAgg.content);
      const structurePct = pct(statsAgg.organization);
      const vocabPct = pct(statsAgg.vocabulary);

      this.commonIssues = [
        { label: 'Grammar and punctuation errors', pctText: this.safePctText(grammarPct) },
        { label: 'Weak thesis statements', pctText: this.safePctText(thesisPct) },
        { label: 'Insufficient supporting evidence', pctText: this.safePctText(evidencePct) },
        { label: 'Poor paragraph structure', pctText: this.safePctText(structurePct) },
        { label: 'Vocabulary repetition', pctText: this.safePctText(vocabPct) }
      ];

      // Performance trends: best-effort placeholders based on current dataset
      const reviewedScores = computed.map((x) => x.scorePct).filter((n) => Number.isFinite(n));
      const avgScore = reviewedScores.length ? reviewedScores.reduce((a, b) => a + b, 0) / reviewedScores.length : 0;
      const revisionRate = total ? (needRevision / total) * 100 : 0;

      this.performanceTrends = [
        `Average score improved by 0% this month`,
        `Revision rate decreased by 0%`,
        `Most common essay type: (N/A)`,
        `Average score: ${Math.round(avgScore)}%`,
        `Revision rate: ${Math.round(revisionRate)}%`
      ];
    } finally {
      this.isLoading = false;
    }
  }

  onSearchInput(value: string): void {
    this.searchTerm = typeof value === 'string' ? value : '';
    this.currentPage = 1;
    this.applyFilterAndPagination();
  }

  goToPage(page: number): void {
    const p = Number(page);
    if (!Number.isFinite(p)) return;
    const next = Math.max(1, Math.min(this.totalPages, Math.floor(p)));
    if (next === this.currentPage) return;
    this.currentPage = next;
    this.applyFilterAndPagination();
  }

  prevPage(): void {
    this.goToPage(this.currentPage - 1);
  }

  nextPage(): void {
    this.goToPage(this.currentPage + 1);
  }

  private applyFilterAndPagination(): void {
    const term = (this.searchTerm || '').trim().toLowerCase();
    const base = this.allRows || [];

    this.filteredRows = !term
      ? [...base]
      : base.filter((r) => {
          const hay = `${r.title} ${r.subtitle} ${r.authorName} ${r.authorMeta} ${r.dateLabel} ${r.scorePctText} ${r.scoreLabel} ${r.statusLabel}`
            .toLowerCase();
          return hay.includes(term);
        });

    this.totalResults = this.filteredRows.length;
    this.totalPages = Math.max(1, Math.ceil(this.totalResults / this.pageSize));
    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages;
    }

    const startIdx = (this.currentPage - 1) * this.pageSize;
    const endIdxExclusive = startIdx + this.pageSize;
    this.pagedRows = this.filteredRows.slice(startIdx, endIdxExclusive);

    this.visibleFrom = this.totalResults ? startIdx + 1 : 0;
    this.visibleTo = this.totalResults ? Math.min(this.totalResults, startIdx + this.pagedRows.length) : 0;

    this.pageNumbers = Array.from({ length: this.totalPages }).map((_, i) => i + 1);
  }
}
