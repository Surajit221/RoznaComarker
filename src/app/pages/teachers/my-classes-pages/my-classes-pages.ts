import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MyClassesCard } from '../../../components/teacher/my-classes-card/my-classes-card';
import { ModalDialog } from '../../../shared/modal-dialog/modal-dialog';
import { MyClassesForm } from './my-classes-form/my-classes-form';
import { DeviceService } from '../../../services/device.service';
import { BottomsheetDialog } from '../../../shared/bottomsheet-dialog/bottomsheet-dialog';
import { ClassApiService, type BackendClass } from '../../../api/class-api.service';
import { AlertService } from '../../../services/alert.service';
import { DebounceService } from '../../../services/debounce.service';
import { Subject, takeUntil } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-my-classes-pages',
  imports: [CommonModule, MyClassesCard, ModalDialog, MyClassesForm, BottomsheetDialog],
  templateUrl: './my-classes-pages.html',
  styleUrl: './my-classes-pages.css',
})
export class MyClassesPages {
  showDialog = false;
  device = inject(DeviceService);
  openSheet = false;

  showEditDialog = false;
  showDeleteDialog = false;
  selectedClass: BackendClass | null = null;

  private classesById = new Map<string, BackendClass>();

  private classApi = inject(ClassApiService);
  private alert = inject(AlertService);
  private debounceService = inject(DebounceService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  private destroy$ = new Subject<void>();
  private readonly searchDebounce = this.debounceService.createDebounce(300);

  isLoading = false;
  searchTerm = '';
  filteredClasses: Array<{
    id: string;
    image: string;
    title: string;
    students: number;
    assignments: number;
    submissions: number;
    description: string;
    lastEdited: string;
  }> = [];

  classes: Array<{
    id: string;
    image: string;
    title: string;
    students: number;
    assignments: number;
    submissions: number;
    description: string;
    lastEdited: string;
  }> = [];

  async ngOnInit() {
    await this.loadClasses();
    this.setupSearchDebounce();

    this.classApi.classUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe((updated) => {
        void this.onExternalClassUpdated(updated);
      });

    const shouldOpenCreate = this.route.snapshot.queryParamMap.get('create') === '1';
    if (shouldOpenCreate) {
      this.onAddClasses();
      this.router.navigate([], {
        queryParams: { create: null },
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    }
  }

  private async onExternalClassUpdated(updated: BackendClass): Promise<void> {
    if (!updated || !updated._id) return;

    this.classesById.set(updated._id, updated);

    if (updated.isActive === false) {
      this.classes = (this.classes || []).filter((x) => x.id !== updated._id);
      this.filteredClasses = (this.filteredClasses || []).filter((x) => x.id !== updated._id);
      if (this.selectedClass?._id === updated._id) {
        this.selectedClass = null;
      }
      return;
    }

    const idx = (this.classes || []).findIndex((x) => x.id === updated._id);
    if (idx < 0) {
      if (this.showEditDialog || this.showDeleteDialog) {
        if (this.selectedClass?._id === updated._id) {
          this.selectedClass = updated;
        }
      }
      return;
    }

    const nextItem = await this.mapClassToCardItem(updated);
    const next = [...this.classes];
    next[idx] = nextItem;
    this.classes = next;

    this.filterClasses(this.searchTerm);

    if (this.selectedClass?._id === updated._id) {
      this.selectedClass = updated;
    }
  }

  async onRefresh() {
    this.classApi.invalidateTeacherClassesList();
    this.classApi.invalidateAllClassSummaries();
    await this.loadClasses();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();

    this.searchDebounce.subject.complete();
  }

  private setupSearchDebounce() {
    this.searchDebounce.debounced$
      .pipe(takeUntil(this.destroy$))
      .subscribe((term) => this.filterClasses(term));
  }

  onSearchInput(event: Event) {
    const target = event.target as HTMLInputElement;
    this.searchTerm = target.value;
    this.searchDebounce.subject.next(this.searchTerm);
  }

  private filterClasses(searchTerm: string) {
    if (!searchTerm || searchTerm.trim() === '') {
      this.filteredClasses = [...this.classes];
      return;
    }

    const term = searchTerm.toLowerCase().trim();
    this.filteredClasses = this.classes.filter(cls => 
      cls.title.toLowerCase().includes(term) ||
      cls.description.toLowerCase().includes(term)
    );
  }

  private async mapClassToCardItem(c: BackendClass) {
    // Get class summary to get dynamic counts and last edited time
    try {
      const summary = await this.classApi.getClassSummary(c._id);
      return {
        id: c._id,
        image: c.bannerUrl || '',
        title: c.name,
        students: summary.studentsCount || 0,
        assignments: summary.assignmentsCount || 0,
        submissions: summary.submissionsCount || 0,
        description: c.description || '',
        lastEdited: summary.lastEdited || ''
      };
    } catch (err) {
      // Fallback if summary fails
      return {
        id: c._id,
        image: c.bannerUrl || '',
        title: c.name,
        students: 0,
        assignments: 0,
        submissions: 0,
        description: c.description || '',
        lastEdited: ''
      };
    }
  }

  async loadClasses() {
    if (this.isLoading) return;
    this.isLoading = true;
    try {
      const classes = await this.classApi.getMyTeacherClasses();

      this.classesById = new Map<string, BackendClass>();
      for (const c of classes || []) {
        if (c && c._id) this.classesById.set(c._id, c);
      }

      const classCards = await Promise.all(
        (classes || []).map((c) => this.mapClassToCardItem(c))
      );

      const uniqueById = new Map<string, (typeof classCards)[number]>();
      for (const item of classCards) {
        uniqueById.set(item.id, item);
      }

      this.classes = Array.from(uniqueById.values());
      this.filteredClasses = [...this.classes];
    } catch (err: any) {
      this.alert.showError('Failed to load classes', err?.message || 'Please try again');
    } finally {
      this.isLoading = false;
    }
  }

  async onClassCreated(_created: BackendClass) {
    await this.loadClasses();
  }

  onAddClasses() {
    this.showDialog = true;
  }
  closeDialog() {
    this.showDialog = false;
  }

  onEditRequested(payload: { id: string; title: string; description: string }) {
    const found = this.classesById.get(payload.id) || null;
    this.selectedClass = found;
    this.showEditDialog = true;
  }

  closeEditDialog() {
    this.showEditDialog = false;
    this.selectedClass = null;
  }

  onDeleteRequested(payload: { id: string; title: string }) {
    const found = this.classesById.get(payload.id) || null;
    this.selectedClass = found;
    this.showDeleteDialog = true;
  }

  closeDeleteDialog() {
    this.showDeleteDialog = false;
    this.selectedClass = null;
  }

  onClassUpdated(_updated: BackendClass) {
    this.closeEditDialog();
  }

  async confirmDeleteClass() {
    const id = this.selectedClass?._id;
    if (!id) return;
    try {
      await this.classApi.deleteClass(id);
      this.alert.showSuccess('Class deleted', 'Your class has been removed');
      this.closeDeleteDialog();
      await this.loadClasses();
    } catch (err: any) {
      this.alert.showError('Failed to delete class', err?.message || 'Please try again');
    }
  }

  onOpenCreateClass() {
    document.body.classList.add('overflow-hidden');
    this.openSheet = true;
  }

  onCloseCreateClass() {
    document.body.classList.remove('overflow-hidden');
    this.openSheet = false;
  }
}
