/**
 * ComprehensiveReport — shared component for worksheet and flashcard report pages.
 * Accepts normalized input and renders summary stats, score distribution bars,
 * pass/fail breakdown, struggling / top performers tables.
 *
 * Usage:
 *   <app-comprehensive-report [entries]="entries" [type]="'worksheet'">
 *   </app-comprehensive-report>
 */
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ReportEntry {
  name:       string;
  score:      number;
  timeTaken:  number;
  submittedAt?: string | Date;
}

export type ReportType = 'worksheet' | 'flashcard';

interface DistBucket {
  label: string;
  count: number;
  pct:   number;
}

@Component({
  selector: 'app-comprehensive-report',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './comprehensive-report.html',
  styleUrl: './comprehensive-report.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComprehensiveReport implements OnChanges {
  @Input() entries: ReportEntry[] = [];
  @Input() type: ReportType = 'worksheet';
  @Input() passThreshold = 60;

  distribution: DistBucket[] = [];

  ngOnChanges(_: SimpleChanges): void {
    this.distribution = this.buildDistribution();
  }

  get total(): number { return this.entries.length; }

  get average(): number {
    if (!this.total) return 0;
    return this.entries.reduce((s, e) => s + e.score, 0) / this.total;
  }

  get highest(): number {
    return this.total ? Math.max(...this.entries.map((e) => e.score)) : 0;
  }

  get lowest(): number {
    return this.total ? Math.min(...this.entries.map((e) => e.score)) : 0;
  }

  get passCount(): number {
    return this.entries.filter((e) => e.score >= this.passThreshold).length;
  }

  get failCount(): number { return this.total - this.passCount; }

  get passRate(): number {
    return this.total ? (this.passCount / this.total) * 100 : 0;
  }

  get medianScore(): number {
    if (!this.total) return 0;
    const sorted = [...this.entries].map((e) => e.score).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  get avgTimeSec(): number {
    if (!this.total) return 0;
    return this.entries.reduce((s, e) => s + (e.timeTaken ?? 0), 0) / this.total;
  }

  get topPerformers(): ReportEntry[] {
    return [...this.entries]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  get strugglers(): ReportEntry[] {
    return [...this.entries]
      .sort((a, b) => a.score - b.score)
      .slice(0, 5);
  }

  formatTime(seconds: number): string {
    if (!seconds || seconds <= 0) return '—';
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  private buildDistribution(): DistBucket[] {
    const buckets = [
      { label: '0–20%',   min: 0,  max: 20  },
      { label: '21–40%',  min: 21, max: 40  },
      { label: '41–60%',  min: 41, max: 60  },
      { label: '61–80%',  min: 61, max: 80  },
      { label: '81–100%', min: 81, max: 100 },
    ];
    return buckets.map((b) => {
      const count = this.entries.filter((e) => e.score >= b.min && e.score <= b.max).length;
      const pct   = this.total ? (count / this.total) * 100 : 0;
      return { label: b.label, count, pct };
    });
  }

  get maxDistCount(): number {
    return Math.max(1, ...this.distribution.map((d) => d.count));
  }

  trackByName(_: number, e: ReportEntry): string { return e.name; }
}
