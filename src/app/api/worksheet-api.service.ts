/**
 * WorksheetApiService — all HTTP calls for the Worksheet feature.
 *
 * Mirrors the patterns from flashcard-api.service.ts and assignment-api.service.ts.
 * All methods return Observables (for components that use takeUntil)
 * or Promises (via firstValueFrom) where needed.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export interface WorksheetConceptItem {
  emoji: string;
  name: string;
  role: string;
}

export interface WorksheetActivity1Item {
  id: string;
  emoji: string;
  name: string;
  role: string;
  correctOrder: number;
}

export interface WorksheetActivity2Item {
  id: string;
  emoji: string;
  name: string;
  description: string;
  correctCategory: string;
}

export interface WorksheetActivity3Question {
  id: string;
  text: string;
  options: string[];
  correctAnswer: string;
}

export interface WorksheetSentencePart {
  type: 'text' | 'blank';
  value?: string;
  blankId?: string;
  correctAnswer?: string;
}

export interface WorksheetActivity4Sentence {
  id: string;
  parts: WorksheetSentencePart[];
}

export interface WorksheetDraft {
  title: string;
  description?: string;
  subject?: string;
  tags?: string[];
  estimatedMinutes?: number;
  language?: string;
  difficulty?: string;
  generationSource?: string;
  sourceContent?: string;
  conceptExplanation?: {
    title: string;
    body: string;
    chainSummary: string;
    items: WorksheetConceptItem[];
  } | null;
  activity1?: {
    title: string;
    instructions: string;
    items: WorksheetActivity1Item[];
  } | null;
  activity2?: {
    title: string;
    instructions: string;
    categories: string[];
    items: WorksheetActivity2Item[];
  } | null;
  activity3?: {
    title: string;
    instructions: string;
    questions: WorksheetActivity3Question[];
  } | null;
  activity4?: {
    title: string;
    instructions: string;
    wordBank: string[];
    sentences: WorksheetActivity4Sentence[];
  } | null;
}

export interface Worksheet extends WorksheetDraft {
  _id: string;
  totalPoints: number;
  createdBy: string;
  isPublished: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AnswerResult {
  questionId: string;
  sectionId: string;
  studentAnswer: string;
  isCorrect: boolean;
  pointsEarned: number;
  aiGradingFeedback?: string;
}

export interface WorksheetSubmission {
  _id: string;
  worksheetId: string;
  assignmentId: string;
  studentId: string;
  answers: AnswerResult[];
  totalPointsEarned: number;
  totalPointsPossible: number;
  percentage: number;
  timeTaken: number;
  submittedAt: string;
  gradingStatus: string;
  worksheet?: { title?: string };
}

export interface GenerateWorksheetDto {
  inputType: 'topic' | 'image';
  content?: string;
  language?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
}

export interface SubmitWorksheetDto {
  assignmentId: string;
  answers: Array<{
    questionId: string;
    sectionId: string;
    studentAnswer: string;
    isCorrect: boolean;
  }>;
  timeTaken?: number;
  totalPointsEarned?: number;
  totalPointsPossible?: number;
  percentage?: number;
}

@Injectable({ providedIn: 'root' })
export class WorksheetApiService {
  private get base(): string {
    return `${environment.apiUrl}/api/worksheets`;
  }

  constructor(private http: HttpClient) {}

  /**
   * Generate a worksheet draft via AI (topic-based). Does NOT save to DB.
   * @param payload - Generation params (topic, count, difficulty, etc.)
   */
  generate(payload: GenerateWorksheetDto): Observable<{ success: boolean; worksheet: WorksheetDraft; sourceContent: string }> {
    return this.http.post<{ success: boolean; worksheet: WorksheetDraft; sourceContent: string }>(
      `${this.base}/generate`,
      payload
    );
  }

  /**
   * Save a finalized worksheet to the database.
   * @param worksheet - Worksheet data including sections
   */
  create(worksheet: Omit<WorksheetDraft, '_id'> & { generationSource?: string; sourceContent?: string; language?: string }): Observable<{ success: boolean; worksheet: Worksheet }> {
    return this.http.post<{ success: boolean; worksheet: Worksheet }>(this.base, worksheet);
  }

  /**
   * Update an existing worksheet (teacher only).
   * @param id - Worksheet ID
   * @param data - Partial worksheet fields to update
   */
  update(id: string, data: Partial<WorksheetDraft>): Observable<{ success: boolean; data: Worksheet }> {
    return this.http.put<{ success: boolean; data: Worksheet }>(`${this.base}/${id}`, data);
  }

  /**
   * Fetch all worksheets owned by the current teacher.
   */
  getAll(): Observable<{ success: boolean; data: Worksheet[] }> {
    return this.http.get<{ success: boolean; data: Worksheet[] }>(this.base);
  }

  /**
   * Fetch a single worksheet by ID (teacher or enrolled student).
   * @param id - Worksheet ID
   */
  getById(id: string): Observable<{ success: boolean; data: Worksheet }> {
    return this.http.get<{ success: boolean; data: Worksheet }>(`${this.base}/${id}`);
  }

  /**
   * Delete a worksheet (teacher only, no active assignments allowed).
   * @param id - Worksheet ID
   */
  delete(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.base}/${id}`);
  }

  /**
   * Student submits answers. Server grades and stores the result.
   * @param worksheetId - Worksheet document _id
   * @param payload - Answers array + assignmentId + timeTaken
   */
  submit(worksheetId: string, payload: SubmitWorksheetDto): Observable<{ success: boolean; submission: WorksheetSubmission }> {
    return this.http.post<{ success: boolean; submission: WorksheetSubmission }>(
      `${this.base}/${worksheetId}/submit`,
      payload
    );
  }

  /**
   * Student fetches their own submission for a worksheet.
   * Throws 404 if not submitted yet — catch this to know the student hasn't submitted.
   * @param worksheetId - Worksheet document _id
   */
  getMySubmission(worksheetId: string): Observable<{ success: boolean; data: WorksheetSubmission }> {
    return this.http.get<{ success: boolean; data: WorksheetSubmission }>(
      `${this.base}/${worksheetId}/my-submission`
    );
  }

  /**
   * Student fetches their submission using assignment ID (alternative lookup).
   * @param worksheetId - Worksheet document _id
   * @param assignmentId - Assignment document _id
   */
  getMySubmissionByAssignment(worksheetId: string, assignmentId: string): Promise<WorksheetSubmission | null> {
    return firstValueFrom(
      this.http.get<{ success: boolean; data: WorksheetSubmission }>(
        `${this.base}/${worksheetId}/my-submission-by-assignment?assignmentId=${assignmentId}`
      )
    ).then((r) => r?.data ?? null).catch(() => null);
  }

  /**
   * Teacher fetches all student submissions for a worksheet.
   * @param worksheetId - Worksheet document _id
   */
  getSubmissions(worksheetId: string): Observable<{ success: boolean; data: { worksheet: Worksheet; submissions: WorksheetSubmission[] } }> {
    return this.http.get<{ success: boolean; data: { worksheet: Worksheet; submissions: WorksheetSubmission[] } }>(
      `${this.base}/${worksheetId}/submissions`
    );
  }

  /**
   * Assign a worksheet to a class (teacher only).
   * @param worksheetId - Worksheet document _id
   * @param payload - classId, title, deadline
   */
  assignToClass(worksheetId: string, payload: { classId: string; title: string; deadline: string }): Observable<{ success: boolean; data: { assignment: any } }> {
    return this.http.post<{ success: boolean; data: { assignment: any } }>(
      `${this.base}/${worksheetId}/assign`,
      payload
    );
  }
}
