import { Component, ElementRef, EventEmitter, Input, Output, inject, signal } from '@angular/core';

export type AssignmentKind = 'writing' | 'speaking';

/**
 * The step before the assignment form (only while speaking assignments are on): Writing assignment or Speaking assignment.
 * Each card is a native button (Tab, Enter and Space as usual); the arrow keys, Home and End also move between the two cards.
 * The chosen card is marked (aria-pressed and a check icon), so the selection is never shown by colour alone.
 */
@Component({
  selector: 'app-assignment-type-choice',
  standalone: true,
  templateUrl: './assignment-type-choice.html',
  styleUrl: './assignment-type-choice.css'
})
export class AssignmentTypeChoice {
  /** The longest recording a speaking assignment allows, in minutes (the audio config, passed in by the page). */
  @Input() maxMinutes: number | null = null;
  @Output() chosen = new EventEmitter<AssignmentKind>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly selected = signal<AssignmentKind | null>(null);

  choose(kind: AssignmentKind): void {
    this.selected.set(kind);
    this.chosen.emit(kind);
  }

  onKeydown(event: KeyboardEvent): void {
    const cards = Array.from(this.host.nativeElement.querySelectorAll<HTMLButtonElement>('button.lt-choice-card'));
    const current = cards.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0) return;
    const last = cards.length - 1;
    const moves: Record<string, number> = { ArrowRight: current + 1, ArrowDown: current + 1, ArrowLeft: current - 1, ArrowUp: current - 1, Home: 0, End: last };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    cards[next > last ? 0 : next < 0 ? last : next].focus();
  }
}
