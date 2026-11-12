import { Component, EventEmitter, Injectable, Input, OnChanges, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { TeacherUploadApiService } from '../../../api/teacher-upload-api.service';
import { GuestStudentAccess } from '../../../services/guest-student-access.service';
import { ImagePreflightService } from '../../../services/image-preflight.service';
import { UploadEssayForm } from '../../../pages/students/my-class-student-pages/detail-my-class-student-pages/upload-essay-form/upload-essay-form';

/**
 * Where the student upload screen's page check is sent for one student's pages. ImagePreflightService already adapts its
 * transport for guests through GuestStudentAccess.preflight(file, phase); this provides the same method for the teacher route,
 * so the check itself (basic checks, then the handwriting check, timeouts and messages) is the student screen's own code.
 */
@Injectable()
export class TeacherPagesPreflight {
  private api = inject(TeacherUploadApiService);
  private assignmentId = '';
  private student = { name: '', email: '' };
  bind(assignmentId: string, student: { name: string; email: string }): void { this.assignmentId = assignmentId; this.student = { ...student }; }
  preflight(file: File, phase: string) { return this.api.preflight(this.assignmentId, this.student, file, phase); }
}

/**
 * One student's pages in the teacher's "Upload student work" dialog: the student upload screen (crop per page, quality and
 * handwriting checks, validation messages) unchanged, with its page check bound to this student and this teacher's assignment.
 */
@Component({
  selector: 'app-teacher-student-pages',
  standalone: true,
  imports: [UploadEssayForm],
  providers: [TeacherPagesPreflight, { provide: GuestStudentAccess, useExisting: TeacherPagesPreflight }, ImagePreflightService],
  template: `<app-upload-essay-form [assignmentId]="assignmentId" [disabled]="disabled"
    (filesSelected)="filesSelected.emit($event)" (readinessChange)="readinessChange.emit($event)"></app-upload-essay-form>`,
})
export class TeacherStudentPages implements OnChanges {
  @Input({ required: true }) assignmentId!: string;
  @Input() studentId = '';
  @Input() name = '';
  @Input() email = '';
  @Input() disabled = false;
  @Output() filesSelected = new EventEmitter<File[]>();
  @Output() readinessChange = new EventEmitter<boolean>();
  @ViewChild(UploadEssayForm) form?: UploadEssayForm;
  private transport = inject(TeacherPagesPreflight);

  ngOnChanges(changes: SimpleChanges): void {
    this.transport.bind(this.assignmentId, { name: this.name, email: this.email });
    // A check belongs to one student: after the name or email changes, every page is checked again for the new student.
    const student = changes['email'] || changes['name'];
    if (student && !student.firstChange) this.recheck();
  }

  /** Runs the page check again for every page (for example when the server says an earlier check is out of date). */
  recheck(): void {
    for (const entry of [...(this.form?.files || [])]) this.form?.retryQuality(entry);
  }
}
