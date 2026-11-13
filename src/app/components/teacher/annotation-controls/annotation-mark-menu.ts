import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { AnnotationAction, CorrectionRow } from './annotation-editor.logic';

/** One correction the menu can act on, with what the server's state machine allows for it. */
export interface MarkMenuEntry { row: CorrectionRow; actions: AnnotationAction[]; }
export interface MarkMenuAction { action: AnnotationAction; key: string; event: Event; }

/**
 * The teacher's action menu for a chosen correction mark (Phase A). It only shows and reports: the editor (AnnotationControls) runs the
 * action with its existing openForm / run / askRemove. With several corrections it first asks which one, so none is changed by mistake.
 * Text is rendered by interpolation only.
 */
@Component({
  selector: 'app-annotation-mark-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './annotation-mark-menu.html',
  styleUrl: './annotation-mark-menu.css',
})
export class AnnotationMarkMenu {
  readonly entries = input.required<MarkMenuEntry[]>();
  readonly locked = input(false);
  /** Says which correction the actions apply to (chip and original text). Off where the surrounding view already says it. */
  readonly showTarget = input(true);
  readonly act = output<MarkMenuAction>();

  private readonly chosenKey = signal<string | null>(null);
  readonly chosen = computed<MarkMenuEntry | null>(() => {
    const entries = this.entries();
    if (entries.length === 1) return entries[0];
    const key = this.chosenKey();
    return entries.find(entry => entry.row.key === key) ?? null;
  });

  choose(key: string): void { this.chosenKey.set(key); }
  back(): void { this.chosenKey.set(null); }
  label(action: AnnotationAction, row: CorrectionRow): string {
    return action === 'edit' ? (row.orphanReason ? 'Place again' : 'Edit') : action === 'hide' ? 'Hide'
      : action === 'restore' ? (row.status === 'hidden' ? 'Show' : 'Restore') : 'Remove';
  }
  /** Hide (from visible) and Show (from hidden) are one show/hide toggle: the icon shows the state, the text says the action. */
  isToggle(action: AnnotationAction, row: CorrectionRow): boolean {
    return (action === 'hide' && row.status === 'visible') || (action === 'restore' && row.status === 'hidden');
  }
  run(action: AnnotationAction, row: CorrectionRow, event: Event): void {
    event.stopPropagation();
    if (this.locked()) return;
    this.act.emit({ action, key: row.key, event });
  }
}
