import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import {
  WorksheetApiService,
  type WorksheetDraft,
  type Worksheet,
} from '../../../api/worksheet-api.service';
import { AlertService } from '../../../services/alert.service';

type Difficulty = 'easy' | 'medium' | 'hard';

@Component({
  selector: 'app-worksheet-edit',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './worksheet-edit.html',
  styleUrl: './worksheet-edit.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorksheetEditPage implements OnInit, OnDestroy {
  private readonly router   = inject(Router);
  private readonly route    = inject(ActivatedRoute);
  private readonly api      = inject(WorksheetApiService);
  private readonly alert    = inject(AlertService);
  private readonly cdr      = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  worksheetId = '';
  isLoading   = false;
  isSaving    = false;
  worksheet: Worksheet | null = null;

  title       = '';
  description = '';
  subject     = '';
  language    = 'English';
  difficulty: Difficulty = 'medium';

  readonly languages: string[]      = ['English', 'Arabic', 'French', 'Spanish'];
  readonly difficulties: Difficulty[] = ['easy', 'medium', 'hard'];

  ngOnInit(): void {
    this.worksheetId = this.route.snapshot.paramMap.get('id') ?? '';
    this.loadWorksheet();
  }

  private loadWorksheet(): void {
    if (!this.worksheetId) return;
    this.isLoading = true;
    this.cdr.markForCheck();

    this.api.getById(this.worksheetId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        const ws = res.data;
        this.worksheet   = ws;
        this.title       = ws.title ?? '';
        this.description = ws.description ?? '';
        this.subject     = ws.subject ?? '';
        this.language    = ws.language ?? 'English';
        this.difficulty  = (ws.difficulty as Difficulty) ?? 'medium';
        this.isLoading   = false;
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.alert.showError('Failed to load', err?.error?.message ?? err?.message ?? 'Try again.');
        this.cdr.markForCheck();
      },
    });
  }

  save(): void {
    if (!this.worksheet || this.isSaving) return;
    const t = this.title.trim();
    if (!t) { this.alert.showError('Title required', 'Please enter a title.'); return; }

    this.isSaving = true;
    this.cdr.markForCheck();

    const updates: Partial<WorksheetDraft> = {
      title:       t,
      description: this.description,
      subject:     this.subject,
      language:    this.language,
      difficulty:  this.difficulty,
    };

    this.api.update(this.worksheetId, updates).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.isSaving = false;
        this.cdr.markForCheck();
        this.alert.showSuccess('Saved!', 'Worksheet updated.');
        this.router.navigate(['/worksheets']);
      },
      error: (err: any) => {
        this.isSaving = false;
        this.cdr.markForCheck();
        this.alert.showError('Save failed', err?.error?.message ?? err?.message ?? 'Try again.');
      },
    });
  }

  cancel(): void { this.router.navigate(['/worksheets']); }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
