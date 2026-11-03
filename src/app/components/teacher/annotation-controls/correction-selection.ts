import { Injectable, OnDestroy, computed, signal } from '@angular/core';
import { NO_SELECTION, SelectionEvent, SelectionState, activeOf, nextSelection } from './annotation-sync.logic';

const HOVER_DELAY_MS = 150;
/** A pin scrolls views, and a browser reports whatever then slides under a resting pointer as a hover. The pointer did not move: that must not replace the choice. */
const PIN_HOVER_GUARD_MS = 700;
export type SelectionSource = 'list' | 'transcript' | 'image';

/**
 * The one "active correction" of an editor (provided by AnnotationControls, so it lives and dies with it). Selecting, hovering or keyboard-focusing
 * in any of the three views goes through here. Hover waits a moment, so moving the pointer across a list does not scroll the other views.
 */
@Injectable()
export class CorrectionSelection implements OnDestroy {
  private readonly state = signal<SelectionState>(NO_SELECTION);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pinnedAt = -Infinity;
  /** Which view the last change came from: the other two scroll to it, that one stays put under the pointer. */
  readonly source = signal<SelectionSource | null>(null);
  readonly pinnedId = computed(() => this.state().pinnedId);
  readonly activeId = computed(() => activeOf(this.state()));

  private apply(event: SelectionEvent): void { this.state.update(state => nextSelection(state, event)); }
  private cancelTimer(): void { if (this.timer !== null) clearTimeout(this.timer); this.timer = null; }

  pin(id: string, source: SelectionSource): void { this.cancelTimer(); this.pinnedAt = Date.now(); this.source.set(source); this.apply({ type: 'pin', id }); }
  hover(id: string, source: SelectionSource): void {
    if (Date.now() - this.pinnedAt < PIN_HOVER_GUARD_MS) return;
    this.cancelTimer();
    this.timer = setTimeout(() => { this.timer = null; this.source.set(source); this.apply({ type: 'hover', id }); }, HOVER_DELAY_MS);
  }
  hoverEnd(): void {
    this.cancelTimer();
    this.timer = setTimeout(() => { this.timer = null; this.apply({ type: 'hoverEnd' }); }, HOVER_DELAY_MS);
  }
  clear(): void { this.cancelTimer(); this.source.set(null); this.apply({ type: 'clear' }); }
  ngOnDestroy(): void { this.cancelTimer(); }
}
