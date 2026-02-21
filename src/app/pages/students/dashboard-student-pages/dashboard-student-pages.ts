import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { DeviceService } from '../../../services/device.service';
import { StudentDashboardStateService } from '../../../services/student-dashboard-state.service';
import type { StudentDashboardLatestFeedback } from '../../../services/student-dashboard-state.service';

@Component({
  selector: 'app-dashboard-student-pages',
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard-student-pages.html',
  styleUrl: './dashboard-student-pages.css',
})
export class DashboardStudentPages {
  device = inject(DeviceService);

  private readonly router = inject(Router);

  private readonly dashboardState = inject(StudentDashboardStateService);

  readonly greetingName$ = this.dashboardState.greetingName$;
  readonly greetingFirstName$ = this.dashboardState.greetingFirstName$;

  readonly stats$ = this.dashboardState.stats$;
  readonly latestFeedback$ = this.dashboardState.latestFeedback$;
  readonly classCards$ = this.dashboardState.classCards$;
  readonly upcomingDeadlines$ = this.dashboardState.upcomingDeadlines$;

  async ngOnInit() {
    await this.dashboardState.ensureLoaded();
  }

  classCardContainerClass(index: number): string {
    if (index % 2 === 0) {
      return 'bg-white p-4 border-[3px] border-[#E7E7E7] rounded-3xl hover:border-[#203864] hover:shadow-[0px_4px_0_#203864] cursor-pointer transition-all flex gap-4 items-center';
    }
    return 'bg-white p-4 border-[3px] border-[#E7E7E7] rounded-3xl hover:border-[#008081] hover:shadow-[0px_4px_0_#008081] cursor-pointer transition-all flex gap-4 items-center';
  }

  classCardAvatarUrl(classTitle: string, index: number): string {
    const bg = index % 2 === 0 ? '203864' : '008081';
    const name = encodeURIComponent((classTitle || '').trim().replace(/\s+/g, '+') || 'Class');
    return `https://ui-avatars.com/api/?name=${name}&background=${bg}&color=fff`;
  }

  classProgressBarClass(index: number): string {
    return index % 2 === 0 ? 'h-full bg-[#203864] rounded-full' : 'h-full bg-[#008081] rounded-full';
  }

  deadlineBoxClass(isUrgent: boolean): string {
    return isUrgent
      ? 'flex flex-col items-center min-w-14 bg-[#FFE5E5] border border-[#EE4E4E] rounded-xl p-1 text-[#EE4E4E]'
      : 'flex flex-col items-center min-w-14 bg-[#F0F0F0] border border-[#D4D4D4] rounded-xl p-1 text-[#7A7A7A]';
  }

  deadlineUrgentLabelClass(isUrgent: boolean): string {
    return isUrgent
      ? 'text-[10px] font-bold text-white bg-[#EE4E4E] px-2 py-0.5 rounded-md w-fit mt-1 animate-pulse'
      : '';
  }

  toMyClasses(): void {
    this.router.navigate(['/student/my-classes']);
  }

  toJoinClass(): void {
    this.router.navigate(['/student/my-classes'], {
      queryParams: { join: '1' }
    });
  }

  toClass(classId: string): void {
    if (!classId) return;
    this.router.navigate(['/student/my-classes/detail', classId]);
  }

  toLatestCorrection(latest: StudentDashboardLatestFeedback): void {
    const assignmentId = (latest?.assignmentId || '').trim();
    if (!assignmentId) return;

    this.router.navigate(['/student/my-classes/detail/my-submissions', assignmentId], {
      queryParams: {
        classId: (latest?.classId || '').trim() || undefined
      }
    });
  }
}
