import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, computed, inject, signal } from '@angular/core';
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
  imports: [CommonModule, FormsModule, MyClassesCard, ModalDialog, MyClassesForm, BottomsheetDialog],
  templateUrl: './my-classes-pages.html',
  styleUrl: './my-classes-pages.css',
})
export class MyClassesPages {
  showSemesterCopy = false; copySources: BackendClass[] = []; copyPreview: any = null; copySourceId = '';
  copyName = ''; copyDescription = ''; copySubjectLevel = ''; copyStartDate = ''; copyEndDate = '';
  selectedCopyAssignments = new Set<string>(); copyLoading = false; copySubmitting = false; copyError = '';
  private copyRequestId = '';
  showDialog = false;
  device = inject(DeviceService);
  openSheet = false;

  showEditDialog = false;
  showDeleteDialog = false;
  showArchiveDialog = false;
  selectedClass: BackendClass | null = null;
  selectedStatus: 'active' | 'archived' = 'active';

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
  private readonly classCards = signal<Array<{
    id: string;
    image: string;
    title: string;
    students: number;
    assignments: number;
    submissions: number;
    description: string;
    lastEdited: string;
    status: 'active' | 'archived';
    archivedAt: string | null;
  }>>([]);

  readonly classes = this.classCards.asReadonly();
  private readonly appliedSearchTerm = signal('');
  readonly filteredClasses = computed(() => {
    const term = this.appliedSearchTerm().toLowerCase().trim();
    if (!term) return this.classCards();
    return this.classCards().filter((cls) => cls.title.toLowerCase().includes(term) ||
      cls.description.toLowerCase().includes(term));
  });

  async ngOnInit() {
    await this.loadClasses();
    this.setupSearchDebounce();

    this.classApi.classUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe((updated) => {
        void this.onExternalClassUpdated(updated);
      });
    this.classApi.classDeleted$
      .pipe(takeUntil(this.destroy$))
      .subscribe((id) => this.removeClassById(id));

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
      this.classCards.update((items) => items.filter((x) => x.id !== updated._id));
      if (this.selectedClass?._id === updated._id) {
        this.selectedClass = null;
      }
      return;
    }

    const updatedStatus = updated.status || 'active';
    if (updatedStatus !== this.selectedStatus) {
      this.classCards.update((items) => items.filter((x) => x.id !== updated._id));
      return;
    }

