import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import {
  WorksheetApiService,
  type Worksheet,
  type WorksheetPagination,
} from '../../../api/worksheet-api.service';
import { ErrorModal } from '../../../shared/ui/error-modal/error-modal';
import { SuccessModal } from '../../../shared/ui/success-modal/success-modal';
import { ResourceStateService } from '../../../services/resource-state.service';

interface ActiveFilters {
  subjects:        string[];
  gradeCategories: string[];
  gradeLevels:     string[];
  cefrLevels:      string[];
}

@Component({
  selector: 'app-worksheet-library',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ErrorModal, SuccessModal],
  templateUrl: './worksheet-library.html',
  styleUrl: './worksheet-library.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorksheetLibrary implements OnInit, OnDestroy {
  private readonly router  = inject(Router);
  private readonly route   = inject(ActivatedRoute);
  private readonly api     = inject(WorksheetApiService);
  private readonly cdr     = inject(ChangeDetectorRef);
  private readonly resourceState = inject(ResourceStateService);
  private readonly destroy$ = new Subject<void>();
  private readonly searchStream$ = new Subject<string>();

  worksheets: Worksheet[]          = [];
  pagination: WorksheetPagination | null = null;
  isLoading  = false;
  errorMsg   = '';
  errorModal  = { open: false, title: '', message: '' };
  successModal = { open: false, title: '', message: '' };
  searchQuery = '';

  returnTo = '';
  assignmentId = '';
  selectButtonLabel = 'Use Worksheet';

  activeFilters: ActiveFilters = {
    subjects:        [],
    gradeCategories: [],
    gradeLevels:     [],
    cefrLevels:      [],
  };

  readonly subjectOptions     = ['Math', 'Science', 'Social Studies', 'English Language', 'ESL',
                                  'History', 'Geography', 'Arts', 'Music', 'Physical Education', 'Technology', 'Other'];
  readonly gradeCatOptions    = ['Early Learning', 'Elementary', 'Middle School', 'High School', 'University'];
  readonly gradeLevelOptions  = ['Pre-K', 'K', '1st', '2nd', '3rd', '4th', '5th', '6th',
                                  '7th', '8th', '9th', '10th', '11th', '12th', 'University', 'Adult'];
  readonly cefrOptions        = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

  get hasActiveFilters(): boolean {
    return Object.values(this.activeFilters).some((arr) => arr.length > 0) || !!this.searchQuery;
  }

  ngOnInit(): void {
    this.returnTo    = this.route.snapshot.queryParamMap.get('returnTo') ?? '';
    this.assignmentId = this.route.snapshot.queryParamMap.get('assignmentId') ?? '';
    if (this.returnTo === 'assignment') {
      this.selectButtonLabel = 'Select for Assignment';
    }
    this.searchStream$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => this.loadWorksheets(1));
    this.loadWorksheets(1);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadWorksheets(page = 1): void {
    this.isLoading = true;
    this.cdr.markForCheck();

    const params: Record<string, any> = { page, limit: 24 };
    if (this.searchQuery) params['search'] = this.searchQuery;
    if (this.activeFilters.cefrLevels.length > 0)      params['cefrLevel']     = this.activeFilters.cefrLevels;
    if (this.activeFilters.gradeLevels.length > 0)     params['gradeLevel']    = this.activeFilters.gradeLevels;
    if (this.activeFilters.gradeCategories.length > 0) params['gradeCategory'] = this.activeFilters.gradeCategories;
    if (this.activeFilters.subjects.length > 0)        params['subject']       = this.activeFilters.subjects;

    this.api.getLibrary(params).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.worksheets  = res.data ?? [];
        this.pagination  = res.pagination ?? null;
        this.isLoading   = false;
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        this.errorMsg  = err?.error?.message ?? 'Failed to load worksheets.';
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  onSearch(value: string): void {
    this.searchQuery = value;
    this.searchStream$.next(value);
  }

  toggleFilter(category: keyof ActiveFilters, value: string): void {
    const arr = this.activeFilters[category];
    const idx = arr.indexOf(value);
    if (idx > -1) arr.splice(idx, 1);
    else arr.push(value);
    this.loadWorksheets(1);
  }

  isActive(category: keyof ActiveFilters, value: string): boolean {
    return this.activeFilters[category].includes(value);
  }

  clearAllFilters(): void {
    this.activeFilters = { subjects: [], gradeCategories: [], gradeLevels: [], cefrLevels: [] };
    this.searchQuery = '';
    this.loadWorksheets(1);
  }

  selectWorksheet(ws: Worksheet): void {
    if (this.returnTo === 'assignment') {
      this.router.navigate(['/teacher/my-classes'], {
        queryParams: {
          openWorksheetAssignModal: 'true',
          preselectedWorksheetId: ws._id,
          returnFromLibrary: 'true',
        },
      });
    } else {
      this.router.navigate(['/worksheets', ws._id, 'report']);
    }
  }

  assignWorksheet(ws: Worksheet): void {
    this.router.navigate(['/teacher/my-classes'], {
      queryParams: {
        openWorksheetAssignModal: 'true',
        preselectedWorksheetId: ws._id,
        returnFromLibrary: 'true',
      },
    });
  }

  previewWorksheet(ws: Worksheet): void {
    this.router.navigate(['/worksheets', ws._id, 'report']);
  }

  deleteWorksheet(ws: Worksheet, event: Event): void {
    event.stopPropagation();
    const confirmed = window.confirm(`Delete "${ws.title}"? This will remove it from all assignments and cannot be undone.`);
    if (!confirmed) return;

    this.api.delete(ws._id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.worksheets = this.worksheets.filter((w) => w._id !== ws._id);
        if (this.pagination) {
          this.pagination.total = Math.max(0, this.pagination.total - 1);
        }
        this.resourceState.notifyWorksheetDeleted(ws._id);
        this.cdr.markForCheck();
        this.successModal = { open: true, title: 'Deleted', message: `Worksheet "${ws.title}" has been deleted.` };
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        const msg = err?.error?.message ?? 'Failed to delete worksheet.';
        this.errorModal = { open: true, title: 'Delete Failed', message: msg };
        this.cdr.markForCheck();
      },
    });
  }

  goBack(): void { this.router.navigate(['/teacher/my-classes']); }
  trackById(_: number, ws: Worksheet): string { return ws._id; }

  get currentPage(): number { return this.pagination?.page ?? 1; }
  get totalPages(): number  { return this.pagination?.pages ?? 1; }
  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }
}
