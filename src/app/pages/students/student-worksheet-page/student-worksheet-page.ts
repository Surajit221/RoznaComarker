import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { WorksheetViewerComponent } from '../../../components/worksheet-viewer/worksheet-viewer';

@Component({
  selector: 'app-student-worksheet-page',
  standalone: true,
  imports: [WorksheetViewerComponent],
  templateUrl: './student-worksheet-page.html',
  styleUrl: './student-worksheet-page.css',
})
export class StudentWorksheetPageComponent implements OnInit {
  private readonly route  = inject(ActivatedRoute);
  private readonly router = inject(Router);

  worksheetId  = '';
  assignmentId: string | null = null;
  classId: string | null = null;

  ngOnInit(): void {
    this.worksheetId  = this.route.snapshot.paramMap.get('worksheetId') ?? '';
    this.assignmentId = this.route.snapshot.queryParamMap.get('assignmentId');
    this.classId      = this.route.snapshot.queryParamMap.get('classId');
  }

  onClosed(): void {
    if (this.classId) {
      this.router.navigate(['/student/classroom', this.classId]);
    } else {
      this.router.navigate(['/student/my-classes']);
    }
  }
}
