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
import { environment } from '../../../../environments/environment';
import { FlashcardApiService } from '../../../api/flashcard-api.service';
import { AutoResizeDirective } from '../../../shared/directives/auto-resize.directive';
import type { FlashCard } from '../../../models/flashcard-set.model';
import { UnsplashImageModal } from '../../../components/teacher/unsplash-image-modal/unsplash-image-modal';
import { SuccessModal } from '../../../shared/ui/success-modal/success-modal';
import { ErrorModal } from '../../../shared/ui/error-modal/error-modal';

@Component({
  selector: 'app-flashcard-editor',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AutoResizeDirective, UnsplashImageModal, SuccessModal, ErrorModal],
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
  showUnsplashModal = false;
  editingCardIndex: number | null = null;
  editingSide: 'front' | 'back' | null = null;

  showSuccessModal = false;
  showErrorModal   = false;
  modalTitle       = '';
  modalMessage     = '';

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
      frontImage: [card.frontImage ?? ''],
      backImage: [card.backImage ?? ''],
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
        // Always navigate to preview page after saving, preserving classId if available
        const returnToClassId = this.route.snapshot.queryParamMap.get('returnToClassId');
        const queryParams = returnToClassId ? { classId: returnToClassId } : undefined;
        this.router.navigate(['/flashcards', this.setId], { queryParams });
      },
      error: () => this.showToast('error', 'Failed to save. Please try again.'),
    });
  }

  /** Navigate back to class dashboard without saving */
  cancel(): void { 
    const returnToClassId = this.route.snapshot.queryParamMap.get('returnToClassId');
    if (returnToClassId) {
      this.router.navigate(['/teacher/my-classes/detail', returnToClassId]);
    } else {
      this.router.navigate(['/flashcards', this.setId]);
    }
  }

  /** Dismiss error banner */
  dismissError(): void { this.errorMsg = null; this.cdr.markForCheck(); }

  /** TrackBy for card FormArray */
  trackByIndex(index: number): number { return index; }

  /** Open Unsplash modal for image search */
  openUnsplashModal(index: number, side: 'front' | 'back'): void {
    this.editingCardIndex = index;
    this.editingSide = side;
    this.showUnsplashModal = true;
    this.cdr.markForCheck();
  }

  /** Handle image selection from Unsplash modal */
  onUnsplashImageSelected(imageUrl: string): void {
    if (this.editingCardIndex !== null && this.editingSide) {
      const cardGroup = this.cardsArray.at(this.editingCardIndex) as FormGroup;
      const fieldName = this.editingSide === 'front' ? 'frontImage' : 'backImage';
      cardGroup.patchValue({ [fieldName]: imageUrl });
      this.cdr.markForCheck();
    }
    this.editingCardIndex = null;
    this.editingSide = null;
  }

  /** Handle file upload for image */
  onFileUpload(event: Event, index: number, side: 'front' | 'back'): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        this.showToast('error', 'Please select an image file');
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        this.showToast('error', 'Image size must be less than 5MB');
        return;
      }

      // Upload image to server
      this.uploadImage(file, index, side);
    }
    
    // Reset input
    input.value = '';
  }

  /** Upload image to server */
  private uploadImage(file: File, index: number, side: 'front' | 'back'): void {
    this.flashcardApi.uploadFlashcardImage(file).subscribe({
      next: (result) => {
        const cardGroup = this.cardsArray.at(index) as FormGroup;
        const fieldName = side === 'front' ? 'frontImage' : 'backImage';

        // Store relative path from backend response
        cardGroup.patchValue({ [fieldName]: result.imageUrl });
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Image upload error:', error);
        this.showToast('error', 'Failed to upload image');
      }
    });
  }

  /** Get full image URL from relative path */
  getImageUrl(relativePath: string | null | undefined): string {
    if (!relativePath) return '';
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) return relativePath;
    return `${environment.apiUrl}${relativePath}`;
  }

  /** Remove image from card */
  removeImage(index: number, side: 'front' | 'back'): void {
    const cardGroup = this.cardsArray.at(index) as FormGroup;
    const fieldName = side === 'front' ? 'frontImage' : 'backImage';
    cardGroup.patchValue({ [fieldName]: '' });
    this.cdr.markForCheck();
  }

  /** Trigger file input click for front image */
  triggerFrontUpload(index: number): void {
    const inputId = `front-upload-${index}`;
    const input = document.getElementById(inputId) as HTMLInputElement;
    if (input) {
      input.click();
    }
  }

  /** Trigger file input click for back image */
  triggerBackUpload(index: number): void {
    const inputId = `back-upload-${index}`;
    const input = document.getElementById(inputId) as HTMLInputElement;
    if (input) {
      input.click();
    }
  }

  openSuccessModal(title: string, message: string): void {
    this.modalTitle = title; this.modalMessage = message;
    this.showSuccessModal = true; this.cdr.markForCheck();
  }
  openErrorModal(title: string, message: string): void {
    this.modalTitle = title; this.modalMessage = message;
    this.showErrorModal = true; this.cdr.markForCheck();
  }
  closeModal(): void {
    this.showSuccessModal = false; this.showErrorModal = false; this.cdr.markForCheck();
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    if (type === 'success') this.openSuccessModal('Success', msg);
    else this.openErrorModal('Error', msg);
  }
}
