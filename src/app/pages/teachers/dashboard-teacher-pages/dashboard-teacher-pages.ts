import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { DeviceService } from '../../../services/device.service';
import { TeacherDashboardStateService } from '../../../services/teacher-dashboard-state.service';
import { Router } from '@angular/router';
import type { DashboardSubmission } from '../../../models/dashboard-submission.model';
import type { TeacherDashboardClassCard } from '../../../models/dashboard-submission.model';

@Component({
  selector: 'app-dashboard-teacher-pages',
  imports: [CommonModule],
  templateUrl: './dashboard-teacher-pages.html',
  styleUrl: './dashboard-teacher-pages.css',
})
export class DashboardTeacherPages {
  device = inject(DeviceService);

  private readonly dashboardState = inject(TeacherDashboardStateService);
  private readonly router = inject(Router);

  readonly pendingCount$ = this.dashboardState.pendingCount$;
  readonly pendingTodayCount$ = this.dashboardState.pendingTodayCount$;
  readonly pendingSubmissions$ = this.dashboardState.pendingSubmissions$;
  readonly dashboardStats$ = this.dashboardState.dashboardStats$;
  readonly classCards$ = this.dashboardState.classCards$;
  readonly needsAttention$ = this.dashboardState.needsAttention$;

  async ngOnInit() {
    await this.dashboardState.ensureLoaded();
  }

  onCreateClass(): void {
    this.router.navigate(['/teacher/my-classes'], {
      queryParams: {
        create: '1'
      }
    });
  }

  scoreBadgeClass(score: number | null | undefined): string {
    const n = Number(score);
    if (!Number.isFinite(n)) {
      return 'px-3 py-1 bg-[#FFF4E5] text-[#FFC300] font-bold rounded-lg text-sm border border-[#DBB12A]';
    }

    if (n >= 80) {
      return 'px-3 py-1 bg-[#E6F2F2] text-[#008081] font-bold rounded-lg text-sm border border-[#136C6D]';
    }

    return 'px-3 py-1 bg-[#FFF4E5] text-[#FFC300] font-bold rounded-lg text-sm border border-[#DBB12A]';
  }

  onReview(submission: DashboardSubmission): void {
    if (!submission?.student?.id) return;

    this.router.navigate(['/teacher/my-classes/detail/student-submissions', submission.student.id], {
      queryParams: {
        classId: submission.class?.id || undefined,
        assignmentId: submission.assignment?.id || undefined,
        submissionId: submission.id || undefined
      }
    });
  }

  classCardContainerClass(index: number): string {
    if (index % 2 === 0) {
      return 'bg-white p-5 rounded-3xl border-[3px] border-[#E7E7E7] hover:border-[#203864] hover:shadow-[0px_6px_0_#203864] transition-all cursor-pointer flex flex-col gap-4 relative overflow-hidden';
    }
    return 'bg-white p-5 rounded-3xl border-[3px] border-[#E7E7E7] hover:border-[#008081] hover:shadow-[0px_6px_0_#008081] transition-all cursor-pointer flex flex-col gap-4 relative overflow-hidden';
  }

  classCardIconClass(index: number): string {
    return index % 2 === 0 ? 'bx bxs-book-open text-xl' : 'bx bxs-pencil text-xl';
  }

  onOpenClass(card: TeacherDashboardClassCard): void {
    if (!card?.id) return;
    this.router.navigate(['/teacher/my-classes/detail', card.id]);
  }
}
