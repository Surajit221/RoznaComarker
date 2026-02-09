import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MembershipApiService } from '../../../api/membership-api.service';
import { AlertService } from '../../../services/alert.service';
import { JoinIntentService } from '../../../services/join-intent.service';

@Component({
  selector: 'app-join-class-link-pages',
  imports: [CommonModule],
  templateUrl: './join-class-link-pages.html',
  styleUrl: './join-class-link-pages.css',
})
export class JoinClassLinkPages {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private membershipApi = inject(MembershipApiService);
  private alert = inject(AlertService);
  private joinIntent = inject(JoinIntentService);

  isLoading = false;

  async ngOnInit() {
    const joinCode = (this.route.snapshot.queryParamMap.get('joinCode') || '').trim();
    if (!joinCode) {
      this.alert.showWarning('Missing join code', 'This link is missing a join code.');
      this.router.navigate(['/student/my-classes']);
      return;
    }

    await this.join(joinCode);
  }

  private async join(joinCode: string) {
    if (this.isLoading) return;
    this.isLoading = true;

    try {
      const resp = await this.membershipApi.joinClassByCode(joinCode);
      const classId = resp?.class?._id || (resp as any)?.membership?.class?._id;

      if (!classId || typeof classId !== 'string') {
        throw new Error('Invalid join response');
      }

      this.router.navigate(['/student/classroom', classId]);
    } catch (err: any) {
      const status = err?.status || err?.error?.statusCode;
      if (status === 401 || status === 403) {
        this.joinIntent.setJoinClassIntent(joinCode);
        this.router.navigate(['/login']);
        return;
      }

      const message = err?.error?.message || err?.message || 'Please try again.';
      this.alert.showError('Failed to join class', message);
      this.router.navigate(['/student/my-classes']);
    } finally {
      this.isLoading = false;
    }
  }
}
