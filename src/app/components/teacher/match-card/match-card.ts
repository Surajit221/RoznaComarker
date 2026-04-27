import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatchCardData, MatchCardOption, WorksheetRole } from '../../../models/worksheet.model';

@Component({
  selector: 'app-match-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './match-card.html',
  styleUrl: './match-card.css',
})
export class MatchCardComponent {
  @Input({ required: true }) card!: MatchCardData;
  @Input() options: MatchCardOption[] = [];
  @Output() roleSelected = new EventEmitter<{ cardId: string; role: WorksheetRole }>();
  @Output() reveal = new EventEmitter<string>();

  selectRole(role: WorksheetRole): void {
    if (this.card?.revealed) {
      return;
    }

    this.roleSelected.emit({ cardId: this.card.id, role });
  }

  revealCard(): void {
    if (!this.card || this.card.revealed || !this.card.selectedRole) {
      return;
    }

    this.reveal.emit(this.card.id);
  }

  isSelected(role: WorksheetRole): boolean {
    return this.card?.selectedRole === role;
  }

  get isCorrect(): boolean {
    return !!this.card?.revealed && this.card.selectedRole === this.card.answer;
  }
}
