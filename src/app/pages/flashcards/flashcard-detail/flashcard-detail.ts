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
import { FlashcardApiService } from '../../../api/flashcard-api.service';
import type { FlashCard, FlashcardSet } from '../../../models/flashcard-set.model';

@Component({
  selector: 'app-flashcard-detail',
  standalone: true,
  imports: [CommonModule],
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

  /** PART 2 — share link modal state */
  showShareModal  = false;
  shareUrl: string | null = null;
  shareLoading    = false;
  shareCopied     = false;

  private get setId(): string {
    return this.route.snapshot.paramMap.get('id') ?? '';
  }

  get cards(): FlashCard[] { return this.set?.cards ?? []; }

  get currentCard(): FlashCard | null { return this.cards[this.currentIndex] ?? null; }

  get progress(): number {
    return this.cards.length ? ((this.currentIndex + 1) / this.cards.length) * 100 : 0;
  }

  ngOnInit(): void { this.loadSet(); }

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
    this.cdr.markForCheck();
  }

  /** Move to the next card */
  next(): void {
    if (this.currentIndex >= this.cards.length - 1) return;
    this.currentIndex++;
    this.isFlipped = false;
    this.cdr.markForCheck();
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
  edit(): void { this.router.navigate(['/flashcards', this.setId, 'edit']); }

  /** Navigate to report */
  viewReport(): void { this.router.navigate(['/flashcards', this.setId, 'report']); }

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
        text: 'This action cannot be undone.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Delete',
        confirmButtonColor: 'var(--color-danger)',
      }).then((r) => {
        if (!r.isConfirmed) return;
        this.flashcardApi.deleteSet(this.setId).pipe(takeUntil(this.destroy$)).subscribe({
          next: () => this.router.navigate(['/flashcards']),
          error: () => this.showToast('error', 'Failed to delete'),
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
    a.href = url; a.download = `${this.set.title}.json`; a.click();
    URL.revokeObjectURL(url);
    this.showMoreMenu = false;
  }

  /** Dismiss error banner */
  dismissError(): void { this.errorMsg = null; this.cdr.markForCheck(); }

  /** TrackBy for cards */
  trackById(_: number, card: FlashCard): string { return card._id ?? String(_); }

  private showToast(type: 'success' | 'error', msg: string): void {
    import('sweetalert2').then(({ default: Swal }) => {
      Swal.fire({ toast: true, position: 'top-end', icon: type, title: msg,
        showConfirmButton: false, timer: 3000, timerProgressBar: true });
    });
  }
}
