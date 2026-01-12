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

  private classApi = inject(ClassApiService);
  private alert = inject(AlertService);
  private debounceService = inject(DebounceService);

  private destroy$ = new Subject<void>();

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
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupSearchDebounce() {
    const searchDebounce = this.debounceService.createDebounce(300);
    searchDebounce.pipe(takeUntil(this.destroy$)).subscribe(term => {
      this.filterClasses(term);
    });
  }

  onSearchInput(event: Event) {
    const target = event.target as HTMLInputElement;
    this.searchTerm = target.value;
    this.filterClasses(this.searchTerm);
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
        image: 'img/default-img.png',
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
        image: 'img/default-img.png',
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
      const classCards = await Promise.all(
        (classes || []).map((c) => this.mapClassToCardItem(c))
      );
      this.classes = classCards;
      this.filteredClasses = [...this.classes];
    } catch (err: any) {
      this.alert.showError('Failed to load classes', err?.message || 'Please try again');
    } finally {
      this.isLoading = false;
    }
  }

  async onClassCreated(created: BackendClass) {
    const newClassCard = await this.mapClassToCardItem(created);
    this.classes = [newClassCard, ...this.classes];
    await this.loadClasses();
  }

  onAddClasses() {
    this.showDialog = true;
  }
  closeDialog() {
    this.showDialog = false;
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
