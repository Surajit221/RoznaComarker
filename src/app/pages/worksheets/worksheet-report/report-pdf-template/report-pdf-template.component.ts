import { Component, Input } from '@angular/core';
import type { WorksheetReportData } from '../../../../services/worksheet-report-pdf.service';

@Component({
  selector: 'app-report-pdf-template',
  standalone: true,
  templateUrl: './report-pdf-template.component.html',
  styleUrl: './report-pdf-template.component.scss',
})
export class ReportPdfTemplateComponent {
  @Input() reportData!: WorksheetReportData;

  get today(): string {
    return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  get topPerformers() {
    return this.reportData.students.filter(s => s.score >= 70).slice(0, 5);
  }

  get needsAttention() {
    return this.reportData.students.filter(s => s.score < 70).slice(0, 5);
  }

  get passedCount() {
    return this.reportData.students.filter(s => s.score >= 70).length;
  }

  get failedCount() {
    return this.reportData.students.filter(s => s.score < 70).length;
  }

  get highestScore() {
    return this.reportData.students.length > 0 ? Math.max(...this.reportData.students.map(s => s.score)) : 0;
  }

  get lowestScore() {
    return this.reportData.students.length > 0 ? Math.min(...this.reportData.students.map(s => s.score)) : 0;
  }

  get activeResultColumns(): Array<{ label: string; scoreKey: keyof import('../../../../services/worksheet-report-pdf.service').StudentResult }> {
    const columns: Array<{ id: string; label: string; scoreKey: keyof import('../../../../services/worksheet-report-pdf.service').StudentResult }> = [
      { id: 'activity1', label: 'Drag & Drop', scoreKey: 'dragDropScore' },
      { id: 'activity2', label: 'Classification', scoreKey: 'classificationScore' },
      { id: 'activity3', label: 'MCQ', scoreKey: 'multipleChoiceScore' },
      { id: 'activity4', label: 'Fill Blanks', scoreKey: 'fillBlanksScore' },
      { id: 'activity5', label: 'Matching', scoreKey: 'matchingScore' },
      { id: 'activity6', label: 'True/False', scoreKey: 'trueFalseScore' },
    ];
    return columns.filter((column) =>
      this.reportData.sections.some((section) => section.id === column.id && section.questionCount > 0),
    );
  }

  get resultsGridColumns(): string {
    return `minmax(120px, 2fr) 50px 58px 76px 58px repeat(${this.activeResultColumns.length}, minmax(54px, 1fr))`;
  }

  get visibleWeakSections() {
    const activeNames = new Set(
      this.reportData.sections
        .filter((section) => section.questionCount > 0)
        .flatMap((section) => [section.title.toLowerCase(), section.type.toLowerCase()]),
    );
    return this.reportData.weakSections.filter((section) => activeNames.has(section.name.toLowerCase()));
  }

  get visibleTeacherInsights(): string[] {
    const aliases: Record<string, string[]> = {
      activity1: ['drag & drop', 'ordering'], activity2: ['classification'],
      activity3: ['multiple choice'], activity4: ['fill in blanks'],
      activity5: ['matching pairs', 'matching'], activity6: ['true/false', 'true / false'],
    };
    const excludedTerms = this.reportData.sections
      .filter((section) => section.questionCount <= 0)
      .flatMap((section) => [section.title, section.type, ...(aliases[section.id] || [])])
      .map((term) => term.toLowerCase());
    return this.reportData.teacherInsights
      .filter((insight) => !excludedTerms.some((term) => insight.toLowerCase().includes(term)))
      .slice(0, 4);
  }

  studentActivityScore(student: import('../../../../services/worksheet-report-pdf.service').StudentResult, scoreKey: keyof import('../../../../services/worksheet-report-pdf.service').StudentResult): number {
    const value = student[scoreKey];
    return typeof value === 'number' ? value : 0;
  }

  formatTime(seconds: number): string {
    if (seconds <= 0) return '0s';
    const m = Math.floor(seconds / 60);
    const sec = Math.round(seconds % 60);
    if (m >= 60) {
      const h = Math.floor(m / 60);
      const remMin = m % 60;
      return `${h}h ${remMin}m`;
    }
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  }

  getBarWidth(count: number, maxCount: number, maxWidth: number): number {
    if (maxCount === 0) return 0;
    const width = (count / maxCount) * maxWidth;
    return count === 0 ? 4 : Math.max(width, 4); // Minimum 4px for visibility
  }

  getScoreColor(score: number): string {
    if (score >= 70) return '#52C41A';
    if (score >= 50) return '#FAAD14';
    return '#FF4D4F';
  }
}
