import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { environment } from '../../environments/environment';
import type {
  FlashCard,
  FlashcardSet,
  Submission,
  FlashcardReport,
  GenerateFlashcardPayload,
} from '../models/flashcard-set.model';

type BackendResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

@Injectable({ providedIn: 'root' })
export class FlashcardApiService {
  private readonly baseUrl = `${environment.apiUrl}/api/flashcards`;

  constructor(private http: HttpClient) {}

  generateFlashcards(payload: GenerateFlashcardPayload): Observable<FlashCard[]> {
    return this.http
      .post<BackendResponse<FlashCard[]>>(`${this.baseUrl}/generate`, payload)
      .pipe(map((r) => r.data));
  }

  getAllSets(): Observable<FlashcardSet[]> {
    return this.http
      .get<BackendResponse<FlashcardSet[]>>(this.baseUrl)
      .pipe(map((r) => r.data));
  }

  getSetById(id: string): Observable<FlashcardSet> {
    return this.http
      .get<BackendResponse<FlashcardSet>>(`${this.baseUrl}/${encodeURIComponent(id)}`)
      .pipe(map((r) => r.data));
  }

  createSet(data: Partial<FlashcardSet>): Observable<FlashcardSet> {
    return this.http
      .post<BackendResponse<FlashcardSet>>(this.baseUrl, data)
      .pipe(map((r) => r.data));
  }

  updateSet(id: string, data: Partial<FlashcardSet>): Observable<FlashcardSet> {
    return this.http
      .put<BackendResponse<FlashcardSet>>(`${this.baseUrl}/${encodeURIComponent(id)}`, data)
      .pipe(map((r) => r.data));
  }

  deleteSet(id: string): Observable<void> {
    return this.http
      .delete<BackendResponse<void>>(`${this.baseUrl}/${encodeURIComponent(id)}`)
      .pipe(map(() => void 0));
  }

  gradeAnswer(question: string, correctAnswer: string, studentAnswer: string): Observable<{ isCorrect: boolean }> {
    return this.http
      .post<BackendResponse<{ isCorrect: boolean }>>(`${this.baseUrl}/grade-answer`, {
        question, correctAnswer, studentAnswer,
      })
      .pipe(map((r) => r.data));
  }

  submitStudySession(id: string, sub: Submission): Observable<Submission> {
    return this.http
      .post<BackendResponse<Submission>>(
        `${this.baseUrl}/${encodeURIComponent(id)}/submissions`,
        sub
      )
      .pipe(map((r) => r.data));
  }

  getReport(id: string, assignmentId?: string | null): Observable<FlashcardReport> {
    let params = new HttpParams();
    if (assignmentId && String(assignmentId).trim().length) {
      params = params.set('assignmentId', String(assignmentId).trim());
    }

    return this.http
      .get<BackendResponse<FlashcardReport>>(`${this.baseUrl}/${encodeURIComponent(id)}/report`, { params })
      .pipe(map((r) => r.data));
  }

  /**
   * Assigns a flashcard set to a class, optionally creating an Assignment record.
   * @param id flashcard set id
   * @param payload { classId, title?, deadline? } title+deadline trigger Assignment creation
   */
  assignSet(id: string, payload: { classId: string; title?: string; deadline?: string }): Observable<{ message: string; data?: { assignment: unknown } }> {
    return this.http
      .post<BackendResponse<{ message: string; data?: { assignment: unknown } }>>(
        `${this.baseUrl}/${encodeURIComponent(id)}/assign`,
        payload
      )
      .pipe(map((r) => r.data));
  }

  /**
   * Generates a public share link for a flashcard set (teacher only).
   * @param id flashcard set id
   * @returns { shareUrl, shareToken }
   */
  shareSet(id: string): Observable<{ shareUrl: string; shareToken: string }> {
    return this.http
      .post<BackendResponse<{ shareUrl: string; shareToken: string }>>(
        `${this.baseUrl}/${encodeURIComponent(id)}/share`,
        {}
      )
      .pipe(map((r) => r.data));
  }

  /**
   * Revokes the public share link for a flashcard set (teacher only).
   * @param id flashcard set id
   */
  revokeShare(id: string): Observable<{ message: string }> {
    return this.http
      .delete<BackendResponse<{ message: string }>>(`${this.baseUrl}/${encodeURIComponent(id)}/share`)
      .pipe(map((r) => r.data));
  }

  /**
   * Fetches a publicly shared flashcard set by shareToken (no auth required).
   * @param shareToken uuid token from the share URL
   * @returns { title, description, cards, shareToken }
   */
  getSharedSet(shareToken: string): Observable<{ title: string; description: string; cards: import('../models/flashcard-set.model').FlashCard[]; shareToken: string }> {
    const base = this.baseUrl.replace('/api/flashcards', '/api/shared');
    return this.http
      .get<BackendResponse<{ title: string; description: string; cards: import('../models/flashcard-set.model').FlashCard[]; shareToken: string }>>(
        `${base}/flashcards/${encodeURIComponent(shareToken)}`
      )
      .pipe(map((r) => r.data));
  }

  /**
   * Submits a shared flashcard session for a logged-in user.
   * Returns 403 NOT_ENROLLED if student is not in any matching class.
   * @param shareToken uuid share token
   * @param payload { score, timeTaken, results }
   */
  submitSharedSession(shareToken: string, payload: { score: number; timeTaken: number; results: unknown[] }): Observable<{ success: boolean; assignmentId?: string }> {
    const base = this.baseUrl.replace('/api/flashcards', '/api/shared');
    return this.http
      .post<BackendResponse<{ success: boolean; assignmentId?: string }>>(
        `${base}/flashcards/${encodeURIComponent(shareToken)}/submit`,
        payload
      )
      .pipe(map((r) => r.data));
  }
}
