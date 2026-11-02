import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AppUpdateService } from './app-update.service';

/** Non-blocking notice: the page keeps working; the update applies on click or at the next safe navigation. */
@Component({
  selector: 'app-update-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (update.updateAvailable() && !update.dismissed()) {
      <div role="status" aria-live="polite"
        class="fixed bottom-4 left-1/2 z-[10000] flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-lg bg-[#302e2e] px-4 py-3 text-sm text-white shadow-lg">
        <span>{{ update.unsavedWork.hasWork() ? 'Updating when you finish…' : update.waitingToApply() ? 'Updating when the current task finishes…' : 'A new version is available.' }}</span>
        @if (!update.waitingToApply()) {
          @if (!update.unsavedWork.hasWork()) {
            <button type="button" class="rounded bg-white px-3 py-1 font-medium text-[#302e2e]" (click)="update.applyNow()">Refresh</button>
          }
          <button type="button" class="px-1 text-white/80 underline" (click)="update.dismiss()">Later</button>
        }
      </div>
    }
  `,
})
export class UpdateBanner {
  protected readonly update = inject(AppUpdateService);
}
