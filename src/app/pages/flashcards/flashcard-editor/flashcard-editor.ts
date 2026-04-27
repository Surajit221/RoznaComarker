import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, finalize, takeUntil } from 'rxjs';
import { FlashcardApiService } from '../../../api/flashcard-api.service';
import { AutoResizeDirective } from '../../../shared/directives/auto-resize.directive';
import type { FlashCard } from '../../../models/flashcard-set.model';

@Component({
  selector: 'app-flashcard-editor',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AutoResizeDirective],
  templateUrl: './flashcard-editor.html',
  styleUrl: './flashcard-editor.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlashcardEditor implements OnInit, OnDestroy {
  private readonly router       = inject(Router);
  private readonly route        = inject(ActivatedRoute);
  private readonly flashcardApi = inject(FlashcardApiService);
  private readonly fb           = inject(FormBuilder);
  private readonly cdr          = inject(ChangeDetectorRef);
  private readonly destroy$     = new Subject<void>();

  isLoading    = false;
  isSaving     = false;
  isNaming     = false;
  errorMsg: string | null = null;
  showSaveModal = false;

  readonly editorForm = this.fb.group({
    title:       ['', Validators.required],
    description: [''],
    cards: this.fb.array([]),
  });

  readonly saveModalForm = this.fb.group({
    title: ['', Validators.required],
    visibility: ['public'],
  });

  private get setId(): string {
    return this.route.snapshot.paramMap.get('id') ?? '';
  }

  get cardsArray(): FormArray { return this.editorForm.get('cards') as FormArray; }

  /** Cast AbstractControl to FormGroup for template access */
  asGroup(ctrl: AbstractControl): FormGroup { return ctrl as FormGroup; }

  ngOnInit(): void { this.loadSet(); }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  /** Load set and populate FormArray */
  private loadSet(): void {
    this.isLoading = true;
    this.flashcardApi.getSetById(this.setId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (set) => {
        this.editorForm.patchValue({ title: set.title, description: set.description });
        this.saveModalForm.patchValue({ title: set.title, visibility: set.visibility });
        (set.cards ?? []).forEach((c) => this.cardsArray.push(this.makeCardGroup(c)));
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.errorMsg = 'Failed to load set.';
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  private makeCardGroup(card: Partial<FlashCard> = {}): FormGroup {
    return this.fb.group({
      front: [card.front ?? '', Validators.required],
      back:  [card.back  ?? '', Validators.required],
      order: [card.order ?? this.cardsArray.length],
    });
  }

  /** Add a blank card at the end */
  addCard(): void {
    this.cardsArray.push(this.makeCardGroup());
    this.cdr.markForCheck();
  }

  /** Insert a blank card after the given index */
  insertAfter(index: number): void {
    const blank = this.makeCardGroup();
    this.cardsArray.insert(index + 1, blank);
    this.cdr.markForCheck();
  }

  /** Remove card at index */
  removeCard(index: number): void {
    this.cardsArray.removeAt(index);
    this.cdr.markForCheck();
  }

  /** Move a card up one position */
  moveUp(index: number): void {
    if (index === 0) return;
    const ctrl = this.cardsArray.at(index);
    this.cardsArray.removeAt(index);
    this.cardsArray.insert(index - 1, ctrl);
    this.cdr.markForCheck();
  }

  /** Move a card down one position */
  moveDown(index: number): void {
    if (index === this.cardsArray.length - 1) return;
    const ctrl = this.cardsArray.at(index);
    this.cardsArray.removeAt(index);
    this.cardsArray.insert(index + 1, ctrl);
    this.cdr.markForCheck();
  }

  /** Open the save modal */
  openSaveModal(): void {
    this.showSaveModal = true;
    this.cdr.markForCheck();
  }

  /** Close the save modal */
  closeSaveModal(): void {
    this.showSaveModal = false;
    this.cdr.markForCheck();
  }

  /**
   * Generate a title for the set based on the first card's front using AI
   * (calls generateFlashcards with first card content as a name hint).
   * Falls back gracefully if API fails.
   */
  generateTitle(): void {
    const firstFront = (this.cardsArray.at(0) as FormGroup)?.get('front')?.value as string ?? '';
    this.isNaming = true;
    this.cdr.markForCheck();
    this.flashcardApi.generateFlashcards({
      inputType: 'topic', content: `Name a flashcard set about: ${firstFront}`,
      template: 'term-definition', cardCount: 1, language: 'English',
    }).pipe(
      finalize(() => { this.isNaming = false; this.cdr.markForCheck(); }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (cards) => {
        const suggested = cards[0]?.front ?? `Flashcards: ${firstFront.slice(0, 40)}`;
        this.saveModalForm.patchValue({ title: suggested });
        this.cdr.markForCheck();
      },
      error: () => {
        this.saveModalForm.patchValue({ title: `Flashcards: ${firstFront.slice(0, 40)}` });
      },
    });
  }

  /** Confirm save: patch title + cards then call updateSet */
  confirmSave(): void {
    if (this.saveModalForm.invalid) { this.saveModalForm.markAllAsTouched(); return; }
    this.isSaving = true;
    this.cdr.markForCheck();
    const { title, visibility } = this.saveModalForm.value;
    const cards = this.cardsArray.value.map((c: FlashCard, i: number) => ({ ...c, order: i }));
    this.flashcardApi.updateSet(this.setId, {
      title: title ?? '',
      visibility: (visibility as 'public' | 'private') ?? 'public',
      cards,
    }).pipe(
      finalize(() => { this.isSaving = false; this.cdr.markForCheck(); }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: () => {
        this.closeSaveModal();
        const returnToClassId = this.route.snapshot.queryParamMap.get('returnToClassId');
        if (returnToClassId) {
          this.router.navigate(
            ['/teacher/my-classes/detail', returnToClassId],
            { queryParams: { openAssignModal: 'true', preselectedSetId: this.setId } }
          );
        } else {
          this.router.navigate(['/flashcards', this.setId]);
        }
      },
      error: () => this.showToast('error', 'Failed to save. Please try again.'),
    });
  }

  /** Navigate back to set detail without saving */
  cancel(): void { this.router.navigate(['/flashcards', this.setId]); }

  /** Dismiss error banner */
  dismissError(): void { this.errorMsg = null; this.cdr.markForCheck(); }

  /** TrackBy for card FormArray */
  trackByIndex(index: number): number { return index; }

  private showToast(type: 'success' | 'error', msg: string): void {
    import('sweetalert2').then(({ default: Swal }) => {
      Swal.fire({ toast: true, position: 'top-end', icon: type, title: msg,
        showConfirmButton: false, timer: 3000, timerProgressBar: true });
    });
  }
}
