import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { FlashcardApiService } from '../../../api/flashcard-api.service';
import type { FlashCard, FlashcardSet } from '../../../models/flashcard-set.model';
import { QrCodeComponent } from 'ng-qrcode';
import { SuccessModal } from '../../../shared/ui/success-modal/success-modal';
import { ErrorModal } from '../../../shared/ui/error-modal/error-modal';
import { AssignFromDetailModal } from '../../../components/teacher/assign-from-detail-modal/assign-from-detail-modal';

@Component({
  selector: 'app-flashcard-detail',
  standalone: true,
  imports: [CommonModule, QrCodeComponent, SuccessModal, ErrorModal, AssignFromDetailModal],
  templateUrl: './flashcard-detail.html',
  styleUrl: './flashcard-detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlashcardDetail implements OnInit, OnDestroy {
  private readonly router       = inject(Router);
  private readonly route        = inject(ActivatedRoute);
  private readonly flashcardApi = inject(FlashcardApiService);
  private readonly cdr          = inject(ChangeDetectorRef);
  private readonly destroy$     = new Subject<void>();

  set: FlashcardSet | null  = null;
  isLoading   = false;
  errorMsg: string | null   = null;
  currentIndex = 0;
  isFlipped    = false;
  isSpeaking   = false;
  showMoreMenu = false;

  /** Card template: 'with-image' (Template A) | 'text-only' (Template B) */
  cardTemplate: 'with-image' | 'text-only' = 'with-image';

  /** Image error flag — reset when card changes */
  imgError = false;

  /** Touch swipe tracking */
  private touchStartX = 0;
  private touchStartY = 0;

  /** PART 2 — share link modal state */
  showShareModal  = false;
  shareUrl: string | null = null;
  shareLoading    = false;
  shareCopied     = false;

  /** Success / Error modal state */
  showSuccessModal = false;
  showErrorModal   = false;
  modalTitle       = '';
  modalMessage     = '';

  /** Assign-from-detail modal state */
  showAssignModal = false;

  classId: string | null = null;

  /** Get display title with fallback */
  get displayTitle(): string {
    return this.set?.title?.trim() || 'Untitled Flashcard Set';
  }

  /** Get full image URL from relative path */
  getImageUrl(relativePath: string | null | undefined): string {
    if (!relativePath) return '';
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) return relativePath;
    return `${environment.apiUrl}${relativePath}`;
  }

  get setId(): string {
    return this.route.snapshot.paramMap.get('id') ?? '';
  }

  get classIdParam(): string | null {
    return this.route.snapshot.queryParamMap.get('classId');
  }

  get cards(): FlashCard[] { return this.set?.cards ?? []; }

  get currentCard(): FlashCard | null { return this.cards[this.currentIndex] ?? null; }

  get progress(): number {
    return this.cards.length ? ((this.currentIndex + 1) / this.cards.length) * 100 : 0;
  }

  ngOnInit(): void {
    this.classId = this.classIdParam;
    this.loadSet();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    window.speechSynthesis.cancel();
  }

  /** Load the set and its cards */
  private loadSet(): void {
    this.isLoading = true;
    this.flashcardApi.getSetById(this.setId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.set = data;
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (err: Error) => {
        this.errorMsg = err?.message ?? 'Failed to load set.';
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  /** Flip the current card to show front/back */
  flip(): void {
    this.isFlipped = !this.isFlipped;
    this.cdr.markForCheck();
  }

  /** Move to the previous card */
  prev(): void {
    if (this.currentIndex === 0) return;
    this.currentIndex--;
    this.isFlipped = false;
    this.imgError  = false;
    this.cdr.markForCheck();
  }

  /** Move to the next card */
  next(): void {
    if (this.currentIndex >= this.cards.length - 1) return;
    this.currentIndex++;
    this.isFlipped = false;
    this.imgError  = false;
    this.cdr.markForCheck();
  }

  /** Touch start — record position for swipe detection */
  onTouchStart(e: TouchEvent): void {
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
  }

  /** Touch end — if horizontal swipe > 50px, navigate; otherwise flip */
  onTouchEnd(e: TouchEvent): void {
    const dx = e.changedTouches[0].clientX - this.touchStartX;
    const dy = e.changedTouches[0].clientY - this.touchStartY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      e.preventDefault();
      if (dx < 0) this.next();
      else         this.prev();
    }
    // If not a swipe, the (click) handler on the parent will fire flip()
  }

  /** Keyboard navigation: left/right arrow keys and space to flip */
  @HostListener('document:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'ArrowLeft')  { this.prev(); return; }
    if (e.key === 'ArrowRight') { this.next(); return; }
    if (e.key === ' ')          { this.flip(); e.preventDefault(); }
  }

  /** Speak the visible side of the current card using Web Speech API */
  speak(): void {
    if (!this.currentCard) return;
    window.speechSynthesis.cancel();
    const text = this.isFlipped ? this.currentCard.back : this.currentCard.front;
    const utter = new SpeechSynthesisUtterance(text);
    this.isSpeaking = true;
    this.cdr.markForCheck();
    utter.onend = () => { this.isSpeaking = false; this.cdr.markForCheck(); };
    utter.onerror = () => { this.isSpeaking = false; this.cdr.markForCheck(); };
    window.speechSynthesis.speak(utter);
  }

  /** Stop speech */
  stopSpeech(): void {
    window.speechSynthesis.cancel();
    this.isSpeaking = false;
    this.cdr.markForCheck();
  }

  /** Navigate to study mode */
  study(): void { this.router.navigate(['/flashcards', this.setId, 'study']); }

  /** Navigate to editor */
  edit(): void {
    const queryParams = this.classId ? { returnToClassId: this.classId } : undefined;
    this.router.navigate(['/flashcards', this.setId, 'edit'], { queryParams });
  }

  /** Navigate to report */
  viewReport(): void { this.router.navigate(['/flashcards', this.setId, 'report']); }

  /** Open assign modal inline — no navigation */
  assignSet(): void {
    this.showAssignModal = true;
    this.cdr.markForCheck();
  }

  onAssignModalClosed(): void {
    this.showAssignModal = false;
    this.cdr.markForCheck();
  }

  /** Navigate back to library */
  goBack(): void { this.router.navigate(['/flashcards']); }

  /** Toggle more menu */
  toggleMoreMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.showMoreMenu = !this.showMoreMenu;
    this.cdr.markForCheck();
  }

  /** PART 2 — open share modal, generating a token if not already set */
  openShareModal(): void {
    this.showShareModal = true;
    this.shareLoading   = true;
    this.cdr.markForCheck();
    this.flashcardApi.shareSet(this.setId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.shareUrl     = res.shareUrl;
        this.shareLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.shareLoading = false;
        this.showShareModal = false;
        this.showToast('error', 'Failed to generate share link');
        this.cdr.markForCheck();
      },
    });
  }

  /** Copy share URL to clipboard */
  copyUrl(): void {
    if (!this.shareUrl) return;
    navigator.clipboard.writeText(this.shareUrl).then(() => {
      this.shareCopied = true;
      this.cdr.markForCheck();
      setTimeout(() => { this.shareCopied = false; this.cdr.markForCheck(); }, 2000);
    });
  }

  /** Revoke the share link and close modal */
  revokeShare(): void {
    this.shareLoading = true;
    this.cdr.markForCheck();
    this.flashcardApi.revokeShare(this.setId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.shareUrl      = null;
        this.showShareModal = false;
        this.shareLoading  = false;
        this.cdr.markForCheck();
        this.showToast('success', 'Share link revoked');
      },
      error: () => {
        this.shareLoading = false;
        this.cdr.markForCheck();
        this.showToast('error', 'Failed to revoke link');
      },
    });
  }

  /** Close share modal without revoking */
  closeShareModal(): void {
    this.showShareModal = false;
    this.cdr.markForCheck();
  }

  /** Close more menu on outside click */
  @HostListener('document:click')
  closeMoreMenu(): void {
    if (this.showMoreMenu) { this.showMoreMenu = false; this.cdr.markForCheck(); }
  }

  /** Delete set with SweetAlert2 confirmation */
  deleteSet(): void {
    this.showMoreMenu = false;
    import('sweetalert2').then(({ default: Swal }) => {
      Swal.fire({
        title: 'Delete set?',
        text: 'This action cannot be undone. All assignments and submissions will be removed.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Delete',
        confirmButtonColor: 'var(--color-danger)',
      }).then((r) => {
        if (!r.isConfirmed) return;
        this.flashcardApi.deleteSet(this.setId).pipe(takeUntil(this.destroy$)).subscribe({
          next: () => {
            this.showToast('success', 'Set deleted successfully');
            this.router.navigate(['/flashcards']);
          },
          error: (err) => {
            console.error('Delete failed:', err);
            this.showToast('error', 'Failed to delete set');
          },
        });
      });
    });
  }

  /** Export cards as JSON download */
  exportCards(): void {
    if (!this.set) return;
    const blob = new Blob([JSON.stringify(this.set.cards, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${this.displayTitle}.json`; a.click();
    URL.revokeObjectURL(url);
    this.showMoreMenu = false;
  }

  /** Dismiss error banner */
  dismissError(): void { this.errorMsg = null; this.cdr.markForCheck(); }

  /** TrackBy for cards */
  trackById(_: number, card: FlashCard): string { return card._id ?? String(_); }

  /** Open success modal */
  openSuccessModal(title: string, message: string): void {
    this.modalTitle    = title;
    this.modalMessage  = message;
    this.showSuccessModal = true;
    this.cdr.markForCheck();
  }

  /** Open error modal */
  openErrorModal(title: string, message: string): void {
    this.modalTitle   = title;
    this.modalMessage = message;
    this.showErrorModal = true;
    this.cdr.markForCheck();
  }

  /** Close any feedback modal */
  closeModal(): void {
    this.showSuccessModal = false;
    this.showErrorModal   = false;
    this.cdr.markForCheck();
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    if (type === 'success') {
      this.openSuccessModal('Success', msg);
    } else {
      this.openErrorModal('Error', msg);
    }
  }
}
