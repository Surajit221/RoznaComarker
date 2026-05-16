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
