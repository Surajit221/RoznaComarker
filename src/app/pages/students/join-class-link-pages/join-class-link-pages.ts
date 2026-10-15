import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { JoinIntentService } from '../../../services/join-intent.service';
import { QrClassJoinService } from '../../../services/qr-class-join.service';

@Component({ selector: 'app-join-class-link-pages', imports: [CommonModule],
  templateUrl: './join-class-link-pages.html', styleUrl: './join-class-link-pages.css' })
export class JoinClassLinkPages {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private joins = inject(QrClassJoinService);
  private intents = inject(JoinIntentService);
  private destroyRef = inject(DestroyRef);
  private sequence = 0;
  private destroyed = false;
  isLoading = false;
  errorMessage = '';

  constructor() { this.destroyRef.onDestroy(() => { this.destroyed = true; ++this.sequence; }); }

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => { void this.resume(); });
  }

  async resume(): Promise<void> {
    const sequence = ++this.sequence;
    const url = this.router.serializeUrl(this.router.createUrlTree(['/student/join-class'], {
      queryParams: this.route.snapshot.queryParams, fragment: this.route.snapshot.fragment ?? undefined
    }));
    this.isLoading = true; this.errorMessage = '';
    try {
      const result = await this.joins.run(url);
      if (this.destroyed || sequence !== this.sequence) return;
      if (result.state === 'joined') await this.router.navigate(
        result.classId ? ['/student/classroom', result.classId] : ['/student/my-classes'], { replaceUrl: true });
      else if (result.state === 'wrong-role') this.errorMessage = 'Please log in as a Student to join a class.';
      else await this.router.navigate([result.state === 'verification' ? '/verify-email'
        : result.state === 'role' ? '/select-role' : '/login'], { queryParams: { returnUrl: url }, replaceUrl: true });
    } catch {
      if (!this.destroyed && sequence === this.sequence) this.errorMessage = 'Unable to join this class. Please try again.';
    } finally { if (!this.destroyed && sequence === this.sequence) this.isLoading = false; }
  }

  cancel(): void {
    ++this.sequence; this.intents.clear();
    void this.router.navigate(['/student/my-classes'], { replaceUrl: true });
  }
}
