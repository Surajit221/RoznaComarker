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
import { Subject, takeUntil } from 'rxjs';
import { WorksheetApiService, type Worksheet } from '../../../api/worksheet-api.service';
import { WorksheetViewerComponent } from '../../../components/worksheet-viewer/worksheet-viewer';
import { ResourceStateService } from '../../../services/resource-state.service';

type SortField = 'title' | 'updatedAt';
type SortDir = 'asc' | 'desc';
interface SortState { field: SortField | null; dir: SortDir; }

@Component({
  selector: 'app-worksheet-list',
  standalone: true,
  imports: [CommonModule, DatePipe, WorksheetViewerComponent],
  templateUrl: './worksheet-list.html',
  styleUrl: './worksheet-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorksheetList implements OnInit, OnDestroy {
  private readonly router        = inject(Router);
  private readonly api           = inject(WorksheetApiService);
  private readonly cdr           = inject(ChangeDetectorRef);
  private readonly resourceState = inject(ResourceStateService);
  private readonly destroy$      = new Subject<void>();

  worksheets: Worksheet[]         = [];
  filteredWorksheets: Worksheet[] = [];
  isLoading  = false;
  errorMsg: string | null = null;
  sortState: SortState = { field: null, dir: 'asc' };
  filterQuery = '';
  activeWorksheet: Worksheet | null = null;
  activeMenuId: string | null = null;
  previewWorksheetId: string | null = null;
  showPreview = false;
  readonly skeletonRows = [1, 2, 3, 4, 5];

  ngOnInit(): void {
    this.loadWorksheets();
    this.resourceState.worksheetDeleted$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.loadWorksheets();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadWorksheets(): void {
    this.isLoading = true;
    this.errorMsg  = null;
    this.api.getAll().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.worksheets = res.data ?? [];
        this.applyFilterAndSort();
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        this.errorMsg = err?.error?.message ?? err?.message ?? 'Failed to load worksheets.';
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  onFilter(event: Event): void {
    this.filterQuery = (event.target as HTMLInputElement).value.toLowerCase();
    this.applyFilterAndSort();
    this.cdr.markForCheck();
  }

  sort(field: SortField): void {
    const dir: SortDir = this.sortState.field === field && this.sortState.dir === 'asc' ? 'desc' : 'asc';
    this.sortState = { field, dir };
    this.applyFilterAndSort();
    this.cdr.markForCheck();
  }

  getSortIcon(field: SortField): string {
    if (this.sortState.field !== field) return '↕';
    return this.sortState.dir === 'asc' ? '↑' : '↓';
  }

  navigateToCreate(): void { this.router.navigate(['/worksheets/create']); }
  navigateToReport(id: string): void { this.router.navigate(['/worksheets', id, 'report']); }
  navigateToEdit(id: string): void { this.router.navigate(['/worksheets', id, 'edit']); }

  openMenu(event: MouseEvent, ws: Worksheet): void {
    event.stopPropagation();
    this.activeWorksheet = ws;
    this.activeMenuId = this.activeMenuId === ws._id ? null : ws._id;
    this.cdr.markForCheck();
  }

  @HostListener('document:click')
  closeMenu(): void {
    if (this.activeMenuId !== null) {
      this.activeMenuId = null;
      this.cdr.markForCheck();
    }
  }

  dismissError(): void { this.errorMsg = null; this.cdr.markForCheck(); }

  openPreview(event: MouseEvent, ws: Worksheet): void {
    event.stopPropagation();
    this.activeMenuId = null;
    this.previewWorksheetId = ws._id;
    this.showPreview = true;
    this.cdr.markForCheck();
  }

  closePreview(): void {
    this.showPreview = false;
    this.previewWorksheetId = null;
    this.cdr.markForCheck();
  }

  deleteWorksheet(ws: Worksheet | null): void {
    if (!ws) return;
    this.activeMenuId = null;
    import('sweetalert2').then(({ default: Swal }) => {
      Swal.fire({
        title: 'Delete worksheet?',
        text: `"${ws.title}" will be permanently deleted.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Delete',
        confirmButtonColor: 'var(--color-danger)',
      }).then((r) => {
        if (!r.isConfirmed) return;
        this.api.delete(ws._id).pipe(takeUntil(this.destroy$)).subscribe({
          next: () => {
            this.resourceState.notifyWorksheetDeleted(ws._id);
            this.showToast('success', 'Worksheet deleted');
            this.loadWorksheets();
          },
          error: (err: any) => this.showToast('error', err?.error?.message ?? 'Failed to delete worksheet'),
        });
      });
    });
  }

  trackById(_: number, ws: Worksheet): string { return ws._id; }
  trackByIndex(index: number): number { return index; }

  private applyFilterAndSort(): void {
    let result = this.worksheets.filter((w) =>
      (w.title ?? '').toLowerCase().includes(this.filterQuery)
    );
    if (this.sortState.field) {
      const { field, dir } = this.sortState;
      result = [...result].sort((a, b) => {
        const av = String(a[field as keyof Worksheet] ?? '');
        const bv = String(b[field as keyof Worksheet] ?? '');
        return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    this.filteredWorksheets = result;
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    import('sweetalert2').then(({ default: Swal }) => {
      Swal.fire({ toast: true, position: 'top-end', icon: type, title: msg,
        showConfirmButton: false, timer: 3000, timerProgressBar: true });
    });
  }
}
