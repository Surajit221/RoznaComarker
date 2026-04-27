import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, finalize, switchMap, takeUntil } from 'rxjs';
import { FlashcardApiService } from '../../../api/flashcard-api.service';
import type { GenerateFlashcardPayload } from '../../../models/flashcard-set.model';

type InputTab = 'topic' | 'text' | 'webpage' | 'file';

@Component({
  selector: 'app-create-flashcard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-flashcard.html',
  styleUrl: './create-flashcard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateFlashcard implements OnDestroy {
  private readonly router       = inject(Router);
  private readonly route        = inject(ActivatedRoute);
  private readonly flashcardApi = inject(FlashcardApiService);
  private readonly fb           = inject(FormBuilder);
  private readonly cdr          = inject(ChangeDetectorRef);
  private readonly destroy$     = new Subject<void>();

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  activeTab: InputTab  = 'topic';
  isGenerating = false;
  isDragOver   = false;

  readonly createForm = this.fb.group({
    content:   ['', [Validators.required, Validators.minLength(3)]],
    template:  ['term-def', Validators.required],
    cardCount: ['auto'],
    addImage:  ['later'],
    language:  ['English'],
  });

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Switch input tab and clear content field */
  setTab(tab: InputTab): void {
    this.activeTab = tab;
    this.createForm.patchValue({ content: '' });
    this.cdr.markForCheck();
  }

  /** Clear the content input */
  clearInput(): void {
    this.createForm.patchValue({ content: '' });
    this.cdr.markForCheck();
  }

  /** Navigate back to library */
  goBack(): void { this.router.navigate(['/flashcards']); }

  /** Handle dragover to enable drop zone highlight */
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
    this.cdr.markForCheck();
  }

  /** Handle file dropped on drop zone */
  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
    const file = event.dataTransfer?.files[0];
    if (file) { this.createForm.patchValue({ content: file.name }); }
    this.cdr.markForCheck();
  }

  /** Handle file selected via browse dialog */
  onFileSelect(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) { this.createForm.patchValue({ content: file.name }); }
    this.cdr.markForCheck();
  }

  /**
   * Validate form, call generateFlashcards, pipe into createSet,
   * then navigate to /flashcards/:id/edit on success.
   */
  generateFlashcards(): void {
    if (this.createForm.invalid) { this.createForm.markAllAsTouched(); return; }
    this.isGenerating = true;
    this.cdr.markForCheck();

    const { content, template, cardCount, language } = this.createForm.value;
    const payload: GenerateFlashcardPayload = {
      inputType: this.activeTab,
      content:   content   ?? '',
      template:  template  ?? 'term-def',
      cardCount: cardCount === 'auto' ? 'auto' : Number(cardCount),
      language:  language  ?? 'English',
    };

    this.flashcardApi.generateFlashcards(payload).pipe(
      switchMap((cards) => {
        const savePayload = {
          title:       `Flashcards: ${(content ?? '').slice(0, 40)}`,
          description: '',
          template:    template ?? 'term-def',
          cards:       cards.map((c, i) => ({ ...c, order: i })),
          visibility:  'public' as const,
          language:    language ?? 'English',
        };
        console.log('[CREATE] Sending payload:', JSON.stringify(savePayload, null, 2));
        return this.flashcardApi.createSet(savePayload);
      }),
      finalize(() => { this.isGenerating = false; this.cdr.markForCheck(); }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (newSet) => {
        const returnToClassId = this.route.snapshot.queryParamMap.get('returnToClassId');
        if (returnToClassId) {
          this.router.navigate(['/teacher/my-classes/detail', returnToClassId], {
            queryParams: {
              openAssignModal: 'true',
              preselectedSetId: newSet._id,
            },
          });
          return;
        }

        this.router.navigate(['/flashcards', newSet._id, 'edit']);
      },
      error: () => this.showToast('error', 'Failed to generate flashcards'),
    });
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    import('sweetalert2').then(({ default: Swal }) => {
      Swal.fire({ toast: true, position: 'top-end', icon: type, title: msg,
        showConfirmButton: false, timer: 3000, timerProgressBar: true });
    });
  }
}
