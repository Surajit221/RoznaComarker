import { CommonModule, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { Subject, switchMap, takeUntil } from 'rxjs';
import { FlashcardApiService } from '../../../api/flashcard-api.service';
import type { FlashcardSet } from '../../../models/flashcard-set.model';

type SortField = 'title' | 'updatedAt';
type SortDir = 'asc' | 'desc';
interface SortState { field: SortField | null; dir: SortDir; }

@Component({
  selector: 'app-flashcard-library',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './flashcard-library.html',
  styleUrl: './flashcard-library.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlashcardLibrary implements OnInit, OnDestroy {
  private readonly router       = inject(Router);
  private readonly flashcardApi = inject(FlashcardApiService);
  private readonly cdr          = inject(ChangeDetectorRef);
  private readonly destroy$     = new Subject<void>();

  sets: FlashcardSet[]         = [];
  filteredSets: FlashcardSet[] = [];
  isLoading  = false;
  errorMsg: string | null = null;
  sortState: SortState = { field: null, dir: 'asc' };
  filterQuery = '';
  activeSet: FlashcardSet | null = null;
  activeMenuSetId: string | null = null;
  readonly skeletonRows = [1, 2, 3, 4, 5];

  ngOnInit(): void { this.loadSets(); }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Load all sets owned by the teacher and apply current filter/sort */
  loadSets(): void {
    this.isLoading = true;
    this.errorMsg  = null;
    this.flashcardApi.getAllSets().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.sets = data;
        this.applyFilterAndSort();
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (err: Error) => {
        this.errorMsg = err?.message ?? 'Failed to load flashcard sets.';
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  /** Filter filteredSets by title substring */
  onFilter(event: Event): void {
    this.filterQuery = (event.target as HTMLInputElement).value.toLowerCase();
    this.applyFilterAndSort();
    this.cdr.markForCheck();
  }

  /** Toggle sort direction on a field and re-sort */
  sort(field: SortField): void {
    const dir: SortDir =
      this.sortState.field === field && this.sortState.dir === 'asc' ? 'desc' : 'asc';
    this.sortState = { field, dir };
    this.applyFilterAndSort();
    this.cdr.markForCheck();
  }

  /** Returns the sort icon character for the given field */
  getSortIcon(field: SortField): string {
    if (this.sortState.field !== field) return '↕';
    return this.sortState.dir === 'asc' ? '↑' : '↓';
  }

  /** Navigate to the create-flashcard page */
  navigateToCreate(): void { this.router.navigate(['/flashcards/create']); }

  /** Navigate to the set detail page */
  navigateToDetail(id: string): void { this.router.navigate(['/flashcards', id]); }

  /** Toggle the kebab dropdown for a row */
  openMenu(event: MouseEvent, set: FlashcardSet): void {
    event.stopPropagation();
    this.activeSet      = set;
    this.activeMenuSetId = this.activeMenuSetId === set._id ? null : set._id;
    this.cdr.markForCheck();
  }

  /** Close the dropdown when clicking anywhere outside */
  @HostListener('document:click')
  closeMenu(): void {
    if (this.activeMenuSetId !== null) {
      this.activeMenuSetId = null;
      this.cdr.markForCheck();
    }
  }

  /** Dismiss error banner */
  dismissError(): void {
    this.errorMsg = null;
    this.cdr.markForCheck();
  }

  /** Delete set after SweetAlert2 confirmation */
  deleteSet(set: FlashcardSet | null): void {
    if (!set) return;
    this.activeMenuSetId = null;
    import('sweetalert2').then(({ default: Swal }) => {
      Swal.fire({
        title: 'Delete set?',
        text: `"${set.title}" will be permanently deleted.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Delete',
        confirmButtonColor: 'var(--color-danger)',
      }).then((r) => {
        if (!r.isConfirmed) return;
        this.flashcardApi.deleteSet(set._id).pipe(takeUntil(this.destroy$)).subscribe({
          next: () => { this.showToast('success', 'Set deleted'); this.loadSets(); },
          error: () => this.showToast('error', 'Failed to delete set'),
        });
      });
    });
  }

  /** Clone set — loads full cards first via getSetById then creates copy */
  cloneSet(set: FlashcardSet | null): void {
    if (!set) return;
    this.activeMenuSetId = null;
    this.flashcardApi.getSetById(set._id).pipe(
      switchMap((full) => this.flashcardApi.createSet({
        title: `${full.title} (Copy)`,
        description: full.description,
        visibility: full.visibility,
        language: full.language,
        cards: full.cards,
      })),
      takeUntil(this.destroy$),
    ).subscribe({
      next: () => { this.showToast('success', 'Set cloned'); this.loadSets(); },
      error: () => this.showToast('error', 'Failed to clone set'),
    });
  }

  /** Rename set via SweetAlert2 text input */
  renameSet(set: FlashcardSet | null): void {
    if (!set) return;
    this.activeMenuSetId = null;
    import('sweetalert2').then(({ default: Swal }) => {
      Swal.fire({
        title: 'Rename set',
        input: 'text',
        inputValue: set.title,
        showCancelButton: true,
        confirmButtonText: 'Save',
        confirmButtonColor: 'var(--color-primary)',
        inputValidator: (v) => (!v ? 'Title cannot be empty' : null),
      }).then((r) => {
        if (!r.isConfirmed || !r.value) return;
        this.flashcardApi.updateSet(set._id, { title: r.value }).pipe(takeUntil(this.destroy$)).subscribe({
          next: () => { this.showToast('success', 'Set renamed'); this.loadSets(); },
          error: () => this.showToast('error', 'Failed to rename'),
        });
      });
    });
  }

  /** Edit description via SweetAlert2 textarea input */
  editDescription(set: FlashcardSet | null): void {
    if (!set) return;
    this.activeMenuSetId = null;
    import('sweetalert2').then(({ default: Swal }) => {
      Swal.fire({
        title: 'Edit description',
        input: 'textarea',
        inputValue: set.description ?? '',
        showCancelButton: true,
        confirmButtonText: 'Save',
        confirmButtonColor: 'var(--color-primary)',
      }).then((r) => {
        if (!r.isConfirmed) return;
        this.flashcardApi.updateSet(set._id, { description: r.value ?? '' }).pipe(takeUntil(this.destroy$)).subscribe({
          next: () => { this.showToast('success', 'Description updated'); this.loadSets(); },
          error: () => this.showToast('error', 'Failed to update description'),
        });
      });
    });
  }

  /** Toggle visibility between public and private */
  toggleVisibility(set: FlashcardSet | null): void {
    if (!set) return;
    this.activeMenuSetId = null;
    const next: 'public' | 'private' = set.visibility === 'public' ? 'private' : 'public';
    this.flashcardApi.updateSet(set._id, { visibility: next }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.showToast('success', `Set made ${next}`); this.loadSets(); },
      error: () => this.showToast('error', 'Failed to update visibility'),
    });
  }

  /** Placeholder: move set to folder */
  moveSet(_set: FlashcardSet | null): void { this.activeMenuSetId = null; }

  /** Placeholder: create folder */
  createFolder(): void { /* TODO: folder creation modal */ }

  /** TrackBy for set rows */
  trackById(_: number, set: FlashcardSet): string { return set._id; }

  /** TrackBy for skeleton rows */
  trackByIndex(index: number): number { return index; }

  private applyFilterAndSort(): void {
    let result = this.sets.filter((s) =>
      s.title.toLowerCase().includes(this.filterQuery)
    );
    if (this.sortState.field) {
      const { field, dir } = this.sortState;
      result = [...result].sort((a, b) => {
        const av = String(a[field as keyof FlashcardSet] ?? '');
        const bv = String(b[field as keyof FlashcardSet] ?? '');
        return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    this.filteredSets = result;
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    import('sweetalert2').then(({ default: Swal }) => {
      Swal.fire({ toast: true, position: 'top-end', icon: type, title: msg,
        showConfirmButton: false, timer: 3000, timerProgressBar: true });
    });
  }
}
