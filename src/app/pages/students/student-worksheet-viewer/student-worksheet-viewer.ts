/**
 * StudentWorksheetViewer
 * Route: /student/worksheet-viewer/:worksheetId?assignmentId=&classId=
 *
 * Worksheets are now opened as an inline modal in the class detail page.
 * This route-based component simply redirects back to the class so that
 * any deep-linked or bookmarked URLs degrade gracefully.
 */
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { WorksheetViewerComponent } from '../../../components/worksheet-viewer/worksheet-viewer';

@Component({
  selector: 'app-student-worksheet-viewer',
  standalone: true,
  imports: [CommonModule, WorksheetViewerComponent],
  template: `
    @if (worksheetId) {
      <div class="swv-fullpage">
        <app-worksheet-viewer
          [worksheetId]="worksheetId"
          [assignmentId]="assignmentId"
          mode="student"
          [classId]="classId"
          (closed)="goBack()">
        </app-worksheet-viewer>
      </div>
    }
  `,
  styles: [`
    .swv-fullpage {
      position: fixed;
      inset: 0;
      display: flex;
      flex-direction: column;
      background: #f1f5f9;
      z-index: 100;
    }
  `],
})
export class StudentWorksheetViewer implements OnInit {
  private readonly router = inject(Router);
  private readonly route  = inject(ActivatedRoute);

  worksheetId  = '';
  assignmentId: string | null = null;
  classId: string | null = null;

  ngOnInit(): void {
    this.worksheetId  = this.route.snapshot.paramMap.get('worksheetId') ?? '';
    this.assignmentId = this.route.snapshot.queryParamMap.get('assignmentId') || null;
    this.classId      = this.route.snapshot.queryParamMap.get('classId') || null;

    if (!this.worksheetId) this.goBack();
  }

  goBack(): void {
    if (this.classId) {
      this.router.navigate(['/student/classroom', this.classId]);
    } else {
      this.router.navigate(['/student/my-classes']);
    }
  }
}
