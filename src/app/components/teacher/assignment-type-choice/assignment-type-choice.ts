import { Component, EventEmitter, Output } from '@angular/core';

export type AssignmentKind = 'writing' | 'speaking';

/** The step before the assignment form (only while speaking assignments are on): Writing assignment or Speaking assignment. */
@Component({
  selector: 'app-assignment-type-choice',
  standalone: true,
  templateUrl: './assignment-type-choice.html',
  styleUrl: './assignment-type-choice.css'
})
export class AssignmentTypeChoice {
  @Output() chosen = new EventEmitter<AssignmentKind>();
}
