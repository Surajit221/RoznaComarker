/**
 * WorksheetCreatePage
 * Route: /worksheets/create?returnToClassId=
 *
 * Teacher enters a topic, picks options, generates a worksheet via AI,
 * reviews/edits the draft, then saves it. After saving, navigates back
 * to the class detail with openWorksheetAssignModal=true so the
 * assign modal auto-opens.
 */
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import {
  WorksheetApiService,
  type WorksheetDraft,
} from '../../../api/worksheet-api.service';
import { AlertService } from '../../../services/alert.service';

type Difficulty = 'easy' | 'medium' | 'hard';

@Component({
  selector: 'app-worksheet-create',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './worksheet-create.html',
  styleUrl: './worksheet-create.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorksheetCreatePage implements OnDestroy {
  private readonly router   = inject(Router);
  private readonly route    = inject(ActivatedRoute);
  private readonly api      = inject(WorksheetApiService);
  private readonly alert    = inject(AlertService);
  private readonly cdr      = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  /* ── Form fields ─────────────────────────── */
  topic      = '';
  language   = 'English';
  difficulty: Difficulty = 'medium';

  /* ── State ───────────────────────────────── */
  isGenerating = false;
  isSaving     = false;
  draft: WorksheetDraft | null = null;
  sourceContent = '';

  readonly languages  = ['English', 'Arabic', 'French', 'Spanish'];
  readonly difficulties: Difficulty[] = ['easy', 'medium', 'hard'];

  activitySummary(): { label: string; count: number }[] {
    if (!this.draft) return [];
    return [
      { label: 'Ordering items', count: this.draft.activity1?.items?.length ?? 0 },
      { label: 'Classification items', count: this.draft.activity2?.items?.length ?? 0 },
      { label: 'Quiz questions', count: this.draft.activity3?.questions?.length ?? 0 },
      { label: 'Fill-blank sentences', count: this.draft.activity4?.sentences?.length ?? 0 },
    ];
  }

  generate(): void {
    if (this.isGenerating) return;
    const topic = this.topic.trim();
    if (!topic) {
      this.alert.showError('Topic required', 'Please enter a topic to generate from.');
      return;
    }
    this.isGenerating = true;
    this.draft = null;
    this.cdr.markForCheck();

    this.api
      .generate({ inputType: 'topic', content: topic, language: this.language, difficulty: this.difficulty })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.draft = res.worksheet ?? null;
          this.sourceContent = res.sourceContent ?? topic;
          this.isGenerating = false;
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          this.isGenerating = false;
          this.alert.showError('Generation failed', err?.error?.message ?? err?.message ?? 'Try again.');
          this.cdr.markForCheck();
        },
      });
  }

  save(): void {
    if (!this.draft || this.isSaving) return;
    if (!this.draft.title?.trim()) {
      this.alert.showError('Title required', 'Please give the worksheet a title.');
      return;
    }
    this.isSaving = true;
    this.cdr.markForCheck();

    this.api
      .create({ ...this.draft, generationSource: 'topic', sourceContent: this.sourceContent, language: this.language, difficulty: this.difficulty })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.isSaving = false;
          this.cdr.markForCheck();
          const worksheetId = res.worksheet?._id;
          const returnToClassId = this.route.snapshot.queryParamMap.get('returnToClassId');
          if (returnToClassId) {
            this.router.navigate(['/teacher/my-classes/detail', returnToClassId], {
              queryParams: { openWorksheetAssignModal: 'true', preselectedWorksheetId: worksheetId ?? null },
            });
          } else {
            this.alert.showSuccess('Saved!', 'Worksheet saved to your library.');
            this.router.navigate(['/teacher/my-classes']);
          }
        },
        error: (err: any) => {
          this.isSaving = false;
          this.cdr.markForCheck();
          this.alert.showError('Save failed', err?.error?.message ?? err?.message ?? 'Save failed.');
        },
      });
  }

  cancel(): void {
    const returnToClassId = this.route.snapshot.queryParamMap.get('returnToClassId');
    this.router.navigate(
      returnToClassId ? ['/teacher/my-classes/detail', returnToClassId] : ['/teacher/my-classes']
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
