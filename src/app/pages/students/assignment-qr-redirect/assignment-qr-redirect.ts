import { Component, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { AssignmentApiService, type BackendAssignment } from '../../../api/assignment-api.service';

@Component({
  selector: 'app-assignment-qr-redirect',
  // GuestSubmissionPage embeds this component and overrides AssignmentApiService
  // with a guest-only stub. Registered QR access always needs the real API service.
  providers: [AssignmentApiService],
  template: `
    <div class="min-h-[50vh] flex items-center justify-center px-4">
      <div class="bg-white rounded-2xl p-6 text-center max-w-md w-full">
        @if (errorMessage) {
          <h1 class="text-xl font-bold mb-2">Unable to open assignment</h1>
          <p class="text-gray-600">{{ errorMessage }}</p>
        } @else {
          <p class="text-gray-600">Opening assignment...</p>
        }
      </div>
    </div>
  `,
})
export class AssignmentQrRedirect {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private assignmentApi = inject(AssignmentApiService);

  errorMessage = '';

  async ngOnInit(): Promise<void> {
    const qrToken = this.route.snapshot.paramMap.get('qrToken') || '';
    if (!qrToken) {
      this.errorMessage = 'This QR code is invalid.';
      return;
    }

    try {
      const assignment = await this.assignmentApi.getAssignmentByQrToken(qrToken);
      await this.openAssignment(assignment);
    } catch (err: unknown) {
      console.error('Assignment QR access failed', err);
      this.errorMessage = this.describeError(err);
    }
  }

  private describeError(err: unknown): string {
    if (!(err instanceof HttpErrorResponse) || err.status === 0) {
      return "Couldn't reach the server. Please check your connection and retry.";
    }
    if (err.status === 403) return "You're not a member of this class. Join with your class code.";
    if (err.status === 404) return 'This assignment is no longer available.';
    return err.error?.message || 'Unable to open this assignment. Please try again.';
  }

  private async openAssignment(assignment: BackendAssignment): Promise<void> {
    const classId = typeof assignment.class === 'string' ? assignment.class : assignment.class?._id;

    if (assignment.resourceType === 'flashcard' && assignment.resourceId) {
      await this.router.navigate(['/student/flashcard-player', assignment.resourceId], {
        queryParams: { assignmentId: assignment._id, classId },
      });
      return;
    }

    if (assignment.resourceType === 'worksheet' && assignment.resourceId) {
      await this.router.navigate(['/student/worksheet', assignment.resourceId], {
        queryParams: { assignmentId: assignment._id, classId },
      });
      return;
    }

    await this.router.navigate(['/student/my-classes/detail', classId], {
      queryParams: { assignmentId: assignment._id },
    });
  }
}