    const upsertCard = (nextItem: ReturnType<MyClassesPages['mapClassToCardItemFallback']>) =>
      this.classCards.update((items) => {
        const idx = items.findIndex((item) => item.id === updated._id);
        return idx < 0 ? [nextItem, ...items] : items.map((item, index) => index === idx ? nextItem : item);
      });
    // Render the authoritative POST/event payload immediately. Summary counts
    // enrich the same card afterward but are not a prerequisite for visibility.
    upsertCard(this.mapClassToCardItemFallback(updated));
    const nextItem = await this.mapClassToCardItem(updated);
    upsertCard(nextItem);

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
    this.appliedSearchTerm.set(searchTerm);
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
        lastEdited: summary.lastEdited || '',
        status: c.status || 'active',
        archivedAt: c.archivedAt || null
      };
    } catch (err) {
      return this.mapClassToCardItemFallback(c);
    }
  }

  private removeClassById(id: string): void {
    if (!id) return;
    this.classesById.delete(id);
    this.classCards.update((items) => items.filter((item) => item.id !== id));
    if (this.selectedClass?._id === id) this.selectedClass = null;
  }

  private mapClassToCardItemFallback(c: BackendClass) {
    return { id: c._id, image: c.bannerUrl || '', title: c.name, students: 0,
      assignments: 0, submissions: 0, description: c.description || '', lastEdited: '',
      status: c.status || 'active', archivedAt: c.archivedAt || null };
  }

  async loadClasses() {
    if (this.isLoading) return;
    this.isLoading = true;
    try {
      const classes = await this.classApi.getMyTeacherClasses(this.selectedStatus);

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

      this.classCards.set(Array.from(uniqueById.values()));
      this.appliedSearchTerm.set(this.searchTerm);
    } catch (err: any) {
      this.alert.showError('Failed to load classes', err?.message || 'Please try again');
    } finally {
      this.isLoading = false;
    }
  }

  async onClassCreated(created: BackendClass) {
    // POST /classes returns the authoritative class. Upsert it directly so the
    // UI does not depend on a route reload or a second list fetch.
    this.selectedStatus = 'active';
    this.searchTerm = '';
    this.appliedSearchTerm.set('');
    await this.onExternalClassUpdated(created);
  }

  onAddClasses() {
    this.showDialog = true;
  }

  async openSemesterCopy(): Promise<void> {
    this.showSemesterCopy = true; this.copyError = ''; this.copyLoading = true;
    try { this.copySources = await this.classApi.getCopyableClasses(); } catch { this.copyError = 'Previous classes could not be loaded.'; }
    finally { this.copyLoading = false; }
  }
  closeSemesterCopy(): void { if (!this.copySubmitting) this.showSemesterCopy = false; }
  async chooseCopySource(id: string): Promise<void> {
    this.copySourceId = id; this.copyPreview = null; this.copyError = ''; this.copyLoading = true;
    try { this.copyPreview = await this.classApi.getSemesterCopyPreview(id); this.copyName = `${this.copyPreview.sourceClass.name} - New Semester`;
      this.copyDescription = this.copyPreview.sourceClass.description; this.copySubjectLevel = this.copyPreview.sourceClass.subjectLevel;
      this.selectedCopyAssignments = new Set(this.copyPreview.assignments.map((x: any) => x.id)); this.copyRequestId = crypto.randomUUID(); }
    catch { this.copyError = 'The class preview could not be loaded.'; } finally { this.copyLoading = false; }
  }
  toggleCopyAssignment(id: string, checked: boolean): void { const next = new Set(this.selectedCopyAssignments); checked ? next.add(id) : next.delete(id); this.selectedCopyAssignments = next; }
  toggleAllCopyAssignments(checked: boolean): void { this.selectedCopyAssignments = new Set(checked ? this.copyPreview?.assignments.map((x: any) => x.id) || [] : []); }
  get allCopyAssignmentsSelected(): boolean { return Boolean(this.copyPreview?.assignments.length) && this.selectedCopyAssignments.size === this.copyPreview.assignments.length; }
  get someCopyAssignmentsSelected(): boolean { return this.selectedCopyAssignments.size > 0 && !this.allCopyAssignmentsSelected; }
  async submitSemesterCopy(): Promise<void> {
    if (this.copySubmitting || !this.copySourceId || !this.copyName.trim()) return; this.copySubmitting = true; this.copyError = '';
    try { const result = await this.classApi.copySemester(this.copySourceId, { requestId: this.copyRequestId,
      newClass: { name: this.copyName.trim(), description: this.copyDescription, subjectLevel: this.copySubjectLevel,
        ...(this.copyStartDate ? { startDate: this.copyStartDate } : {}), ...(this.copyEndDate ? { endDate: this.copyEndDate } : {}) },
      assignmentIds: [...this.selectedCopyAssignments], deadlineMode: 'unset' });
      await this.onClassCreated(result.class); this.showSemesterCopy = false; await this.router.navigate(['/teacher/my-classes/detail', result.class._id]);
    } catch (error: any) { this.copyError = error?.error?.message || 'The new semester could not be created. Your selections are preserved.'; }
    finally { this.copySubmitting = false; }
  }

  async selectStatus(status: 'active' | 'archived') {
    if (status === this.selectedStatus) return;
    this.selectedStatus = status;
    this.searchTerm = '';
    await this.loadClasses();
  }

  onArchiveRequested(payload: { id: string; title: string }) {
    this.selectedClass = this.classesById.get(payload.id) || null;
    this.showArchiveDialog = true;
  }

  closeArchiveDialog() {
    this.showArchiveDialog = false;
    this.selectedClass = null;
  }

  async confirmArchiveClass() {
    const id = this.selectedClass?._id;
    if (!id) return;
    try {
      await this.classApi.archiveClass(id);
      this.alert.showSuccess('Class archived', 'All class history has been kept');
      this.closeArchiveDialog();
    } catch (err: any) {
      this.alert.showError('Failed to archive class', err?.error?.message || err?.message || 'Please try again');
    }
  }

  async onRestoreRequested(payload: { id: string; title: string }) {
    const found = this.classesById.get(payload.id);
    if (!found) return;
    try {
      await this.classApi.unarchiveClass(payload.id);
      this.alert.showSuccess('Class restored', `${payload.title} is active again`);
    } catch (err: any) {
      const message = err?.error?.code === 'ACTIVE_CLASS_LIMIT_REACHED'
        ? "You've reached your active class limit. Archive another class or upgrade your plan before restoring this class."
        : err?.error?.message || err?.message || 'Please try again';
      this.alert.showError('Unable to restore class', message);
    }
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
      this.removeClassById(id);
      this.alert.showSuccess('Class deleted', 'Your class has been removed');
      this.closeDeleteDialog();
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
