import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MyClassesCardStudent } from '../../../components/student/my-classes-card-student/my-classes-card-student';
import { ModalDialog } from '../../../shared/modal-dialog/modal-dialog';
import { JoinClassForm } from './join-class-form/join-class-form';
import { DeviceService } from '../../../services/device.service';
import { BottomsheetDialog } from '../../../shared/bottomsheet-dialog/bottomsheet-dialog';
import { MembershipApiService, type BackendMembership, type JoinClassResponse } from '../../../api/membership-api.service';
import { ClassApiService, type BackendClassSummary } from '../../../api/class-api.service';
import { AlertService } from '../../../services/alert.service';
import { DebounceService } from '../../../services/debounce.service';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-my-class-student-pages',
  imports: [CommonModule, MyClassesCardStudent, ModalDialog, JoinClassForm, BottomsheetDialog],
  templateUrl: './my-class-student-pages.html',
  styleUrl: './my-class-student-pages.css',
})
export class MyClassStudentPages {
  showDialog = false;
  openSheet = false;
  device = inject(DeviceService);

  private membershipApi = inject(MembershipApiService);
  private classApi = inject(ClassApiService);
  private alert = inject(AlertService);
  private debounceService = inject(DebounceService);

  private destroy$ = new Subject<void>();
  private readonly searchDebounce = this.debounceService.createDebounce(300);

  isLoading = false;
  searchTerm = '';
  filteredClasses: Array<{
    id: string;
    image: string;
    title: string;
    teacher: string;
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
    teacher: string;
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
      cls.teacher.toLowerCase().includes(term) ||
      cls.description.toLowerCase().includes(term)
    );
  }

  private async mapMembershipToCardItem(m: BackendMembership) {
    const c: any = m && (m as any).class;
    const teacher = c && c.teacher;
    const teacherName = (teacher && (teacher.displayName || teacher.email)) || '';
    
    try {
      // Get class summary to get dynamic counts and last edited time
      const summary: BackendClassSummary = await this.classApi.getClassSummary(c?._id);
      return {
        id: c?._id,
        image: 'img/default-img.png',
        title: c?.name || '',
        teacher: teacherName,
        students: summary.studentsCount || 0,
        assignments: summary.assignmentsCount || 0,
        submissions: summary.submissionsCount || 0,
        description: c?.description || '',
        lastEdited: summary.lastEdited || ''
      };
    } catch (err) {
      // Fallback if summary fails
      return {
        id: c?._id,
        image: 'img/default-img.png',
        title: c?.name || '',
        teacher: teacherName,
        students: 0,
        assignments: 0,
        submissions: 0,
        description: c?.description || '',
        lastEdited: ''
      };
    }
  }

  async loadClasses() {
    if (this.isLoading) return;
    this.isLoading = true;
    try {
      const memberships = await this.membershipApi.getMyMemberships();
      const classCards = await Promise.all(
        (memberships || []).map((m) => this.mapMembershipToCardItem(m))
      );
      this.classes = classCards;
      this.filteredClasses = [...this.classes];
    } catch (err: any) {
      this.alert.showError('Failed to load classes', err?.message || 'Please try again');
    } finally {
      this.isLoading = false;
    }
  }

  // --

  async onJoined(_resp: JoinClassResponse) {
    this.closeDialog();
    this.onCloseSheetAddClasses();
    await this.loadClasses();
  }

  onAddClasses() {
    this.showDialog = true;
  }

  onOpenSheetAddClasses() {
    document.body.classList.add('overflow-hidden');
    this.openSheet = true;
  }

  onCloseSheetAddClasses() {
    document.body.classList.remove('overflow-hidden');
    this.openSheet = false;
  }
  closeDialog() {
    this.showDialog = false;
  }
}
