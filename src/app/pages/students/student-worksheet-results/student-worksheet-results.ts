/**
 * StudentWorksheetResults
 * Route: /student/worksheet-results
 *
 * Reads the graded WorksheetSubmission from router state (passed by the viewer)
 * and shows: overall score, per-section question breakdown with correct/wrong
 * indicators, AI feedback, and a back-to-class button.
 */
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import type { WorksheetSubmission, AnswerResult } from '../../../api/worksheet-api.service';

interface ResultState {
  submission: WorksheetSubmission;
  worksheetTitle: string;
  classId: string;
  assignmentId: string;
}

@Component({
  selector: 'app-student-worksheet-results',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './student-worksheet-results.html',
  styleUrl: './student-worksheet-results.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentWorksheetResultsPage implements OnInit {
  private readonly router = inject(Router);

  submission: WorksheetSubmission | null = null;
  worksheetTitle = '';
  classId        = '';
  assignmentId   = '';
  hasState       = false;

  get percentage(): number {
    return this.submission?.percentage ?? 0;
  }

  get scoreLabel(): string {
    const p = this.percentage;
    if (p >= 90) return '🌟 Excellent!';
    if (p >= 70) return '👍 Good job!';
    if (p >= 50) return '📖 Keep practising';
    return '💪 You can do it!';
  }

  get formattedTime(): string {
    const t = this.submission?.timeTaken ?? 0;
    const m = Math.floor(t / 60);
    const s = t % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
  }

  /** Flat list of graded answers for display */
  get gradedAnswers(): AnswerResult[] {
    return this.submission?.answers ?? [];
  }

  ngOnInit(): void {
    const nav   = this.router.getCurrentNavigation();
    const state = (
      nav?.extras?.state ?? (typeof history !== 'undefined' ? history.state : {})
    ) as Partial<ResultState>;

    if (state?.submission) {
      this.submission     = state.submission;
      this.worksheetTitle = state.worksheetTitle  ?? '';
      this.classId        = state.classId         ?? '';
      this.assignmentId   = state.assignmentId    ?? '';
      this.hasState       = true;
    } else {
      this.router.navigate(['/student/my-classes']);
    }
  }

  goBack(): void {
    if (this.classId) {
      this.router.navigate(['/student/classroom', this.classId]);
    } else {
      this.router.navigate(['/student/my-classes']);
    }
  }
}
