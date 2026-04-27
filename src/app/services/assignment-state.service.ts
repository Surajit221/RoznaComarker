/**
 * AssignmentStateService — GAP 1 (signal-based assignment completion events).
 *
 * After a student submits a flashcard or worksheet assignment, components emit
 * the assignmentId here. The class detail page subscribes and flips the local
 * status badge from 'pending' → 'completed' without a full page refresh.
 */
import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AssignmentStateService {
  /**
   * Emits the assignmentId string each time a student completes an assignment.
   * Subscribers update UI state accordingly.
   */
  readonly completed$ = new Subject<string>();

  /**
   * Call this after a successful submission to broadcast the completion event.
   * @param assignmentId the completed Assignment._id
   * @side-effect emits on completed$ subject; subscribed components update status badges
   */
  markCompleted(assignmentId: string): void {
    this.completed$.next(assignmentId);
  }
}
