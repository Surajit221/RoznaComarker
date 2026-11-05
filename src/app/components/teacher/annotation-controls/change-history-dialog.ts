import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, output, viewChild } from '@angular/core';
import { DeviceService } from '../../../services/device.service';
import { BottomsheetDialog } from '../../../shared/bottomsheet-dialog/bottomsheet-dialog';
import { ModalDialog } from '../../../shared/modal-dialog/modal-dialog';
import { AnnotationSnapshot, HistoryItem, historyActionLabel, historyQuote, historySummary, historyTarget, historyTargetIndex } from './annotation-editor.logic';

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
/** Longer than the 10 ms the bottom sheet waits before it slides in. */
const SHEET_SETTLE_MS = 30;

/**
 * The teacher's change history as a dialog: the shared modal on desktop, the shared bottom sheet on compact (the same split as the class page's
 * dialogs). It exists only while it is open, so it leaves no listener or backdrop behind, whichever way it goes away. Text is shown by interpolation only.
 */
@Component({
  selector: 'app-change-history-dialog',
  imports: [DatePipe, NgTemplateOutlet, ModalDialog, BottomsheetDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './change-history-dialog.html',
  styleUrl: './change-history-dialog.css',
  host: { '(document:keydown)': 'onKeydown($event)' },
})
export class ChangeHistoryDialog {
  readonly items = input<HistoryItem[]>([]);
  readonly loading = input(false);
  readonly error = input('');
  readonly hasMore = input(false);
  readonly snapshot = input<AnnotationSnapshot | null>(null);
  readonly closed = output<void>();
  readonly retry = output<void>();
  readonly loadMore = output<void>();

  readonly device = inject(DeviceService);
  private readonly injector = inject(Injector);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly targets = computed(() => historyTargetIndex(this.snapshot()));

  readonly actionLabel = historyActionLabel;
  readonly summary = historySummary;
  readonly quote = historyQuote;
  target(item: HistoryItem) { return historyTarget(item, this.targets()); }
  shortId(id: string | null | undefined): string { return id ? String(id).slice(-8) : ''; }

  constructor() {
    // Opening, crossing the breakpoint (the panel is rebuilt) and a button that disappears (Retry, the last Load more) all leave focus outside the panel.
    effect(() => {
      this.device.isCompact(); this.items(); this.loading(); this.error();
      afterNextRender(() => this.keepFocusInside(), { injector: this.injector });
    });
    // The sheet sets its slide-in flag in a timer. This component and its parent are OnPush, so without this the sheet would stay hidden.
    effect(onCleanup => {
      if (!this.device.isCompact()) return;
      const timer = setTimeout(() => this.cdr.markForCheck(), SHEET_SETTLE_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  private keepFocusInside(): void {
    const panel = this.panel()?.nativeElement;
    if (panel && !panel.contains(document.activeElement)) panel.focus();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); this.closed.emit(); return; }
    if (event.key !== 'Tab') return;
    const panel = this.panel()?.nativeElement;
    if (!panel) return;
    const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!focusable.length) { event.preventDefault(); panel.focus(); return; }
    const first = focusable[0], last = focusable[focusable.length - 1], active = document.activeElement;
    const outside = !panel.contains(active);
    if (event.shiftKey && (outside || active === first || active === panel)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (outside || active === last)) { event.preventDefault(); first.focus(); }
  }
}
