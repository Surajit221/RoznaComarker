import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ResourceStateService {
  private _flashcardDeleted$ = new Subject<string>();
  private _worksheetDeleted$ = new Subject<string>();
  private _assignmentDeleted$ = new Subject<string>();

  readonly flashcardDeleted$ = this._flashcardDeleted$.asObservable();
  readonly worksheetDeleted$ = this._worksheetDeleted$.asObservable();
  readonly assignmentDeleted$ = this._assignmentDeleted$.asObservable();

  notifyFlashcardDeleted(id: string): void { this._flashcardDeleted$.next(id); }
  notifyWorksheetDeleted(id: string): void { this._worksheetDeleted$.next(id); }
  notifyAssignmentDeleted(id: string): void { this._assignmentDeleted$.next(id); }
}
