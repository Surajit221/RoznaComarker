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

export interface WorksheetActivity5Pair {
  id: string;
  leftItem: {
    text: string;
    imageUrl?: string;
  };
  rightItem: {
    text: string;
    imageUrl?: string;
  };
}

export interface WorksheetActivity6Question {
  id: string;
  text: string;
  correctAnswer: boolean;
  explanation?: string;
}

export interface WorksheetActivity7Label {
  id: string;
  text: string;
  x: number;
  y: number;
  targetId: string;
}

export interface WorksheetActivity8Sequence {
  id: string;
  title: string;
  items: {
    id: string;
    text: string;
    imageUrl?: string;
    correctOrder: number;
  }[];
}

export interface WorksheetThemeColorPalette {
  correct: string;
  wrong: string;
  highlight: string;
  cardBackground: string;
  borderColor: string;
}

export interface WorksheetTheme {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  headerGradient: string;
  patternType: string;
  fontStyle: string;
  headerStyle: string;
  darkHeader: boolean;
  generatedFor?: string;
  colorPalette: WorksheetThemeColorPalette;
}

export interface WorksheetLibraryParams {
  cefrLevel?: string;
  gradeLevel?: string;
  gradeCategory?: string;
  subject?: string;
  difficulty?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface WorksheetPagination {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface WorksheetDraft {
  title: string;
  description?: string;
  subject?: string;
  cefrLevel?: string | null;
  gradeLevel?: string | null;
  gradeCategory?: string | null;
  assignmentDeadline: string;
  tags?: string[];
  estimatedMinutes?: number;
  language?: string;
  difficulty?: string | null;
  generationSource?: string;
  sourceContent?: string;
  thumbnailUrl?: string | null;
  isPublic?: boolean;
  theme?: WorksheetTheme;
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
  activity5?: {
    title: string;
    instructions: string;
    pairs: WorksheetActivity5Pair[];
  } | null;
  activity6?: {
    title: string;
    instructions: string;
    questions: WorksheetActivity6Question[];
  } | null;
  activity7?: {
    title: string;
    instructions: string;
    imageUrl: string;
    labels: WorksheetActivity7Label[];
  } | null;
  activity8?: {
    title: string;
    instructions: string;
    sequences: WorksheetActivity8Sequence[];
  } | null;
  activities?: Array<{
    type: string;
    title: string;
    instructions: string;
    data: any;
    order: number;
  }>;
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

export interface PerQuestionResult {
  questionId: string;
  slotId?: string;
  isCorrect: boolean;
  studentAnswer: any;
  correctAnswer: any;
}

export interface SectionResult {
  sectionId: string;
  sectionName: string;
  activityType: string;
  earnedPoints: number;
  totalPoints: number;
  score: number;
  correctCount: number;
  incorrectCount: number;
  skippedCount: number;
  perQuestionResults: PerQuestionResult[];
}

export interface WorksheetSubmission {
  _id: string;
  worksheetId: string;
  assignmentId: string;
  studentId: string;
  answers: AnswerResult[] | Record<string, Record<string, any>>;
  // Legacy fields (kept for backward compatibility)
  totalPointsEarned?: number;
  totalPointsPossible?: number;
  percentage?: number;
  // New root-level fields (single source of truth)
  earnedPoints: number;
  totalPoints: number;
  score: number;
  isPassed: boolean;
  sections: SectionResult[];
  timeTaken: number;
  submittedAt: string;
  gradingStatus: string;
  worksheet?: { title?: string };
  timeSpentPerActivity?: Record<string, number>;
}

export interface GenerateWorksheetDto {
  inputType: 'topic' | 'image' | 'file';
  content?: string;
  language?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  fileName?: string;
  fileType?: string;
  activityTypes?: string[] | null;
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
   * Upload a file and generate worksheet from it.
   * @param file - File to upload (PDF, DOCX, etc.)
   * @param options - Generation options
   */
  uploadAndGenerate(file: File, options: { language?: string; difficulty?: 'easy' | 'medium' | 'hard'; activityTypes?: string[] | null }): Observable<{ success: boolean; worksheet: WorksheetDraft; sourceContent: string; fileName?: string }> {
    const formData = new FormData();
    formData.append('file', file);
    if (options.language) formData.append('language', options.language);
    if (options.difficulty) formData.append('difficulty', options.difficulty);
    if (options.activityTypes) formData.append('activityTypes', JSON.stringify(options.activityTypes));
    
    return this.http.post<{ success: boolean; worksheet: WorksheetDraft; sourceContent: string; fileName?: string }>(
      `${this.base}/upload-and-generate`,
      formData
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
   * Fetch all worksheets owned by the current teacher (simple, no params).
   */
  getAll(): Observable<{ success: boolean; data: Worksheet[]; pagination?: WorksheetPagination }> {
    return this.http.get<{ success: boolean; data: Worksheet[]; pagination?: WorksheetPagination }>(this.base);
  }

  /**
   * Fetch worksheets with filter, search, sort, and pagination support.
   */
  getLibrary(params: WorksheetLibraryParams = {}): Observable<{ success: boolean; data: Worksheet[]; pagination: WorksheetPagination }> {
    let query = `?limit=${params.limit ?? 50}&page=${params.page ?? 1}`;
    if (params.search)        query += `&search=${encodeURIComponent(params.search)}`;
    if (params.cefrLevel)     query += `&cefrLevel=${encodeURIComponent(params.cefrLevel)}`;
    if (params.gradeLevel)    query += `&gradeLevel=${encodeURIComponent(params.gradeLevel)}`;
    if (params.gradeCategory) query += `&gradeCategory=${encodeURIComponent(params.gradeCategory)}`;
    if (params.subject)       query += `&subject=${encodeURIComponent(params.subject)}`;
    if (params.difficulty)    query += `&difficulty=${encodeURIComponent(params.difficulty)}`;
    if (params.sortBy)        query += `&sortBy=${params.sortBy}`;
    if (params.sortOrder)     query += `&sortOrder=${params.sortOrder}`;
    return this.http.get<{ success: boolean; data: Worksheet[]; pagination: WorksheetPagination }>(`${this.base}${query}`);
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
  assignToClass(worksheetId: string, payload: { classId: string; title: string; deadline?: string }): Observable<{ success: boolean; data: { assignment: any } }> {
    return this.http.post<{ success: boolean; data: { assignment: any } }>(
      `${this.base}/${worksheetId}/assign`,
      payload
    );
  }

  /**
   * Re-generate an AI theme for an existing worksheet (teacher only).
   * @param worksheetId - Worksheet document _id
   */
  regenerateTheme(worksheetId: string): Observable<{ success: boolean; data: { theme: WorksheetTheme } }> {
    return this.http.post<{ success: boolean; data: { theme: WorksheetTheme } }>(
      `${this.base}/${worksheetId}/regenerate-theme`,
      {}
    );
  }

  /**
   * Generate or retrieve share token for a worksheet (teacher only).
   * @param worksheetId - Worksheet document _id
   */
  shareSet(worksheetId: string): Observable<{ success: boolean; shareUrl: string; shareToken: string }> {
    return this.http.post<{ success: boolean; shareUrl: string; shareToken: string }>(
      `${this.base}/${worksheetId}/share`,
      {}
    );
  }

  /**
   * Revoke share token for a worksheet (teacher only).
   * @param worksheetId - Worksheet document _id
   */
  revokeShare(worksheetId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(
      `${this.base}/${worksheetId}/share`
    );
  }

  /**
   * Student fetches their draft for a worksheet.
   * @param worksheetId - Worksheet document _id
   * @param assignmentId - Assignment document _id
   */
  getDraft(worksheetId: string, assignmentId: string): Observable<{ success: boolean; data: any }> {
    return this.http.get<{ success: boolean; data: any }>(
      `${this.base}/${worksheetId}/draft?assignmentId=${assignmentId}`
    );
  }

  /**
   * Student saves or updates their draft for a worksheet.
   * @param worksheetId - Worksheet document _id
   * @param payload - Draft data including activity answers, progress, time spent
   */
  saveDraft(worksheetId: string, payload: {
    assignmentId: string;
    activity1Answers?: Record<string, string>;
    activity2Answers?: Record<string, string>;
    activity2Revealed?: Record<string, boolean>;
    activity3Answers?: Record<string, string>;
    activity4Blanks?: Record<string, string>;
    progressPercentage?: number;
    timeSpent?: number;
  }): Observable<{ success: boolean; data: any }> {
    return this.http.post<{ success: boolean; data: any }>(
      `${this.base}/${worksheetId}/draft`,
      payload
    );
  }

  /**
   * Student deletes their draft for a worksheet (called on submit).
   * @param worksheetId - Worksheet document _id
   * @param assignmentId - Assignment document _id
   */
  deleteDraft(worksheetId: string, assignmentId: string): Observable<{ success: boolean; deleted: boolean }> {
    return this.http.delete<{ success: boolean; deleted: boolean }>(
      `${this.base}/${worksheetId}/draft?assignmentId=${assignmentId}`
    );
  }

  /**
   * Teacher fetches comprehensive report for a worksheet.
   * @param worksheetId - Worksheet document _id
   * @param params - Filter and pagination params
   */
  getWorksheetReport(worksheetId: string, params: {
    page?: number;
    limit?: number;
    classId?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {}): Observable<{ success: boolean; data: any }> {
    let query = '';
    if (params.page) query += `&page=${params.page}`;
    if (params.limit) query += `&limit=${params.limit}`;
    if (params.classId) query += `&classId=${params.classId}`;
    if (params.status) query += `&status=${params.status}`;
    if (params.dateFrom) query += `&dateFrom=${params.dateFrom}`;
    if (params.dateTo) query += `&dateTo=${params.dateTo}`;
    const separator = query ? '?' : '';
    return this.http.get<{ success: boolean; data: any }>(
      `${this.base}/${worksheetId}/report${separator}${query.replace('&', '?')}`
    );
  }
}
