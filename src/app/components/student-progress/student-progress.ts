import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { ClassApiService, StudentProgress } from '../../api/class-api.service';

@Component({
  selector: 'app-student-progress',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './student-progress.html',
  styleUrl: './student-progress.css'
})
export class StudentProgressComponent implements OnChanges {
  @Input() classId: string | null = null;
  @Input() studentId: string | null = null;
  private readonly classApi = inject(ClassApiService);
  progress: StudentProgress | null = null;
  loading = false;
  error = '';
  private requestVersion = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['classId'] || changes['studentId']) void this.load();
  }

  async load(): Promise<void> {
    const classId = this.classId; const studentId = this.studentId; const version = ++this.requestVersion;
    this.progress = null; this.error = '';
    if (!classId || !studentId) { this.loading = false; return; }
    this.loading = true;
    try {
      const result = await this.classApi.getStudentProgress(classId, studentId);
      if (version === this.requestVersion) this.progress = result;
    } catch { if (version === this.requestVersion) this.error = 'Student progress could not be loaded.'; }
    finally { if (version === this.requestVersion) this.loading = false; }
  }

  delta(value: number | null): string { return value == null ? 'Not available' : `${value > 0 ? '+' : ''}${value}`; }
}
