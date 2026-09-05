import { CommonModule } from '@angular/common';
import { AfterViewChecked, Component, inject, OnDestroy, signal } from '@angular/core';
import { DeviceService } from '../../../services/device.service';
import { TeacherDashboardStateService } from '../../../services/teacher-dashboard-state.service';
import { Router } from '@angular/router';
import type { DashboardSubmission } from '../../../models/dashboard-submission.model';
import type { TeacherDashboardClassCard } from '../../../models/dashboard-submission.model';
import { TeacherActivityStateService } from '../../../services/teacher-activity-state.service';
import { TeacherActivityApiService, type ProfessionalMilestoneSummary } from '../../../api/teacher-activity-api.service';
import { NotificationRealtimeService } from '../../../services/notification-realtime.service';
import { Subscription } from 'rxjs';
import { WeeklyTeacherSummaryStateService } from '../../../services/weekly-teacher-summary-state.service';

@Component({
  selector: 'app-dashboard-teacher-pages',
  imports: [CommonModule],
  templateUrl: './dashboard-teacher-pages.html',
  styleUrl: './dashboard-teacher-pages.css',
})
export class DashboardTeacherPages implements AfterViewChecked, OnDestroy {
  device = inject(DeviceService);

  private readonly dashboardState = inject(TeacherDashboardStateService);
  private readonly router = inject(Router);
  private readonly teacherActivity = inject(TeacherActivityStateService);
  private readonly activityApi = inject(TeacherActivityApiService);
  readonly milestones = signal<ProfessionalMilestoneSummary | null>(null);
  private readonly milestoneEvents: Subscription;
  readonly activityState$ = this.teacherActivity.state$;
  private readonly weeklySummary = inject(WeeklyTeacherSummaryStateService);
  readonly weeklySummaryState$ = this.weeklySummary.state$;
  weeklyDetailsOpen = false;

  readonly pendingCount$ = this.dashboardState.pendingCount$;
  readonly pendingTodayCount$ = this.dashboardState.pendingTodayCount$;
  readonly pendingSubmissions$ = this.dashboardState.pendingSubmissions$;
  readonly dashboardStats$ = this.dashboardState.dashboardStats$;
  readonly classCards$ = this.dashboardState.classCards$;
  readonly needsAttention$ = this.dashboardState.needsAttention$;

  constructor() {
    this.milestoneEvents = inject(NotificationRealtimeService).events$.subscribe((event) => {
      if (event?.type === 'professional_milestone_updated') void this.refreshMilestones();
    });
  }

  async ngOnInit() {
    // Refresh on each dashboard entry so evaluations completed while the teacher
    // was on another page are reflected without polling.
    await Promise.all([this.dashboardState.refresh(), this.teacherActivity.refresh(), this.weeklySummary.refresh(), this.refreshMilestones()]);
  }

  ngOnDestroy(): void { this.milestoneEvents.unsubscribe(); }
  async refreshMilestones(): Promise<void> { try { this.milestones.set(await this.activityApi.getMilestones()); } catch { /* dashboard remains usable */ } }

  ngAfterViewChecked(): void {
    // This hook runs only after Angular has presented the current template.
    // The service makes repeated change-detection passes idempotent per token.
    void this.teacherActivity.acknowledgeDisplayedSummary();
  }

  retryActivity(): void { void this.teacherActivity.refresh(); }
  retryWeeklySummary(): void { void this.weeklySummary.refresh(); }
  toggleWeeklyDetails(): void { this.weeklyDetailsOpen = !this.weeklyDetailsOpen; }

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
